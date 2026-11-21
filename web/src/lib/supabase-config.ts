/**
 * Browser-safe Supabase connection settings.
 *
 * The publishable key is designed to be exposed in browser applications.
 * Cloudflare Pages build variables override these defaults when available;
 * defaults keep preview builds functional even if Pages omits build variables.
 */
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://cgwffpxlwgbnlinzwfoj.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_FM9k__vF-RNoCRA_gZ7bzw_Z9B1P_TS";

/** Optional Cloudflare Worker API origin. Configure preview and production independently; never point production at a preview Worker. */
export const CMI_WORKER_API_URL = import.meta.env.VITE_CMI_WORKER_API_URL || "";
