"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { copy } from "@/lib/copy";
import { slugify } from "@/lib/utils";
import { createBoatAction, createDemoBoatAction, deleteBoatAction } from "../../actions";

type BoatRow = { id: number; name: string; slug: string; note: string | null; savedCount: number; draftCount: number };

export function BoatsClient({ boats }: { boats: BoatRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [deleting, setDeleting] = useState<BoatRow | null>(null);
  const [confirmName, setConfirmName] = useState("");

  function submitAdd() {
    start(async () => {
      const res = await createBoatAction({ name, slug });
      if (!res.ok) return toast(res.error, "error");
      toast(`${name.trim()} added ⛵`);
      setAddOpen(false);
      setName("");
      setSlug("");
      setSlugTouched(false);
      router.push(`/admin/boats/${res.data.id}`);
    });
  }

  function submitDelete() {
    if (!deleting) return;
    start(async () => {
      const res = await deleteBoatAction(deleting.id, confirmName);
      if (!res.ok) return toast(res.error, "error");
      toast(`${deleting.name} deleted`);
      setDeleting(null);
      setConfirmName("");
      router.refresh();
    });
  }

  function createDemo() {
    start(async () => {
      const res = await createDemoBoatAction();
      if (!res.ok) return toast(res.error, "error");
      toast("Demo Yacht created with 5 sample cards");
      router.push(`/admin/boats/${res.data.id}`);
    });
  }

  return (
    <>
      <PageHeader
        title="Boats"
        subtitle={boats.length ? `${boats.length} boat${boats.length === 1 ? "" : "s"} in the fleet` : "Your fleet and its knowledge"}
        action={
          <Button onClick={() => setAddOpen(true)}>
            <span className="text-lg leading-none">+</span> Add boat
          </Button>
        }
      />

      {boats.length === 0 ? (
        <EmptyState icon="⛵" title={copy.admin.boatsEmptyTitle} body={copy.admin.boatsEmptyBody}>
          <Button onClick={() => setAddOpen(true)}>+ Add your first boat</Button>
          <Button variant="secondary" onClick={createDemo} loading={pending}>
            Create demo yacht
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {boats.map((b) => (
            <Card key={b.id} className="flex flex-col gap-3 transition hover:shadow-soft">
              <Link href={`/admin/boats/${b.id}`} className="group flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-slate-900 group-hover:text-brand-700">{b.name}</h3>
                  <p className="truncate text-sm text-slate-400">/b/{b.slug}</p>
                  {b.note && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{b.note}</p>}
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-xl">⛵</span>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={b.savedCount ? "brand" : "slate"}>
                  {b.savedCount} card{b.savedCount === 1 ? "" : "s"}
                </Badge>
                {b.draftCount > 0 && <Badge tone="amber">{b.draftCount} draft{b.draftCount === 1 ? "" : "s"}</Badge>}
                <div className="ml-auto flex items-center gap-1">
                  <a href={`/b/${b.slug}`} target="_blank" rel="noreferrer" className="rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
                    Open guest chat ↗
                  </a>
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(`${window.location.origin}/b/${b.slug}`);
                      toast("Guest link copied");
                    }}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                  >
                    Copy link
                  </button>
                  <button onClick={() => setDeleting(b)} className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {boats.length > 0 && !boats.some((b) => b.slug === "demo-yacht") && (
        <p className="mt-6 text-center text-sm text-slate-400">
          Want to see how everything works first?{" "}
          <button onClick={createDemo} className="font-medium text-brand-700 hover:underline">
            Create the demo yacht
          </button>
        </p>
      )}

      {/* Add boat */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a boat">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitAdd();
          }}
        >
          <div>
            <Label>Boat name</Label>
            <Input
              autoFocus
              placeholder="e.g. Lamela"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div>
            <Label hint="used in the guest link">Short link name</Label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-slate-400">/b/</span>
              <Input
                placeholder="lamela"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={!name.trim()}>
              Add boat
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete boat */}
      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Delete ${deleting?.name ?? ""}?`}>
        <p className="text-sm text-slate-600">
          This permanently removes the boat and <b>all {deleting ? deleting.savedCount + deleting.draftCount : 0} knowledge cards</b>. Guests using its link will no longer get answers.
        </p>
        <div className="mt-4">
          <Label>Type the boat name to confirm</Label>
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={deleting?.name} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Keep it
          </Button>
          <Button variant="danger" onClick={submitDelete} loading={pending} disabled={!deleting || confirmName.trim().toLowerCase() !== deleting.name.toLowerCase()}>
            Delete boat
          </Button>
        </div>
      </Modal>
    </>
  );
}
