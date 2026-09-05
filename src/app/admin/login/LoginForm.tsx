"use client";

import { useActionState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { loginAction } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label>Email</Label>
        <Input name="email" type="email" autoComplete="email" placeholder="you@baxyachting.com" required />
      </div>
      <div>
        <Label>Password</Label>
        <Input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
      </div>
      {state?.error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Sign in
      </Button>
    </form>
  );
}
