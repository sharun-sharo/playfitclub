"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function JoinCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const ready = /^[A-Z2-9]{6}$/.test(code.trim().toUpperCase());

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(next)) return;
    router.push(`/join/${next}`);
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#141618] px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white">
      <p className="font-display text-sm tracking-[0.14em] text-[#BEFF39]">PlayFit Club</p>
      <h1 className="mt-3 font-display text-4xl text-white">Join a game</h1>
      <p className="mt-2 text-base text-white/80">Type the 6-character code on the TV.</p>
      <form className="mt-10 space-y-4" onSubmit={onSubmit}>
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
            autoCorrect="off"
            spellCheck={false}
            required
            className="min-h-11 font-display text-2xl tracking-[0.28em]"
          />
        </div>
        <Button type="submit" className="min-h-14 w-full bg-[#BEFF39] text-[#141618] hover:bg-[#d4ff6a]" size="lg" disabled={!ready}>
          Continue
        </Button>
      </form>
    </main>
  );
}
