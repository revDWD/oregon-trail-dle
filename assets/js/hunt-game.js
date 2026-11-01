// Retro hunting minigame. Pure game rules (newRound, step, fire) are separate from canvas rendering
// so they can be tested. Food from a finished round is sent to the community by hunt page wiring below.
(function () {
  "use strict";

  const WIDTH = 320;
  const HEIGHT = 180;
  const ROUND_SECONDS = 30;
  const AMMO = 12;
  const AIM_SPEED = 130;
  const MAX_ROUND_FOOD = 400;
  const SPAWN_EVERY = 1.1;
  const MAX_ANIMALS = 5;

  // food is in lbs; speed in logical pixels per second; w/h in logical pixels.
  const ANIMALS = {
    rabbit: { name: "rabbit", food: 2, speed: 95, w: 14, h: 9, weight: 4, colors: ["#b9a58a", "#8a7560"] },
    deer: { name: "deer", food: 50, speed: 62, w: 26, h: 18, weight: 3, colors: ["#a8683a", "#7a4a26"] },
    bear: { name: "bear", food: 80, speed: 42, w: 28, h: 18, weight: 1, colors: ["#4a3a30", "#2b211b"] },
    buffalo: { name: "buffalo", food: 100, speed: 30, w: 34, h: 20, weight: 2, colors: ["#5b3d28", "#3a2618"] }
  };

  function pickAnimal(random) {
    const kinds = Object.keys(ANIMALS);
    const total = kinds.reduce((sum, kind) => sum + ANIMALS[kind].weight, 0);
    let roll = random() * total;
    for (const kind of kinds) {
      roll -= ANIMALS[kind].weight;
      if (roll < 0) return kind;
    }
    return "rabbit";
  }

  function newRound(random) {
    return {
      random: random || Math.random,
      timeLeft: ROUND_SECONDS,
      ammo: AMMO,
      food: 0,
      kills: [],
      aim: { x: WIDTH / 2, y: HEIGHT / 2 },
      animals: [],
      spawnIn: 0.2,
      flash: 0,
      over: false
    };
  }

  function spawn(state) {
    const kind = pickAnimal(state.random);
    const spec = ANIMALS[kind];
    const fromLeft = state.random() < 0.5;
    state.animals.push({
      kind,
      x: fromLeft ? -spec.w : WIDTH,
      y: 70 + state.random() * (HEIGHT - 70 - spec.h - 6),
      dir: fromLeft ? 1 : -1
    });
  }

  // input: { dx, dy } in -1..1. Advances the round by dt seconds.
  function step(state, dt, input) {
    if (state.over) return state;
    const move = input || { dx: 0, dy: 0 };
    state.aim.x = Math.min(Math.max(state.aim.x + move.dx * AIM_SPEED * dt, 0), WIDTH);
    state.aim.y = Math.min(Math.max(state.aim.y + move.dy * AIM_SPEED * dt, 0), HEIGHT);
    state.timeLeft = Math.max(state.timeLeft - dt, 0);
    state.flash = Math.max(state.flash - dt, 0);

    state.spawnIn -= dt;
    if (state.spawnIn <= 0 && state.animals.length < MAX_ANIMALS) {
      spawn(state);
      state.spawnIn = SPAWN_EVERY;
    }
    state.animals.forEach((animal) => {
      animal.x += animal.dir * ANIMALS[animal.kind].speed * dt;
    });
    state.animals = state.animals.filter((animal) => animal.x > -40 && animal.x < WIDTH + 40);

    if (state.timeLeft <= 0 || (state.ammo <= 0 && state.flash <= 0)) state.over = true;
    return state;
  }

  // Fires at the current aim point; the nearest animal under the crosshair is the one hit.
  function fire(state) {
    if (state.over || state.ammo <= 0) return null;
    state.ammo -= 1;
    state.flash = 0.12;
    const { x, y } = state.aim;
    const index = state.animals.findIndex((animal) => {
      const spec = ANIMALS[animal.kind];
      return x >= animal.x && x <= animal.x + spec.w && y >= animal.y && y <= animal.y + spec.h;
    });
    if (index < 0) return null;
    const [animal] = state.animals.splice(index, 1);
    const food = Math.min(ANIMALS[animal.kind].food, MAX_ROUND_FOOD - state.food);
    state.food += Math.max(food, 0);
    state.kills.push(animal.kind);
    return { kind: animal.kind, food };
  }

  function draw(ctx, state) {
    ctx.fillStyle = "#e9d7a8";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#cfe0e8";
    ctx.fillRect(0, 0, WIDTH, 50);
    ctx.fillStyle = "#c9b172";
    ctx.fillRect(0, 50, WIDTH, HEIGHT - 50);
    ctx.fillStyle = "#6f8f4e";
    for (let x = 8; x < WIDTH; x += 46) ctx.fillRect(x, 60 + ((x * 7) % 90), 6, 3);

    state.animals.forEach((animal) => {
      const spec = ANIMALS[animal.kind];
      ctx.fillStyle = spec.colors[0];
      ctx.fillRect(Math.round(animal.x), Math.round(animal.y), spec.w, spec.h);
      ctx.fillStyle = spec.colors[1];
      ctx.fillRect(Math.round(animal.x + (animal.dir > 0 ? spec.w - 7 : 0)), Math.round(animal.y), 7, Math.max(spec.h - 8, 5));
      ctx.fillRect(Math.round(animal.x + 3), Math.round(animal.y + spec.h), 3, 4);
      ctx.fillRect(Math.round(animal.x + spec.w - 6), Math.round(animal.y + spec.h), 3, 4);
    });

    ctx.fillStyle = state.flash > 0 ? "#ffd84a" : "#7a2b1a";
    const ax = Math.round(state.aim.x);
    const ay = Math.round(state.aim.y);
    ctx.fillRect(ax - 8, ay - 1, 5, 2);
    ctx.fillRect(ax + 3, ay - 1, 5, 2);
    ctx.fillRect(ax - 1, ay - 8, 2, 5);
    ctx.fillRect(ax - 1, ay + 3, 2, 5);
  }

  window.OTDLE_HUNT = { WIDTH, HEIGHT, ROUND_SECONDS, AMMO, ANIMALS, newRound, step, fire };

  function initialize() {
    const root = document.querySelector("[data-hunt-game]");
    if (!root) return;
    const canvas = root.querySelector("[data-hunt-canvas]");
    const ctx = canvas.getContext("2d");
    const startButton = root.querySelector("[data-hunt-start]");
    const sendButton = root.querySelector("[data-hunt-send]");
    const nameField = root.querySelector("[data-hunt-name]");
    const message = root.querySelector("[data-hunt-message]");
    const timeText = root.querySelector("[data-hunt-time]");
    const ammoText = root.querySelector("[data-hunt-ammo]");
    const foodText = root.querySelector("[data-hunt-food]");
    const community = window.OTDLE_COMMUNITY;
    const keys = new Set();
    let state = newRoundForPage();
    let running = false;
    let last = 0;
    let sending = false;

    function newRoundForPage() {
      return newRound(() => {
        const buffer = new Uint32Array(1);
        window.crypto.getRandomValues(buffer);
        return buffer[0] / 4294967296;
      });
    }

    function readout() {
      timeText.textContent = `${Math.ceil(state.timeLeft)}s`;
      ammoText.textContent = String(state.ammo);
      foodText.textContent = `${state.food} lbs`;
    }

    function input() {
      return {
        dx: (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
        dy: (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0)
      };
    }

    function finish() {
      running = false;
      startButton.hidden = false;
      startButton.textContent = "Hunt again";
      sendButton.hidden = state.food <= 0;
      sendButton.disabled = false;
      message.classList.remove("is-error");
      message.textContent = state.food > 0
        ? `The hunt is over. You brought down ${state.kills.length} ${state.kills.length === 1 ? "animal" : "animals"} for ${state.food} lbs of food.`
        : "The hunt is over. Nothing this time; the plains are wide and the shots are few.";
    }

    function frame(now) {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      step(state, dt, input());
      draw(ctx, state);
      readout();
      if (state.over) finish();
      else window.requestAnimationFrame(frame);
    }

    function shoot() {
      if (!running) return;
      const hit = fire(state);
      message.textContent = hit ? `Hit! A ${hit.kind} adds ${hit.food} lbs.` : "Missed.";
    }

    function begin() {
      state = newRoundForPage();
      running = true;
      startButton.hidden = true;
      sendButton.hidden = true;
      message.classList.remove("is-error");
      message.textContent = "Aim with WASD or the arrow keys. Press Space or click to fire.";
      canvas.focus();
      last = window.performance.now();
      window.requestAnimationFrame(frame);
    }

    startButton.addEventListener("click", begin);

    document.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (!running) return;
      if (key === " " || key.startsWith("arrow")) event.preventDefault();
      if (key === " ") { if (!event.repeat) shoot(); return; }
      keys.add(key);
    });
    document.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

    canvas.addEventListener("pointerdown", (event) => {
      if (!running) return;
      const box = canvas.getBoundingClientRect();
      state.aim.x = ((event.clientX - box.left) / box.width) * WIDTH;
      state.aim.y = ((event.clientY - box.top) / box.height) * HEIGHT;
      shoot();
    });

    if (nameField && community) nameField.value = community.getName();
    sendButton.addEventListener("click", () => {
      if (sending || !community || state.food <= 0) return;
      sending = true;
      sendButton.disabled = true;
      message.classList.remove("is-error");
      message.textContent = "Bringing the food back to camp...";
      community.setName(nameField.value);
      community.submitFood(state.food, nameField.value).then(() => {
        message.textContent = `${state.food} lbs of food added to the community stores. Thank you!`;
        sendButton.hidden = true;
      }, (error) => {
        message.textContent = `Could not add the food: ${error.message}. Try again.`;
        message.classList.add("is-error");
        sendButton.disabled = false;
      }).finally(() => { sending = false; });
    });

    if (community) community.start();
    draw(ctx, state);
    readout();
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
