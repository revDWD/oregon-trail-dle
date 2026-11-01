// Retro hunting minigame. Pure game rules (newRound, step, fire) are separate from canvas rendering
// so they can be tested. Food from a finished round is sent to the community by hunt page wiring below.
(function () {
  "use strict";

  const WIDTH = 320;
  const HEIGHT = 180;
  const ROUND_SECONDS = 30;
  const AMMO = 12;
  const AIM_SPEED = 150;
  const MAX_ROUND_FOOD = 400;
  const SPAWN_EVERY = 1.1;
  const MAX_ANIMALS = 6;
  const MIN_Y = 62;
  const HIT_PAD = 2;
  const STARTLE_RADIUS = 46;
  const LEAVE_AFTER = 14;

  // food is in lbs; speed in logical pixels per second; w/h in logical pixels.
  // behavior: chance to pause / turn each time the animal re-decides, speed multiplier and drift ranges, decision timer.
  const ANIMALS = {
    rabbit: {
      name: "rabbit", food: 2, speed: 80, w: 14, h: 9, skittish: true,
      behavior: { pause: 0.45, turn: 0.15, mult: [1, 2], drift: 45, timer: [0.35, 1], pauseTime: [0.3, 0.8] }
    },
    turkey: {
      name: "turkey", food: 12, speed: 46, w: 14, h: 13, skittish: true, graze: true,
      behavior: { pause: 0.4, turn: 0.25, mult: [0.8, 1.9], drift: 20, timer: [0.5, 1.4], pauseTime: [0.5, 1.2] }
    },
    deer: {
      name: "deer", food: 50, speed: 58, w: 26, h: 18, skittish: true, graze: true, herd: 2,
      behavior: { pause: 0.2, turn: 0.2, mult: [0.7, 1.5], drift: 24, timer: [1, 2.4], pauseTime: [0.8, 1.7] }
    },
    elk: {
      name: "elk", food: 85, speed: 52, w: 32, h: 22, skittish: true, graze: true, herd: 3,
      behavior: { pause: 0.25, turn: 0.12, mult: [0.7, 1.4], drift: 18, timer: [1.2, 2.6], pauseTime: [0.9, 1.8] }
    },
    bear: {
      name: "bear", food: 80, speed: 40, w: 28, h: 18, skittish: false,
      behavior: { pause: 0.3, turn: 0.15, mult: [0.6, 1.3], drift: 14, timer: [1.5, 3], pauseTime: [0.8, 1.6] }
    },
    buffalo: {
      name: "buffalo", food: 100, speed: 30, w: 34, h: 20, skittish: false, graze: true, herd: 3,
      behavior: { pause: 0.25, turn: 0.1, mult: [0.8, 1.2], drift: 8, timer: [1.5, 3], pauseTime: [0.8, 1.5] }
    }
  };

  // Hunting grounds. animals: spawn weights in the order rabbit, turkey, deer, elk, bear, buffalo.
  // Scenery counts and colors drive the seeded scenery; far is the backdrop style.
  const KINDS = ["rabbit", "turkey", "deer", "elk", "bear", "buffalo"];
  const BIOMES = {
    prairie: { label: "Prairie", animals: [4, 1, 3, 0, 1, 3], sky: "#bcd9e6", haze: "#d6e8ee", far: "#b6a68c", ground: "#d8c58a", band: "#cdb87a", patch: "#c9b270", tuft: "#6f8f4e", trees: 1, pines: false, shrubs: 6, rocks: 5, logs: 1, tall: 14, backdrop: "spire" },
    grassland: { label: "Grassland", animals: [4, 2, 3, 1, 0, 3], sky: "#c4e0e8", haze: "#dcefee", far: "#8fa56a", ground: "#b9c77a", band: "#a9b96a", patch: "#9fb260", tuft: "#4f7a3a", trees: 2, pines: false, shrubs: 8, rocks: 3, logs: 0, tall: 30, backdrop: "hills" },
    forest: { label: "Forest", animals: [3, 3, 3, 2, 2, 0], sky: "#b9d3d6", haze: "#d0e2e2", far: "#4e6b48", ground: "#8fa268", band: "#7f9358", patch: "#728a4e", tuft: "#3e6a35", trees: 16, pines: true, shrubs: 10, rocks: 5, logs: 3, tall: 8, backdrop: "hills" },
    riverbank: { label: "Riverbank", animals: [3, 2, 3, 1, 1, 1], sky: "#bcd9e6", haze: "#d6e8ee", far: "#9aa77a", ground: "#c9c58a", band: "#b9b87a", patch: "#b2b070", tuft: "#5d8a45", trees: 5, pines: false, shrubs: 8, rocks: 7, logs: 2, tall: 16, backdrop: "hills", stream: true },
    foothills: { label: "Foothills", animals: [3, 1, 2, 3, 2, 0], sky: "#c0d6e4", haze: "#d9e6ee", far: "#8a7f78", ground: "#c4a56c", band: "#b8996a", patch: "#ae9060", tuft: "#7a8a4a", trees: 6, pines: true, shrubs: 6, rocks: 12, logs: 1, tall: 10, backdrop: "mesa" },
    mountains: { label: "Mountain edge", animals: [2, 0, 1, 3, 2, 0], sky: "#c5d5e2", haze: "#dfe8ef", far: "#6f7a8c", ground: "#a9a58f", band: "#9a9680", patch: "#908c78", tuft: "#6a7a52", trees: 8, pines: true, shrubs: 3, rocks: 14, logs: 2, tall: 5, backdrop: "peaks" }
  };
  const WEATHERS = ["clear", "clear", "clear", "clear", "windy", "rain", "fog"];

  // Where the wagon train is decides which ground the hunters visit.
  const BIOME_BY_MILES = [[0, "grassland"], [320, "riverbank"], [626, "prairie"], [865, "foothills"], [973, "mountains"], [1294, "riverbank"], [1550, "foothills"], [1750, "forest"], [1951, "riverbank"]];
  function biomeForMiles(miles) {
    let id = "prairie";
    BIOME_BY_MILES.forEach(([from, biome]) => { if ((miles || 0) >= from) id = biome; });
    return id;
  }
  const between = (random, range) => range[0] + random() * (range[1] - range[0]);
  const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

  function pickAnimal(random, biome) {
    const weights = (BIOMES[biome] || BIOMES.prairie).animals;
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = random() * total;
    for (let i = 0; i < KINDS.length; i += 1) {
      roll -= weights[i];
      if (roll < 0) return KINDS[i];
    }
    return "rabbit";
  }

  // options: { biome, weather } chosen by the page; tests and callers that omit them get a clear prairie.
  function newRound(random, options) {
    const choice = options || {};
    return {
      random: random || Math.random,
      biome: BIOMES[choice.biome] ? choice.biome : "prairie",
      weather: choice.weather || "clear",
      clock: 0,
      shake: 0,
      nextHerd: 1,
      timeLeft: ROUND_SECONDS,
      ammo: AMMO,
      food: 0,
      kills: [],
      aim: { x: WIDTH / 2, y: HEIGHT / 2 },
      animals: [],
      popups: [],
      puffs: [],
      spawnIn: 0.2,
      flash: 0,
      over: false
    };
  }

  // Herd animals sometimes arrive as a small group that tends to move together.
  function spawn(state) {
    const kind = pickAnimal(state.random, state.biome);
    const spec = ANIMALS[kind];
    const fromLeft = state.random() < 0.5;
    const baseY = MIN_Y + 8 + state.random() * (HEIGHT - MIN_Y - 8 - spec.h - 8);
    let count = 1;
    if (spec.herd && state.random() < 0.5) count = Math.min(1 + Math.ceil(state.random() * (spec.herd - 1)), MAX_ANIMALS + 1 - state.animals.length);
    const herdId = count > 1 ? state.nextHerd++ : 0;
    for (let i = 0; i < Math.max(count, 1); i += 1) {
      state.animals.push({
        kind,
        herdId,
        x: fromLeft ? -spec.w - i * (spec.w + 6) : WIDTH + i * (spec.w + 6),
        y: clamp(baseY + (i % 2 ? 10 : -4) * (i ? 1 : 0), MIN_Y, HEIGHT - spec.h - 6),
        dir: fromLeft ? 1 : -1
      });
    }
  }
  // Animals pushed by tests or spawn() get their behavior state lazily so plain {kind, x, y, dir} objects work.
  function prepare(state, animal) {
    if (animal.age !== undefined) return;
    animal.age = 0;
    animal.phase = state.random() * 6;
    animal.mult = 1;
    animal.drift = 0;
    animal.pause = 0;
    animal.timer = 0.3 + state.random();
  }

  function decide(state, animal, spec) {
    const rule = spec.behavior;
    const random = state.random;
    const inside = animal.x > 16 && animal.x + spec.w < WIDTH - 16;
    const roll = random();
    animal.timer = between(random, rule.timer);
    const mate = animal.herdId ? state.animals.find((other) => other !== animal && other.herdId === animal.herdId) : null;
    if (mate && random() < 0.6) {
      animal.dir = mate.dir;
      animal.mult = mate.mult;
      animal.drift = mate.drift;
      return;
    }
    if (roll < rule.pause) {
      animal.pause = between(random, rule.pauseTime);
      animal.drift = 0;
      return;
    }
    if (roll < rule.pause + rule.turn && inside && animal.age < LEAVE_AFTER) animal.dir = -animal.dir;
    animal.mult = between(random, rule.mult);
    animal.drift = (random() * 2 - 1) * rule.drift;
  }

  function move(state, animal, dt) {
    const spec = ANIMALS[animal.kind];
    prepare(state, animal);
    animal.age += dt;
    if (animal.age >= LEAVE_AFTER && animal.pause > 0) animal.pause = 0;
    if (animal.pause > 0) {
      animal.pause -= dt;
      return;
    }
    animal.timer -= dt;
    if (animal.timer <= 0) decide(state, animal, spec);
    animal.phase += dt * 9 * animal.mult;
    animal.x += animal.dir * spec.speed * animal.mult * dt;
    const low = MIN_Y;
    const high = HEIGHT - spec.h - 6;
    animal.y = clamp(animal.y + animal.drift * dt, low, high);
    if (animal.y === low || animal.y === high) animal.drift = -animal.drift;
  }

  // A shot that misses spooks nearby skittish animals so they bolt away from the crosshair.
  function startle(state) {
    const { x, y } = state.aim;
    const spooked = [];
    state.animals.forEach((animal) => {
      const spec = ANIMALS[animal.kind];
      if (!spec.skittish) return;
      prepare(state, animal);
      const dx = animal.x + spec.w / 2 - x;
      const dy = animal.y + spec.h / 2 - y;
      if (Math.hypot(dx, dy) > STARTLE_RADIUS) return;
      animal.dir = dx >= 0 ? 1 : -1;
      animal.pause = 0;
      animal.mult = 2;
      animal.timer = 1.2;
      spooked.push(animal);
    });
    spooked.forEach((scared) => {
      if (!scared.herdId) return;
      state.animals.forEach((mate) => {
        if (mate.herdId !== scared.herdId || mate === scared) return;
        prepare(state, mate);
        mate.dir = scared.dir;
        mate.pause = 0;
        mate.mult = 2;
        mate.timer = 1.2;
      });
    });
  }

  function ageEffects(list, dt, life) {
    list.forEach((item) => { item.age += dt; });
    return list.filter((item) => item.age < life);
  }

  // input: { dx, dy } in -1..1. Advances the round by dt seconds.
  function step(state, dt, input) {
    if (state.over) return state;
    const move2 = input || { dx: 0, dy: 0 };
    const length = Math.hypot(move2.dx, move2.dy) || 1;
    const scale = length > 1 ? 1 / length : 1;
    state.aim.x = clamp(state.aim.x + move2.dx * scale * AIM_SPEED * dt, 0, WIDTH);
    state.aim.y = clamp(state.aim.y + move2.dy * scale * AIM_SPEED * dt, 0, HEIGHT);
    state.timeLeft = Math.max(state.timeLeft - dt, 0);
    state.clock = (state.clock || 0) + dt;
    state.flash = Math.max(state.flash - dt, 0);
    state.popups = ageEffects(state.popups || [], dt, 1.1);
    state.puffs = ageEffects(state.puffs || [], dt, 0.35);

    state.spawnIn -= dt;
    if (state.spawnIn <= 0 && state.animals.length < MAX_ANIMALS) {
      spawn(state);
      state.spawnIn = SPAWN_EVERY;
    }
    state.animals.forEach((animal) => move(state, animal, dt));
    state.animals = state.animals.filter((animal) => animal.x > -40 && animal.x < WIDTH + 40);

    if (state.timeLeft <= 0 || (state.ammo <= 0 && state.flash <= 0)) state.over = true;
    return state;
  }

  function animalAt(state, x, y) {
    return state.animals.findIndex((animal) => {
      const spec = ANIMALS[animal.kind];
      return x >= animal.x - HIT_PAD && x <= animal.x + spec.w + HIT_PAD && y >= animal.y - HIT_PAD && y <= animal.y + spec.h + HIT_PAD;
    });
  }

  // Fires at the current aim point; the first animal under the crosshair is the one hit.
  function fire(state) {
    if (state.over || state.ammo <= 0) return null;
    state.ammo -= 1;
    state.flash = 0.12;
    const { x, y } = state.aim;
    const index = animalAt(state, x, y);
    if (index < 0) {
      state.puffs.push({ x, y, age: 0, hit: false });
      startle(state);
      return null;
    }
    const [animal] = state.animals.splice(index, 1);
    const food = Math.max(Math.min(ANIMALS[animal.kind].food, MAX_ROUND_FOOD - state.food), 0);
    state.food += food;
    state.kills.push(animal.kind);
    state.puffs.push({ x, y, age: 0, hit: true });
    state.popups.push({ x: animal.x + ANIMALS[animal.kind].w / 2, y: animal.y, age: 0, text: food > 0 ? `+${food} lbs` : "Wagons full" });
    return { kind: animal.kind, food };
  }

  // Scenery is generated once per ground from a fixed seed so each field looks the same every round.
  function buildScenery(biome) {
    const spec = BIOMES[biome];
    let seed = 20240513 + Object.keys(BIOMES).indexOf(biome) * 7919;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const place = (count, minY, maxY, extra) => {
      const items = [];
      for (let i = 0; i < count; i += 1) items.push({ x: Math.round(random() * (WIDTH - 12)) + 4, y: Math.round(minY + random() * (maxY - minY)), ...extra(random) });
      return items.sort((a, b) => a.y - b.y);
    };
    return {
      trees: place(spec.trees, 36, 58, (r) => ({ h: 14 + Math.round(r() * 8) })),
      shrubs: place(spec.shrubs, 60, 170, (r) => ({ w: 12 + Math.round(r() * 8) })),
      rocks: place(spec.rocks, 64, 172, (r) => ({ w: 5 + Math.round(r() * 7) })),
      logs: place(spec.logs, 70, 168, (r) => ({ w: 18 + Math.round(r() * 10) })),
      tall: place(spec.tall, 62, 176, (r) => ({ h: 5 + Math.round(r() * 3) })),
      tufts: place(22, 58, 176, () => ({})),
      patches: place(6, 70, 160, (r) => ({ w: 28 + Math.round(r() * 40) })),
      streamY: 96 + Math.round(random() * 30)
    };
  }
  const SCENERY = {};
  function sceneryFor(biome) {
    const id = BIOMES[biome] ? biome : "prairie";
    if (!SCENERY[id]) SCENERY[id] = buildScenery(id);
    return SCENERY[id];
  }
  const OUTLINE = "#2a1d12";

  // Each part is [x, y, w, h, colorIndex] for an animal facing right; colorIndex 0 body, 1 dark, 2 light.
  function parts(animal, spec, walk) {
    const lift = walk > 0 ? 1 : 0;
    const legA = lift ? 0 : 1;
    const legB = lift ? 1 : 0;
    switch (animal.kind) {
      case "rabbit": return [
        [2, 3, 9, 6, 0], [9, 2, 5, 5, 0], [10, -3, 2, 5, 0], [0, 4, 3, 3, 2], [12, 3, 1, 1, 1],
        [3, 9, 3, 2 - legA, 1], [8, 9, 3, 2 - legB, 1]
      ];
      case "turkey": return [
        [2, 4, 9, 6, 0], [0, 1, 4, 7, 1], [9, 2, 3, 5, 0], [10, 0, 3, 3, 0], [12, 1, 2, 1, 2], [11, 3, 1, 2, 1],
        [5, 10, 1, 3 + legA, 2], [8, 10, 1, 3 + legB, 2]
      ];
      case "elk": return [
        [5, 6, 20, 9, 0], [8, 13, 14, 2, 2], [17, 5, 6, 8, 1], [22, 1, 5, 9, 0], [25, 0, 6, 5, 0], [29, 3, 3, 2, 1],
        [23, -6, 1, 6, 2], [27, -6, 1, 6, 2], [21, -9, 3, 1, 2], [27, -9, 4, 1, 2], [3, 7, 3, 4, 2],
        [7, 15, 2, 6 + legA, 1], [12, 15, 2, 6 + legB, 1], [19, 15, 2, 6 + legA, 1], [23, 15, 2, 6 + legB, 1]
      ];
      case "deer": return [
        [4, 5, 17, 8, 0], [6, 11, 13, 2, 2], [18, 0, 5, 9, 0], [20, 0, 6, 5, 0], [24, 3, 2, 2, 1],
        [21, -4, 1, 4, 2], [23, -4, 1, 4, 2], [2, 5, 3, 3, 2],
        [6, 13, 2, 5 + legA, 1], [11, 13, 2, 5 + legB, 1], [16, 13, 2, 5 + legA, 1], [19, 13, 2, 5 + legB, 1]
      ];
      case "bear": return [
        [3, 4, 20, 11, 0], [8, 1, 9, 4, 0], [20, 5, 8, 8, 0], [25, 9, 3, 4, 2], [21, 3, 3, 3, 1],
        [5, 15, 5, 3 + legA, 1], [17, 15, 5, 3 + legB, 1]
      ];
      default: return [
        [4, 4, 24, 12, 0], [6, 0, 14, 6, 1], [24, 6, 10, 10, 1], [30, 4, 3, 2, 2], [30, 15, 3, 3, 1], [1, 6, 3, 6, 1],
        [7, 16, 4, 4 + legA, 1], [22, 16, 4, 4 + legB, 1]
      ];
    }
  }

  function drawAnimal(ctx, animal, clock) {
    const spec = ANIMALS[animal.kind];
    const ax = Math.round(animal.x);
    const ay = Math.round(animal.y);
    const walk = animal.pause > 0 || animal.phase === undefined ? 0 : (Math.floor(animal.phase) % 2 ? 1 : -1);
    const nod = animal.pause > 0 && spec.graze ? (Math.floor((clock || 0) * 2.5 + (animal.phase || 0)) % 2) * 2 : 0;
    const bob = animal.pause > 0 ? nod : (walk > 0 ? 0 : 1);
    const list = parts(animal, spec, walk);
    const place = (part, grow) => {
      const [x, y, w, h] = part;
      const px = animal.dir > 0 ? x : spec.w - x - w;
      return [ax + px - grow, ay + y + bob - grow, w + grow * 2, h + grow * 2];
    };
    ctx.fillStyle = "rgba(60, 40, 20, 0.28)";
    ctx.fillRect(ax + 1, ay + spec.h + 3, spec.w - 2, 2);
    ctx.fillStyle = OUTLINE;
    list.forEach((part) => ctx.fillRect(...place(part, 1)));
    list.forEach((part) => {
      ctx.fillStyle = part[4] === 2 ? (spec.light || "#f0e4c8") : spec.colors[part[4]];
      ctx.fillRect(...place(part, 0));
    });
  }

  function drawBackdrop(ctx, biome) {
    const b = BIOMES[biome];
    ctx.fillStyle = b.far;
    if (b.backdrop === "peaks") {
      for (let x = 0; x < WIDTH; x += 4) {
        const h = 10 + Math.abs(Math.sin(x / 41) * 26) + Math.abs(Math.sin(x / 13)) * 4;
        ctx.fillRect(x, 46 - Math.round(h), 4, Math.round(h));
      }
      ctx.fillStyle = "#f4f7fa";
      for (let x = 0; x < WIDTH; x += 4) {
        const h = 10 + Math.abs(Math.sin(x / 41) * 26) + Math.abs(Math.sin(x / 13)) * 4;
        if (h > 26) ctx.fillRect(x, 46 - Math.round(h), 4, 4);
      }
      return;
    }
    if (b.backdrop === "spire") {
      ctx.fillStyle = "#a79a86";
      ctx.fillRect(262, 18, 6, 28);
      ctx.fillRect(257, 38, 16, 8);
      ctx.fillStyle = "#b9ad98";
      ctx.fillRect(263, 18, 2, 28);
      ctx.fillStyle = b.far;
    }
    if (b.backdrop === "mesa") {
      ctx.fillRect(20, 24, 70, 22);
      ctx.fillRect(210, 20, 90, 26);
      ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
      ctx.fillRect(20, 24, 70, 3);
      ctx.fillRect(210, 20, 90, 3);
      ctx.fillStyle = b.far;
    }
    for (let x = 0; x < WIDTH; x += 8) ctx.fillRect(x, 34 + Math.round(Math.sin(x / 23) * 5 + 5), 8, 14);
  }

  function drawTree(ctx, tree, spec) {
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(tree.x + 3, tree.y, 4, tree.h);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(tree.x + 4, tree.y, 2, tree.h - 1);
    if (spec.pines) {
      [[0, 11, 10], [1, 6, 8], [3, 1, 4]].forEach(([inset, off, w], i) => {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(tree.x - 3 + inset, tree.y - off - 1, w + 7 - inset * 2, 5);
        ctx.fillStyle = i % 2 ? "#2f5a35" : "#3b6e40";
        ctx.fillRect(tree.x - 2 + inset, tree.y - off, w + 5 - inset * 2, 3);
      });
      return;
    }
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(tree.x - 1, tree.y - 10, 12, 12);
    ctx.fillStyle = "#4b7a3a";
    ctx.fillRect(tree.x, tree.y - 9, 10, 10);
    ctx.fillStyle = "#6a9a4c";
    ctx.fillRect(tree.x + 1, tree.y - 9, 4, 3);
  }

  function drawScenery(ctx, biome, clock) {
    const b = BIOMES[biome] || BIOMES.prairie;
    const scene = sceneryFor(biome);
    ctx.fillStyle = b.sky;
    ctx.fillRect(0, 0, WIDTH, 46);
    ctx.fillStyle = b.haze;
    ctx.fillRect(0, 30, WIDTH, 16);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(40, 10, 26, 4);
    ctx.fillRect(46, 7, 14, 3);
    ctx.fillRect(190, 16, 32, 4);
    ctx.fillRect(198, 13, 16, 3);
    drawBackdrop(ctx, biome);

    ctx.fillStyle = b.ground;
    ctx.fillRect(0, 46, WIDTH, HEIGHT - 46);
    ctx.fillStyle = b.band;
    ctx.fillRect(0, 46, WIDTH, 14);
    ctx.fillStyle = b.patch;
    scene.patches.forEach((patch) => ctx.fillRect(patch.x, patch.y, patch.w, 5));

    if (b.stream) {
      const y = scene.streamY;
      ctx.fillStyle = "#5f8fa8";
      ctx.fillRect(0, y, WIDTH, 12);
      ctx.fillStyle = "#86b4c8";
      ctx.fillRect(0, y + 2, WIDTH, 3);
      ctx.fillStyle = "#e8f4f8";
      for (let x = 0; x < WIDTH; x += 36) ctx.fillRect((x + Math.floor((clock || 0) * 8)) % WIDTH, y + 6, 8, 1);
    }

    scene.trees.forEach((tree) => drawTree(ctx, tree, b));
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

  // Tall grass is drawn after the animals so wildlife can be partly hidden in it.
  function drawTallGrass(ctx, biome, clock) {
    const b = BIOMES[biome] || BIOMES.prairie;
    ctx.fillStyle = b.tuft;
    sceneryFor(biome).tall.forEach((blade) => {
      const sway = Math.round(Math.sin((clock || 0) * 2 + blade.x) );
      ctx.fillRect(blade.x + sway, blade.y - blade.h, 1, blade.h);
      ctx.fillRect(blade.x + 2, blade.y - blade.h + 2, 1, blade.h - 2);
      ctx.fillRect(blade.x + 4 - sway, blade.y - blade.h + 1, 1, blade.h - 1);
    });
  }

  function drawWeather(ctx, state) {
    const clock = state.clock || 0;
    if (state.weather === "rain") {
      ctx.fillStyle = "rgba(40, 60, 90, 0.12)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "rgba(220, 235, 250, 0.7)";
      for (let i = 0; i < 46; i += 1) {
        const x = (i * 53 + Math.floor(clock * 60)) % WIDTH;
        const y = (i * 37 + Math.floor(clock * 220)) % HEIGHT;
        ctx.fillRect(x, y, 1, 5);
      }
    } else if (state.weather === "snow") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      for (let i = 0; i < 50; i += 1) {
        const x = (i * 61 + Math.floor(Math.sin(clock + i) * 6) + Math.floor(clock * 10)) % WIDTH;
        const y = (i * 29 + Math.floor(clock * 40)) % HEIGHT;
        ctx.fillRect(x, y, 2, 2);
      }
    } else if (state.weather === "fog") {
      ctx.fillStyle = "rgba(235, 240, 240, 0.28)";
      ctx.fillRect(0, 40, WIDTH, HEIGHT - 40);
      ctx.fillStyle = "rgba(235, 240, 240, 0.18)";
      ctx.fillRect(0, 70 + Math.round(Math.sin(clock / 2) * 6), WIDTH, 40);
    } else if (state.weather === "windy") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      for (let i = 0; i < 8; i += 1) {
        const x = (i * 97 + Math.floor(clock * 180)) % (WIDTH + 40) - 20;
        ctx.fillRect(x, 20 + i * 18, 16, 1);
      }
    }
  }
  function drawEffects(ctx, state) {
    state.puffs.forEach((puff) => {
      const size = 3 + Math.round(puff.age * 26);
      ctx.fillStyle = puff.hit ? "rgba(255, 216, 74, 0.75)" : "rgba(214, 190, 140, 0.8)";
      ctx.fillRect(Math.round(puff.x - size / 2), Math.round(puff.y - size / 2), size, 2);
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

  function draw(ctx, state) {
    drawScenery(ctx, state.biome, state.clock);
    state.animals.slice().sort((a, b) => a.y - b.y).forEach((animal) => drawAnimal(ctx, animal, state.clock));
    drawTallGrass(ctx, state.biome, state.clock);
    drawWeather(ctx, state);
    ctx.fillStyle = "#5d7f43";
    sceneryFor(state.biome).tufts.slice(0, 8).forEach((tuft) => ctx.fillRect(tuft.x + 6, HEIGHT - 4, 1, 4));
    drawEffects(ctx, state);
    if (state.flash > 0.08) {
      ctx.fillStyle = "rgba(255, 244, 200, 0.28)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const ax = Math.round(state.aim.x);
    const ay = Math.round(state.aim.y);
    const onTarget = animalAt(state, state.aim.x, state.aim.y) >= 0;
    const mark = (x, y, w, h) => {
      ctx.fillStyle = "#fff6dc";
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = state.flash > 0 ? "#ffb300" : onTarget ? "#1f8f3a" : "#7a2b1a";
      ctx.fillRect(x, y, w, h);
    };
    mark(ax - 9, ay - 1, 6, 2);
    mark(ax + 3, ay - 1, 6, 2);
    mark(ax - 1, ay - 9, 2, 6);
    mark(ax - 1, ay + 3, 2, 6);
  }

  // Colors per animal; light is the accent color for tails, antlers, snouts and bellies.
  ANIMALS.rabbit.colors = ["#b79d7c", "#6e5a43"];
  ANIMALS.deer.colors = ["#b5703a", "#5e3a1e"];
  ANIMALS.bear.colors = ["#5a4437", "#2f2119"];
  ANIMALS.buffalo.colors = ["#6a4630", "#3b2517"];
  ANIMALS.rabbit.light = "#fffaf0";
  ANIMALS.deer.light = "#e8d5a6";
  ANIMALS.bear.light = "#b98d61";
  ANIMALS.turkey.colors = ["#7a5230", "#3f2a18"];
  ANIMALS.elk.colors = ["#9a6a3c", "#4a2f1c"];
  ANIMALS.turkey.light = "#e0a030";
  ANIMALS.elk.light = "#e3cfa0";
  ANIMALS.buffalo.light = "#f0e0b4";

  window.OTDLE_HUNT = { WIDTH, HEIGHT, ROUND_SECONDS, AMMO, ANIMALS, BIOMES, newRound, step, fire, pickAnimal, biomeForMiles };

  // Small synthesized sound effects; silently disabled where WebAudio is unavailable.
  function createAudio() {
    const Context = window.AudioContext || window.webkitAudioContext;
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
      } catch (error) {
        muted = true;
      }
    };
    return {
      shot: () => tone(220, 55, 0.14, "square", 0.08),
      hit: () => tone(520, 880, 0.16, "triangle", 0.12),
      miss: () => tone(140, 90, 0.08, "sine", 0.05),
      end: () => tone(330, 165, 0.35, "triangle", 0.1),
      setMuted: (value) => { muted = value; }
    };
  }

  function initialize() {
    const root = document.querySelector("[data-hunt-game]");
    if (!root) return;
    const canvas = root.querySelector("[data-hunt-canvas]");
    const ctx = canvas.getContext("2d");
    const startButton = root.querySelector("[data-hunt-start]");
    const sendButton = root.querySelector("[data-hunt-send]");
    const muteButton = root.querySelector("[data-hunt-mute]");
    const nameField = root.querySelector("[data-hunt-name]");
    const message = root.querySelector("[data-hunt-message]");
    const timeText = root.querySelector("[data-hunt-time]");
    const ammoText = root.querySelector("[data-hunt-ammo]");
    const foodText = root.querySelector("[data-hunt-food]");
    const community = window.OTDLE_COMMUNITY;
    const sound = createAudio();
    const keys = new Set();
    let state = newRoundForPage();
    let running = false;
    let last = 0;
    let sending = false;

    function random() {
      const buffer = new Uint32Array(1);
      window.crypto.getRandomValues(buffer);
      return buffer[0] / 4294967296;
    }

    // Hunters visit the ground the wagon train is crossing, most of the time; otherwise a random one.
    function newRoundForPage() {
      const params = new window.URLSearchParams(window.location.search);
      const snapshot = community && community.getSnapshot();
      const local = biomeForMiles(snapshot ? snapshot.totalMiles : 0);
      const ids = Object.keys(BIOMES);
      let biome = random() < 0.65 ? local : ids[Math.floor(random() * ids.length)];
      if (BIOMES[params.get("biome")]) biome = params.get("biome");
      const pool = biome === "mountains" ? ["clear", "snow", "snow", "fog", "windy"] : WEATHERS;
      let weather = pool[Math.floor(random() * pool.length)];
      if (["clear", "windy", "rain", "fog", "snow"].includes(params.get("weather"))) weather = params.get("weather");
      return newRound(random, { biome, weather });
    }

    function groundText() {
      const label = BIOMES[state.biome].label;
      return state.weather === "clear" ? `${label}, clear skies.` : `${label}, ${state.weather === "windy" ? "windy" : state.weather}.`;
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
      keys.clear();
      if (sound) sound.end();
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
      if (sound) {
        sound.shot();
        if (hit) sound.hit();
        else sound.miss();
      }
      message.textContent = hit
        ? (hit.food > 0 ? `Hit! A ${hit.kind} adds ${hit.food} lbs.` : "Hit! The wagons are already full.")
        : "Missed.";
      draw(ctx, state);
      readout();
    }

    function begin() {
      state = newRoundForPage();
      running = true;
      startButton.hidden = true;
      sendButton.hidden = true;
      message.classList.remove("is-error");
      message.textContent = `${groundText()} Aim with WASD or the arrow keys. Press Space or click to fire.`;
      canvas.focus();
      last = window.performance.now();
      window.requestAnimationFrame(frame);
    }

    startButton.addEventListener("click", begin);

    if (muteButton) {
      muteButton.hidden = !sound;
      muteButton.addEventListener("click", () => {
        const muted = muteButton.getAttribute("aria-pressed") !== "true";
        muteButton.setAttribute("aria-pressed", String(muted));
        muteButton.textContent = muted ? "Sound off" : "Sound on";
        if (sound) sound.setMuted(muted);
      });
    }

    document.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (!running) return;
      if (key === " " || key.startsWith("arrow")) event.preventDefault();
      if (key === " ") { if (!event.repeat) shoot(); return; }
      keys.add(key);
    });
    document.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

    function aimAt(event) {
      const box = canvas.getBoundingClientRect();
      state.aim.x = clamp(((event.clientX - box.left) / box.width) * WIDTH, 0, WIDTH);
      state.aim.y = clamp(((event.clientY - box.top) / box.height) * HEIGHT, 0, HEIGHT);
    }

    canvas.addEventListener("pointermove", (event) => {
      if (running && event.pointerType === "mouse") aimAt(event);
    });
    canvas.addEventListener("pointerdown", (event) => {
      if (!running) return;
      aimAt(event);
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
