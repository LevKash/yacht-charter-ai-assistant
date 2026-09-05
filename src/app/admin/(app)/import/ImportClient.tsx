"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { CardSource } from "@/db/schema";
import { Badge, Button, Card, Chip, EmptyState, Input, Label, PageHeader, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { ProposedCard } from "@/lib/ai/ingest";
import type { ImportResponse } from "@/app/api/import/route";
import { CATEGORIES } from "@/lib/categories";
import { copy } from "@/lib/copy";
import { cx } from "@/lib/utils";
import { saveProposedCardsAction } from "../../actions";

type BoatOpt = { id: number; name: string; slug: string };
type Kind = "text" | "voice" | "whatsapp";
type Draft = ProposedCard & { key: number };

const KIND_TO_SOURCE: Record<Kind, CardSource> = { text: "text_dump", voice: "voice", whatsapp: "whatsapp_export" };

const SAMPLE_TEXT = `Talked with the captain about Lamela today. The fridge is the top loading one under the counter, lid sticks a bit, pull hard. Set to 4 not max or it ices up.
BBQ is in the starboard aft locker, mount on the stern rail. Green gas cartridges in same locker.
Water: two tanks 300L each, valve under saloon floor. Hot water: run engine 20 min or boiler breaker on shore power.
If anchor gets stuck motor slowly over it, never force the windlass, call base if still stuck after 10 min.
Also — the aft toilet pump handle needs to be left in the "dry" position or it floods. Guests always forget this!`;

export function ImportClient({ boats, initialBoatId, sttEnabled, aiEnabled }: { boats: BoatOpt[]; initialBoatId: number | null; sttEnabled: boolean; aiEnabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [boatId, setBoatId] = useState<number | null>(initialBoatId);
  const [kind, setKind] = useState<Kind>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<(ImportResponse & { kind: Kind }) | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const boat = boats.find((b) => b.id === boatId) ?? null;

  async function run() {
    if (processing) return;
    const form = new FormData();
    form.set("kind", kind);
    if (boatId) form.set("boatId", String(boatId));
    if (kind === "text") form.set("text", text);
    else if (file) form.set("file", file);
    setProcessing(true);
    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as Partial<ImportResponse> & { error?: string };
      if (!res.ok || !data.cards) {
        toast(data.error ?? "Couldn't process this right now — try again.", "error");
        return;
      }
      const full = data as ImportResponse;
      setResult({ ...full, kind });
      setDrafts(full.cards.map((c, i) => ({ ...c, key: i + 1 })));
      if (full.cards.length === 0) toast("No useful boat knowledge found in this material.", "info");
      else toast(`${full.cards.length} card${full.cards.length === 1 ? "" : "s"} proposed — review and save`, "info");
    } catch {
      toast("Network problem — please try again.", "error");
    } finally {
      setProcessing(false);
    }
  }

  function saveAll(status: "saved" | "draft") {
    if (!boatId || !result) return toast("Please choose a boat first.", "error");
    start(async () => {
      const res = await saveProposedCardsAction({ boatId, jobId: result.jobId, source: KIND_TO_SOURCE[result.kind], status, cards: drafts.map(({ title, category, body }) => ({ title, category, body })) });
      if (!res.ok) return toast(res.error, "error");
      toast(status === "saved" ? `${res.data.count} card${res.data.count === 1 ? "" : "s"} saved to ${boat?.name} ✓` : `${res.data.count} draft${res.data.count === 1 ? "" : "s"} kept for later`);
      setResult(null);
      setDrafts([]);
      setText("");
      setFile(null);
      router.push(`/admin/boats/${boatId}`);
    });
  }

  function updateDraft(key: number, patch: Partial<ProposedCard>) {
    setDrafts((d) => d.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  if (boats.length === 0) {
    return (
      <>
        <PageHeader title="Import knowledge" subtitle="Turn messy notes into clean cards" />
        <EmptyState icon="⛵" title="Add a boat first" body="Knowledge always belongs to a boat. Create one, then come back here to import.">
          <Link href="/admin/boats">
            <Button>Go to boats</Button>
          </Link>
        </EmptyState>
      </>
    );
  }

  /* -------------------------------- Review -------------------------------- */
  if (result) {
    return (
      <>
        <PageHeader title="Review proposed cards" subtitle="Fix anything you like, remove what's wrong, then save. Nothing is live until you save." />

        <Card className="mb-4 flex flex-wrap items-center gap-3">
          <Label>Boat</Label>
          <BoatSelect boats={boats} value={boatId} onChange={setBoatId} />
          <div className="ml-auto flex items-center gap-2">
            {result.mode === "heuristic" && <Badge tone="amber">Split without AI</Badge>}
            {result.remaining > 0 && <Badge tone="amber">~{result.remaining} more possible — run again with the rest</Badge>}
          </div>
        </Card>

        {result.transcript && (
          <details className="mb-4 rounded-2xl bg-white p-4 text-sm shadow-card ring-1 ring-slate-100">
            <summary className="cursor-pointer font-medium text-slate-700">Transcript</summary>
            <p className="mt-2 whitespace-pre-wrap text-slate-600">{result.transcript}</p>
          </details>
        )}

        {drafts.length === 0 ? (
          <EmptyState icon="🤷" title="Nothing left to save" body="The material didn't contain boat knowledge, or you removed all cards.">
            <Button variant="secondary" onClick={() => setResult(null)}>
              Back
            </Button>
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {drafts.map((d, i) => (
              <Card key={d.key} className="fade-up space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Card {i + 1}</span>
                  <button onClick={() => setDrafts((all) => all.filter((c) => c.key !== d.key))} className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                    Remove
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <Input value={d.title} onChange={(e) => updateDraft(d.key, { title: e.target.value })} placeholder="Title" className="font-medium" />
                  <CategoryPicker value={d.category} onChange={(category) => updateDraft(d.key, { category })} />
                </div>
                <Textarea rows={5} value={d.body} onChange={(e) => updateDraft(d.key, { body: e.target.value })} />
              </Card>
            ))}
          </div>
        )}

        {drafts.length > 0 && (
          <div className="sticky bottom-20 mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/95 p-3 shadow-soft ring-1 ring-slate-100 backdrop-blur sm:bottom-4">
            <Button variant="ghost" onClick={() => setResult(null)} disabled={pending}>
              ← Back
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => saveAll("draft")} loading={pending}>
                Keep as drafts
              </Button>
              <Button onClick={() => saveAll("saved")} loading={pending} disabled={!boatId}>
                Save {drafts.length} card{drafts.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </>
    );
  }

  /* -------------------------------- Input --------------------------------- */
  const tabs: Array<{ id: Kind; label: string; icon: string; disabled?: boolean }> = [
    { id: "text", label: "Paste text", icon: "📝" },
    { id: "voice", label: "Voice note", icon: "🎙️", disabled: !sttEnabled },
    { id: "whatsapp", label: "WhatsApp export", icon: "💬" },
  ];
  const canRun = Boolean(boatId) && (kind === "text" ? text.trim().length > 20 : Boolean(file));

  return (
    <>
      <PageHeader title="Import knowledge" subtitle="Drop in messy material — the assistant organizes it into clean cards for you to review." />

      <Card className="mb-4 flex flex-wrap items-center gap-3">
        <Label>Which boat is this about?</Label>
        <BoatSelect boats={boats} value={boatId} onChange={setBoatId} />
      </Card>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            disabled={t.disabled}
            onClick={() => {
              setKind(t.id);
              setFile(null);
            }}
            className={cx(
              "flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-sm font-medium ring-1 transition",
              kind === t.id ? "bg-brand-600 text-white ring-brand-600 shadow-sm" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
              t.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span className="text-xl leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {!sttEnabled && kind !== "voice" && <p className="mb-3 text-xs text-slate-400">🎙️ {copy.admin.importVoiceDisabled}</p>}

      <Card>
        {processing ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Spinner className="h-8 w-8 text-brand-600" />
            <p className="font-medium text-slate-800">{kind === "voice" ? "Transcribing and analyzing…" : copy.admin.importProcessing}</p>
            <p className="text-sm text-slate-500">You&apos;ll get a list of proposed cards to review.</p>
          </div>
        ) : kind === "text" ? (
          <div className="space-y-3">
            <Label hint="a long chat with the captain, notes, a manual excerpt…">Paste anything</Label>
            <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your text here…" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button onClick={() => setText(SAMPLE_TEXT)} className="text-sm font-medium text-brand-700 hover:underline">
                Try with sample text
              </button>
              <Button onClick={run} disabled={!canRun} size="lg">
                ✨ Break into cards
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Label hint={kind === "voice" ? "mp3, m4a, ogg, wav · up to 20 MB" : "the .txt file from WhatsApp → Export chat (without media)"}>
              {kind === "voice" ? "Upload a voice note" : "Upload the chat export"}
            </Label>
            <input
              ref={fileRef}
              type="file"
              accept={kind === "voice" ? "audio/*,.m4a,.mp3,.ogg,.opus,.wav" : ".txt,text/plain"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center transition hover:border-brand-400 hover:bg-brand-50/40"
            >
              <span className="text-3xl">{kind === "voice" ? "🎙️" : "💬"}</span>
              {file ? (
                <span className="font-medium text-slate-800">
                  {file.name} <span className="text-slate-400">({Math.max(1, Math.round(file.size / 1024))} KB)</span>
                </span>
              ) : (
                <span className="text-sm text-slate-600">Tap to choose a file</span>
              )}
            </button>
            {kind === "whatsapp" && (
              <p className="text-xs text-slate-500">
                In WhatsApp: open the group → ⋮ → More → Export chat → <b>Without media</b>. Then upload the .txt file here. Social chatter is skipped automatically.
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={run} disabled={!canRun} size="lg">
                ✨ {kind === "voice" ? "Transcribe & break into cards" : "Extract knowledge"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {!aiEnabled && <p className="mt-3 text-xs text-slate-400">Without an AI key, text is split by paragraph so you can still review and save cards.</p>}
    </>
  );
}

/* ------------------------------------------------------------------ */

function BoatSelect({ boats, value, onChange }: { boats: BoatOpt[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-11 min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 text-[15px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
    >
      {value === null && <option value="">Choose a boat…</option>}
      {boats.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}

function CategoryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPreset = (CATEGORIES as readonly string[]).includes(value);
  const [custom, setCustom] = useState(!isPreset);
  if (custom) {
    return (
      <div className="flex gap-1">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Category" />
        <Chip onClick={() => setCustom(false)}>▾</Chip>
      </div>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__custom") {
          setCustom(true);
          onChange("");
        } else onChange(e.target.value);
      }}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
    >
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value="__custom">Custom…</option>
    </select>
  );
}
