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
3. Open the site once, then check Dashboard > Authentication > Users shows a new anonymous user and `at_profiles` has a matching row.

(Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)

## 3. Supabase Auth settings: anonymous sign-ins (there is no login screen)

The app has no email/password login. On first visit, each browser is given a Supabase **anonymous user**, so every activity still belongs to a real `auth.uid()` and Row Level Security still prevents players editing each other's records.

- **Required:** Authentication > Sign In / Providers > **Allow anonymous sign-ins: ON**. Without it the app shows "We couldn't reach the trail server".
- **Recommended:** Authentication > Attack Protection: keep the anonymous sign-in rate limit (default 30 per hour per IP), and consider enabling CAPTCHA (Turnstile/hCaptcha). CAPTCHA would need a small frontend change to pass the token.
- Site URL: set it to `https://atfitnesstracker.abbydavid.com`. Redirect URLs and SMTP are not needed, because the app sends no auth emails.
- Optional housekeeping: anonymous users that never log activity can be deleted periodically from the dashboard. Deleting a user cascades to their `at_*` rows.

**Trade-off to know:** progress is tied to the browser. Clearing site data, private browsing, or a new device starts a new hiker, and the old progress cannot be recovered from the app. (Supabase can later convert an anonymous user into an email account with `updateUser`, if you want that back.)

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
| Local | http://localhost:8000 | `python3 -m http.server 8000` (anonymous sign-in works from any origin) |
| Pages default | https://revdwd.github.io/oregon-trail-dle/ | Redirects to the custom domain once configured |

For a separate staging database, create a second Supabase project, run the migration there, and point a local copy of `config.js` at it. Do not commit that change.

## 7. Verification checklist after go-live

- [ ] First visit starts automatically (no login) and the Profile page lets you set a trail name.
- [ ] Log an activity; trail percent and map marker update.
- [ ] Create a challenge, copy the invite code, join from a second account; both appear on the leaderboard.
- [ ] In a second browser (a second anonymous hiker), the first hiker's activities are not visible or editable.
- [ ] `https://` loads with a valid certificate.
