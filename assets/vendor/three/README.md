# Vendored: three.js

- Package: `three@0.187.0` (MIT, see `LICENSE`), files `build/three.module.js` and `build/three.core.js` from the npm tarball (`three.module.js` imports `./three.core.js`).
- npm integrity of the tarball: `sha512-Qiu7R+Cmh8CstZsY1uJOSWnVlfo7ZtNLV7mF8Jltk3LB3AtDu9cRZlcnRKkAk8Y4z6KKw35z7Y7Urd7jWY8etA==`
- SHA-256 of `three.module.js`: `104f56145899722094556490d787aae0617cc2fc3382f31df02d724ea1aee341`
- SHA-256 of `three.core.js`: `613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578` (a test fails if any vendored file changes).
- Add-ons from the same tarball, for the camp's hero models (`assets/models/camp/`): `examples/jsm/loaders/GLTFLoader.js` and the two files it imports, `examples/jsm/utils/BufferGeometryUtils.js` and `examples/jsm/utils/SkeletonUtils.js`. Only their import paths are changed: `'three'` becomes `'./three.module.js'` and `'../utils/?'` becomes `'./?'`, so they share the camp's copy of three.js without an import map.
  - SHA-256 of `GLTFLoader.js`: `7bbda9f3af9b5acbd89a33cfc0aeb020f34d2d31a72829c79c0b354f9502c8e5`
  - SHA-256 of `BufferGeometryUtils.js`: `319782169ed48af21fcaa251d839ecb8e58f14174aacbf68b74a437f3d6a3a98`
  - SHA-256 of `SkeletonUtils.js`: `eedd768765d6553f8082953ab3882e2c86dacc2eb7d180a312d1d52e86bb35c5`
  - The loader is imported dynamically by `camp-3d.js` on Medium and High only. No Draco or Meshopt decoder is vendored, so models must not use those compressions.
- Used only by the 3D Camp (`assets/js/at/ui/camp-3d.js`), which loads it with a dynamic `import()` when Camp opens, so the other pages never download it. Committed instead of loaded from a CDN so the site has no third-party script at runtime and no build step. `.gitattributes` keeps vendored files byte-for-byte (no line-ending conversion).

To upgrade: `npm pack three@<version>`, copy `package/build/three.module.js`, `package/build/three.core.js`, `package/LICENSE` and the three add-ons (re-applying the import path change), update this file, then run `npm test` and look at Camp in a browser.
