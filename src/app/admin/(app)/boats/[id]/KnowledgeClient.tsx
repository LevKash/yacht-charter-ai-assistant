"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Boat, CardSource, CardStatus } from "@/db/schema";
import { LightMarkdown } from "@/components/markdown";
import { Badge, Button, Card, Chip, EmptyState, Input, Label, Modal, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { CATEGORIES } from "@/lib/categories";
import { copy } from "@/lib/copy";
import { formatDate, slugify } from "@/lib/utils";
import { createCardAction, deleteCardAction, updateBoatAction, updateCardAction } from "../../../actions";

type CardRow = { id: number; title: string; category: string; body: string; source: CardSource; status: CardStatus; updatedAt: string };

const SOURCE_LABEL: Record<CardSource, string> = { manual: "By hand", text_dump: "Pasted text", voice: "Voice note", whatsapp_export: "WhatsApp export" };

export function KnowledgeClient({ boat, cards }: { boat: Boat; cards: CardRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<CardRow | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CardRow | null>(null);
  const [boatEdit, setBoatEdit] = useState(false);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [cards]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => (!category || c.category === category) && (!q || c.title.toLowerCase().includes(q) || c.body.toLowerCase().includes(q)));
  }, [cards, query, category]);

  const savedCount = cards.filter((c) => c.status === "saved").length;

  function remove(card: CardRow) {
    start(async () => {
      const res = await deleteCardAction(card.id);
      if (!res.ok) return toast(res.error, "error");
      toast("Card deleted");
      setConfirmDelete(null);
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <>
      {/* Header */}
      <div className="mb-5">
        <Link href="/admin/boats" className="text-sm text-slate-500 hover:text-brand-700">
          ← All boats
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
              {boat.name}
              <button onClick={() => setBoatEdit(true)} className="rounded-lg px-2 py-0.5 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                Edit
              </button>
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {savedCount} saved card{savedCount === 1 ? "" : "s"} ·{" "}
              <a href={`/b/${boat.slug}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                Open guest chat ↗
              </a>
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/admin/import?boat=${boat.id}`}>
              <Button variant="secondary">✨ Import</Button>
            </Link>
            <Button onClick={() => setEditing("new")}>
              <span className="text-lg leading-none">+</span> Add card
            </Button>
          </div>
        </div>
      </div>

      {cards.length === 0 ? (
        <EmptyState icon="📝" title={copy.admin.knowledgeEmptyTitle}>
          <ol className="mx-auto max-w-md space-y-2 text-left text-sm text-slate-600">
            {copy.admin.knowledgeEmptySteps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex w-full flex-wrap justify-center gap-2">
            <Button onClick={() => setEditing("new")}>+ Add a card by hand</Button>
            <Link href={`/admin/import?boat=${boat.id}`}>
              <Button variant="secondary">✨ Import text, voice or WhatsApp</Button>
            </Link>
          </div>
        </EmptyState>
      ) : (
        <>
          {/* Filters */}
          <div className="mb-4 space-y-3">
            <Input placeholder="Search cards…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Chip active={category === null} onClick={() => setCategory(null)}>
                All ({cards.length})
              </Chip>
              {categories.map(([name, count]) => (
                <Chip key={name} active={category === name} onClick={() => setCategory(category === name ? null : name)}>
                  {name} ({count})
                </Chip>
              ))}
            </div>
          </div>

          {/* Cards */}
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No cards match your search.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((c) => (
                <button key={c.id} onClick={() => setEditing(c)} className="text-left">
                  <Card className="h-full transition hover:shadow-soft">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{c.category}</Badge>
                      <Badge>{SOURCE_LABEL[c.source]}</Badge>
                      {c.status === "draft" && <Badge tone="amber">Draft</Badge>}
                    </div>
                    <h3 className="font-semibold text-slate-900">{c.title}</h3>
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-slate-500">{c.body}</p>
                    <p className="mt-2 text-xs text-slate-400">Updated {formatDate(c.updatedAt)}</p>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add / edit card */}
      <CardEditor
        key={editing === "new" ? "new" : editing?.id ?? "closed"}
        open={editing !== null}
        card={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onDelete={(card) => setConfirmDelete(card)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
        boatId={boat.id}
      />

      {/* Confirm delete */}
      <Modal open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} title="Delete this card?">
        <p className="text-sm text-slate-600">
          “{confirmDelete?.title}” will be removed and the assistant will no longer use it.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
            Keep it
          </Button>
          <Button variant="danger" loading={pending} onClick={() => confirmDelete && remove(confirmDelete)}>
            Delete card
          </Button>
        </div>
      </Modal>

      {/* Edit boat details */}
      <BoatEditor open={boatEdit} boat={boat} onClose={() => setBoatEdit(false)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Card editor                                                         */
/* ------------------------------------------------------------------ */

function CardEditor({ open, card, boatId, onClose, onSaved, onDelete }: { open: boolean; card: CardRow | null; boatId: number; onClose: () => void; onSaved: () => void; onDelete: (c: CardRow) => void }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(card?.title ?? "");
  const [category, setCategory] = useState(card?.category ?? "General");
  const [customCategory, setCustomCategory] = useState(card && !(CATEGORIES as readonly string[]).includes(card.category) ? card.category : "");
  const [body, setBody] = useState(card?.body ?? "");
  const [preview, setPreview] = useState(false);

  const effectiveCategory = customCategory.trim() || category;

  function save(status: CardStatus) {
    start(async () => {
      const input = { title, category: effectiveCategory, body, status };
      const res = card ? await updateCardAction(card.id, input) : await createCardAction(boatId, input);
      if (!res.ok) return toast(res.error, "error");
      toast(card ? "Card updated" : status === "saved" ? "Card saved — the assistant can use it now" : "Draft saved");
      onSaved();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={card ? "Edit card" : "Add knowledge"} wide>
      <div className="space-y-4">
        <div>
          <Label>What is this about?</Label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                active={effectiveCategory === c}
                onClick={() => {
                  setCategory(c);
                  setCustomCategory("");
                }}
              >
                {c}
              </Chip>
            ))}
          </div>
          <Input className="mt-2" placeholder="Or type your own category…" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} />
        </div>
        <div>
          <Label hint="short, like a question">Title</Label>
          <Input autoFocus={!card} placeholder="e.g. How to open the fridge" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label hint="plain text, steps welcome">The information</Label>
            {body.trim() && (
              <button type="button" onClick={() => setPreview((p) => !p)} className="text-xs font-medium text-brand-700 hover:underline">
                {preview ? "Edit" : "Preview"}
              </button>
            )}
          </div>
          {preview ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-800">
              <LightMarkdown text={body} />
            </div>
          ) : (
            <Textarea rows={8} placeholder={"Explain it like you would to a guest who has never been on this boat.\n\nExample: The fridge is under the galley counter. Lift the lid by the recessed handle…"} value={body} onChange={(e) => setBody(e.target.value)} />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div>
            {card && (
              <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => onDelete(card)}>
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {(!card || card.status === "draft") && (
              <Button variant="secondary" loading={pending} onClick={() => save("draft")}>
                Save as draft
              </Button>
            )}
            <Button loading={pending} onClick={() => save("saved")}>
              {card?.status === "draft" ? "Publish card" : "Save card"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Boat details editor                                                 */
/* ------------------------------------------------------------------ */

function BoatEditor({ open, boat, onClose }: { open: boolean; boat: Boat; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(boat.name);
  const [slug, setSlug] = useState(boat.slug);
  const [note, setNote] = useState(boat.note ?? "");

  function save() {
    start(async () => {
      const res = await updateBoatAction(boat.id, { name, slug, note });
      if (!res.ok) return toast(res.error, "error");
      toast("Boat updated");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Boat details">
      <div className="space-y-4">
        <div>
          <Label>Boat name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label hint="changing it breaks old QR codes">Short link name</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">/b/</span>
            <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
          </div>
        </div>
        <div>
          <Label hint="only visible to staff">Note</Label>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bavaria 46, 4 cabins, berth C12" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
