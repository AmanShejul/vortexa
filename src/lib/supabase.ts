import { createClient, type User } from "@supabase/supabase-js";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey, serviceRoleKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function isSupabasePersistenceConfigured(): boolean {
  return Boolean(getSupabaseConfig()?.serviceRoleKey);
}

export function getBearerTokenFromRequest(request?: Request): string | null {
  if (!request) return null;
  const headerValue = request.headers.get("authorization");
  if (!headerValue) return null;

  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1].trim() : null;
}

export function createSupabaseBrowserClient() {
  const config = getSupabaseConfig();
  if (!config) return null;

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
}

export async function getBrowserAccessToken(): Promise<string | null> {
  const client = createSupabaseBrowserClient();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export function createSupabaseAnonClient() {
  const config = getSupabaseConfig();
  if (!config) return null;

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}

export function createSupabaseServiceClient() {
  const config = getSupabaseConfig();
  if (!config || !config.serviceRoleKey) return null;

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}

export async function getAuthenticatedUser(request?: Request): Promise<User | null> {
  const config = getSupabaseConfig();
  if (!config) return null;

  const authToken = getBearerTokenFromRequest(request);
  if (!authToken) {
    return null;
  }

  const client = createSupabaseServiceClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser(authToken);
  if (error || !data.user) return null;
  return data.user;
}

export async function refreshSupabaseSession() {
  const client = createSupabaseBrowserClient();
  if (!client) return null;

  const { data, error } = await client.auth.refreshSession();
  if (error || !data.user) return null;
  return data.user;
}

export async function signOutSupabaseSession(): Promise<boolean> {
  const client = createSupabaseBrowserClient();
  if (!client) return false;

  const { error } = await client.auth.signOut();
  return !error;
}

export function ensureUserOwnsRecord(learnerId: string, userId: string): void {
  if (learnerId !== userId) {
    throw new Error("User is not allowed to access this learner record.");
  }
}
