import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  // eslint-disable-next-line no-var
  var __supabase: SupabaseClient | undefined;
}

function buildClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("Missing SUPABASE_URL environment variable.");
  }
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getClient(): SupabaseClient {
  if (globalThis.__supabase) return globalThis.__supabase;
  const client = buildClient();
  if (process.env.NODE_ENV !== "production") globalThis.__supabase = client;
  return client;
}

// Lazy proxy — only initializes Supabase when a property is actually accessed.
// This means importing this module is safe even if env vars are missing;
// only the first real query throws.
const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client as any, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export default supabase;
