"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "sign-up" ? "sign-up" : "sign-in";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "loading" | "error" | "success"; message: string } | null>(null);

  async function submit() {
    setStatus({ kind: "loading", message: mode === "sign-up" ? "Creating account…" : "Signing in…" });
    const client = createSupabaseBrowserClient();
    if (!client) {
      setStatus({ kind: "error", message: "Supabase is not configured." });
      return;
    }

    const request = mode === "sign-up"
      ? client.auth.signUp({ email, password, options: { data: { display_name: displayName || email.split("@")[0] } } })
      : client.auth.signInWithPassword({ email, password });

    const { data, error } = await request;
    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }

    if (data.user) {
      setStatus({ kind: "success", message: mode === "sign-up" ? "Account created. Check your email to confirm sign-in." : "Signed in successfully." });
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen bg-[#080808] text-neutral-200">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-5 py-20">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Authentication</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-white">
            {mode === "sign-up" ? "Create account" : "Sign in"}
          </h1>
        </div>

        <div className="space-y-4 rounded-2xl border border-[#292929] bg-[#101010] p-5">
          <div className="space-y-2">
            <label className="text-sm text-neutral-300" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-[#404040] bg-black px-3 py-2 text-sm text-white outline-none ring-0"
            />
          </div>

          {mode === "sign-up" && (
            <div className="space-y-2">
              <label className="text-sm text-neutral-300" htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-xl border border-[#404040] bg-black px-3 py-2 text-sm text-white outline-none ring-0"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-neutral-300" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-[#404040] bg-black px-3 py-2 text-sm text-white outline-none ring-0"
            />
          </div>

          {status && (
            <p className={status.kind === "error" ? "text-sm text-red-300" : "text-sm text-neutral-300"}>
              {status.message}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={status?.kind === "loading"}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:bg-neutral-500"
          >
            {mode === "sign-up" ? "Create account" : "Sign in"}
          </button>
        </div>

        <p className="text-sm text-neutral-500">
          {mode === "sign-up" ? "Already have an account?" : "Need an account?"}{" "}
          <a href={mode === "sign-up" ? "/auth" : "/auth?mode=sign-up"} className="text-white underline">
            {mode === "sign-up" ? "Sign in" : "Create one"}
          </a>
        </p>
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#080808] text-neutral-200"><div className="mx-auto flex max-w-md flex-col gap-6 px-5 py-20"><p className="text-sm text-neutral-400">Loading authentication…</p></div></main>}>
      <AuthContent />
    </Suspense>
  );
}
