// Expedition view: canvas renderer + input for the camp minigame (hunt, wildlife spotting, ...).
// All rules live in engine/expedition.js; themes live in engine/expedition-themes.js.
// Returns { element, stop } so the app can halt the animation loop when the route changes.
import { h } from "./dom.js";
import { WIDTH, HEIGHT, MIN_Y, createRound, step, fire, summary } from "../engine/expedition.js";

const HABITAT = {
  "southern-ridges": ["#9fc7d8", "#5f8a5a", "#6f8f4a"], "high-balds": ["#a9d0e0", "#9fbf74", "#7a9a4b"],
  "blue-ridge": ["#a3c4dc", "#5c7f97", "#6b8c4a"], "rocky-ridges": ["#b3c6cf", "#7b7f6c", "#7a7f55"],
  lakes: ["#a7cfe0", "#5d806a", "#6a8a4c"], "river-valley": ["#acd0de", "#678c56", "#739350"],
  alpine: ["#b5c4d6", "#6c7a73", "#6c8048"], "north-woods": ["#98bccc", "#35594a", "#5a7a44"]
};

function drawSprite(ctx, sprite, palette, x, y, flip) {
  sprite.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === "." || !palette[ch]) return;
    ctx.fillStyle = palette[ch];
    const col = flip ? row.length - 1 - c : c;
    ctx.fillRect(Math.round(x + col * 2), Math.round(y + r * 2), 2, 2);
  }));
}

function draw(ctx, state) {
  const [sky, hills, ground] = HABITAT[state.scene] || HABITAT["southern-ridges"];
  ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = hills;
  ctx.beginPath(); ctx.moveTo(0, MIN_Y + 6);
  for (let x = 0; x <= WIDTH; x += 40) ctx.lineTo(x, MIN_Y - 10 + ((x / 40) % 2 ? 8 : -4));
  ctx.lineTo(WIDTH, MIN_Y + 10); ctx.lineTo(0, MIN_Y + 10); ctx.fill();
  ctx.fillStyle = ground; ctx.fillRect(0, MIN_Y + 6, WIDTH, HEIGHT - MIN_Y);
  ctx.fillStyle = "rgba(30,60,30,.35)";
  for (let i = 0; i < 40; i += 1) ctx.fillRect((i * 41) % WIDTH, MIN_Y + 10 + ((i * 23) % (HEIGHT - MIN_Y - 12)), 1, 3);
  const { palette, species } = state.theme;
  state.animals.forEach((a) => {
    const sp = species.find((s) => s.id === a.kind);
    drawSprite(ctx, sp.sprite, palette, a.x, a.y, a.dir < 0);
    if (a.photographed) { ctx.strokeStyle = "#fdf6d8"; ctx.strokeRect(a.x - 2, a.y - 2, a.w + 4, a.h + 4); }
  });
  state.effects.forEach((e) => {
    ctx.fillStyle = e.kind === "hit" ? "#fdf6d8" : "rgba(60,40,20,.6)";
    if (e.text) { ctx.font = "8px monospace"; ctx.fillText(e.text, e.x + 6, e.y - 6 - (0.6 - e.life) * 20); }
    else ctx.fillRect(e.x - 2, e.y - 2, 4, 4);
  });
  if (state.flash > 0) { ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
  const { x, y } = state.aim;
  ctx.strokeStyle = "#1c1a18"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11); ctx.stroke();
  ctx.strokeStyle = "#fdf6d8"; ctx.lineWidth = 1; ctx.stroke();
}

/**
 * @param theme      a theme from expedition-themes.js
 * @param options    { scene, reducedMotion, onFinish(summary) -> Promise|void }
 */
export function createExpedition(theme, { scene = "southern-ridges", reducedMotion = false, onFinish = () => {} } = {}) {
  const canvas = h("canvas", { class: "expedition-canvas", width: WIDTH, height: HEIGHT, tabindex: "0", role: "img",
    "aria-label": `${theme.title} field. Arrow keys or W A S D move the sight, Space ${theme.actionLabel.toLowerCase()}s. On touch screens, tap an animal.` });
  const ctx = canvas.getContext ? canvas.getContext("2d") : null;
  const status = h("p", { class: "expedition-status", "aria-live": "polite" }, "Press Start when you're ready.");
  const hud = h("p", { class: "expedition-hud", "aria-live": "off" });
  const startBtn = h("button", { class: "btn primary", type: "button" }, "Start");
  const fireBtn = h("button", { class: "btn", type: "button", disabled: true }, theme.actionLabel);
  let state = null;
  let raf = 0;
  let last = 0;
  let finished = false;
  const keys = new Set();

  const updateHud = () => {
    if (!state) { hud.textContent = `${theme.roundSeconds} s · ${theme.ammo} ${theme.toolName} · score 0`; return; }
    const loaded = state.reload > 0 ? "reloading…" : `${state.loaded} ready`;
    hud.textContent = `${Math.ceil(state.time)} s · ${state.ammo} ${theme.toolName} (${loaded}) · score ${Math.round(state.score)}`;
  };
  const say = (text) => { status.textContent = text; };

  const doFire = () => {
    if (!state || state.over) return;
    const out = fire(state);
    if (out.result === "hit") say(`${theme.removeOnHit ? "Got" : "Snapped"} a ${out.species.name}: +${out.value}.`);
    else if (out.result === "miss") say(theme.removeOnHit ? "Missed." : "Nothing in frame.");
    else if (out.result === "reloading") say("Reloading…");
    else if (out.result === "empty") say(`Out of ${theme.toolName}.`);
    updateHud();
  };

  const finish = async () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    fireBtn.disabled = true;
    const s = summary(state);
    say(`Round over. ${theme.resultText(s)}`);
    startBtn.disabled = false;
    startBtn.textContent = "Play again";
    await onFinish(s);
  };

  const loop = (now) => {
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    const dx = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
    const dy = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
    step(state, dt, { dx, dy });
    if (ctx) draw(ctx, state);
    updateHud();
    if (state.over) { finish(); return; }
    raf = requestAnimationFrame(loop);
  };

  const start = () => {
    cancelAnimationFrame(raf);
    state = createRound(theme, { scene, speedFactor: reducedMotion ? 0.6 : 1 });
    finished = false; last = 0;
    startBtn.disabled = true; fireBtn.disabled = false;
    say(`Go! ${theme.roundSeconds} seconds.`);
    canvas.focus();
    raf = requestAnimationFrame(loop);
  };

  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * WIDTH, y: ((e.clientY - r.top) / r.height) * HEIGHT };
  };
  canvas.addEventListener("keydown", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === " " || k === "Enter") { e.preventDefault(); if (state && !state.over) doFire(); else if (!startBtn.disabled) start(); return; }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"].includes(k) && state && !state.over) { e.preventDefault(); keys.add(k); }
  });
  canvas.addEventListener("keyup", (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  canvas.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("pointermove", (e) => { if (state && !state.over && e.pointerType === "mouse") Object.assign(state.aim, toCanvas(e)); });
  canvas.addEventListener("pointerdown", (e) => {
    if (!state || state.over) return;
    e.preventDefault();
    Object.assign(state.aim, toCanvas(e));
    doFire();
  });
  startBtn.addEventListener("click", start);
  fireBtn.addEventListener("click", doFire);

  updateHud();
  if (ctx) draw(ctx, createRound(theme, { scene, rng: () => 0.5 }));

  const element = h("div", { class: "expedition" },
    h("div", { class: "expedition-frame" }, canvas),
    hud,
    h("div", { class: "row" }, startBtn, fireBtn),
    status);
  return { element, stop: () => { cancelAnimationFrame(raf); keys.clear(); } };
}
