"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SessionUser } from "@/lib/auth";
import { Badge, Button, Card, Input, Label, Modal, PageHeader, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { formatDate } from "@/lib/utils";
import {
  changePasswordAction,
  createInviteAction,
  removeMemberAction,
  removeWhatsappBindingAction,
  revokeInviteAction,
  toggleWhatsappBindingAction,
  updateSettingsAction,
} from "../../actions";

type Person = { id: number; email: string; name: string | null; role: "owner" | "member"; createdAt: string };
type Invite = { id: number; email: string; token: string; createdAt: string };
type Binding = { id: number; groupId: string; active: boolean; boatName: string | null; updatedAt: string };
type SettingsShape = { companyName: string; fallbackContact: string; defaultLanguage: string; llmModel: string };
type Status = { ai: boolean; stt: boolean; whatsapp: boolean; botName: string };

export function SettingsClient({ me, settings, envModel, people, invites, bindings, status }: { me: SessionUser; settings: SettingsShape; envModel: string; people: Person[]; invites: Invite[]; bindings: Binding[]; status: Status }) {
  const isOwner = me.role === "owner";
  return (
    <>
      <PageHeader title="Settings" subtitle={isOwner ? "Company, people and connections" : "Your account"} />
      <div className="space-y-6">
        <StatusCard status={status} />
        {isOwner && <CompanyCard settings={settings} envModel={envModel} />}
        {isOwner && <PeopleCard me={me} people={people} invites={invites} />}
        {isOwner && <WhatsappCard bindings={bindings} status={status} />}
        <PasswordCard />
      </div>
    </>
  );
}

/* ---------------------------- Connections --------------------------- */

function StatusCard({ status }: { status: Status }) {
  const items = [
    { label: "AI answers & imports", ok: status.ai, hint: "OPENROUTER_API_KEY" },
    { label: "Voice transcription", ok: status.stt, hint: "STT_API_KEY" },
    { label: "WhatsApp", ok: status.whatsapp, hint: "WHATSAPP_* keys" },
  ];
  return (
    <Card>
      <h2 className="mb-3 font-semibold text-slate-900">Connections</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((it) => (
          <div key={it.label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium text-slate-800">{it.label}</div>
              <div className="text-xs text-slate-400">{it.hint}</div>
            </div>
            <Badge tone={it.ok ? "green" : "slate"}>{it.ok ? "Connected" : "Not connected"}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------ Company ----------------------------- */

function CompanyCard({ settings, envModel }: { settings: SettingsShape; envModel: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState(settings);
  const [advanced, setAdvanced] = useState(false);

  function save() {
    start(async () => {
      const res = await updateSettingsAction(form);
      if (!res.ok) return toast(res.error, "error");
      toast("Settings saved");
      router.refresh();
    });
  }

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold text-slate-900">Company</h2>
      <div>
        <Label>Company name</Label>
        <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
      </div>
      <div>
        <Label hint="shown when the assistant doesn't know the answer">Fallback contact line</Label>
        <Textarea rows={3} value={form.fallbackContact} onChange={(e) => setForm({ ...form, fallbackContact: e.target.value })} placeholder="For urgent help call the base: +30 …" />
      </div>
      <div>
        <Label hint="guests are answered in the language they write in">Default language</Label>
        <select value={form.defaultLanguage} onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[15px]">
          <option value="en">English</option>
        </select>
      </div>
      <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-sm font-medium text-slate-500 hover:text-slate-800">
        {advanced ? "▾" : "▸"} Advanced
      </button>
      {advanced && (
        <div>
          <Label hint={`leave empty to use ${envModel}`}>AI model (OpenRouter)</Label>
          <Input value={form.llmModel} onChange={(e) => setForm({ ...form, llmModel: e.target.value })} placeholder={envModel} />
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={save} loading={pending}>
          Save settings
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------- People ----------------------------- */

function PeopleCard({ me, people, invites }: { me: SessionUser; people: Person[]; invites: Invite[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);
  const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

  function invite() {
    start(async () => {
      const res = await createInviteAction(email);
      if (!res.ok) return toast(res.error, "error");
      setEmail("");
      setLink(inviteUrl(res.data.token));
      router.refresh();
    });
  }

  function copyLink(url: string) {
    void navigator.clipboard?.writeText(url);
    toast("Invite link copied — send it via WhatsApp or email");
  }

  function remove() {
    if (!removing) return;
    start(async () => {
      const res = await removeMemberAction(removing.id);
      if (!res.ok) return toast(res.error, "error");
      toast(`${removing.email} removed`);
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">People</h2>
        <p className="text-sm text-slate-500">Members can manage boats, cards and imports. Only you can invite or remove people and change settings.</p>
      </div>

      <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
        {people.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-800">
                {p.name || p.email} {p.id === me.id && <span className="text-slate-400">(you)</span>}
              </div>
              {p.name && <div className="truncate text-xs text-slate-400">{p.email}</div>}
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={p.role === "owner" ? "brand" : "slate"}>{p.role}</Badge>
              {p.role === "member" && (
                <button onClick={() => setRemoving(p)} className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          invite();
        }}
      >
        <Input type="email" placeholder="colleague@baxyachting.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" loading={pending} disabled={!email.trim()}>
          Create invite link
        </Button>
      </form>

      {invites.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Pending invites</h3>
          <ul className="space-y-1.5">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-700">
                  {i.email} <span className="text-xs text-slate-400">· {formatDate(i.createdAt)}</span>
                </span>
                <span className="flex gap-1">
                  <button onClick={() => copyLink(inviteUrl(i.token))} className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
                    Copy link
                  </button>
                  <button
                    onClick={() =>
                      start(async () => {
                        await revokeInviteAction(i.id);
                        toast("Invite cancelled");
                        router.refresh();
                      })
                    }
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    Cancel
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={Boolean(link)} onClose={() => setLink(null)} title="Invite link ready">
        <p className="text-sm text-slate-600">Send this link to your colleague (WhatsApp is fine). They open it, choose a password, and they&apos;re in.</p>
        <div className="mt-3 break-all rounded-xl bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-700">{link}</div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setLink(null)}>
            Close
          </Button>
          <Button onClick={() => link && copyLink(link)}>Copy link</Button>
        </div>
      </Modal>

      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title={`Remove ${removing?.email ?? ""}?`}>
        <p className="text-sm text-slate-600">They will be signed out immediately and lose access to the admin. Cards they added stay.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            Keep
          </Button>
          <Button variant="danger" onClick={remove} loading={pending}>
            Remove
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

/* ------------------------------ WhatsApp ---------------------------- */

function WhatsappCard({ bindings, status }: { bindings: Binding[]; status: Status }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<Binding | null>(null);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">WhatsApp groups</h2>
        <Badge tone={status.whatsapp ? "green" : "slate"}>{status.whatsapp ? "Connected" : "WhatsApp not connected"}</Badge>
      </div>
      <p className="text-sm text-slate-500">
        In a charter group, send <code className="rounded bg-slate-100 px-1">!bind lamela</code> to connect the assistant to that boat. Then ask with{" "}
        <code className="rounded bg-slate-100 px-1">@{status.botName} …</code> or <code className="rounded bg-slate-100 px-1">!ask …</code>. Use{" "}
        <code className="rounded bg-slate-100 px-1">!off</code> / <code className="rounded bg-slate-100 px-1">!on</code> to pause. {!status.whatsapp && "See the README to connect a WhatsApp Business number."}
      </p>
      {bindings.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500">No groups connected yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
          {bindings.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-slate-800">{b.boatName ?? "Unknown boat"}</div>
                <div className="truncate font-mono text-xs text-slate-400">{b.groupId}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={b.active ? "green" : "amber"}>{b.active ? "On" : "Paused"}</Badge>
                <button
                  onClick={() =>
                    start(async () => {
                      await toggleWhatsappBindingAction(b.id, !b.active);
                      router.refresh();
                    })
                  }
                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  {b.active ? "Pause" : "Resume"}
                </button>
                <button onClick={() => setRemoving(b)} className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                  Disconnect
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title="Disconnect this group?">
        <p className="text-sm text-slate-600">The assistant will stop answering there until someone sends !bind again.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            Keep
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              removing &&
              start(async () => {
                await removeWhatsappBindingAction(removing.id);
                toast("Group disconnected");
                setRemoving(null);
                router.refresh();
              })
            }
          >
            Disconnect
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

/* ------------------------------ Password ---------------------------- */

function PasswordCard() {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold text-slate-900">Your password</h2>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await changePasswordAction(current, next);
            if (!res.ok) return toast(res.error, "error");
            toast("Password changed");
            setCurrent("");
            setNext("");
          });
        }}
      >
        <Input type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <Input type="password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <Button type="submit" variant="secondary" loading={pending} disabled={!current || next.length < 8}>
          Change
        </Button>
      </form>
    </Card>
  );
}
