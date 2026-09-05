"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { copy } from "@/lib/copy";

type BoatRow = { id: number; name: string; slug: string };

export function QrClient({ boats, baseUrl }: { boats: BoatRow[]; baseUrl: string }) {
  const base = baseUrl.replace(/\/$/, "");

  return (
    <>
      <PageHeader
        title={copy.admin.nav.qr}
        subtitle={
          boats.length
            ? `${boats.length} boat${boats.length === 1 ? "" : "s"} — print a code and stick it on the yacht; scanning opens the boat's guest chat`
            : "Print a code for each boat; scanning opens its guest chat"
        }
      />

      {boats.length === 0 ? (
        <EmptyState icon="🔳" title={copy.admin.boatsEmptyTitle} body="Add a boat first — its QR code will appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boats.map((b) => (
            <QrCard key={b.id} name={b.name} slug={b.slug} url={`${base}/b/${b.slug}`} />
          ))}
        </div>
      )}
    </>
  );
}

function QrCard({ name, slug, url }: { name: string; slug: string; url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    setReady(false);
    setError(null);
    QRCode.toCanvas(canvas, url, { width: 1024, margin: 2, errorCorrectionLevel: "M" })
      .then(() => {
        // The renderer pins inline width/height to 1024px; clear them so CSS
        // scales the canvas to the card while the backing store stays 1024×1024.
        canvas.style.width = "";
        canvas.style.height = "";
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not render QR code");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, url]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${slug}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="min-w-0">
        <h3 className="truncate text-lg font-semibold text-slate-900" title={name}>
          {name}
        </h3>
        <p className="mt-0.5 break-all font-mono text-xs text-slate-400">{url}</p>
      </div>
      <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl bg-brand-50 p-3">
        <canvas ref={canvasRef} aria-label={`QR code for ${name}`} className="h-full w-full rounded-xl bg-white" style={{ imageRendering: "pixelated" }} />
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <Button variant="secondary" size="sm" onClick={download} disabled={!ready}>
        Download PNG
      </Button>
    </Card>
  );
}
