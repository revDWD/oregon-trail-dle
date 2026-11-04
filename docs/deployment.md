# Deployment: GitHub Pages + ATFitnessTracker.abbydavid.com + Supabase

The site is static (no build step). GitHub Pages serves the repository root from `main`.

## 1. Values you must provide (nothing here is invented)

| Value | Where to find it | Where it goes |
|---|---|---|
| Supabase **Project URL** | Supabase Dashboard > Project Settings > API | `assets/js/at/config.js` (`SUPABASE_CONFIG.url`) |
| Supabase **publishable (anon) key** | Same page. Use the `sb_publishable_...` key (or legacy `anon`) | `assets/js/at/config.js` (`SUPABASE_CONFIG.anonKey`) |

**Confirmed project:** `eojzvyyhzdapwgsrtyne` (`https://eojzvyyhzdapwgsrtyne.supabase.co`), the same project the Oregon game used. `config.js` uses its existing publishable key. If that key has been rotated or deleted, copy the current `sb_publishable_...` key from Project Settings > API Keys into `config.js`. These two values are public by design; security comes from Row Level Security.

**Never** put the `service_role` / secret key, database password or JWT secret in this repo. A test fails if one appears, and `layer.js` refuses to start with one.

## 2. Apply the database migration

1. Supabase Dashboard > SQL Editor > New query (https://supabase.com/dashboard/project/eojzvyyhzdapwgsrtyne/sql/new).
2. Paste the whole of `supabase/migrations/20261101000000_at_fitness_schema.sql` and run it. It is idempotent and only creates `at_*` objects, so the existing Oregon tables are untouched.
3. Open the site once, then check Dashboard > Authentication > Users shows a new anonymous user and `at_profiles` has a matching row.

4. **Phase 2 (Camp, Expeditions, Trail Dispatches):** in a new query, paste the whole of `supabase/migrations/20261103000000_at_camp_dispatches.sql` and run it. It is also idempotent. Until it is applied, the app still works but Camp shows no dispatches or supplies, and saving an expedition fails with a friendly message.

5. **Phase 8 (hikers, per-hiker badges):** paste the whole of `supabase/migrations/20261104000000_at_hikers.sql` and run it. It seeds David and Kevin. Until it is applied, the app still works without the hiker field.
   - Activities logged before Phase 8 have no hiker and don't count toward the expedition. On the device that logged them, open **History**, tap **Edit** on each, choose the hiker and save. (Or in the SQL Editor: `update public.at_activities set hiker_id = (select id from public.at_hikers where name = 'David') where hiker_id is null and user_id = '<device id>';`. The device ID is under History > "About this device".)
   - Add a hiker: `insert into public.at_hikers (name, sort_order) values ('Sarah', 3);` Retire one (their miles and badges stay): `update public.at_hikers set active = false where name = 'Sarah';`

6. **Open participation (no invite codes):** paste the whole of `supabase/migrations/20261105000000_at_open_expedition.sql` and run it. Any visitor can now log for any hiker straight away (pick a name → log → everything updates). It removes the invite code, the join function and the membership table. Devices still own, and alone can edit or delete, the rows they logged.

7. **Wildlife field guide:** paste the whole of `supabase/migrations/20261106000000_at_field_guide.sql` and run it. Each Wildlife Spotting outing then records which species were photographed (and the habitat), and the field guide and wildlife badges fill in. Until it is applied, outings still save to the photo board and the guide shows a short "waiting for the update" note.

(Or with the Supabase CLI: `supabase link --project-ref eojzvyyhzdapwgsrtyne` then `supabase db push`.)

## 2b. Let the organizer (Kevin) post Trail Dispatches

Organizers are listed in `public.at_organizers`, which the app cannot write to.

1. Kevin opens the site **on the device and browser he'll post from**, goes to **History**, and expands **About this device** (at the bottom). He sends you the Device ID.
2. In the SQL Editor, run (replace the ID):

   ```sql
   insert into public.at_organizers (user_id, note)
   values ('00000000-0000-0000-0000-000000000000', 'Kevin')
   on conflict (user_id) do nothing;
   ```

3. Kevin reloads the site. A **Write a dispatch** button appears at Camp. He can pin a dispatch to the top of the Trail page. Formatting: `**bold**`, `*italics*`, `[text](https://link)`, `- ` lists, `# ` heading, `> ` quote.

Alternatives and notes:

- Dispatches can also be added in **Table Editor > at_dispatches** (fill `title`, `body`, `author_name`; set `published_at` in the future to schedule one).
- "Everyone" dispatches can be read by any visitor of the site, because every visitor is an anonymous signed-in user. Don't post private details there.
- Remove an organizer: `delete from public.at_organizers where user_id = '...';`
- **Landmark notes** ("Kevin's Trail Notes" in each landmark's map panel) are different from dispatches. They live in `assets/js/at/trail/landmark-stories.js`. To add one, open that file on GitHub, click the pencil, add a line like `kevin: "Watch for the wild ponies!",` inside the landmark's `{ }`, and commit. The site updates in about a minute. Use dispatches for news and updates, and landmark notes for evergreen commentary about a place.
- If Kevin clears his browser data he gets a new device ID; repeat steps 1–2.

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

- [ ] First visit starts automatically (no login, nothing to join): Log Activity shows the Hiker dropdown right away.
- [ ] Log Activity requires a hiker; after saving, that hiker's miles and badges update at Camp.
- [ ] After the Phase 2 migration and organizer setup, a dispatch posted at Camp appears at the top of the Trail page for everyone.
- [ ] A Wildlife Spotting round that scores saves to the photo board (the photo total on Camp goes up); the 11th round in a day is politely refused.
- [ ] After a scoring round, the photographed species appear in the Field guide (with first-seen date and who found them), and the hiker's Camp panel shows "Species photographed".
- [ ] Log an activity; trail percent and map marker update.
- [ ] Log for Kevin from a second device; Camp shows both hikers' totals on both devices.
- [ ] In a second browser (a second anonymous hiker), the first hiker's activities are not visible or editable.
- [ ] `https://` loads with a valid certificate.
