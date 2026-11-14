# Vendored: three.js

- Package: `three@0.187.0` (MIT, see `LICENSE`), files `build/three.module.js` and `build/three.core.js` from the npm tarball (`three.module.js` imports `./three.core.js`).
- npm integrity of the tarball: `sha512-Qiu7R+Cmh8CstZsY1uJOSWnVlfo7ZtNLV7mF8Jltk3LB3AtDu9cRZlcnRKkAk8Y4z6KKw35z7Y7Urd7jWY8etA==`
- SHA-256 of `three.module.js`: `104f56145899722094556490d787aae0617cc2fc3382f31df02d724ea1aee341`
- SHA-256 of `three.core.js`: `613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578` (a test fails if either file changes).
- Used only by the 3D Camp (`assets/js/at/ui/camp-3d.js`), which loads it with a dynamic `import()` when Camp opens, so the other pages never download it. Committed instead of loaded from a CDN so the site has no third-party script at runtime and no build step. `.gitattributes` keeps vendored files byte-for-byte (no line-ending conversion).

To upgrade: `npm pack three@<version>`, copy `package/build/three.module.js`, `package/build/three.core.js` and `package/LICENSE`, update this file, then run `npm test` and look at Camp in a browser.
