"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input, Label } from "@/components/ui";
import { acceptInviteAction } from "@/app/admin/actions";

export function InviteForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await acceptInviteAction(token, name, password);
          if (!res.ok) return setError(res.error);
          router.push("/admin/boats");
        });
      }}
    >
      <div>
        <Label>Email</Label>
        <Input value={email} disabled />
      </div>
      <div>
        <Label>Your name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria" autoFocus />
      </div>
      <div>
        <Label hint="8+ characters">Choose a password</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={password.length < 8}>
        Join the team
      </Button>
    </form>
  );
}
