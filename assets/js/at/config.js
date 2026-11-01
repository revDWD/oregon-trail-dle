// PUBLIC configuration. Safe to commit: the publishable (anon) key is designed to ship to browsers and
// is constrained by the Row Level Security policies in supabase/migrations.
// NEVER put a service_role / secret key here. See docs/deployment.md for where to find these values.
//
// These two values point at the Supabase project already used by this repository. Replace them if you
// want the game to use a different project.
export const SUPABASE_CONFIG = Object.freeze({
  url: "https://eojzvyyhzdapwgsrtyne.supabase.co",
  anonKey: "sb_publishable_hlpYOqJdI-wmrYPkwUNa5g_awoBAJHO"
});

// Canonical production address (used for auth redirect links; must be in the Supabase redirect allow-list).
export const SITE_URL = "https://atfitnesstracker.abbydavid.com";
