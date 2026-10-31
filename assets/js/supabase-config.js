// Supabase connection for the community expedition. Loaded before community.js.
// Both values are PUBLIC by design (they ship to every browser); security comes from the
// row-level-security policies in supabase/schema.sql. NEVER put a service_role key here.
// Leave blank to run in local-only mode (the community panel shows "not connected").
window.OTDLE_SUPABASE = {
  url: "https://eojzvyyhzdapwgsrtyne.supabase.co",
  anonKey: "sb_publishable_hlpYOqJdI-wmrYPkwUNa5g_awoBAJHO"
};
