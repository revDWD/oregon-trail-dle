# Vendored: @supabase/supabase-js

- Package: `@supabase/supabase-js@2.118.0` (MIT, see `LICENSE`), file `dist/umd/supabase.js` from the npm tarball.
- npm integrity of the tarball: `sha512-FxI8UXMVC2UG7IkeiI8fuQZqq2oI3JeSuN8MPIC2RLVaoEAxKS0nqE6kii9Ewpq8f9gNPM6git1Y8f0vN/QLFw==`
- SHA-256 of `supabase.js`: `ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3` (a test fails if the file changes).
- Exposes the global `supabase` (`supabase.createClient`). It is committed instead of loaded from a CDN so the site has no third-party script at runtime, and no build step or npm dependency is needed.

To upgrade: `npm pack @supabase/supabase-js@<version>`, copy `package/dist/umd/supabase.js` and `LICENSE`, and update this file, the checksum in `tests/at/static-site.test.js`, then re-run all tests.
