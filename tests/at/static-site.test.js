import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");

function walk(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (name === "node_modules" || name === ".git") continue;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}

const appJs = walk("assets/js/at").filter((f) => f.endsWith(".js") && !f.endsWith("us-states.js"));
const html = read("index.html");

test("index.html is a mobile-first, accessible shell", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /class="skip" href="#app"/);
  assert.match(html, /<nav id="nav" aria-label="Main"/);
  assert.match(html, /<main id="app"/);
  assert.match(html, /aria-live="polite"/);
});

test("every local script and stylesheet referenced by index.html exists", () => {
  const refs = [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 4);
  refs.forEach((ref) => assert.ok(existsSync(join(root, ref)), `${ref} is missing`));
});

test("no third-party scripts or styles are loaded", () => {
  assert.equal([...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="https?:/g)].length, 0);
});

test("app code never writes HTML strings or evaluates code", () => {
  const banned = /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write|\beval\(|new Function\(/;
  appJs.forEach((file) => assert.doesNotMatch(read(file), banned, `${file} uses an unsafe DOM/eval API`));
});

test("Supabase tables and RPCs are only called from the data layer", () => {
  appJs.filter((f) => !f.endsWith("data/layer.js")).forEach((file) => {
    assert.doesNotMatch(read(file), /\.from\(\s*["']at_|\.rpc\(|\bclient\.auth\b|supabase\.createClient/, `${file} bypasses the data layer`);
  });
});

test("localStorage is only used for the selected-challenge preference", () => {
  const uses = appJs.flatMap((file) => [...read(file).matchAll(/localStorage\.\w+\(([^)]*)\)/g)].map((m) => m[1]));
  uses.forEach((arg) => assert.match(arg, /CHALLENGE_KEY/));
});

test("no secrets are committed", () => {
  const files = walk(".").filter((f) => !f.startsWith("assets/vendor") && !/us-states\.js$/.test(f) && !f.startsWith("tests/") && f !== "assets/js/at/data/layer.js");
  const secret = /sb_secret_|-----BEGIN (?:RSA |EC )?PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/;
  files.filter((f) => /\.(js|html|css|json|md|sql|sh|yml)$/.test(f)).forEach((file) => {
    const text = read(file);
    // Documentation may warn about the service role key; it may never contain one.
    if (/\.md$/.test(file)) assert.doesNotMatch(text, /sb_secret_|eyJ[A-Za-z0-9_-]{20,}\./, `${file} contains a key`);
    else assert.doesNotMatch(text, secret, `${relative(root, join(root, file))} looks like it contains a secret`);
  });
});

test("the only Supabase key in config is a public publishable key", () => {
  const config = read("assets/js/at/config.js");
  assert.match(config, /anonKey: "sb_publishable_/);
});

test("vendored supabase-js matches the documented checksum", () => {
  const readme = read("assets/vendor/supabase-js/README.md");
  const sum = createHash("sha256").update(readFileSync(join(root, "assets/vendor/supabase-js/supabase.js"))).digest("hex");
  assert.ok(readme.includes(sum), "README must document the sha256 of supabase.js");
});

test("stylesheet supports focus, reduced motion, touch targets and responsive layout", () => {
  const css = read("assets/css/at.css");
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /--tap: 44px/);
  assert.match(css, /min-height: var\(--tap\)/);
  assert.match(css, /@media \(min-width/);
});

test("custom domain is configured for GitHub Pages", () => {
  assert.equal(read("CNAME").trim(), "atfitnesstracker.abbydavid.com");
  assert.ok(existsSync(join(root, ".nojekyll")));
});

test("every page-level view has an h1 that receives focus on navigation", () => {
  const views = read("assets/js/at/ui/views.js");
  const h1s = [...views.matchAll(/h\("h1"/g)].length;
  const focus = [...views.matchAll(/"data-focus": ""/g)].length;
  assert.equal(h1s, focus);
  assert.ok(h1s >= 7);
});
