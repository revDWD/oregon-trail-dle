# Deployment: GitHub Pages + ATFitnessTracker.abbydavid.com + Supabase

The site is static (no build step). GitHub Pages serves the repository root from `main`.

## 1. Values you must provide (nothing here is invented)

| Value | Where to find it | Where it goes |
|---|---|---|
| Supabase **Project URL** | Supabase Dashboard > Project Settings > API | `assets/js/at/config.js` (`SUPABASE_CONFIG.url`) |
| Supabase **publishable (anon) key** | Same page. Use the `sb_publishable_...` key (or legacy `anon`) | `assets/js/at/config.js` (`SUPABASE_CONFIG.anonKey`) |

`config.js` currently holds the URL and publishable key that were already committed in this repository for the old Oregon game. **Confirm that this is the project you want for this game.** If not, replace both values. These two values are public by design; security comes from Row Level Security.

**Never** put the `service_role` / secret key, database password or JWT secret in this repo. A test fails if one appears, and `layer.js` refuses to start with one.

## 2. Apply the database migration

1. Supabase Dashboard > SQL Editor > New query.
2. Paste the whole of `supabase/migrations/20261101000000_at_fitness_schema.sql` and run it. It is idempotent and only creates `at_*` objects, so the existing Oregon tables are untouched.
3. Dashboard > Authentication > Users: sign up once through the site and check an `at_profiles` row appears.

(Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)

## 3. Supabase Auth settings (Authentication > URL Configuration)

- **Site URL:** `https://atfitnesstracker.abbydavid.com`
- **Redirect URLs (allow list):**
  - `https://atfitnesstracker.abbydavid.com/**`
  - `http://localhost:8000/**` (local development: `python3 -m http.server 8000`)
  - `http://127.0.0.1:8000/**`
- **Email confirmations:** your choice. If on, new users must click the emailed link before signing in (the app tells them). Supabase's built-in email sender is heavily rate limited, so for more than a handful of friends configure custom SMTP (Authentication > SMTP Settings).
- Password minimum length: the app asks for 8; set the same in Authentication > Providers > Email.

## 4. DNS (at the provider that hosts `abbydavid.com`)

| Type | Name/Host | Value |
|---|---|---|
| CNAME | `atfitnesstracker` | `revdwd.github.io` |

Use only the CNAME (no A records are needed for a subdomain). If your DNS provider proxies traffic (e.g. Cloudflare orange cloud), set it to "DNS only" until GitHub has issued the certificate.

## 5. GitHub Pages

The `CNAME` file in the repo root (`atfitnesstracker.abbydavid.com`) and `.nojekyll` are already committed. In the repository: Settings > Pages:

1. Source: Deploy from a branch, `main`, `/ (root)` (already the current setting).
2. Custom domain: `atfitnesstracker.abbydavid.com` > Save (or `gh api -X PUT repos/revDWD/oregon-trail-dle/pages -f cname=atfitnesstracker.abbydavid.com`).
3. Wait for the DNS check, then tick **Enforce HTTPS** (GitHub provisions the Let's Encrypt certificate; this can take up to an hour).

Merging the feature branch into `main` replaces the old Oregon site. The Oregon version is preserved at tag `oregon-trail-final`.

## 6. Environments

| Environment | URL | Notes |
|---|---|---|
| Production | https://atfitnesstracker.abbydavid.com | Pages from `main` |
| Local | http://localhost:8000 | `python3 -m http.server 8000`; auth emails link back to localhost (must be in the redirect allow list) |
| Pages default | https://revdwd.github.io/oregon-trail-dle/ | Redirects to the custom domain once configured |

For a separate staging database, create a second Supabase project, run the migration there, and point a local copy of `config.js` at it. Do not commit that change.

## 7. Verification checklist after go-live

- [ ] Sign up, confirm email (if enabled), sign in.
- [ ] Log an activity; trail percent and map marker update.
- [ ] Create a challenge, copy the invite code, join from a second account; both appear on the leaderboard.
- [ ] As the second account, try editing the first account's activity (it must fail / be invisible).
- [ ] Password reset email returns to the site.
- [ ] `https://` loads with a valid certificate.
