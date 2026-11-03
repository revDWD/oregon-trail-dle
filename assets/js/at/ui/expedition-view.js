// Wildlife Spotting view: the original Oregon Trail DLE hunt renderer (seeded scenery, outlined pixel
// animals with walk cycles, tall grass, weather, pop-ups, sound), redrawn for Appalachian Trail
// habitats with a camera viewfinder. Rules live in engine/expedition.js and data in
// engine/expedition-themes.js. Returns { element, stop } so the app can halt the loop when the route changes.
import { h } from "./dom.js";
import { WIDTH, HEIGHT, newRound, step, fire, animalAt, summary, chooseOuting, speciesOf, spottedList } from "../engine/expedition.js";

const OUTLINE = "#2a1d12";
const AUTUMN = [["#c8642a", "#e08a4a"], ["#d9a13a", "#ecc060"], ["#a8432a", "#c8643a"], ["#4b7a3a", "#6a9a4c"]];
const WEATHER_TEXT = { clear: "clear skies", windy: "windy", rain: "light rain", fog: "foggy", snow: "snowing" };

// Scenery is generated once per habitat from a fixed seed so each place looks the same every round.
const SCENERY = new Map();
function sceneryFor(theme, habitat) {
  const key = `${theme.id}:${habitat}`;
  if (SCENERY.has(key)) return SCENERY.get(key);
  const spec = theme.habitats[habitat];
  let seed = 20240513 + Object.keys(theme.habitats).indexOf(habitat) * 7919;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const place = (count, minY, maxY, extra) => {
    const items = [];
    for (let i = 0; i < count; i += 1) items.push({ x: Math.round(random() * (WIDTH - 12)) + 4, y: Math.round(minY + random() * (maxY - minY)), ...extra(random, i) });
    return items.sort((a, b) => a.y - b.y);
  };
  const scene = {
    trees: place(spec.trees, 36, 58, (r, i) => ({ h: 14 + Math.round(r() * 8), tint: i % AUTUMN.length })),
    shrubs: place(spec.shrubs, 60, 170, (r) => ({ w: 12 + Math.round(r() * 8) })),
    rocks: place(spec.rocks, 64, 172, (r) => ({ w: 5 + Math.round(r() * 7) })),
    logs: place(spec.logs, 70, 168, (r) => ({ w: 18 + Math.round(r() * 10) })),
    tall: place(spec.tall, 62, 176, (r) => ({ h: 5 + Math.round(r() * 3) })),
    tufts: place(22, 58, 176, () => ({})),
    patches: place(6, 70, 160, (r) => ({ w: 28 + Math.round(r() * 40) })),
    waterY: 96 + Math.round(random() * 30)
  };
  SCENERY.set(key, scene);
  return scene;
}

function drawBackdrop(ctx, b, weather) {
  if (b.backdrop === "peaks") {
    const height = (x) => 10 + Math.abs(Math.sin(x / 41) * 26) + Math.abs(Math.sin(x / 13)) * 4;
    ctx.fillStyle = b.far;
    for (let x = 0; x < WIDTH; x += 4) ctx.fillRect(x, 46 - Math.round(height(x)), 4, Math.round(height(x)));
    ctx.fillStyle = weather === "snow" ? "#f4f7fa" : "#c9cdd2";
    for (let x = 0; x < WIDTH; x += 4) if (height(x) > 26) ctx.fillRect(x, 46 - Math.round(height(x)), 4, 4);
    return;
  }
  if (b.backdrop === "ridges") {
    // The Blue Ridge: layered ridgelines fading into the haze.
    [["#a9c0d2", 22, 6, 37, 0], ["#7f9db4", 30, 5, 29, 2], [b.far, 38, 5, 21, 4]].forEach(([colour, base, amp, period, offset]) => {
      ctx.fillStyle = colour;
      for (let x = 0; x < WIDTH; x += 4) {
        const top = Math.round(base + Math.sin(x / period + offset) * amp);
        ctx.fillRect(x, top, 4, 46 - top);
      }
    });
    return;
  }
  if (b.backdrop === "balds") {
    // Rounded summits with grassy, treeless tops.
    const height = (x) => 14 + Math.abs(Math.sin(x / 52)) * 18;
    ctx.fillStyle = b.far;
    for (let x = 0; x < WIDTH; x += 4) ctx.fillRect(x, 46 - Math.round(height(x)), 4, Math.round(height(x)));
    ctx.fillStyle = "#a9c47e";
    for (let x = 0; x < WIDTH; x += 4) if (height(x) > 24) ctx.fillRect(x, 46 - Math.round(height(x)), 4, 5);
    return;
  }
  ctx.fillStyle = b.far;
  for (let x = 0; x < WIDTH; x += 8) ctx.fillRect(x, 34 + Math.round(Math.sin(x / 23) * 5 + 5), 8, 14);
}

function drawTree(ctx, tree, b, autumn) {
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(tree.x + 3, tree.y, 4, tree.h);
  ctx.fillStyle = "#6b4a2b";
  ctx.fillRect(tree.x + 4, tree.y, 2, tree.h - 1);
  if (b.pines) {
    [[0, 11, 10], [1, 6, 8], [3, 1, 4]].forEach(([inset, off, w], i) => {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(tree.x - 3 + inset, tree.y - off - 1, w + 7 - inset * 2, 5);
      ctx.fillStyle = i % 2 ? "#2f5a35" : "#3b6e40";
      ctx.fillRect(tree.x - 2 + inset, tree.y - off, w + 5 - inset * 2, 3);
    });
    return;
  }
  const [leaf, shine] = autumn ? AUTUMN[tree.tint] : AUTUMN[3];
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(tree.x - 1, tree.y - 10, 12, 12);
  ctx.fillStyle = leaf;
  ctx.fillRect(tree.x, tree.y - 9, 10, 10);
  ctx.fillStyle = shine;
  ctx.fillRect(tree.x + 1, tree.y - 9, 4, 3);
}

function drawScenery(ctx, state, still) {
  const b = state.theme.habitats[state.habitat];
  const scene = sceneryFor(state.theme, state.habitat);
  const clock = still ? 0 : state.clock;
  ctx.fillStyle = b.sky;
  ctx.fillRect(0, 0, WIDTH, 46);
  ctx.fillStyle = b.haze;
  ctx.fillRect(0, 30, WIDTH, 16);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(40, 10, 26, 4);
  ctx.fillRect(46, 7, 14, 3);
  ctx.fillRect(190, 16, 32, 4);
  ctx.fillRect(198, 13, 16, 3);
  drawBackdrop(ctx, b, state.weather);

  ctx.fillStyle = b.ground;
  ctx.fillRect(0, 46, WIDTH, HEIGHT - 46);
  ctx.fillStyle = b.band;
  ctx.fillRect(0, 46, WIDTH, 14);
  ctx.fillStyle = b.patch;
  scene.patches.forEach((patch) => ctx.fillRect(patch.x, patch.y, patch.w, 5));

  if (b.water) {
    const y = scene.waterY;
    const depth = b.water === "lake" ? 22 : 12;
    if (b.water === "lake") { ctx.fillStyle = "#c9b98a"; ctx.fillRect(0, y - 2, WIDTH, depth + 4); }
    ctx.fillStyle = "#5f8fa8";
    ctx.fillRect(0, y, WIDTH, depth);
    ctx.fillStyle = "#86b4c8";
    ctx.fillRect(0, y + 2, WIDTH, 3);
    ctx.fillStyle = "#e8f4f8";
    for (let x = 0; x < WIDTH; x += 36) ctx.fillRect((x + Math.floor(clock * 8)) % WIDTH, y + 6, 8, 1);
    if (b.water === "lake") for (let x = 18; x < WIDTH; x += 52) ctx.fillRect((x + Math.floor(clock * 5)) % WIDTH, y + 14, 6, 1);
  }

  scene.trees.forEach((tree) => drawTree(ctx, tree, b, state.autumn));
  scene.logs.forEach((log) => {
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(log.x - 1, log.y - 1, log.w + 2, 8);
    ctx.fillStyle = "#7b5535";
    ctx.fillRect(log.x, log.y, log.w, 6);
    ctx.fillStyle = "#9a7448";
    ctx.fillRect(log.x, log.y, log.w, 2);
    ctx.fillStyle = "#d9c08a";
    ctx.fillRect(log.x + log.w - 2, log.y + 1, 2, 4);
  });
  scene.rocks.forEach((rock) => {
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(rock.x - 1, rock.y - 1, rock.w + 2, 6);
    ctx.fillStyle = "#8d8a80";
    ctx.fillRect(rock.x, rock.y, rock.w, 4);
    ctx.fillStyle = "#b1aea2";
    ctx.fillRect(rock.x, rock.y, Math.max(rock.w - 3, 2), 1);
  });
  scene.shrubs.forEach((shrub) => {
    ctx.fillStyle = "#3e5c2c";
    ctx.fillRect(shrub.x, shrub.y + 4, shrub.w, 4);
    ctx.fillStyle = "#587d3d";
    ctx.fillRect(shrub.x + 2, shrub.y + 1, shrub.w - 4, 5);
    ctx.fillStyle = "#79a054";
    ctx.fillRect(shrub.x + 3, shrub.y, Math.max(shrub.w - 8, 3), 2);
  });
  ctx.fillStyle = b.tuft;
  scene.tufts.forEach((tuft) => {
    ctx.fillRect(tuft.x, tuft.y, 1, 3);
    ctx.fillRect(tuft.x + 2, tuft.y - 1, 1, 4);
    ctx.fillRect(tuft.x + 4, tuft.y + 1, 1, 2);
  });
}

function drawAnimal(ctx, state, animal) {
  const spec = speciesOf(state.theme, animal.kind);
  const ax = Math.round(animal.x);
  const ay = Math.round(animal.y);
  const walk = animal.pause > 0 || animal.phase === undefined ? 0 : (Math.floor(animal.phase) % 2 ? 1 : -1);
  const nod = animal.pause > 0 && spec.graze ? (Math.floor(state.clock * 2.5 + (animal.phase || 0)) % 2) * 2 : 0;
  const bob = animal.pause > 0 ? nod : (walk > 0 ? 0 : 1);
  const legA = walk > 0 ? 0 : 1;
  const legB = walk > 0 ? 1 : 0;
  const stride = { 1: legA, 2: legB, "-1": -legA, "-2": -legB };
  const place = (part, grow) => {
    const [x, y, w, hgt, , leg] = part;
    const tall = hgt + (leg ? stride[leg] : 0);
    const px = animal.dir > 0 ? x : spec.w - x - w;
    return [ax + px - grow, ay + y + bob - grow, w + grow * 2, tall + grow * 2];
  };
  ctx.fillStyle = "rgba(60, 40, 20, 0.28)";
  ctx.fillRect(ax + 1, ay + spec.h + 3, spec.w - 2, 2);
  ctx.fillStyle = OUTLINE;
  spec.parts.forEach((part) => ctx.fillRect(...place(part, 1)));
  spec.parts.forEach((part) => {
    ctx.fillStyle = part[4] === 2 ? spec.light : spec.colors[part[4]];
    ctx.fillRect(...place(part, 0));
  });
}

// Tall grass is drawn after the animals so wildlife can be partly hidden in it.
function drawTallGrass(ctx, state, still) {
  const b = state.theme.habitats[state.habitat];
  ctx.fillStyle = b.tuft;
  sceneryFor(state.theme, state.habitat).tall.forEach((blade) => {
    const sway = still ? 0 : Math.round(Math.sin(state.clock * 2 + blade.x));
    ctx.fillRect(blade.x + sway, blade.y - blade.h, 1, blade.h);
    ctx.fillRect(blade.x + 2, blade.y - blade.h + 2, 1, blade.h - 2);
    ctx.fillRect(blade.x + 4 - sway, blade.y - blade.h + 1, 1, blade.h - 1);
  });
}

function drawWeather(ctx, state, still) {
  const clock = still ? 0 : state.clock;
  if (state.weather === "rain") {
    ctx.fillStyle = "rgba(40, 60, 90, 0.12)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(220, 235, 250, 0.7)";
    for (let i = 0; i < 46; i += 1) ctx.fillRect((i * 53 + Math.floor(clock * 60)) % WIDTH, (i * 37 + Math.floor(clock * 220)) % HEIGHT, 1, 5);
  } else if (state.weather === "snow") {
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    for (let i = 0; i < 50; i += 1) {
      const x = (i * 61 + Math.floor(Math.sin(clock + i) * 6) + Math.floor(clock * 10) + WIDTH) % WIDTH;
      ctx.fillRect(x, (i * 29 + Math.floor(clock * 40)) % HEIGHT, 2, 2);
    }
  } else if (state.weather === "fog") {
    ctx.fillStyle = "rgba(235, 240, 240, 0.28)";
    ctx.fillRect(0, 40, WIDTH, HEIGHT - 40);
    ctx.fillStyle = "rgba(235, 240, 240, 0.18)";
    ctx.fillRect(0, 70 + Math.round(Math.sin(clock / 2) * 6), WIDTH, 40);
  } else if (state.weather === "windy") {
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    for (let i = 0; i < 8; i += 1) ctx.fillRect((i * 97 + Math.floor(clock * 180)) % (WIDTH + 40) - 20, 20 + i * 18, 16, 1);
  }
}

function drawEffects(ctx, state) {
  state.puffs.forEach((puff) => {
    const size = 3 + Math.round(puff.age * 26);
    ctx.fillStyle = puff.hit ? "rgba(255, 255, 255, 0.9)" : "rgba(214, 190, 140, 0.8)";
    ctx.fillRect(Math.round(puff.x - size / 2), Math.round(puff.y - 1), size, 2);
    ctx.fillRect(Math.round(puff.x - 1), Math.round(puff.y - size / 2), 2, size);
  });
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  state.popups.forEach((popup) => {
    const y = Math.round(popup.y - 4 - popup.age * 18);
    ctx.fillStyle = OUTLINE;
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([ox, oy]) => ctx.fillText(popup.text, Math.round(popup.x) + ox, y + oy));
    ctx.fillStyle = "#ffe36a";
    ctx.fillText(popup.text, Math.round(popup.x), y);
  });
  ctx.textAlign = "left";
}

// Camera viewfinder: four corner brackets that turn green when an animal is in frame.
function drawViewfinder(ctx, state) {
  const ax = Math.round(state.aim.x);
  const ay = Math.round(state.aim.y);
  const colour = state.flash > 0 ? "#ffb300" : animalAt(state, state.aim.x, state.aim.y) >= 0 ? "#1f8f3a" : "#7a2b1a";
  const mark = (x, y, w, hgt) => {
    ctx.fillStyle = "#fff6dc";
    ctx.fillRect(x - 1, y - 1, w + 2, hgt + 2);
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, w, hgt);
  };
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
    const cx = ax + sx * 11;
    const cy = ay + sy * 8;
    mark(sx < 0 ? cx : cx - 5, sy < 0 ? cy : cy - 1, 6, 2);
    mark(sx < 0 ? cx : cx - 1, sy < 0 ? cy : cy - 5, 2, 6);
  });
  mark(ax - 1, ay - 1, 2, 2);
}

export function draw(ctx, state, { still = false } = {}) {
  drawScenery(ctx, state, still);
  state.animals.slice().sort((a, b) => a.y - b.y).forEach((animal) => drawAnimal(ctx, state, animal));
  drawTallGrass(ctx, state, still);
  drawWeather(ctx, state, still);
  ctx.fillStyle = "#5d7f43";
  sceneryFor(state.theme, state.habitat).tufts.slice(0, 8).forEach((tuft) => ctx.fillRect(tuft.x + 6, HEIGHT - 4, 1, 4));
  drawEffects(ctx, state);
  if (state.flash > 0.08 && !still) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  drawViewfinder(ctx, state);
}

// Small synthesized sound effects; silently disabled where Web Audio is unavailable.
function createAudio() {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) return null;
  let audio = null;
  let muted = false;
  const tone = (from, to, seconds, type, volume) => {
    if (muted) return;
    try {
      audio = audio || new Context();
      if (audio.state === "suspended") audio.resume();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const now = audio.currentTime;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, now);
      oscillator.frequency.exponentialRampToValueAtTime(to, now + seconds);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(now);
      oscillator.stop(now + seconds);
    } catch {
      muted = true;
    }
  };
  return {
    shutter: () => tone(1600, 700, 0.06, "square", 0.05),
    hit: () => tone(520, 880, 0.16, "triangle", 0.12),
    miss: () => tone(140, 90, 0.08, "sine", 0.05),
    end: () => tone(330, 165, 0.35, "triangle", 0.1),
    setMuted: (value) => { muted = value; }
  };
}

const isField = (target) => Boolean(target && target.closest && target.closest("input, textarea, select, [contenteditable]"));

/**
 * @param theme    a theme from expedition-themes.js
 * @param options  { localHabitat (region scene), month (1-12), reducedMotion, random, onFinish(summary) -> Promise|void }
 */
export function createExpedition(theme, { localHabitat, month = new Date().getMonth() + 1, reducedMotion = false, random, onFinish = () => {} } = {}) {
  const rules = theme.rounds;
  const pickOuting = () => chooseOuting(theme, localHabitat, { random, month });
  const roundFor = (outing) => newRound(theme, { ...outing, random, speedFactor: reducedMotion ? 0.6 : 1 });
  let state = roundFor(pickOuting());
  let running = false;
  let raf = 0;
  let last = 0;
  const keys = new Set();
  const sound = createAudio();

  const canvas = h("canvas", { class: "expedition-canvas", width: WIDTH, height: HEIGHT, tabindex: "0", role: "img",
    "aria-label": `${theme.title} field. Move the viewfinder with W A S D or the arrow keys and press Space to ${theme.action}, or tap an animal.` });
  const ctx = canvas.getContext ? canvas.getContext("2d") : null;
  const readout = (label) => { const value = h("strong", {}); return { value, box: h("div", {}, h("span", {}, label), value) }; };
  const time = readout("Time");
  const ammo = readout(theme.shotsLabel);
  const reload = readout(theme.reloadLabel);
  const score = readout(theme.scoreLabel);
  const message = h("p", { class: "expedition-status", role: "status", "aria-live": "polite" });
  const startButton = h("button", { class: "btn primary", type: "button" }, theme.start);
  const muteButton = h("button", { class: "btn small", type: "button", "aria-pressed": "false", hidden: !sound }, "Sound on");

  const groundText = () => {
    const habitat = theme.habitats[state.habitat];
    return `${habitat.label}, ${WEATHER_TEXT[state.weather] || state.weather}${state.autumn && !habitat.pines ? ", autumn colours" : ""}.`;
  };
  const updateReadout = () => {
    time.value.textContent = `${Math.ceil(state.timeLeft)}s`;
    ammo.value.textContent = `${state.ammo} (${state.clip} wound)`;
    reload.value.textContent = state.reload > 0 ? `${state.reload.toFixed(1)}s` : "Ready";
    score.value.textContent = `${state.score} ${theme.unitShort}`;
  };
  const paint = () => { if (ctx) draw(ctx, state, { still: reducedMotion }); };
  const input = () => ({
    dx: (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
    dy: (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0)
  });

  function onKeyDown(event) {
    if (!running || isField(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === " " || key.startsWith("arrow")) event.preventDefault();
    if (key === " ") { if (!event.repeat) snap(); return; }
    keys.add(key);
  }
  function onKeyUp(event) { keys.delete(event.key.toLowerCase()); }
  const listen = (on) => {
    const method = on ? "addEventListener" : "removeEventListener";
    document[method]("keydown", onKeyDown);
    document[method]("keyup", onKeyUp);
  };

  async function finish() {
    running = false;
    listen(false);
    keys.clear();
    if (sound) sound.end();
    startButton.hidden = false;
    startButton.textContent = theme.again;
    const result = summary(state);
    message.textContent = theme.text.finish(result, spottedList(theme, state.spotted));
    await onFinish(result);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    step(state, dt, input());
    paint();
    updateReadout();
    if (state.over) finish();
    else raf = requestAnimationFrame(frame);
  }

  function snap() {
    if (!running) return;
    const out = fire(state);
    if (out.result === "reloading") { message.textContent = theme.text.reloading(state.reload.toFixed(1)); return; }
    if (out.result === "cooldown") { message.textContent = theme.text.cooldown; return; }
    if (out.result !== "hit" && out.result !== "miss") return;
    if (sound) {
      sound.shutter();
      if (out.result === "hit") sound.hit(); else sound.miss();
    }
    message.textContent = out.result === "hit" ? theme.text.hit(out.species, out.value) : theme.text.miss(state.reload > 0 ? state.reload.toFixed(1) : null);
    paint();
    updateReadout();
  }

  function begin() {
    if (state.over || state.shots) state = roundFor(pickOuting());
    running = true;
    startButton.hidden = true;
    message.textContent = theme.text.intro(groundText());
    canvas.focus({ preventScroll: true });
    canvas.scrollIntoView?.({ block: "nearest" });
    listen(true);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function aimAt(event) {
    const box = canvas.getBoundingClientRect();
    state.aim.x = Math.min(Math.max(((event.clientX - box.left) / box.width) * WIDTH, 0), WIDTH);
    state.aim.y = Math.min(Math.max(((event.clientY - box.top) / box.height) * HEIGHT, 0), HEIGHT);
  }

  startButton.addEventListener("click", begin);
  muteButton.addEventListener("click", () => {
    const muted = muteButton.getAttribute("aria-pressed") !== "true";
    muteButton.setAttribute("aria-pressed", String(muted));
    muteButton.textContent = muted ? "Sound off" : "Sound on";
    if (sound) sound.setMuted(muted);
  });
  canvas.addEventListener("keydown", (event) => {
    if (running || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    // begin() adds document listeners mid-dispatch; stop this key reaching them as a snap.
    event.stopPropagation();
    begin();
  });
  canvas.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("pointermove", (event) => { if (running && event.pointerType === "mouse") aimAt(event); });
  canvas.addEventListener("pointerdown", (event) => {
    if (!running) return;
    event.preventDefault();
    aimAt(event);
    snap();
  });

  message.textContent = `Today's spot: ${groundText()} Press ${theme.start.toLowerCase()} when you're ready.`;
  updateReadout();
  paint();

  const help = theme.species.map((sp) => `${sp.name[0].toUpperCase()}${sp.name.slice(1)} ${sp.value}`).join(" · ");
  const element = h("div", { class: "expedition" },
    h("div", { class: "expedition-hud", "aria-live": "off" }, time.box, ammo.box, reload.box, score.box),
    h("div", { class: "expedition-frame" }, canvas),
    h("p", { class: "expedition-help" }, `${help} points. Wildlife follows the section of trail you're on. W A S D or arrows to aim; Space or tap to ${theme.action}. Four frames are wound at a time; the next ones wind automatically. A missed frame startles nearby wildlife.`),
    h("div", { class: "expedition-footer" }, message, h("div", { class: "row" }, muteButton, startButton)));
  return {
    element,
    stop: () => { running = false; cancelAnimationFrame(raf); listen(false); keys.clear(); }
  };
}
