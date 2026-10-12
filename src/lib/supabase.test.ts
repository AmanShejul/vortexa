import { afterEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn((url: string, key: string) => ({ url, key })));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import { createSupabaseBrowserClient, getSupabaseConfig } from "@/lib/supabase";

afterEach(() => {
  vi.unstubAllEnvs();
  createClientMock.mockClear();
});

describe("Supabase browser client", () => {
  it("reuses one client for repeated browser access with the same configuration", () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const first = createSupabaseBrowserClient();
    const second = createSupabaseBrowserClient();

    expect(first).toBe(second);
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it("does not create a browser client when optional Supabase settings are absent", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(createSupabaseBrowserClient()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("does not treat environment-template Supabase values as a real project", () => {
    vi.stubEnv("SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "your-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "your-service-role-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(getSupabaseConfig()).toBeNull();
    expect(createSupabaseBrowserClient()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
