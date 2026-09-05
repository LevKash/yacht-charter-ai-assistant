"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LightMarkdown } from "@/components/markdown";
import { copy } from "@/lib/copy";

type Msg = { id: number; role: "user" | "assistant"; content: string };

export function GuestChat({ slug, boatName, companyName }: { slug: string; boatName: string; companyName: string }) {
  const [messages, setMessages] = useState<Msg[]>([{ id: 0, role: "assistant", content: copy.guest.welcome(boatName) }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(1);

  const nextId = () => nextIdRef.current++;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    const userMsg: Msg = { id: nextId(), role: "user", content: q };
    const history = messages.filter((m) => m.id !== 0).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, question: q, history }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      const reply = res.ok && data.reply ? data.reply : data.error || copy.guest.error;
      setMessages((m) => [...m, { id: nextId(), role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [...m, { id: nextId(), role: "assistant", content: copy.guest.error }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  const showSuggestions = messages.length === 1;

  return (
    <div className="flex h-dvh flex-col bg-[#eef3f3]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-brand-700 px-4 py-3 text-white shadow-md">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-xl">⛵</div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-tight">{boatName}</div>
          <div className="text-xs text-brand-100">{companyName} · boat assistant</div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-2.5">
          {messages.map((m) => (
            <div key={m.id} className={`fade-up flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-sm"
                    : "max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-[15px] leading-relaxed text-slate-800 shadow-sm"
                }
              >
                {m.role === "user" ? m.content : <LightMarkdown text={m.content} />}
              </div>
            </div>
          ))}

          {busy && (
            <div className="fade-up flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
                <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
                <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
                <span className="typing-dot h-2 w-2 rounded-full bg-slate-400" />
              </div>
            </div>
          )}

          {showSuggestions && !busy && (
            <div className="mt-2 flex flex-wrap gap-2">
              {copy.guest.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => void ask(s)}
                  className="rounded-full bg-white px-3.5 py-2 text-sm font-medium text-brand-700 shadow-sm ring-1 ring-brand-100 transition hover:bg-brand-50 active:scale-95"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} className="h-1" />
        </div>
      </main>

      {/* Composer */}
      <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={copy.guest.placeholder}
            autoComplete="off"
            enterKeyHint="send"
            className="h-11 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-px" fill="currentColor" aria-hidden>
              <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.75.75 0 00-1.03.85l1.6 6.15a1 1 0 00.83.74L13 12l-8.2.66a1 1 0 00-.83.74l-1.6 6.15a.75.75 0 001.03.85z" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-slate-400">{copy.guest.footer}</p>
      </form>
    </div>
  );
}
