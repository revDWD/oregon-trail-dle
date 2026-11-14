import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

function walk(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name).split("\\").join("/");
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

// A spread into replaceChildren() turns nested arrays and nulls into stray text (it once emptied the
// Field Guide after a filter change). fill() from dom.js flattens them the way h() does.
test("views re-render lists with fill(), never a spread into replaceChildren()", () => {
  appJs.forEach((file) => assert.doesNotMatch(read(file), /replaceChildren\(\s*\.\.\./, `${file} spreads into replaceChildren`));
});

test("Supabase tables and RPCs are only called from the data layer", () => {
  appJs.filter((f) => !f.endsWith("data/layer.js")).forEach((file) => {
    assert.doesNotMatch(read(file), /\.from\(\s*["']at_|\.rpc\(|\bclient\.auth\b|supabase\.createClient/, `${file} bypasses the data layer`);
  });
});

test("localStorage only holds harmless preferences (last hiker), never data", () => {
  const uses = appJs.flatMap((file) => [...read(file).matchAll(/localStorage\.\w+\(([^)]*)\)/g)].map((m) => m[1]));
  assert.ok(uses.length > 0);
  uses.forEach((arg) => assert.match(arg, /^HIKER_KEY\b/));
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

test("vendored three.js matches the documented checksums and is only loaded lazily by the 3D camp", () => {
  const readme = read("assets/vendor/three/README.md");
  for (const file of ["three.module.js", "three.core.js"]) {
    const sum = createHash("sha256").update(readFileSync(join(root, "assets/vendor/three", file))).digest("hex");
    assert.ok(readme.includes(sum), `README must document the sha256 of ${file}`);
  }
  assert.doesNotMatch(read("index.html"), /three/i, "three.js must not load on every page");
  const camp3d = read("assets/js/at/ui/camp-3d.js");
  assert.match(camp3d, /import\("\.\.\/\.\.\/\.\.\/vendor\/three\/three\.module\.js"\)/);
  assert.doesNotMatch(camp3d, /^import .*three/m, "three.js must be imported dynamically");
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
  assert.ok(h1s >= 5);
});

test("navigation: Trail, Log Activity, Camp, Wildlife Spotting, History; old tabs redirect; every link has a route", () => {
  const html = read("index.html");
  const app = read("assets/js/at/ui/app.js");
  const links = [...html.matchAll(/<a href="#\/([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links, ["trail", "log", "camp", "wildlife", "history"]);
  assert.match(html, /<a href="#\/log">Log Activity<\/a>/);
  assert.match(html, /<a href="#\/wildlife">Wildlife Spotting<\/a>/);
  assert.ok(!/#\/profile/.test(html + read("assets/js/at/ui/views.js")), "no links to the removed profile page");
  const routes = app.match(/const ROUTES = \{([^}]*)\}/)[1];
  links.forEach((l) => assert.match(routes, new RegExp(`\\b${l}:`)));
  assert.ok(!/\b(profile|crew|hunt|badges):/.test(routes), "removed tabs have no routes of their own");
  assert.match(app, /const ALIASES = \{ hunt: "wildlife", crew: "history", badges: "history", hikers: "history", patches: "history" \}/, "old bookmarks redirect");
  const aliases = app.match(/const ALIASES = \{([^}]*)\}/)[1];
  // Every in-app #/ link points at a route or an alias.
  const views = read("assets/js/at/ui/views.js");
  const targets = new Set([...views.matchAll(/href: "#\/([a-z]+)"/g)].map((m) => m[1]));
  targets.forEach((t) => assert.ok(new RegExp(`\\b${t}:`).test(routes + aliases), `#/${t} has a route`));
  assert.ok(!/huntView|crewView|badgesView|setHuntTheme|theme-switch|setCampTime|camp-times/.test(app + views), "no leftover hunt/crew/badges tab code or day/night buttons");
});

test("the expedition loop is stopped whenever the page re-renders", () => {
  const app = read("assets/js/at/ui/app.js");
  assert.match(app, /if \(game\) \{ game\.stop\(\); game = null; \}/);
  assert.match(app, /game = null; \}\s*pauseCamp3d\(\);/, "the 3D camp stops drawing before every re-render");
});

test("every 3D camp place is also a text button, and Camp falls back to the pixel camp", () => {
  const views = read("assets/js/at/ui/views.js");
  const explorer = views.slice(views.indexOf("function campExplorer"), views.indexOf("function registerSection"));
  assert.match(explorer, /h\("h3", \{ id: "camp-places-title" \}, "Camp Locations"\)/);
  assert.match(explorer, /CAMP_LOCATIONS\.map\(\(loc\) => \{\s*const btn = h\("button"/, "one button per location");
  assert.match(explorer, /onFallback:[\s\S]*?fill\(holder, scene\)/, "the pixel camp comes back when 3D can't run");
  const body = views.slice(views.indexOf("function campPlaceBody"), views.indexOf("function campExplorer"));
  for (const id of ["roster", "bulletin", "journal", "patches", "wildlife"]) assert.match(body, new RegExp(`id === "${id}"`), `${id} has a panel`);
  assert.match(body, /campLink\("#\/trail"/, "the map table (the last panel) links to the Trail");
  assert.match(views.slice(views.indexOf("export function campView")), /campExplorer\(s, ctx,/);
});

test("starting a round from the keyboard does not also take a photo", () => {
  const view = read("assets/js/at/ui/expedition-view.js");
  const start = view.slice(view.indexOf('canvas.addEventListener("keydown"'));
  assert.match(start.slice(0, start.indexOf("});")), /event\.stopPropagation\(\);\s*(\/\/[^\n]*\n\s*)?begin\(\);/);
  assert.match(view, /on \? "addEventListener" : "removeEventListener"/);
});

test("background refreshes keep the page usable (focus, fail-soft, fresh photo total)", () => {
  const app = readFileSync("assets/js/at/ui/app.js", "utf8");
  const views = readFileSync("assets/js/at/ui/views.js", "utf8");
  assert.match(app, /function redrawInBackground\(\)[\s\S]*?if \(busy\(\)( \|\||\))/, "background redraws wait while focus is in the page");
  assert.match(app, /route\(\) === "history" && state\.editingId/, "History never redraws over an open edit form");
  assert.match(app, /isMissingFunction\(e\)/, "only a missing RPC switches to the pre-migration mode");
  assert.match(app, /layer\.activities\.summary\(/, "pre-migration progress comes from this device's summary");
  assert.doesNotMatch(app, /e\.code === "network"\) \{ announce\(friendly\(e\)\); return; \}/);
  assert.match(views, /expeditionTotals\(s\.hikers\)\.wildlifeScore/, "photo board total uses the freshly loaded hikers");
});

test("no invite codes or join flow: select a name, log, everything updates", () => {
  const app = read("assets/js/at/ui/app.js");
  const views = read("assets/js/at/ui/views.js");
  const layer = read("assets/js/at/data/layer.js");
  for (const [name, text] of [["app.js", app], ["views.js", views], ["layer.js", layer]]) {
    assert.doesNotMatch(text, /joinCard|joinExpedition|showInvite|inviteLink|joinFromLink|at_join_expedition|at_expedition_invite_code|isMember\(/, `${name} still has join/invite code`);
    assert.doesNotMatch(text, /Join the expedition|invite link/i, `${name} still mentions joining`);
  }
  assert.match(app, /\/\^join\\\/\/\.test\(r\) \? "camp"/, "old invite links open Camp");
});

test("Trail has no Coming Up card; Camp opens with the camp, and History holds the collections", async () => {
  const { readFileSync } = await import("node:fs");
  const views = readFileSync("assets/js/at/ui/views.js", "utf8");
  assert.doesNotMatch(views, /Coming up:/);
  const camp = views.slice(views.indexOf("export function campView"));
  assert.ok(camp.indexOf("camp-card") < camp.indexOf("dispatches-title"), "the camp comes first, dispatches below it");
  assert.doesNotMatch(camp, /patchSection\(|hikersSection\(|registerSection\(/, "Camp is a place, not a collection page");
  const history = views.slice(views.indexOf("export function historyView"), views.indexOf("const JOURNAL_SHOWN"));
  for (const part of ["journalSection(s)", "patchSection(s)", "hikersSection(s, a)", "registerSection(s)", "activities-title"]) assert.ok(history.includes(part), `History shows ${part}`);
  assert.ok(history.indexOf("journalSection(s)") < history.indexOf("patchSection(s)") && history.indexOf("registerSection(s)") < history.indexOf("activities-title"), "journal first, this device's activities last");
});

test("headings, card titles and section summaries use Title Case", () => {
  const minor = new Set(["a", "an", "the", "and", "of", "to", "in", "on", "for", "at", "by", "or", "with", "so"]);
  const titles = [];
  for (const file of appJs.filter((f) => f.includes("/ui/"))) {
    const src = read(file);
    // String literals passed to h("h1"…"h4", …) and h("summary", …), plus story-part titles in map.js.
    for (const m of src.matchAll(/h\("(?:h[1-4]|summary)",\s*\{[^}]*\},([^\n]*)/g)) {
      const call = m[1].split(/\bh\("/)[0];
      for (const lit of call.matchAll(/"([^"]{3,})"/g)) titles.push([file, lit[1]]);
    }
    for (const m of src.matchAll(/part\("\w+", "([^"]+)"/g)) titles.push([file, m[1]]);
    for (const m of src.matchAll(/label: "([^"]+)" \}, `/g)) titles.push([file, m[1]]);
  }
  for (const m of read("assets/js/at/engine/field-guide.js").matchAll(/\{ id: "\w+", label: "([^"]+)" \}/g)) titles.push(["field-guide.js", m[1]]);
  assert.ok(titles.length > 20, `found ${titles.length} titles`);
  for (const [file, title] of titles) {
    title.split(/\s+/).forEach((word, i) => {
      const w = word.replace(/^[^A-Za-z]+/, "");
      if (!w || /^[^a-z]/.test(w)) return;
      assert.ok(i > 0 && minor.has(w.replace(/[^a-z]/g, "")), `${file}: "${title}" should be Title Case ("${word}")`);
    });
  }
});

test("Camp shows every species badge and a labelled badge-collection bar", () => {
  const views = read("assets/js/at/ui/views.js");
  const panel = views.slice(views.indexOf("function hikerPanel"), views.indexOf("function hikersSection"));
  assert.match(panel, /speciesBadges\(s\.fieldGuide, \{ hikerId: hk\.id \}\)/, "species badges are per hiker");
  assert.match(panel, /badgeCollection\(badges, species\)/, "the bar counts the badges shown below it");
  assert.match(panel, /bar\(all\.percent, `Badge collection: /, "the bar's accessible name says what it measures");
  assert.match(panel, /"Badge Collection"/, "the bar has a visible label");
  assert.doesNotMatch(panel, /bar\(next\.percent/, "the mileage bar no longer stands in for overall progress");
  assert.match(panel, /Species Badges \(/);
  assert.match(views, /species-badge locked[\s\S]{0,200}"\?\?\?"/, "locked species badges stay a mystery");
  const app = read("assets/js/at/ui/app.js");
  assert.match(app, /speciesBadges\(state\.fieldGuide, \{ hikerId: hk\.id \}\)/, "new species badges are celebrated");
});
