"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function JoinCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(next)) return;
    router.push(`/join/${next}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <p className="font-display text-sm tracking-[0.06em] text-primary">PlayFit Club</p>
      <h1 className="mt-2 font-display text-4xl text-white">Join a TV</h1>
      <p className="mt-2 text-muted-foreground">Type the 6-character code shown on the television.</p>
      <form className="mt-8 space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="code">Join code</Label>
          <Input
            id="code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            minLength={6}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            required
            className="font-display text-2xl tracking-[0.28em]"
          />
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={!/^[A-Z2-9]{6}$/.test(code.trim().toUpperCase())}>
          Continue
        </Button>
      </form>
    </main>
  );
}
