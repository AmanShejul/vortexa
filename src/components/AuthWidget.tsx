"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

interface SessionState {
  loading: boolean;
  signedIn: boolean;
  email?: string;
  error: string | null;
}

export function AuthWidget() {
  const [state, setState] = useState<SessionState>({ loading: true, signedIn: false, error: null });

  useEffect(() => {
    let active = true;
    const client = createSupabaseBrowserClient();
    if (!client) {
      void Promise.resolve().then(() => {
        if (active) setState({ loading: false, signedIn: false, error: "Supabase is not configured." });
      });
      return () => {
        active = false;
      };
    }

    const clientInstance = client;

    async function loadSession() {
      const { data, error } = await clientInstance.auth.getSession();
      if (!active) return;

      if (error) {
        setState({ loading: false, signedIn: false, error: error.message });
        return;
      }

      setState({
        loading: false,
        signedIn: Boolean(data.session),
        email: data.session?.user?.email ?? undefined,
        error: null,
      });
    }

    void loadSession();
    const { data: subscription } = clientInstance.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState({
        loading: false,
        signedIn: Boolean(session),
        email: session?.user?.email ?? undefined,
        error: null,
      });
    });

    return () => {
      active = false;
      subscription?.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    const client = createSupabaseBrowserClient();
    if (!client) {
      setState({ loading: false, signedIn: false, error: "Supabase is not configured." });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));
    const { error } = await client.auth.signOut();
    if (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
      return;
    }

    setState({ loading: false, signedIn: false, email: undefined, error: null });
  }

  if (state.loading) {
    return <div className="rounded-xl border border-[#292929] bg-[#101010] px-3 py-2 text-xs text-neutral-400">Loading session…</div>;
  }

  if (state.error) {
    // When Supabase is not configured the widget stays invisible instead of
    // leaking an infrastructure message into the nav.
    if (state.error === "Supabase is not configured.") return null;
    return <div className="rounded-xl border border-[#737373] bg-[#101010] px-3 py-2 text-xs text-neutral-200">{state.error}</div>;
  }

  if (!state.signedIn) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/auth" className="rounded-xl border border-[#404040] bg-black px-3 py-2 text-sm font-medium text-white transition hover:border-[#737373]">
          Sign in
        </Link>
        <Link href="/auth?mode=sign-up" className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-neutral-200">
          Create account
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/dashboard" className="rounded-xl border border-[#292929] bg-[#101010] px-3 py-2 text-sm text-neutral-200 transition hover:border-[#737373]">
        Dashboard
      </Link>
      <button type="button" onClick={handleSignOut} className="rounded-xl border border-[#404040] bg-black px-3 py-2 text-sm text-white transition hover:border-[#737373]">
        Sign out
      </button>
      <span className="hidden text-xs text-neutral-500 sm:inline">{state.email}</span>
    </div>
  );
}
