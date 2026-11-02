/*
 * Ratio Rogue — a top-down roguelike dungeon crawler.
 * Combat, movement and upgrades are pure game; math problems are the keys to
 * chests, shrines, bridges, and boss shields.
 */
(() => {
  'use strict';
  const P = window.Problems;

  // ================= constants =================
  const T = 48, COLS = 21, ROWS = 13, RW = COLS * T, RH = ROWS * T, HUD = 56;
  const CW = RW, CH = RH + HUD;
  const DC = [9, 10, 11], DR = [5, 6, 7];
  const FLOOR = 0, WALL = 1, ROCK = 2, PIT = 3, BRIDGE = 4;
  const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
  const TAU = Math.PI * 2;
  const EMOJI_FONT = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';

  const THEMES = [
    { name: 'The Damp Cellar',      floor: '#2c3442', floor2: '#303948', wall: '#141922', wallTop: '#46516a', rock: '#5b6678', accent: '#7fd1ff' },
    { name: 'The Mossy Catacombs',  floor: '#27352c', floor2: '#2c3b31', wall: '#111a13', wallTop: '#456052', rock: '#62775c', accent: '#9dff8a' },
    { name: 'The Ember Vault',      floor: '#3a2929', floor2: '#412e2d', wall: '#1b1010', wallTop: '#6a4038', rock: '#77544a', accent: '#ffb36b' },
  ];

  // Which problem types each game object asks for
  const CROSS = ['simple', 'word', 'oneSide', 'twoSides'];
  const SHRINE = ['angles2', 'triAngles'];
  const BRIDGE_T = ['perimeter'];
  const GOBLIN = ['simplify'];
  const BOSS = ['simple', 'oneSide', 'twoSides', 'angles2', 'triAngles', 'perimeter', 'word'];

  // ================= utils =================
  const rand = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const $ = (id) => document.getElementById(id);

  // ================= settings =================
  const SKEY = 'ratioRogue.settings.v1';
  const settings = { types: {}, sound: true, freq: 'normal', name: '' };
  Object.keys(P.TYPES).forEach((k) => (settings.types[k] = true));
  try {
    const saved = JSON.parse(localStorage.getItem(SKEY) || 'null');
    if (saved) Object.assign(settings, saved, { types: Object.assign({}, settings.types, saved.types || {}) });
  } catch (e) { /* storage blocked: use defaults */ }
  // A teacher link like ?types=simple,oneSide&freq=high overrides saved settings
  const urlParams = new URLSearchParams(location.search);
  const lockedByLink = urlParams.has('types');
  if (lockedByLink) {
    const on = urlParams.get('types').split(',');
    Object.keys(settings.types).forEach((k) => (settings.types[k] = on.includes(k)));
  }
  if (urlParams.has('freq')) settings.freq = urlParams.get('freq') === 'high' ? 'high' : 'normal';
  function saveSettings() {
    try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  // ================= audio =================
  let actx = null;
  function tone(freq, dur, type, vol, slide, delay) {
    if (!settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = actx.currentTime + (delay || 0);
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
      g.gain.setValueAtTime(vol || 0.05, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  const sfx = {
    shoot: () => tone(520, 0.06, 'square', 0.018, 300),
    hit: () => tone(180, 0.05, 'triangle', 0.05, 120),
    kill: () => { tone(300, 0.12, 'square', 0.04, 80); },
    hurt: () => { tone(160, 0.25, 'sawtooth', 0.07, 60); },
    coin: () => { tone(988, 0.06, 'square', 0.03); tone(1319, 0.1, 'square', 0.03, null, 0.06); },
    heart: () => { tone(660, 0.08, 'sine', 0.06); tone(880, 0.12, 'sine', 0.06, null, 0.08); },
    door: () => tone(110, 0.25, 'triangle', 0.08, 70),
    dash: () => tone(260, 0.12, 'sine', 0.04, 600),
    correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'square', 0.04, null, i * 0.08)),
    wrong: () => { tone(200, 0.15, 'square', 0.04); tone(150, 0.2, 'square', 0.04, null, 0.15); },
    item: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.06, null, i * 0.07)),
    shield: () => tone(90, 0.6, 'sawtooth', 0.07, 200),
    boom: () => { tone(80, 0.6, 'sawtooth', 0.09, 30); tone(140, 0.4, 'square', 0.05, 40, 0.05); },
    buy: () => { tone(700, 0.08, 'square', 0.04); tone(1050, 0.12, 'square', 0.04, null, 0.08); },
  };

  // ================= canvas & input =================
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  canvas.width = CW; canvas.height = CH;
  function resize() {
    const s = Math.min(window.innerWidth / CW, window.innerHeight / CH);
    canvas.style.width = Math.floor(CW * s) + 'px';
    canvas.style.height = Math.floor(CH * s) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  const keys = {}, pressed = {};
  const mouse = { x: 0, y: 0, down: false };
  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  window.addEventListener('keydown', (e) => {
    if (G.mode === 'modal') return modalKey(e);
    if (G.mode === 'pick') return pickKey(e);
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (G.mode === 'play' && GAME_KEYS.includes(e.code)) e.preventDefault();
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => {
    Object.keys(keys).forEach((k) => (keys[k] = false));
    mouse.down = false;
    if (G.mode === 'play') pauseGame();
  });
  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (CW / r.width), y: (e.clientY - r.top) * (CH / r.height) - HUD };
  }
  canvas.addEventListener('mousemove', (e) => Object.assign(mouse, canvasPos(e)));
  canvas.addEventListener('mousedown', (e) => { Object.assign(mouse, canvasPos(e)); mouse.down = true; e.preventDefault(); });
  window.addEventListener('mouseup', () => (mouse.down = false));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const clearInput = () => {
    Object.keys(keys).forEach((k) => (keys[k] = false));
    Object.keys(pressed).forEach((k) => delete pressed[k]);
    mouse.down = false;
  };
  const blurUI = () => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); };

  // ================= items (no math needed — just fun) =================
  const ITEMS = [
    { id: 'hotsauce', icon: '🌶️', name: 'Hot Sauce', desc: '+Damage', apply: (p) => (p.damage += 0.5) },
    { id: 'quick', icon: '⚡', name: 'Quick Draw', desc: 'Shoot faster', apply: (p) => (p.fireDelay *= 0.8) },
    { id: 'sneakers', icon: '👟', name: 'Sneakers', desc: 'Move faster', apply: (p) => (p.speed *= 1.12) },
    { id: 'heart', icon: '❤️', name: 'Heart Container', desc: '+1 max heart and full heal', apply: (p) => { p.maxHp += 1; p.hp = p.maxHp; } },
    { id: 'twin', icon: '🎯', name: 'Twin Shot', desc: '+1 shot every time you fire', apply: (p) => (p.shots = Math.min(5, p.shots + 1)) },
    { id: 'pierce', icon: '🗡️', name: 'Spear Tips', desc: 'Shots go through enemies', unique: true, apply: (p) => (p.pierce = true) },
    { id: 'bounce', icon: '🏀', name: 'Rubber Ammo', desc: 'Shots bounce off walls', apply: (p) => (p.bounce += 1) },
    { id: 'big', icon: '🎈', name: 'Big Bullets', desc: 'Huge shots, +damage', apply: (p) => { p.size *= 1.35; p.damage += 0.3; } },
    { id: 'homing', icon: '🦋', name: 'Homing Moth', desc: 'Shots curve toward enemies', apply: (p) => (p.homing += 1) },
    { id: 'moon', icon: '🌙', name: 'Moon Buddy', desc: 'A moon circles you, hurting enemies and blocking bullets', apply: (p) => (p.orbitals = Math.min(4, p.orbitals + 1)) },
    { id: 'vampire', icon: '🧛', name: 'Vampire Fang', desc: 'Heal 1 heart every few kills', apply: (p) => (p.vampire = p.vampire ? Math.max(4, p.vampire - 3) : 12) },
    { id: 'clover', icon: '🍀', name: 'Four-Leaf Clover', desc: 'More coins and hearts drop', apply: (p) => (p.luck += 1) },
    { id: 'scope', icon: '🔭', name: 'Sniper Scope', desc: 'Shots fly faster and farther', apply: (p) => { p.shotSpeed *= 1.25; p.range *= 1.3; } },
    { id: 'bubble', icon: '🛡️', name: 'Bubble Shield', desc: 'Blocks the first hit in every room', unique: true, apply: (p) => { p.bubble = true; p.bubbleReady = true; } },
    { id: 'boots', icon: '🚀', name: 'Rocket Boots', desc: 'Dash recharges way faster', apply: (p) => (p.dashCd *= 0.55) },
    { id: 'frost', icon: '❄️', name: 'Frost Rune', desc: 'Shots slow enemies down', unique: true, apply: (p) => (p.frost = true) },
    { id: 'cactus', icon: '🌵', name: 'Cactus Armor', desc: 'Getting hit blasts spikes everywhere', unique: true, apply: (p) => (p.thorns = true) },
    { id: 'magnet', icon: '🧲', name: 'Coin Magnet', desc: 'Coins and hearts fly to you', unique: true, apply: (p) => (p.magnet = true) },
    { id: 'glass', icon: '💎', name: 'Glass Cannon', desc: '+1.2 damage, but -1 max heart', apply: (p) => { p.damage += 1.2; p.maxHp = Math.max(1, p.maxHp - 1); p.hp = Math.min(p.hp, p.maxHp); } },
    { id: 'pizza', icon: '🍕', name: 'Dungeon Pizza', desc: 'Heal 3 hearts, +a little damage', apply: (p) => { p.hp = Math.min(p.maxHp, p.hp + 3); p.damage += 0.25; } },
    { id: 'triple', icon: '🔱', name: 'Trident', desc: '+2 shots, but shoot a bit slower', apply: (p) => { p.shots = Math.min(5, p.shots + 2); p.fireDelay *= 1.15; } },
    { id: 'coffee', icon: '☕', name: 'Coffee', desc: 'Move and shoot a little faster', apply: (p) => { p.speed *= 1.06; p.fireDelay *= 0.9; } },
  ];
  function rollItems(n) {
    const owned = new Set(G.run.items.map((i) => i.id));
    const pool = ITEMS.filter((i) => !(i.unique && owned.has(i.id)));
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }
  function giveItem(item) {
    item.apply(G.run.player);
    G.run.items.push(item);
    sfx.item();
    floatText(G.run.player.x, G.run.player.y - 30, item.name + '!', '#ffe27a', 1.6);
    burst(G.run.player.x, G.run.player.y, '#ffe27a', 24, 220);
  }

  // ================= game state =================
  const G = {
    mode: 'title', run: null, room: null, t: 0, shake: 0, fade: 0, banner: null,
    enemies: [], pbullets: [], ebullets: [], particles: [], texts: [], locked: false,
    bg: null, deathT: 0, hint: null,
  };

  function newPlayer() {
    return {
      x: RW / 2, y: RH / 2, r: 14, hp: 5, maxHp: 5,
      speed: 215, damage: 1, fireDelay: 0.34, shotSpeed: 480, range: 0.7, shots: 1, size: 6,
      pierce: false, bounce: 0, homing: 0, orbitals: 0, frost: false, thorns: false, magnet: false,
      bubble: false, bubbleReady: false, vampire: 0, luck: 0,
      dashCd: 0.9, dashT: 0, dashCdT: 0, dashX: 0, dashY: 0, inv: 0, fireT: 0,
      faceX: 1, faceY: 0, kills: 0, walkT: 0,
    };
  }

  function startRun() {
    G.run = {
      floor: 1, player: newPlayer(), gold: 0, items: [], name: settings.name || '',
      stats: { attempted: 0, solved: 0, perfect: 0, hints: 0, byType: {} }, start: Date.now(),
      kills: 0, endless: false,
    };
    G.texts = []; G.particles = []; G.deathT = 0; G.shake = 0;
    newFloor(1);
    G.mode = 'play';
    showScreen(null);
  }

  // ================= map generation =================
  function newFloor(floor) {
    const run = G.run;
    run.floor = floor;
    run.theme = THEMES[(floor - 1) % THEMES.length];
    const target = Math.min(18, 10 + floor * 2);
    const rooms = new Map();
    const key = (x, y) => x + ',' + y;
    const add = (x, y) => { const r = { gx: x, gy: y, type: 'combat', doors: {}, objects: [], pickups: [], cleared: false, visited: false, seen: false }; rooms.set(key(x, y), r); return r; };
    const start = add(0, 0);
    let guard = 0;
    while (rooms.size < target && guard++ < 5000) {
      const from = pick([...rooms.values()]);
      const d = pick(Object.keys(DIRS));
      const nx = from.gx + DIRS[d][0], ny = from.gy + DIRS[d][1];
      if (rooms.has(key(nx, ny)) || Math.abs(nx) > 4 || Math.abs(ny) > 4) continue;
      let nb = 0;
      for (const dd of Object.values(DIRS)) if (rooms.has(key(nx + dd[0], ny + dd[1]))) nb++;
      if (nb > 1) continue; // keep it tree-like: more dead ends for special rooms
      add(nx, ny);
    }
    // connect doors
    for (const r of rooms.values()) {
      for (const [d, v] of Object.entries(DIRS)) {
        const n = rooms.get(key(r.gx + v[0], r.gy + v[1]));
        if (n) r.doors[d] = n;
      }
    }
    // distances from start
    const distTo = new Map([[start, 0]]);
    const q = [start];
    while (q.length) {
      const r = q.shift();
      for (const n of Object.values(r.doors)) if (!distTo.has(n)) { distTo.set(n, distTo.get(r) + 1); q.push(n); }
    }
    const all = [...rooms.values()];
    const deadEnds = all.filter((r) => r !== start && Object.keys(r.doors).length === 1).sort((a, b) => distTo.get(b) - distTo.get(a));
    const boss = deadEnds.length ? deadEnds.shift() : all.filter((r) => r !== start).sort((a, b) => distTo.get(b) - distTo.get(a))[0];
    boss.type = 'boss';
    start.type = 'start';
    start.cleared = true;
    const specials = ['treasure', 'shrine', 'bridge', 'treasure', 'shop'];
    if (Math.random() < 0.6 && settings.types.simplify !== false) specials.push('goblin');
    const shuffledDead = deadEnds.sort(() => Math.random() - 0.5);
    const others = all.filter((r) => r.type === 'combat' && !shuffledDead.includes(r)).sort(() => Math.random() - 0.5);
    for (const s of specials) {
      const r = shuffledDead.shift() || (others.length > 3 ? others.shift() : null);
      if (!r) break;
      r.type = s;
      r.cleared = true;
    }
    for (const r of rooms.values()) buildRoom(r);
    run.rooms = rooms;
    run.boss = boss;
    run.player.x = RW / 2; run.player.y = RH / 2 + 60;
    G.banner = { text: `Floor ${floor}`, sub: run.theme.name, t: 3 };
    enterRoom(start);
  }

  function buildRoom(room) {
    const t = [];
    for (let r = 0; r < ROWS; r++) {
      t.push([]);
      for (let c = 0; c < COLS; c++) t[r].push(r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1 ? WALL : FLOOR);
    }
    if (room.doors.n) DC.forEach((c) => (t[0][c] = FLOOR));
    if (room.doors.s) DC.forEach((c) => (t[ROWS - 1][c] = FLOOR));
    if (room.doors.w) DR.forEach((r) => (t[r][0] = FLOOR));
    if (room.doors.e) DR.forEach((r) => (t[r][COLS - 1] = FLOOR));
    room.tiles = t;
    room.deco = [];
    for (let i = 0; i < 14; i++) room.deco.push({ x: rand(T, RW - T), y: rand(T, RH - T), k: irand(0, 2), s: rand(0.6, 1.2) });
    const cx = RW / 2, cy = RH / 2;
    const set = (c, r, v) => {
      // keep the center cross (door lanes) clear so every room stays connected
      if (DC.includes(c) || DR.includes(r)) return;
      if (r <= 0 || c <= 0 || r >= ROWS - 1 || c >= COLS - 1) return;
      t[r][c] = v;
    };
    const mirror = (c, r, v) => { set(c, r, v); set(COLS - 1 - c, r, v); set(c, ROWS - 1 - r, v); set(COLS - 1 - c, ROWS - 1 - r, v); };
    if (room.type === 'combat' || room.type === 'boss') {
      const layout = room.type === 'boss' ? pick(['none', 'pillars']) : pick(['none', 'pillars', 'quads', 'lines', 'scatter', 'corners', 'quads']);
      if (layout === 'pillars') [[4, 3], [5, 3], [4, 4], [5, 4]].forEach(([c, r]) => mirror(c, r, ROCK));
      if (layout === 'lines') for (let c = 3; c <= 7; c++) mirror(c, 3, ROCK);
      if (layout === 'corners') [[2, 2], [3, 2], [2, 3]].forEach(([c, r]) => mirror(c, r, ROCK));
      if (layout === 'quads') { for (let i = 0; i < 4; i++) mirror(irand(3, 7), irand(2, 3), ROCK); }
      if (layout === 'scatter') { for (let i = 0; i < 5; i++) set(irand(2, COLS - 3), irand(2, ROWS - 3), ROCK); }
      if (room.type === 'combat' && layout !== 'scatter' && Math.random() < 0.3) for (let i = 0; i < 2; i++) mirror(irand(6, 8), irand(1, 3), PIT);
    }
    if (room.type === 'bridge') {
      for (let r = 3; r <= 9; r++) for (let c = 6; c <= 14; c++) {
        const island = r >= 5 && r <= 7 && c >= 8 && c <= 12;
        t[r][c] = island ? FLOOR : PIT;
      }
      room.objects.push({ kind: 'sign', x: 4.5 * T, y: 6.5 * T, r: 20 });
      room.objects.push({ kind: 'chest', golden: true, unlocked: true, x: cx, y: cy, r: 22 });
    }
    if (room.type === 'treasure') room.objects.push({ kind: 'chest', golden: true, x: cx, y: cy, r: 22 });
    if (room.type === 'shrine') room.objects.push({ kind: 'shrine', x: cx, y: cy - 10, r: 26 });
    if (room.type === 'goblin') room.objects.push({ kind: 'goblin', x: cx, y: cy - 10, r: 18 });
    if (room.type === 'shop') {
      const wares = rollItemsForShop();
      wares.forEach((w, i) => room.objects.push({ kind: 'shopItem', item: w.item, price: w.price, heal: w.heal, x: cx + (i - 1) * 150, y: cy, r: 20 }));
      room.objects.push({ kind: 'shopkeeper', x: cx, y: cy - 120, r: 18 });
    }
  }
  function rollItemsForShop() {
    const f = (G.run && G.run.floor) || 1;
    const items = ITEMS.filter((i) => !i.unique).sort(() => Math.random() - 0.5).slice(0, 2);
    return [
      { item: items[0], price: irand(12, 16) + f * 2 },
      { heal: true, price: 4 + f },
      { item: items[1], price: irand(14, 18) + f * 2 },
    ];
  }

  // ================= rooms =================
  function enterRoom(room, fromDir) {
    const run = G.run;
    G.room = room;
    run.cur = room;
    room.visited = true;
    room.seen = true;
    Object.values(room.doors).forEach((n) => (n.seen = true));
    G.enemies = []; G.pbullets = []; G.ebullets = []; G.particles = [];
    G.locked = false;
    G.fade = 0.25;
    const p = run.player;
    if (fromDir) {
      if (fromDir === 'n') { p.x = RW / 2; p.y = T * 1.5; }
      if (fromDir === 's') { p.x = RW / 2; p.y = RH - T * 1.5; }
      if (fromDir === 'w') { p.x = T * 1.5; p.y = RH / 2; }
      if (fromDir === 'e') { p.x = RW - T * 1.5; p.y = RH / 2; }
    }
    if (p.bubble) p.bubbleReady = true;
    if (!room.cleared && room.type === 'combat') {
      const f = run.floor;
      const n = Math.min(8, 4 + Math.floor((f - 1) * 0.5) + irand(0, 1));
      const kinds = f === 1 ? ['slime', 'slime', 'bat', 'bat', 'archer', 'charger', 'eye']
        : f === 2 ? ['slime', 'slime', 'bigslime', 'bat', 'bat', 'archer', 'charger', 'eye', 'ghost']
          : ['slime', 'bigslime', 'bat', 'bat', 'archer', 'archer', 'charger', 'eye', 'ghost'];
      const spots = spawnSpots(room, p);
      for (let i = 0; i < n && spots.length; i++) {
        const s = spots.splice(irand(0, spots.length - 1), 1)[0];
        let kind = pick(kinds);
        // at most 2 archers per room: their arrows are the hardest thing to dodge
        if (kind === 'archer' && G.enemies.filter((e) => e.kind === 'archer').length >= 2) kind = pick(['slime', 'bat']);
        G.enemies.push(makeEnemy(kind, s.x, s.y));
      }
      G.locked = G.enemies.length > 0;
      if (G.locked) sfx.door();
    }
    if (!room.cleared && room.type === 'boss') {
      const b = makeBoss(run.floor);
      // spawn the boss on the far side of the room from the door you came in
      b.x = clamp(RW / 2 + (RW / 2 - p.x) * 0.45, T * 3, RW - T * 3);
      b.y = clamp(RH / 2 + (RH / 2 - p.y) * 0.45, T * 3, RH - T * 3);
      G.enemies.push(b);
      G.locked = true;
      sfx.boom();
    }
    G.bg = renderRoomBG(room);
  }

  function spawnSpots(room, p) {
    // flood fill from the center so enemies never spawn in unreachable pockets
    const seen = new Set();
    const q = [[10, 6]];
    const spots = [];
    while (q.length) {
      const [c, r] = q.pop();
      const k = c + ',' + r;
      if (seen.has(k)) continue;
      seen.add(k);
      if (c <= 0 || r <= 0 || c >= COLS - 1 || r >= ROWS - 1) continue;
      const t = room.tiles[r][c];
      if (t !== FLOOR && t !== BRIDGE) continue;
      const x = (c + 0.5) * T, y = (r + 0.5) * T;
      if (Math.hypot(x - p.x, y - p.y) > 260 && c > 1 && r > 1 && c < COLS - 2 && r < ROWS - 2) spots.push({ x, y });
      q.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    return spots;
  }

  function roomCleared() {
    const room = G.room;
    room.cleared = true;
    G.locked = false;
    sfx.door();
    if (room.type === 'combat') {
      const chestChance = settings.freq === 'high' ? 0.7 : 0.4;
      if (Math.random() < chestChance) {
        room.objects.push({ kind: 'chest', x: RW / 2, y: RH / 2, r: 20, pop: 0.4 });
        floatText(RW / 2, RH / 2 - 40, 'A locked chest appeared!', '#ffd966', 2);
      } else {
        for (let i = 0; i < irand(1, 3); i++) dropPickup(RW / 2 + rand(-30, 30), RH / 2 + rand(-30, 30), 'coin');
        if (Math.random() < 0.25 + G.run.player.luck * 0.1) dropPickup(RW / 2, RH / 2, 'heart');
      }
    }
  }

  // ================= tiles & collision =================
  function isDoorTile(c, r) {
    return ((r === 0 || r === ROWS - 1) && DC.includes(c)) || ((c === 0 || c === COLS - 1) && DR.includes(r));
  }
  function tileAt(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return WALL;
    if (G.locked && isDoorTile(c, r)) return WALL;
    return G.room.tiles[r][c];
  }
  function solid(t, mode) {
    if (mode === 'shot') return t === WALL || t === ROCK;
    if (mode === 'fly') return t === WALL;
    return t === WALL || t === ROCK || t === PIT;
  }
  function boxHits(x, y, h, mode) {
    const c0 = Math.floor((x - h) / T), c1 = Math.floor((x + h) / T);
    const r0 = Math.floor((y - h) / T), r1 = Math.floor((y + h) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(tileAt(c, r), mode)) return true;
    return false;
  }
  function moveEnt(e, dx, dy, mode) {
    const h = e.r * 0.78;
    let hx = false, hy = false;
    if (dx) { if (!boxHits(e.x + dx, e.y, h, mode)) e.x += dx; else hx = true; }
    if (dy) { if (!boxHits(e.x, e.y + dy, h, mode)) e.y += dy; else hy = true; }
    return hx || hy;
  }
  const pointSolid = (x, y, mode) => solid(tileAt(Math.floor(x / T), Math.floor(y / T)), mode);

  // ================= enemies =================
  function makeEnemy(kind, x, y) {
    const f = G.run.floor, hm = 1 + 0.3 * (f - 1), sm = 1 + 0.04 * (f - 1);
    const base = { kind, x, y, t: Math.random() * 3, flash: 0, slow: 0, spawn: 0.7, kx: 0, ky: 0 };
    const defs = {
      slime: { r: 15, hp: 3, speed: 75, color: '#62d462' },
      bigslime: { r: 21, hp: 6, speed: 60, color: '#3fb84a' },
      bat: { r: 11, hp: 2, speed: 135, color: '#b07ae0' },
      archer: { r: 14, hp: 4, speed: 85, color: '#ece5d0', cd: rand(1.4, 2.6) },
      charger: { r: 17, hp: 6, speed: 60, color: '#b8834f', state: 'walk', st: rand(1, 2.5) },
      eye: { r: 16, hp: 7, speed: 0, color: '#e05a5a', cd: rand(1.5, 2.8), rot: rand(0, TAU) },
      ghost: { r: 14, hp: 3, speed: 62, color: '#d6ebff', alpha: 1 },
    };
    const d = defs[kind];
    const e = Object.assign(base, d);
    e.hp *= hm; e.maxHp = e.hp; e.speed *= sm;
    return e;
  }

  const BOSSES = [
    { name: 'King Gloop', title: 'Ruler of the Cellar', color: '#55d16a', r: 40, hp: 70 },
    { name: 'The Bone Warden', title: 'Keeper of the Catacombs', color: '#e9e2cc', r: 34, hp: 95 },
    { name: 'The Proportion Golem', title: 'Guardian of the Ember Vault', color: '#d0894a', r: 42, hp: 125 },
  ];
  function makeBoss(floor) {
    const v = (floor - 1) % 3;
    const d = BOSSES[v];
    const loop = Math.floor((floor - 1) / 3);
    const hp = d.hp * (1 + 0.6 * loop);
    G.banner = { text: d.name, sub: d.title, t: 2.8, boss: true };
    return {
      kind: 'boss', variant: v, name: d.name, color: d.color, r: d.r, x: RW / 2, y: RH / 2 - 90,
      hp, maxHp: hp, t: 0, cd: 2, cd2: 4, flash: 0, slow: 0, spawn: 1.2, kx: 0, ky: 0,
      thresholds: [0.66, 0.33], shieldIdx: 0, shielded: false, stun: 0, state: 'walk', st: 0, loop,
    };
  }

  function fireEnemy(x, y, ux, uy, speed, opts) {
    const sm = 1 + 0.04 * (G.run.floor - 1);
    G.ebullets.push(Object.assign({ x, y, vx: ux * speed * sm, vy: uy * speed * sm, r: 6, life: 6, color: '#ff6b6b', src: fireEnemy.src }, opts || {}));
  }
  function ring(x, y, n, speed, offset, opts) {
    for (let i = 0; i < n; i++) {
      const a = (offset || 0) + (i * TAU) / n;
      fireEnemy(x, y, Math.cos(a), Math.sin(a), speed, opts);
    }
  }

  function updateEnemy(e, dt) {
    const p = G.run.player;
    fireEnemy.src = e.kind;
    if (e.spawn > 0) { e.spawn -= dt; return; }
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    let sp = e.speed * (e.slow > 0 ? 0.5 : 1);
    if (e.slow > 0) e.slow -= dt;
    // knockback
    if (e.kx || e.ky) {
      moveEnt(e, e.kx * dt, e.ky * dt, e.kind === 'ghost' ? 'fly' : 'walk');
      e.kx *= 0.82; e.ky *= 0.82;
      if (Math.abs(e.kx) + Math.abs(e.ky) < 5) e.kx = e.ky = 0;
    }
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const f = G.run.floor;
    switch (e.kind) {
      case 'slime':
      case 'bigslime': {
        const hop = Math.max(0, Math.sin(e.t * 5));
        e.squash = hop;
        moveEnt(e, ux * sp * hop * 1.9 * dt, uy * sp * hop * 1.9 * dt, 'walk');
        break;
      }
      case 'bat': {
        const w = Math.sin(e.t * 6) * 0.9;
        moveEnt(e, (ux - uy * w) * sp * dt, (uy + ux * w) * sp * dt, 'walk');
        break;
      }
      case 'ghost': {
        e.alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(e.t * 1.6));
        moveEnt(e, ux * sp * dt, uy * sp * dt, 'fly');
        break;
      }
      case 'archer': {
        const m = d < 220 ? -1 : d > 330 ? 1 : 0;
        const s = Math.sin(e.t * 0.9) * 0.6;
        moveEnt(e, (ux * m - uy * s) * sp * dt, (uy * m + ux * s) * sp * dt, 'walk');
        e.cd -= dt;
        e.aim = e.cd < 0.6; // red bow = about to shoot
        if (e.cd <= 0) {
          fireEnemy(e.x, e.y, ux, uy, 225, { color: '#fff1b8', arrow: true });
          if (f >= 4) {
            const a = Math.atan2(uy, ux);
            fireEnemy(e.x, e.y, Math.cos(a + 0.25), Math.sin(a + 0.25), 240, { color: '#fff1b8', arrow: true });
            fireEnemy(e.x, e.y, Math.cos(a - 0.25), Math.sin(a - 0.25), 240, { color: '#fff1b8', arrow: true });
          }
          e.cd = rand(2.0, 2.8) - 0.1 * Math.min(f, 4);
        }
        break;
      }
      case 'charger': {
        if (e.state === 'walk') {
          const w = Math.sin(e.t * 1.3);
          moveEnt(e, (ux * 0.6 - uy * w * 0.4) * sp * dt, (uy * 0.6 + ux * w * 0.4) * sp * dt, 'walk');
          e.st -= dt;
          if (e.st <= 0 && d < 420) { e.state = 'wind'; e.st = 0.65; e.cx = ux; e.cy = uy; }
        } else if (e.state === 'wind') {
          e.st -= dt;
          if (e.st <= 0) { e.state = 'charge'; e.st = 0.6; }
        } else if (e.state === 'charge') {
          const hit = moveEnt(e, e.cx * 440 * dt * (e.slow > 0 ? 0.6 : 1), e.cy * 440 * dt * (e.slow > 0 ? 0.6 : 1), 'walk');
          e.st -= dt;
          if (Math.random() < 0.5) puff(e.x, e.y + e.r * 0.6, '#8a6a4a');
          if (hit) { e.state = 'stun'; e.st = 0.9; G.shake = Math.max(G.shake, 4); sfx.hit(); }
          else if (e.st <= 0) { e.state = 'walk'; e.st = rand(1.2, 2.2); }
        } else if (e.state === 'stun') {
          e.st -= dt;
          if (e.st <= 0) { e.state = 'walk'; e.st = rand(1.2, 2.2); }
        }
        break;
      }
      case 'eye': {
        e.cd -= dt;
        e.rot += dt * 0.7;
        if (e.cd <= 0) {
          ring(e.x, e.y, f >= 3 ? 6 : 4, 160, e.rot, { color: '#ff8a5c' });
          e.cd = 2.8 - 0.1 * Math.min(f, 4);
        }
        break;
      }
      case 'boss': updateBoss(e, dt, ux, uy, d, sp); break;
    }
    if (e.kind !== 'boss' && e.kind !== 'eye') {
      e.x = clamp(e.x, T + e.r * 0.5, RW - T - e.r * 0.5);
      e.y = clamp(e.y, T + e.r * 0.5, RH - T - e.r * 0.5);
    }
  }

  function updateBoss(b, dt, ux, uy, d) {
    const enraged = b.shieldIdx >= 1;
    const minions = G.enemies.filter((e) => e.kind !== 'boss').length;
    if (b.stun > 0) { b.stun -= dt; return; }
    b.cd -= dt; b.cd2 -= dt;
    const loopBoost = 1 + 0.15 * b.loop;
    if (b.variant === 0) {
      // King Gloop: hops toward you, slime rings, summons little slimes
      const hop = Math.max(0, Math.sin(b.t * 3));
      b.squash = hop;
      moveEnt(b, ux * 120 * hop * dt, uy * 120 * hop * dt, 'walk');
      if (b.cd <= 0) {
        ring(b.x, b.y, enraged ? 14 : 10, 170 * loopBoost, b.t, { color: '#9cff7a', r: 8 });
        b.cd = enraged ? 2.0 : 2.8;
      }
      if (b.cd2 <= 0) {
        if (minions < 4) for (let i = 0; i < 2; i++) G.enemies.push(Object.assign(makeEnemy('slime', b.x + rand(-40, 40), b.y + rand(-40, 40)), { spawn: 0.3 }));
        b.cd2 = 6;
      }
    } else if (b.variant === 1) {
      // Bone Warden: circles you and fires aimed fans, summons bats
      const s = Math.sin(b.t * 0.7);
      const m = d < 240 ? -0.6 : d > 360 ? 0.6 : 0;
      moveEnt(b, (ux * m - uy * s) * 110 * dt, (uy * m + ux * s) * 110 * dt, 'walk');
      if (b.cd <= 0) {
        const a = Math.atan2(uy, ux), n = enraged ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.22;
          fireEnemy(b.x, b.y, Math.cos(aa), Math.sin(aa), 250 * loopBoost, { color: '#e6d3ff', r: 7 });
        }
        b.cd = enraged ? 1.0 : 1.4;
      }
      if (b.cd2 <= 0) {
        if (minions < 5) for (let i = 0; i < 3; i++) G.enemies.push(Object.assign(makeEnemy('bat', b.x + rand(-50, 50), b.y + rand(-50, 50)), { spawn: 0.3 }));
        b.cd2 = 7;
      }
    } else {
      // Proportion Golem: stomps, charges, and spins bullet spirals
      if (b.state === 'walk') {
        moveEnt(b, ux * 70 * dt, uy * 70 * dt, 'walk');
        if (b.cd <= 0) { b.state = 'spiral'; b.st = 2.2; b.cd = 0; }
        else if (b.cd2 <= 0) { b.state = 'wind'; b.st = 0.8; b.cx = ux; b.cy = uy; }
      } else if (b.state === 'spiral') {
        b.st -= dt;
        b.spin = (b.spin || 0) + dt;
        if (b.spin > (enraged ? 0.09 : 0.13)) {
          b.spin = 0;
          const a = b.t * 3.2;
          fireEnemy(b.x, b.y, Math.cos(a), Math.sin(a), 190 * loopBoost, { color: '#ffb36b', r: 7 });
          fireEnemy(b.x, b.y, Math.cos(a + Math.PI), Math.sin(a + Math.PI), 190 * loopBoost, { color: '#ffb36b', r: 7 });
        }
        if (b.st <= 0) { b.state = 'walk'; b.cd = enraged ? 3.5 : 4.5; }
      } else if (b.state === 'wind') {
        b.st -= dt;
        if (b.st <= 0) { b.state = 'charge'; b.st = 0.9; }
      } else if (b.state === 'charge') {
        b.st -= dt;
        const hit = moveEnt(b, b.cx * 480 * dt, b.cy * 480 * dt, 'walk');
        if (hit || b.st <= 0) {
          b.state = 'walk';
          b.cd2 = enraged ? 3.5 : 5;
          G.shake = 10;
          sfx.boom();
          ring(b.x, b.y, enraged ? 12 : 8, 200 * loopBoost, 0, { color: '#ffb36b', r: 7 });
        }
      }
    }
    b.x = clamp(b.x, T + b.r, RW - T - b.r);
    b.y = clamp(b.y, T + b.r, RH - T - b.r);
  }

  function damageEnemy(e, dmg, ux, uy) {
    if (e.spawn > 0) return;
    if (e.kind === 'boss' && e.shielded) {
      e.flash = 0.05;
      spark(e.x - ux * e.r, e.y - uy * e.r, '#9ad8ff');
      return;
    }
    e.hp -= dmg;
    e.flash = 0.1;
    sfx.hit();
    if (e.kind !== 'boss') { e.kx = ux * 260; e.ky = uy * 260; }
    if (G.run.player.frost) e.slow = 1.6;
    if (e.kind === 'boss' && e.shieldIdx < e.thresholds.length && e.hp <= e.maxHp * e.thresholds[e.shieldIdx]) {
      e.hp = e.maxHp * e.thresholds[e.shieldIdx];
      raiseShield(e);
    }
    if (e.hp <= 0) killEnemy(e);
  }

  function raiseShield(b) {
    b.shielded = true;
    sfx.shield();
    G.shake = 8;
    const spots = [[3, 3], [17, 3], [3, 9], [17, 9]].map(([c, r]) => ({ x: (c + 0.5) * T, y: (r + 0.5) * T }));
    spots.sort((a, c) => dist(c, b) - dist(a, b));
    const s = spots[0];
    G.room.objects.push({ kind: 'rune', x: s.x, y: s.y, r: 24, boss: b });
    floatText(b.x, b.y - b.r - 20, 'SHIELD UP!', '#9ad8ff', 2);
    G.banner = { text: 'The boss is shielded!', sub: 'Find the glowing rune and solve it to break the shield', t: 3.2, small: true };
  }

  function killEnemy(e) {
    const run = G.run, p = run.player;
    e.dead = true;
    run.kills++;
    sfx.kill();
    burst(e.x, e.y, e.color, e.kind === 'boss' ? 80 : 14, e.kind === 'boss' ? 400 : 200);
    if (e.kind === 'bigslime') for (let i = 0; i < 2; i++) G.enemies.push(Object.assign(makeEnemy('slime', e.x + rand(-12, 12), e.y + rand(-12, 12)), { spawn: 0.15 }));
    if (p.vampire) {
      p.kills++;
      if (p.kills % p.vampire === 0 && p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 26, '+1 ♥', '#ff6b8a'); sfx.heart(); }
    }
    if (e.kind === 'boss') {
      G.shake = 20;
      sfx.boom();
      G.enemies.forEach((m) => { if (!m.dead && m !== e) { m.dead = true; burst(m.x, m.y, m.color, 10, 150); } });
      G.ebullets = [];
      G.room.objects = G.room.objects.filter((o) => o.kind !== 'rune');
      G.room.objects.push({ kind: 'chest', golden: true, unlocked: true, boss: true, x: RW / 2 - 70, y: RH / 2, r: 22, pop: 0.5 });
      G.room.objects.push({ kind: 'hatch', x: RW / 2 + 80, y: RH / 2, r: 26 });
      for (let i = 0; i < 6; i++) dropPickup(RW / 2 + rand(-40, 40), RH / 2 + rand(30, 60), 'coin');
      G.banner = { text: 'Boss defeated!', sub: 'Grab the treasure, then take the hatch down', t: 3 };
      return;
    }
    const luck = p.luck;
    if (Math.random() < 0.35 + luck * 0.15) dropPickup(e.x, e.y, 'coin');
    if (Math.random() < 0.04 + luck * 0.04) dropPickup(e.x, e.y, 'heart');
  }

  // ================= pickups / effects =================
  function dropPickup(x, y, kind) {
    G.room.pickups.push({ kind, x, y, vx: rand(-120, 120), vy: rand(-120, 120), t: 0 });
  }
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(speed * 0.2, speed);
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.8), max: 0.8, color, size: rand(2, 5) });
    }
  }
  function spark(x, y, color) { burst(x, y, color, 5, 140); }
  function puff(x, y, color) {
    G.particles.push({ x: x + rand(-6, 6), y, vx: rand(-20, 20), vy: rand(-30, -5), life: 0.4, max: 0.4, color, size: rand(3, 6) });
  }
  function floatText(x, y, text, color, life) {
    G.texts.push({ x, y, text, color: color || '#fff', life: life || 1.2, max: life || 1.2 });
  }

  // ================= player =================
  function hurtPlayer(src) {
    const p = G.run.player;
    if (p.inv > 0 || p.dashT > 0 || G.mode !== 'play') return;
    G.dmgLog = G.dmgLog || {};
    G.dmgLog[src || '?'] = (G.dmgLog[src || '?'] || 0) + 1;
    if (p.bubble && p.bubbleReady) {
      p.bubbleReady = false;
      p.inv = 0.8;
      burst(p.x, p.y, '#9ad8ff', 18, 200);
      floatText(p.x, p.y - 26, 'Blocked!', '#9ad8ff');
      sfx.shield();
      return;
    }
    p.hp -= 1;
    p.inv = 1.1;
    G.shake = 9;
    sfx.hurt();
    burst(p.x, p.y, '#ff5f5f', 14, 180);
    if (p.thorns) for (let i = 0; i < 10; i++) {
      const a = (i * TAU) / 10;
      G.pbullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, r: 6, dmg: 1.5 + p.damage * 0.5, life: 0.6, pierce: true, bounces: 0, hit: new Set(), color: '#9be36b' });
    }
    if (p.hp <= 0) {
      p.hp = 0;
      G.deathT = 1.3;
      burst(p.x, p.y, '#7fe0d0', 40, 260);
    }
  }

  function updatePlayer(dt) {
    const p = G.run.player;
    let mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    let my = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
    const ml = Math.hypot(mx, my);
    if (ml) { mx /= ml; my /= ml; }
    if (p.inv > 0) p.inv -= dt;
    if (p.dashCdT > 0) p.dashCdT -= dt;
    if ((pressed.Space || pressed.ShiftLeft || pressed.ShiftRight) && p.dashCdT <= 0) {
      const dx = ml ? mx : p.faceX, dy = ml ? my : p.faceY;
      p.dashT = 0.17; p.dashX = dx; p.dashY = dy; p.dashCdT = p.dashCd;
      sfx.dash();
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      moveEnt(p, p.dashX * p.speed * 3.3 * dt, p.dashY * p.speed * 3.3 * dt, 'walk');
      G.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, color: '#7fe0d0', size: p.r * 0.8, ghost: true });
    } else if (ml) {
      moveEnt(p, mx * p.speed * dt, my * p.speed * dt, 'walk');
      p.walkT += dt;
    }
    // aim
    let ax = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    let ay = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    if (!ax && !ay && mouse.down) { ax = mouse.x - p.x; ay = mouse.y - p.y; }
    const al = Math.hypot(ax, ay);
    if (al) { p.faceX = ax / al; p.faceY = ay / al; }
    else if (ml) { p.faceX = mx; p.faceY = my; }
    p.fireT -= dt;
    if (al && p.fireT <= 0) {
      p.fireT = p.fireDelay;
      const base = Math.atan2(ay, ax);
      const n = p.shots;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.16;
        G.pbullets.push({
          x: p.x + Math.cos(a) * 12, y: p.y + Math.sin(a) * 12,
          vx: Math.cos(a) * p.shotSpeed, vy: Math.sin(a) * p.shotSpeed,
          r: p.size, dmg: p.damage, life: p.range, pierce: p.pierce, bounces: p.bounce, hit: new Set(),
          color: p.frost ? '#bfe9ff' : '#ffe27a',
        });
      }
      sfx.shoot();
    }
    // leaving through a door
    if (!G.locked) {
      let dir = null;
      if (p.y < T * 0.5) dir = 'n';
      else if (p.y > RH - T * 0.5) dir = 's';
      else if (p.x < T * 0.5) dir = 'w';
      else if (p.x > RW - T * 0.5) dir = 'e';
      if (dir && G.room.doors[dir]) enterRoom(G.room.doors[dir], OPP[dir]);
    }
  }

  // ================= interactions =================
  function nearestObject() {
    const p = G.run.player;
    let best = null, bd = 1e9;
    for (const o of G.room.objects) {
      if (o.used || o.kind === 'shopkeeper') continue;
      const d = dist(p, o) - o.r - p.r;
      if (d < 26 && d < bd) { best = o; bd = d; }
    }
    return best;
  }
  function objectLabel(o) {
    switch (o.kind) {
      case 'chest': return o.unlocked ? 'Open treasure chest' : (o.golden ? 'Open golden chest (Bow-Tie Lock)' : 'Open chest (Bow-Tie Lock)');
      case 'shrine': return 'Pray at the Angle Shrine';
      case 'sign': return 'Read the bridge sign';
      case 'goblin': return 'Talk to the Ratio Goblin';
      case 'shopItem': return o.heal ? `Buy a heart (${o.price} gold)` : `Buy ${o.item.name} (${o.price} gold)`;
      case 'hatch': return 'Climb down to the next floor';
      case 'rune': return 'Break the shield rune!';
      default: return 'Interact';
    }
  }

  function interact(o) {
    const run = G.run, p = run.player;
    if (o.kind === 'chest') {
      if (o.unlocked) {
        o.used = true; o.open = true;
        const n = o.boss ? 3 : 2;
        run.gold += irand(3, 6);
        return showItemPick(rollItems(n), o.boss ? 'Boss treasure! Choose one:' : 'Treasure! Choose one:');
      }
      return openProblem(o, CROSS, {
        icon: '🔒', title: o.golden ? 'Golden Bow-Tie Lock' : 'Bow-Tie Lock',
        reward: o.golden ? 'Reward: choose 1 of 2 items, or <b>1 of 3</b> for a perfect solve (first try, no hints)' : 'Reward: choose 1 of 2 items, or <b>1 of 3</b> for a perfect solve',
        onSolve: (perfect) => {
          o.used = true; o.open = true;
          run.gold += irand(2, 5);
          burst(o.x, o.y, '#ffd966', 30, 240);
          showItemPick(rollItems(perfect ? 3 : 2), perfect ? 'PERFECT! Choose one:' : 'Unlocked! Choose one:');
        },
      });
    }
    if (o.kind === 'shrine') {
      return openProblem(o, SHRINE, {
        icon: '📐', title: 'Angle Shrine',
        reward: 'Reward: full heal + a blessing. Perfect solve also gives <b>+1 max heart</b>',
        onSolve: (perfect) => {
          o.used = true;
          if (perfect) p.maxHp += 1;
          p.hp = p.maxHp;
          const b = pick([
            ['+Damage', () => (p.damage += 0.3)], ['+Speed', () => (p.speed *= 1.07)], ['+Fire rate', () => (p.fireDelay *= 0.9)],
          ]);
          b[1]();
          sfx.heart();
          burst(o.x, o.y, '#c9a7ff', 40, 260);
          floatText(p.x, p.y - 30, `Healed! ${b[0]}${perfect ? ' +1 max ♥' : ''}`, '#c9a7ff', 2.2);
        },
      });
    }
    if (o.kind === 'sign') {
      return openProblem(o, BRIDGE_T, {
        icon: '🌉', title: 'Build the Bridge',
        reward: 'Solve it to build a bridge to the treasure island. Perfect solve: <b>+8 gold</b>',
        onSolve: (perfect) => {
          o.used = true;
          for (let c = 6; c <= 7; c++) G.room.tiles[6][c] = BRIDGE;
          G.room.bridged = true;
          G.bg = renderRoomBG(G.room);
          if (perfect) { run.gold += 8; floatText(p.x, p.y - 30, '+8 gold', '#ffd966'); }
          burst(6.5 * T, 6.5 * T, '#c58f55', 30, 200);
          sfx.door();
        },
      });
    }
    if (o.kind === 'goblin') {
      return openProblem(o, GOBLIN, {
        icon: '👺', title: 'The Ratio Goblin',
        reward: '"Answer my riddle and the gold is yours!" Reward: <b>12 gold</b> (+6 for perfect)',
        onSolve: (perfect) => {
          o.used = true;
          const g = 12 + (perfect ? 6 : 0);
          run.gold += g;
          sfx.coin();
          floatText(p.x, p.y - 30, `+${g} gold`, '#ffd966', 2);
        },
      });
    }
    if (o.kind === 'shopItem') {
      if (run.gold < o.price) { floatText(p.x, p.y - 30, `Need ${o.price} gold`, '#ff8a8a'); sfx.wrong(); return; }
      if (o.heal && p.hp >= p.maxHp) { floatText(p.x, p.y - 30, 'Already full health!', '#ffffff'); return; }
      run.gold -= o.price;
      o.used = true;
      sfx.buy();
      if (o.heal) { p.hp = Math.min(p.maxHp, p.hp + 1); floatText(p.x, p.y - 30, '+1 ♥', '#ff6b8a'); }
      else giveItem(o.item);
      return;
    }
    if (o.kind === 'hatch') {
      o.used = true;
      if (run.floor === 3 && !run.endless) return showEnd(true);
      return newFloor(run.floor + 1);
    }
    if (o.kind === 'rune') {
      const b = o.boss;
      return openProblem(o, BOSS, {
        icon: '🔮', title: 'Shield Rune', allowLeave: true,
        reward: 'Solve to shatter the boss shield. Perfect solve also <b>stuns the boss longer</b>',
        onSolve: (perfect) => {
          o.used = true;
          G.room.objects = G.room.objects.filter((x) => x !== o);
          b.shielded = false;
          b.shieldIdx++;
          b.stun = perfect ? 4 : 2.5;
          G.ebullets = [];
          G.shake = 12;
          sfx.boom();
          burst(b.x, b.y, '#9ad8ff', 50, 320);
          floatText(b.x, b.y - b.r - 20, 'SHIELD BROKEN!', '#9ad8ff', 2);
        },
      });
    }
  }

  // ================= problem modal =================
  const M = { obj: null, opts: null, preferred: null };
  function openProblem(obj, preferred, opts) {
    if (!obj.problem) {
      obj.problem = P.generate(preferred, settings.types, G.run.floor);
      obj.pst = { wrong: 0, hints: 0, revealed: false };
    }
    M.obj = obj; M.opts = opts; M.preferred = preferred;
    G.mode = 'modal';
    clearInput();
    renderModal();
    $('modal').classList.remove('hidden');
    setTimeout(() => { const i = $('pm-fields').querySelector('input'); if (i) i.focus(); }, 30);
  }

  function renderModal() {
    const o = M.obj, p = o.problem, st = o.pst;
    $('pm-icon').textContent = M.opts.icon;
    $('pm-title').textContent = M.opts.title;
    $('pm-reward').innerHTML = M.opts.reward || '';
    $('pm-type').textContent = P.TYPES[p.type] ? P.TYPES[p.type].name : '';
    $('pm-prompt').innerHTML = p.promptHTML;
    const fields = $('pm-fields');
    fields.innerHTML = '';
    if (p.choices) {
      p.choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.innerHTML = `<span class="ck">${i + 1}</span> ${c.label}`;
        b.onclick = () => submitChoice(c, b);
        fields.appendChild(b);
      });
    } else {
      p.fields.forEach((f) => {
        const lab = document.createElement('label');
        lab.className = 'field';
        lab.innerHTML = `<span class="fl">${f.label}</span><input type="text" inputmode="numeric" autocomplete="off" spellcheck="false"><span class="fu">${f.unit || ''}</span>`;
        fields.appendChild(lab);
      });
    }
    $('pm-hints').innerHTML = p.hints.slice(0, st.hints).map((h, i) => `<div class="hint"><b>Hint ${i + 1}:</b> ${h}</div>`).join('');
    $('pm-solution').innerHTML = '';
    $('pm-solution').classList.add('hidden');
    $('pm-feedback').textContent = '';
    $('pm-feedback').className = '';
    $('pm-hint').disabled = st.hints >= p.hints.length;
    $('pm-hint').textContent = st.hints >= p.hints.length ? 'No more hints' : `Hint (${p.hints.length - st.hints} left)`;
    $('pm-reveal').classList.toggle('hidden', st.wrong < 2);
    $('pm-submit').classList.toggle('hidden', !!p.choices);
    $('pm-submit').disabled = false;
    $('pm-new').classList.add('hidden');
    $('pm-hint').classList.remove('hidden');
    $('pm-leave').textContent = 'Walk away (Esc)';
  }

  function recordResult(type, solved, perfect, hints) {
    const s = G.run.stats;
    s.attempted++;
    if (solved) s.solved++;
    if (perfect) s.perfect++;
    s.hints += hints;
    const bt = (s.byType[type] = s.byType[type] || { attempted: 0, solved: 0 });
    bt.attempted++;
    if (solved) bt.solved++;
  }

  function submitAnswer() {
    const o = M.obj, p = o.problem;
    if (!p || p.choices || o.pst.revealed) return;
    const inputs = [...$('pm-fields').querySelectorAll('input')];
    if (inputs.some((i) => !i.value.trim())) {
      setFeedback('Fill in every box first.', 'warn');
      return;
    }
    let allOk = true;
    inputs.forEach((inp, i) => {
      const v = P.parseAnswer(inp.value);
      const ok = Math.abs(v - p.fields[i].answer) < 1e-9;
      inp.classList.toggle('ok', ok);
      inp.classList.toggle('bad', !ok);
      if (!ok) allOk = false;
    });
    if (allOk) return solvedProblem();
    wrongAnswer(inputs.length > 1 ? 'Not quite. Check the red box(es).' : 'Not quite. Try again!');
  }

  function submitChoice(choice, btn) {
    const o = M.obj;
    if (!o.problem || o.pst.revealed) return;
    if (choice.correct) { btn.classList.add('ok'); return solvedProblem(); }
    btn.classList.add('bad');
    btn.disabled = true;
    wrongAnswer('Not quite. Try another one!');
  }

  function wrongAnswer(msg) {
    const o = M.obj;
    o.pst.wrong++;
    sfx.wrong();
    let m = msg;
    if (o.pst.wrong === 1 && o.pst.hints === 0) m += ' (Stuck? Try a hint.)';
    setFeedback(m, 'bad');
    const panel = $('modal-panel');
    panel.classList.remove('shake'); void panel.offsetWidth; panel.classList.add('shake');
    if (o.pst.wrong >= 2) $('pm-reveal').classList.remove('hidden');
  }

  function solvedProblem() {
    const o = M.obj, st = o.pst, p = o.problem;
    const perfect = st.wrong === 0 && st.hints === 0;
    recordResult(p.type, true, perfect, st.hints);
    o.problem = null;
    sfx.correct();
    setFeedback(perfect ? '⭐ PERFECT! First try, no hints! ⭐' : '✔ Correct! Nice work!', 'ok');
    $('pm-submit').disabled = true;
    $('pm-fields').querySelectorAll('input,button').forEach((el) => (el.disabled = true));
    const opts = M.opts;
    setTimeout(() => {
      closeModal();
      opts.onSolve(perfect);
    }, perfect ? 1100 : 900);
  }

  function revealSolution() {
    const o = M.obj, p = o.problem;
    if (!p) return;
    o.pst.revealed = true;
    recordResult(p.type, false, false, o.pst.hints);
    $('pm-solution').innerHTML = '<div class="sol-title">Here’s how to solve it:</div>' + p.solution.map((s) => `<div class="sol-step">${s}</div>`).join('');
    $('pm-solution').classList.remove('hidden');
    $('pm-hints').innerHTML = '';
    $('pm-submit').classList.add('hidden');
    $('pm-hint').classList.add('hidden');
    $('pm-reveal').classList.add('hidden');
    $('pm-new').classList.remove('hidden');
    $('pm-fields').querySelectorAll('input,button').forEach((el) => (el.disabled = true));
    setFeedback('Study the steps, then try a new one to get the reward.', 'warn');
    o.problem = null;
  }

  function newProblem() {
    const o = M.obj;
    o.problem = P.generate(M.preferred, settings.types, G.run.floor);
    o.pst = { wrong: 0, hints: 0, revealed: false };
    renderModal();
    setTimeout(() => { const i = $('pm-fields').querySelector('input'); if (i) i.focus(); }, 30);
  }

  function useHint() {
    const o = M.obj;
    if (!o.problem || o.pst.hints >= o.problem.hints.length) return;
    o.pst.hints++;
    const saved = [...$('pm-fields').querySelectorAll('input')].map((i) => i.value);
    renderModal();
    [...$('pm-fields').querySelectorAll('input')].forEach((i, k) => (i.value = saved[k] || ''));
    if (o.pst.wrong >= 2) $('pm-reveal').classList.remove('hidden');
  }

  function setFeedback(msg, cls) {
    const f = $('pm-feedback');
    f.textContent = msg;
    f.className = cls || '';
  }

  function closeModal() {
    $('modal').classList.add('hidden');
    if (G.mode === 'modal') G.mode = 'play';
    clearInput();
    blurUI();
  }

  function modalKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!$('pm-new').classList.contains('hidden')) newProblem();
      else submitAnswer();
      return;
    }
    const o = M.obj;
    if (o && o.problem && o.problem.choices && /^[1-4]$/.test(e.key)) {
      const btns = $('pm-fields').querySelectorAll('button');
      const b = btns[Number(e.key) - 1];
      if (b && !b.disabled) b.click();
    }
  }

  $('pm-submit').onclick = submitAnswer;
  $('pm-hint').onclick = useHint;
  $('pm-reveal').onclick = revealSolution;
  $('pm-new').onclick = newProblem;
  $('pm-leave').onclick = closeModal;

  // ================= item pick =================
  let pickChoices = [];
  function showItemPick(items, title) {
    if (!items.length) return;
    pickChoices = items;
    G.mode = 'pick';
    clearInput();
    $('pick-title').textContent = title;
    const box = $('pick-cards');
    box.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML = `<div class="ci">${it.icon}</div><div class="cn">${it.name}</div><div class="cd">${it.desc}</div><div class="ck">press ${i + 1}</div>`;
      b.onclick = () => choosePick(i);
      box.appendChild(b);
    });
    $('pick').classList.remove('hidden');
  }
  function choosePick(i) {
    const it = pickChoices[i];
    if (!it) return;
    $('pick').classList.add('hidden');
    G.mode = 'play';
    clearInput();
    blurUI();
    giveItem(it);
  }
  function pickKey(e) {
    if (/^[1-3]$/.test(e.key)) choosePick(Number(e.key) - 1);
  }

  // ================= update =================
  function update(dt) {
    G.t += dt;
    if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
    if (G.fade > 0) G.fade -= dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
    const run = G.run, p = run.player;

    if (G.deathT > 0) {
      G.deathT -= dt;
      updateParticles(dt);
      if (G.deathT <= 0) showEnd(false);
      return;
    }

    if (pressed.Escape || pressed.KeyP) return pauseGame();
    if (pressed.KeyM) { settings.sound = !settings.sound; saveSettings(); floatText(p.x, p.y - 30, settings.sound ? 'Sound on' : 'Sound off'); }

    const roomBefore = G.room;
    updatePlayer(dt);
    if (G.room !== roomBefore) return;

    // interact
    G.hint = nearestObject();
    if (G.hint && (pressed.KeyE || pressed.Enter)) { interact(G.hint); return; }

    // enemies
    for (const e of G.enemies) updateEnemy(e, dt);
    // separation
    for (let i = 0; i < G.enemies.length; i++) for (let j = i + 1; j < G.enemies.length; j++) {
      const a = G.enemies[i], b = G.enemies[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d > 0 && d < m) {
        const push = (m - d) / 2, ux = dx / d, uy = dy / d;
        if (a.kind !== 'boss' && a.kind !== 'eye') moveEnt(a, -ux * push, -uy * push, a.kind === 'ghost' ? 'fly' : 'walk');
        if (b.kind !== 'boss' && b.kind !== 'eye') moveEnt(b, ux * push, uy * push, b.kind === 'ghost' ? 'fly' : 'walk');
      }
    }
    // contact damage
    for (const e of G.enemies) {
      if (e.spawn > 0 || e.dead) continue;
      if (e.kind === 'ghost' && e.alpha < 0.45) continue;
      if (dist(e, p) < e.r + p.r * 0.7) {
        hurtPlayer('touch:' + e.kind);
        // bounce the attacker away so enemies can't pin you in a corner
        if (e.kind !== 'boss' && e.kind !== 'eye') {
          const d = dist(e, p) || 1;
          e.kx = ((e.x - p.x) / d) * 420; e.ky = ((e.y - p.y) / d) * 420;
          if (e.state === 'charge') { e.state = 'stun'; e.st = 0.8; }
        }
      }
    }

    // player bullets
    for (const b of G.pbullets) {
      if (p.homing && G.enemies.length) {
        let best = null, bd = 260;
        for (const e of G.enemies) { const d = dist(e, b); if (d < bd && !e.dead && e.spawn <= 0) { bd = d; best = e; } }
        if (best) {
          const sp = Math.hypot(b.vx, b.vy);
          const want = Math.atan2(best.y - b.y, best.x - b.x);
          let cur = Math.atan2(b.vy, b.vx);
          let diff = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
          cur += clamp(diff, -1, 1) * Math.min(1, dt * 2.5 * p.homing);
          b.vx = Math.cos(cur) * sp; b.vy = Math.sin(cur) * sp;
        }
      }
      const ox = b.x, oy = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (pointSolid(b.x, b.y, 'shot')) {
        if (b.bounces > 0) {
          b.bounces--;
          if (pointSolid(b.x, oy, 'shot')) b.vx = -b.vx;
          if (pointSolid(ox, b.y, 'shot')) b.vy = -b.vy;
          b.x = ox; b.y = oy;
        } else { b.dead = true; spark(ox, oy, b.color); continue; }
      }
      if (b.life <= 0) { b.dead = true; continue; }
      for (const e of G.enemies) {
        if (e.dead || e.spawn > 0 || b.hit.has(e)) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          damageEnemy(e, b.dmg, b.vx / sp, b.vy / sp);
          spark(b.x, b.y, b.color);
          b.hit.add(e);
          if (!b.pierce) { b.dead = true; break; }
        }
      }
    }
    // orbitals
    if (p.orbitals) {
      for (let i = 0; i < p.orbitals; i++) {
        const a = G.t * 3 + (i * TAU) / p.orbitals;
        const ox = p.x + Math.cos(a) * 46, oy = p.y + Math.sin(a) * 46;
        for (const e of G.enemies) {
          if (e.dead || e.spawn > 0) continue;
          if (Math.hypot(e.x - ox, e.y - oy) < e.r + 10 && (!e.orbHit || G.t - e.orbHit > 0.35)) {
            e.orbHit = G.t;
            damageEnemy(e, 0.6 + p.damage * 0.4, Math.cos(a), Math.sin(a));
          }
        }
        for (const b of G.ebullets) if (Math.hypot(b.x - ox, b.y - oy) < b.r + 10) { b.dead = true; spark(b.x, b.y, '#fff3b0'); }
      }
    }
    // enemy bullets
    for (const b of G.ebullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || pointSolid(b.x, b.y, 'shot')) { b.dead = true; continue; }
      if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r * 0.6) { b.dead = true; hurtPlayer('shot:' + (b.src || '?')); }
    }
    G.pbullets = G.pbullets.filter((b) => !b.dead);
    G.ebullets = G.ebullets.filter((b) => !b.dead);
    G.enemies = G.enemies.filter((e) => !e.dead);

    if (G.locked && G.enemies.length === 0) roomCleared();

    // pickups
    const room = G.room;
    for (const k of room.pickups) {
      k.t += dt;
      const d = dist(k, p);
      if ((p.magnet && d < 600) || d < 70) {
        if (!(k.kind === 'heart' && p.hp >= p.maxHp)) {
          const pull = p.magnet ? 520 : 300;
          k.vx += ((p.x - k.x) / d) * pull * dt * 4;
          k.vy += ((p.y - k.y) / d) * pull * dt * 4;
        }
      }
      k.x += k.vx * dt; k.y += k.vy * dt;
      k.vx *= 0.9; k.vy *= 0.9;
      k.x = clamp(k.x, T + 8, RW - T - 8); k.y = clamp(k.y, T + 8, RH - T - 8);
      if (d < p.r + 12 && k.t > 0.25) {
        if (k.kind === 'coin') { run.gold++; k.dead = true; sfx.coin(); floatText(k.x, k.y - 10, '+1', '#ffd966', 0.6); }
        if (k.kind === 'heart' && p.hp < p.maxHp) { p.hp++; k.dead = true; sfx.heart(); floatText(k.x, k.y - 10, '+1 ♥', '#ff6b8a'); }
      }
    }
    room.pickups = room.pickups.filter((k) => !k.dead);
    for (const o of room.objects) if (o.pop > 0) o.pop -= dt;
    updateParticles(dt);
  }

  function updateParticles(dt) {
    for (const q of G.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; q.life -= dt; }
    G.particles = G.particles.filter((q) => q.life > 0);
    if (G.particles.length > 600) G.particles.splice(0, G.particles.length - 600);
    for (const t of G.texts) { t.y -= 30 * dt; t.life -= dt; }
    G.texts = G.texts.filter((t) => t.life > 0);
  }

  // ================= drawing =================
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function renderRoomBG(room) {
    const th = G.run.theme;
    const c = document.createElement('canvas');
    c.width = RW; c.height = RH;
    const g = c.getContext('2d');
    for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
      const x = col * T, y = r * T;
      g.fillStyle = (r + col) % 2 ? th.floor : th.floor2;
      g.fillRect(x, y, T, T);
    }
    // floor cracks / deco
    for (const d of room.deco) {
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = 2;
      g.beginPath();
      if (d.k === 0) { g.moveTo(d.x, d.y); g.lineTo(d.x + 14 * d.s, d.y + 6 * d.s); g.lineTo(d.x + 20 * d.s, d.y - 4 * d.s); }
      else if (d.k === 1) { g.arc(d.x, d.y, 4 * d.s, 0, TAU); }
      else { g.moveTo(d.x - 8 * d.s, d.y); g.lineTo(d.x + 8 * d.s, d.y); }
      g.stroke();
    }
    for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
      const t = room.tiles[r][col], x = col * T, y = r * T;
      if (t === WALL) {
        g.fillStyle = th.wall; g.fillRect(x, y, T, T);
        g.fillStyle = th.wallTop; g.fillRect(x + 2, y + 2, T - 4, T - 12);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 2, y + T - 12, T - 4, 8);
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.strokeRect(x + 2.5, y + 2.5, (T - 5) / 2, (T - 14) / 2);
      } else if (t === ROCK) {
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath(); g.ellipse(x + T / 2, y + T - 8, 20, 7, 0, 0, TAU); g.fill();
        g.fillStyle = th.rock;
        rr(g, x + 4, y + 4, T - 8, T - 10, 12); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.15)';
        rr(g, x + 9, y + 8, T - 22, 10, 5); g.fill();
      } else if (t === PIT) {
        g.fillStyle = '#05060a'; g.fillRect(x, y, T, T);
        const up = r > 0 && room.tiles[r - 1][col] !== PIT;
        if (up) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y, T, 8); }
      } else if (t === BRIDGE) {
        g.fillStyle = '#05060a'; g.fillRect(x, y, T, T);
        g.fillStyle = '#8a5a32';
        for (let i = 0; i < 4; i++) { g.fillRect(x + i * 12 + 1, y + 6, 10, T - 12); }
        g.fillStyle = '#5e3c20'; g.fillRect(x, y + 6, T, 3); g.fillRect(x, y + T - 9, T, 3);
      }
    }
    // inner shadow along walls
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(T, T, RW - 2 * T, 10);
    // start room tutorial
    if (room.type === 'start' && G.run.floor === 1) {
      g.textAlign = 'center';
      g.font = 'bold 20px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.fillText('WASD = move    ARROWS or MOUSE = shoot', RW / 2, RH / 2 - 120);
      g.fillText('SPACE = dash    E = open / interact    P = pause', RW / 2, RH / 2 - 90);
      g.font = 'bold 17px system-ui, sans-serif';
      g.fillText('Chests, shrines and bridges are locked with math. Solve them for loot!', RW / 2, RH / 2 + 130);
    }
    return c;
  }

  function drawDoors() {
    const room = G.room, th = G.run.theme;
    for (const d of Object.keys(room.doors)) {
      const neighbor = room.doors[d];
      let x, y, w, h;
      if (d === 'n') { x = DC[0] * T; y = 0; w = 3 * T; h = T; }
      if (d === 's') { x = DC[0] * T; y = (ROWS - 1) * T; w = 3 * T; h = T; }
      if (d === 'w') { x = 0; y = DR[0] * T; w = T; h = 3 * T; }
      if (d === 'e') { x = (COLS - 1) * T; y = DR[0] * T; w = T; h = 3 * T; }
      ctx.fillStyle = '#0a0b10';
      ctx.fillRect(x, y, w, h);
      // colored frame hints what's beyond
      const col = neighbor.type === 'boss' ? '#ff4d4d' : neighbor.type === 'treasure' ? '#ffd23f' : neighbor.type === 'shop' ? '#6be38a' : neighbor.type === 'shrine' ? '#c9a7ff' : th.wallTop;
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      if (G.locked) {
        ctx.fillStyle = '#6d6f78';
        if (w > h) for (let i = 0; i < 7; i++) ctx.fillRect(x + 8 + i * 20, y + 4, 8, h - 8);
        else for (let i = 0; i < 7; i++) ctx.fillRect(x + 4, y + 8 + i * 20, w - 8, 8);
      }
    }
  }

  function drawPlayer(p) {
    if (p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0 && p.dashT <= 0) return;
    const bob = Math.sin(p.walkT * 14) * 1.5;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, p.r - bob, p.r, 5, 0, 0, TAU); ctx.fill();
    // cloak
    ctx.fillStyle = '#2bb5a0';
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1f8a7a';
    ctx.beginPath(); ctx.arc(0, 2, p.r * 0.95, 0.2, Math.PI - 0.2); ctx.fill();
    // face
    ctx.fillStyle = '#ffe0bd';
    ctx.beginPath(); ctx.arc(p.faceX * 4, p.faceY * 3 - 2, p.r * 0.62, 0, TAU); ctx.fill();
    // eyes
    ctx.fillStyle = '#1a1a1a';
    const ex = p.faceX * 6, ey = p.faceY * 5 - 3;
    ctx.beginPath(); ctx.arc(ex - 3.5, ey, 2.2, 0, TAU); ctx.arc(ex + 3.5, ey, 2.2, 0, TAU); ctx.fill();
    // hood tip
    ctx.fillStyle = '#2bb5a0';
    ctx.beginPath(); ctx.moveTo(-8, -p.r + 3); ctx.lineTo(0, -p.r - 8); ctx.lineTo(8, -p.r + 3); ctx.fill();
    ctx.restore();
    if (p.bubble && p.bubbleReady) {
      ctx.strokeStyle = 'rgba(154,216,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8 + Math.sin(G.t * 4) * 1.5, 0, TAU); ctx.stroke();
    }
    for (let i = 0; i < p.orbitals; i++) {
      const a = G.t * 3 + (i * TAU) / p.orbitals;
      const ox = p.x + Math.cos(a) * 46, oy = p.y + Math.sin(a) * 46;
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath(); ctx.arc(ox, oy, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e0cf7a';
      ctx.beginPath(); ctx.arc(ox + 3, oy - 2, 3, 0, TAU); ctx.fill();
    }
  }

  function drawEyes(x, y, size, gap, lookX, lookY, color) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - gap, y, size, 0, TAU); ctx.arc(x + gap, y, size, 0, TAU); ctx.fill();
    ctx.fillStyle = color || '#111';
    ctx.beginPath(); ctx.arc(x - gap + lookX * size * 0.4, y + lookY * size * 0.4, size * 0.55, 0, TAU); ctx.arc(x + gap + lookX * size * 0.4, y + lookY * size * 0.4, size * 0.55, 0, TAU); ctx.fill();
  }

  function drawEnemy(e) {
    const p = G.run.player;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, lx = dx / d, ly = dy / d;
    ctx.save();
    if (e.spawn > 0) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = e.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1 + e.spawn), 0, TAU); ctx.stroke();
    }
    if (e.kind === 'ghost') ctx.globalAlpha *= e.alpha;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.85, e.r * 0.9, e.r * 0.3, 0, 0, TAU); ctx.fill();
    const col = e.flash > 0 ? '#ffffff' : e.slow > 0 ? '#9fd8ff' : e.color;
    ctx.fillStyle = col;
    switch (e.kind) {
      case 'slime': case 'bigslime': {
        const s = e.squash || 0;
        ctx.beginPath(); ctx.ellipse(e.x, e.y + s * 2, e.r * (1 + 0.15 * (1 - s)), e.r * (0.8 + 0.25 * s), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.ellipse(e.x - e.r * 0.35, e.y - e.r * 0.3, e.r * 0.25, e.r * 0.15, -0.5, 0, TAU); ctx.fill();
        drawEyes(e.x, e.y - 2, e.r * 0.22, e.r * 0.35, lx, ly);
        break;
      }
      case 'bat': {
        const f = Math.sin(e.t * 22) * 0.6;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x - e.r * 2, e.y - e.r * (0.6 + f));
        ctx.lineTo(e.x - e.r * 1.2, e.y + e.r * 0.3);
        ctx.lineTo(e.x + e.r * 1.2, e.y + e.r * 0.3);
        ctx.lineTo(e.x + e.r * 2, e.y - e.r * (0.6 + f));
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
        drawEyes(e.x, e.y - 1, 3, 4, lx, ly, '#c00');
        break;
      }
      case 'ghost': {
        ctx.beginPath();
        ctx.arc(e.x, e.y - 2, e.r, Math.PI, 0);
        for (let i = 0; i <= 4; i++) ctx.lineTo(e.x + e.r - (i * 2 * e.r) / 4, e.y + e.r * 0.9 + (i % 2 ? -5 : 0) + Math.sin(e.t * 6 + i) * 2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#334';
        ctx.beginPath(); ctx.ellipse(e.x - 5, e.y - 3, 3, 4.5, 0, 0, TAU); ctx.ellipse(e.x + 5, e.y - 3, 3, 4.5, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'archer': {
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(e.x - 5, e.y - 3, 3.5, 0, TAU); ctx.arc(e.x + 5, e.y - 3, 3.5, 0, TAU); ctx.fill();
        ctx.fillRect(e.x - 5, e.y + 5, 10, 2);
        // bow
        ctx.strokeStyle = e.aim ? '#ff5050' : '#8a5a32'; ctx.lineWidth = 3;
        const a = Math.atan2(ly, lx);
        ctx.beginPath(); ctx.arc(e.x + lx * (e.r + 4), e.y + ly * (e.r + 4), 12, a - 1.2, a + 1.2); ctx.stroke();
        break;
      }
      case 'charger': {
        ctx.save();
        if (e.state === 'wind') ctx.translate(rand(-2, 2), rand(-2, 2));
        ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.1, e.r * 0.9, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f2ead8';
        ctx.beginPath(); ctx.moveTo(e.x - 9, e.y + 2); ctx.lineTo(e.x - 13, e.y - 10); ctx.lineTo(e.x - 5, e.y - 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(e.x + 9, e.y + 2); ctx.lineTo(e.x + 13, e.y - 10); ctx.lineTo(e.x + 5, e.y - 2); ctx.fill();
        drawEyes(e.x, e.y - 3, 3.5, 6, lx, ly, e.state === 'wind' || e.state === 'charge' ? '#e00' : '#111');
        if (e.state === 'stun') { ctx.fillStyle = '#ffe27a'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✦ ✦', e.x, e.y - e.r - 6); }
        ctx.restore();
        break;
      }
      case 'eye': {
        ctx.fillStyle = '#4a3a4a';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, 0, TAU); ctx.fill();
        ctx.fillStyle = e.flash > 0 ? '#fff' : '#f3efe6';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
        ctx.fillStyle = e.cd < 0.5 ? '#ff2a2a' : col;
        ctx.beginPath(); ctx.arc(e.x + lx * 5, e.y + ly * 5, e.r * 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(e.x + lx * 7, e.y + ly * 7, e.r * 0.22, 0, TAU); ctx.fill();
        break;
      }
      case 'boss': drawBoss(e, lx, ly, col); break;
    }
    ctx.restore();
    // hp bar for tougher enemies
    if (e.kind !== 'boss' && e.hp < e.maxHp && e.spawn <= 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - 14, e.y - e.r - 10, 28, 4);
      ctx.fillStyle = '#ff5f5f'; ctx.fillRect(e.x - 14, e.y - e.r - 10, 28 * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  function drawBoss(b, lx, ly, col) {
    const s = b.squash || 0;
    if (b.variant === 0) {
      ctx.beginPath(); ctx.ellipse(b.x, b.y + s * 3, b.r * (1 + 0.12 * (1 - s)), b.r * (0.82 + 0.2 * s), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.ellipse(b.x - 14, b.y - 14, 10, 6, -0.5, 0, TAU); ctx.fill();
      // crown
      ctx.fillStyle = '#ffd23f';
      const cy = b.y - b.r * 0.75;
      ctx.beginPath(); ctx.moveTo(b.x - 18, cy); ctx.lineTo(b.x - 18, cy - 16); ctx.lineTo(b.x - 9, cy - 7); ctx.lineTo(b.x, cy - 18); ctx.lineTo(b.x + 9, cy - 7); ctx.lineTo(b.x + 18, cy - 16); ctx.lineTo(b.x + 18, cy); ctx.fill();
      drawEyes(b.x, b.y - 4, 7, 12, lx, ly);
    } else if (b.variant === 1) {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5b3f86';
      ctx.beginPath(); ctx.arc(b.x, b.y - 4, b.r, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.fillStyle = '#1a1020';
      ctx.beginPath(); ctx.arc(b.x - 11, b.y + 2, 7, 0, TAU); ctx.arc(b.x + 11, b.y + 2, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c38bff';
      ctx.beginPath(); ctx.arc(b.x - 11 + lx * 2, b.y + 2 + ly * 2, 3, 0, TAU); ctx.arc(b.x + 11 + lx * 2, b.y + 2 + ly * 2, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1020';
      for (let i = -2; i <= 2; i++) ctx.fillRect(b.x + i * 6 - 2, b.y + 16, 4, 7);
    } else {
      ctx.fillStyle = b.state === 'wind' ? '#ff7a3a' : col;
      rr(ctx, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, 10); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(b.x - b.r, b.y + 4, b.r * 2, 6);
      // glowing ratio rune on its chest
      ctx.fillStyle = '#ffe27a';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('a:b', b.x, b.y + 28);
      ctx.fillStyle = '#2b1a10';
      ctx.fillRect(b.x - 22, b.y - 16, 16, 9); ctx.fillRect(b.x + 6, b.y - 16, 16, 9);
      ctx.fillStyle = '#ffb36b';
      ctx.fillRect(b.x - 18 + lx * 3, b.y - 14, 8, 5); ctx.fillRect(b.x + 10 + lx * 3, b.y - 14, 8, 5);
    }
    if (b.shielded) {
      ctx.strokeStyle = `rgba(154,216,255,${0.6 + 0.3 * Math.sin(G.t * 6)})`;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 14, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(154,216,255,0.15)';
      ctx.fill();
    }
    if (b.stun > 0) {
      ctx.fillStyle = '#ffe27a'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('✦ ✦ ✦', b.x + Math.sin(G.t * 8) * 6, b.y - b.r - 14);
    }
  }

  function drawObject(o) {
    const th = G.run.theme;
    const sc = o.pop > 0 ? 1 + o.pop : 1;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, o.r * 0.8, o.r, o.r * 0.3, 0, 0, TAU); ctx.fill();
    switch (o.kind) {
      case 'chest': {
        const gold = o.golden;
        ctx.fillStyle = gold ? '#c9932b' : '#8a5a32';
        rr(ctx, -22, -14, 44, 30, 5); ctx.fill();
        ctx.fillStyle = gold ? '#e8b84a' : '#a8703f';
        if (o.open || o.used) { rr(ctx, -22, -26, 44, 12, 4); ctx.fill(); ctx.fillStyle = '#1a1208'; ctx.fillRect(-18, -14, 36, 6); }
        else { rr(ctx, -22, -18, 44, 14, 5); ctx.fill(); }
        ctx.fillStyle = gold ? '#fff0a8' : '#d6b25e';
        ctx.fillRect(-22, -6, 44, 4);
        if (!o.unlocked && !o.used) {
          // the "bow-tie" lock: an X between two fractions
          ctx.fillStyle = '#e6e6e6';
          rr(ctx, -9, -8, 18, 18, 3); ctx.fill();
          ctx.strokeStyle = '#d33'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(5, 6); ctx.moveTo(5, -4); ctx.lineTo(-5, 6); ctx.stroke();
        }
        if (!o.used) {
          ctx.globalAlpha = 0.4 + 0.3 * Math.sin(G.t * 3);
          ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2;
          rr(ctx, -26, -22, 52, 42, 7); ctx.stroke();
        }
        break;
      }
      case 'shrine': {
        ctx.fillStyle = '#6b6f80';
        rr(ctx, -26, -6, 52, 26, 4); ctx.fill();
        ctx.fillStyle = '#8b90a3';
        rr(ctx, -20, -40, 40, 36, 4); ctx.fill();
        // glowing angle
        ctx.strokeStyle = o.used ? '#555' : `rgba(201,167,255,${0.7 + 0.3 * Math.sin(G.t * 3)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(12, -10); ctx.moveTo(-12, -10); ctx.lineTo(8, -34); ctx.stroke();
        ctx.beginPath(); ctx.arc(-12, -10, 10, -0.88, 0); ctx.stroke();
        break;
      }
      case 'sign': {
        ctx.fillStyle = '#6b4526'; ctx.fillRect(-3, -6, 6, 26);
        ctx.fillStyle = '#a8703f'; rr(ctx, -22, -30, 44, 26, 3); ctx.fill();
        ctx.fillStyle = '#3a2412'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(o.used ? '✔' : 'a:b:c', 0, -12);
        break;
      }
      case 'goblin': {
        const bob = Math.sin(G.t * 3) * 2;
        ctx.fillStyle = '#6fbf4a';
        ctx.beginPath(); ctx.arc(0, bob, 16, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-14, bob - 4); ctx.lineTo(-28, bob - 12); ctx.lineTo(-12, bob + 4); ctx.fill();
        ctx.beginPath(); ctx.moveTo(14, bob - 4); ctx.lineTo(28, bob - 12); ctx.lineTo(12, bob + 4); ctx.fill();
        ctx.fillStyle = '#7a3fb0';
        ctx.beginPath(); ctx.moveTo(-14, bob - 10); ctx.lineTo(0, bob - 36); ctx.lineTo(14, bob - 10); ctx.fill();
        drawEyes(0, bob - 2, 4, 6, 0, 0.3);
        ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
        if (!o.used) ctx.fillText('?', 0, bob - 42);
        break;
      }
      case 'shopItem': case 'shopkeeper': {
        if (o.kind === 'shopkeeper') {
          ctx.fillStyle = '#d9a066'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill();
          ctx.fillStyle = '#4a2f8a'; ctx.beginPath(); ctx.arc(0, -6, 19, Math.PI, 0); ctx.fill();
          drawEyes(0, 0, 4, 6, 0, 0.3);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center';
          ctx.fillText('SHOP', 0, -32);
          break;
        }
        ctx.fillStyle = '#6b6f80'; rr(ctx, -22, 4, 44, 16, 3); ctx.fill();
        if (!o.used) {
          ctx.font = `30px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(o.heal ? '❤️' : o.item.icon, 0, -10 + Math.sin(G.t * 3) * 3);
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = G.run.gold >= o.price ? '#ffd966' : '#ff8a8a';
          ctx.font = 'bold 15px system-ui';
          ctx.fillText(`${o.price}g`, 0, 40);
        }
        break;
      }
      case 'hatch': {
        ctx.fillStyle = '#3a2a1a'; rr(ctx, -26, -22, 52, 44, 6); ctx.fill();
        ctx.fillStyle = '#05060a'; rr(ctx, -20, -16, 40, 32, 4); ctx.fill();
        ctx.strokeStyle = '#a8703f'; ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-12, -10 + i * 10); ctx.lineTo(12, -10 + i * 10); ctx.stroke(); }
        ctx.fillStyle = th.accent; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('DOWN', 0, -30);
        break;
      }
      case 'rune': {
        const pulse = 0.6 + 0.4 * Math.sin(G.t * 5);
        ctx.fillStyle = `rgba(154,216,255,${0.25 * pulse})`;
        ctx.beginPath(); ctx.arc(0, 0, 36, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a3550'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(154,216,255,${pulse})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.moveTo(9, -9); ctx.lineTo(-9, 9); ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  function drawPickup(k) {
    const bob = Math.sin(G.t * 5 + k.x) * 2;
    if (k.kind === 'coin') {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.ellipse(k.x, k.y + bob, 6 * Math.abs(Math.cos(G.t * 4 + k.x)) + 1.5, 7, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      drawHeart(k.x, k.y + bob, 9, '#ff4d6d');
    }
  }

  function drawHeart(x, y, s, color, outline) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.3, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
    ctx.closePath();
    if (color) { ctx.fillStyle = color; ctx.fill(); }
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.stroke(); }
  }

  function drawHUD() {
    const run = G.run, p = run.player, th = run.theme;
    ctx.fillStyle = '#0d0f15';
    ctx.fillRect(0, 0, CW, HUD);
    ctx.fillStyle = th.accent; ctx.fillRect(0, HUD - 2, CW, 2);
    for (let i = 0; i < p.maxHp; i++) {
      const x = 22 + i * 26, y = 22;
      drawHeart(x, y, 10, i < p.hp ? '#ff4d6d' : '#2a2d38', i < p.hp ? null : '#555');
    }
    if (p.bubble) {
      ctx.strokeStyle = p.bubbleReady ? '#9ad8ff' : '#444';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(22 + p.maxHp * 26, 22, 9, 0, TAU); ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(20, 44, 6, 0, TAU); ctx.fill();
    ctx.fillText(String(run.gold), 32, 50);
    // dash meter
    ctx.fillStyle = '#2a2d38'; ctx.fillRect(80, 40, 60, 7);
    ctx.fillStyle = p.dashCdT <= 0 ? '#7fe0d0' : '#3e7a72';
    ctx.fillRect(80, 40, 60 * (1 - Math.max(0, p.dashCdT) / p.dashCd), 7);
    ctx.fillStyle = '#9aa'; ctx.font = '11px system-ui'; ctx.fillText('DASH', 146, 47);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(`Floor ${run.floor} · ${th.name}`, CW / 2 - 40, 24);
    const s = run.stats;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#b9c2d6';
    ctx.fillText(`Math solved: ${s.solved}   ⭐ Perfect: ${s.perfect}`, CW / 2 - 40, 44);
    // items
    ctx.font = `18px ${EMOJI_FONT}`;
    ctx.textAlign = 'left';
    const items = run.items.slice(-8);
    items.forEach((it, i) => ctx.fillText(it.icon, CW - 220 + i * 25, 36));
    if (run.items.length > 8) { ctx.font = '12px system-ui'; ctx.fillStyle = '#aaa'; ctx.fillText(`+${run.items.length - 8}`, CW - 250, 34); }
  }

  function drawBossBar() {
    const boss = G.enemies.find((e) => e.kind === 'boss');
    if (boss) {
      const w = 420, x = CW / 2 - w / 2, y = HUD + RH - 30;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 4, y - 18, w + 8, 34);
      ctx.fillStyle = '#3a0d12'; ctx.fillRect(x, y, w, 10);
      ctx.fillStyle = boss.shielded ? '#9ad8ff' : '#ff3b4f';
      ctx.fillRect(x, y, w * Math.max(0, boss.hp / boss.maxHp), 10);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(boss.name + (boss.shielded ? '  (SHIELDED: solve the rune!)' : ''), CW / 2, y - 4);
      boss.thresholds.forEach((t) => { ctx.fillStyle = '#fff'; ctx.fillRect(x + w * t - 1, y - 2, 2, 14); });
    }
  }

  function drawMinimap() {
    const run = G.run;
    const cw = 16, ch = 11, gap = 3;
    const rooms = [...run.rooms.values()].filter((r) => r.seen);
    if (!rooms.length) return;
    const minX = Math.min(...[...run.rooms.values()].map((r) => r.gx));
    const maxX = Math.max(...[...run.rooms.values()].map((r) => r.gx));
    const minY = Math.min(...[...run.rooms.values()].map((r) => r.gy));
    const maxY = Math.max(...[...run.rooms.values()].map((r) => r.gy));
    const w = (maxX - minX + 1) * (cw + gap) + gap, h = (maxY - minY + 1) * (ch + gap) + gap;
    const ox = CW - w - 10, oy = HUD + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(ctx, ox - 4, oy - 4, w + 8, h + 8, 6); ctx.fill();
    for (const r of rooms) {
      const x = ox + gap + (r.gx - minX) * (cw + gap), y = oy + gap + (r.gy - minY) * (ch + gap);
      ctx.fillStyle = r === run.cur ? '#ffffff' : r.visited ? '#7d8aa6' : '#3b4252';
      ctx.fillRect(x, y, cw, ch);
      const icon = { boss: ['#ff4d4d', '☠'], treasure: ['#ffd23f', '■'], shop: ['#6be38a', '$'], shrine: ['#c9a7ff', '△'], bridge: ['#c58f55', '≈'], goblin: ['#6fbf4a', '?'] }[r.type];
      if (icon && (r.visited || r.type === 'boss' || r.seen)) {
        ctx.fillStyle = r === run.cur ? '#000' : icon[0];
        ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(icon[1], x + cw / 2, y + ch - 2);
      }
    }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, CW, CH);
    if (!G.run || !G.room) return;
    drawHUD();
    ctx.save();
    const sx = G.shake ? rand(-G.shake, G.shake) : 0, sy = G.shake ? rand(-G.shake, G.shake) : 0;
    ctx.translate(sx, HUD + sy);
    ctx.beginPath(); ctx.rect(-20, 0, RW + 40, RH + 20); ctx.clip();
    if (G.bg) ctx.drawImage(G.bg, 0, 0);
    drawDoors();
    for (const k of G.room.pickups) drawPickup(k);
    for (const o of G.room.objects) drawObject(o);
    const p = G.run.player;
    // trail particles
    for (const q of G.particles) if (q.ghost) {
      ctx.globalAlpha = q.life / q.max * 0.5; ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const ents = [...G.enemies].sort((a, b) => a.y - b.y);
    for (const e of ents) drawEnemy(e);
    if (G.deathT <= 0 && p.hp > 0) drawPlayer(p);
    for (const b of G.pbullets) {
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.4, 0, TAU); ctx.fill();
    }
    for (const b of G.ebullets) {
      ctx.fillStyle = b.color;
      if (b.arrow) {
        const a = Math.atan2(b.vy, b.vx);
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
        ctx.fillRect(-10, -1.5, 16, 3);
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(3, -5); ctx.lineTo(3, 5); ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    for (const q of G.particles) if (!q.ghost) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const t of G.texts) {
      ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = '#000'; ctx.fillText(t.text, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    // interaction prompt
    if (G.hint && G.mode === 'play') {
      const o = G.hint, label = objectLabel(o);
      ctx.font = 'bold 15px system-ui, sans-serif';
      const w = ctx.measureText(label).width + 50;
      const x = clamp(o.x, w / 2 + 6, RW - w / 2 - 6), y = o.y - o.r - 34;
      ctx.fillStyle = 'rgba(10,12,20,0.88)';
      rr(ctx, x - w / 2, y - 16, w, 28, 8); ctx.fill();
      ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#ffe27a'; rr(ctx, x - w / 2 + 6, y - 11, 22, 18, 4); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillText('E', x - w / 2 + 17, y + 3);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, x - w / 2 + 34, y + 3);
    }
    ctx.restore();
    drawBossBar();
    drawMinimap();
    // banner
    if (G.banner) {
      const b = G.banner;
      const a = Math.min(1, b.t, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, HUD + RH / 2 - 70, CW, b.small ? 80 : 100);
      ctx.textAlign = 'center';
      ctx.fillStyle = b.boss ? '#ff6b6b' : G.run.theme.accent;
      ctx.font = `bold ${b.small ? 30 : 42}px system-ui, sans-serif`;
      ctx.fillText(b.text, CW / 2, HUD + RH / 2 - (b.small ? 28 : 18));
      ctx.fillStyle = '#ddd';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText(b.sub || '', CW / 2, HUD + RH / 2 + (b.small ? 0 : 16));
      ctx.globalAlpha = 1;
    }
    if (G.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${G.fade / 0.25})`;
      ctx.fillRect(0, HUD, CW, RH);
    }
  }

  // ================= screens =================
  function showScreen(id) {
    ['title', 'howto', 'pin', 'settings', 'pause', 'end'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
    if (!id) blurUI();
  }
  function pauseGame() {
    if (G.mode !== 'play') return;
    G.mode = 'paused';
    clearInput();
    $('pause-sound').textContent = `Sound: ${settings.sound ? 'ON' : 'OFF'}`;
    showScreen('pause');
  }
  function resumeGame() {
    G.mode = 'play';
    clearInput();
    showScreen(null);
  }

  function reportCode(run, floorReached) {
    const s = run.stats;
    const raw = floorReached * 7 + s.solved * 13 + s.attempted * 17 + s.perfect * 19 + 101;
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    return `F${floorReached}-S${s.solved}-A${s.attempted}-P${s.perfect}-${letters[raw % 24]}${letters[(raw * 7) % 24]}${(raw * 3) % 10}`;
  }

  function showEnd(won) {
    const run = G.run, s = run.stats;
    G.mode = won ? 'won' : 'dead';
    clearInput();
    $('end-title').textContent = won ? '🏆 You escaped the dungeon!' : '💀 You were defeated…';
    $('end-sub').textContent = won ? 'All three bosses defeated. Legendary!' : `You made it to Floor ${run.floor}. Every run makes you stronger at math. Try again!`;
    const mins = Math.max(1, Math.round((Date.now() - run.start) / 60000));
    const rows = Object.entries(s.byType).map(([k, v]) => `<tr><td>${P.TYPES[k].name}</td><td>${v.solved} / ${v.attempted}</td></tr>`).join('');
    $('end-stats').innerHTML = `
      ${run.name ? `<div class="end-name">${escapeHTML(run.name)}</div>` : ''}
      <div class="end-grid">
        <div><b>${run.floor}</b><span>floor reached</span></div>
        <div><b>${s.solved}</b><span>problems solved</span></div>
        <div><b>${s.perfect}</b><span>perfect (1st try)</span></div>
        <div><b>${run.kills}</b><span>monsters defeated</span></div>
      </div>
      ${rows ? `<table class="end-table"><tr><th>Problem type</th><th>Solved</th></tr>${rows}</table>` : '<p>No math problems attempted this run. Open chests to get loot!</p>'}
      <div class="end-code">Report code: <b>${reportCode(run, run.floor)}</b> · ${mins} min</div>`;
    $('end-continue').classList.toggle('hidden', !won);
    showScreen('end');
  }
  function escapeHTML(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // settings screen
  function renderSettings() {
    const box = $('set-types');
    box.innerHTML = '';
    Object.entries(P.TYPES).forEach(([k, t]) => {
      const lab = document.createElement('label');
      lab.className = 'chk';
      lab.innerHTML = `<input type="checkbox" ${settings.types[k] !== false ? 'checked' : ''}> ${t.name}`;
      lab.querySelector('input').onchange = (e) => { settings.types[k] = e.target.checked; saveSettings(); updateLink(); };
      box.appendChild(lab);
    });
    $('set-freq').checked = settings.freq === 'high';
    $('set-sound').checked = settings.sound;
    $('set-locked').classList.toggle('hidden', !lockedByLink);
    updateLink();
  }
  function updateLink() {
    const on = Object.keys(settings.types).filter((k) => settings.types[k] !== false);
    const url = location.origin + location.pathname + `?types=${on.join(',')}` + (settings.freq === 'high' ? '&freq=high' : '');
    $('set-link').value = url;
  }
  $('set-freq').onchange = (e) => { settings.freq = e.target.checked ? 'high' : 'normal'; saveSettings(); updateLink(); };
  $('set-sound').onchange = (e) => { settings.sound = e.target.checked; saveSettings(); };
  $('set-copy').onclick = () => {
    const inp = $('set-link');
    inp.select();
    const done = () => { $('set-copy').textContent = 'Copied!'; setTimeout(() => ($('set-copy').textContent = 'Copy link'), 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(inp.value).then(done, () => { document.execCommand('copy'); done(); });
    else { document.execCommand('copy'); done(); }
  };

  // buttons
  $('name').value = settings.name || '';
  $('name').oninput = (e) => { settings.name = e.target.value.slice(0, 40); saveSettings(); };
  $('btn-play').onclick = () => { tone(1, 0.01, 'sine', 0.0001); startRun(); };
  $('btn-howto').onclick = () => showScreen('howto');
  // Teacher settings are behind a 4-digit PIN. Only a hash of the PIN is stored here, so
  // the digits don't appear in the source. To change the PIN, run
  // RatioRogue.pinHash('1234') in the browser console and paste the result into PIN_HASH.
  const PIN_HASH = 'f1a88529';
  const pinHash = (pin) => {
    let h = 0x811c9dc5;
    for (const ch of 'ratio-rogue-pin:' + pin) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  };
  let teacherUnlocked = false; // stays unlocked until the page is reloaded
  const openSettings = () => { renderSettings(); showScreen('settings'); };
  $('btn-settings').onclick = () => {
    if (teacherUnlocked) return openSettings();
    $('pin-input').value = '';
    $('pin-msg').textContent = '';
    showScreen('pin');
    $('pin-input').focus();
  };
  function checkPin() {
    const inp = $('pin-input');
    if (pinHash(inp.value.trim()) === PIN_HASH) {
      teacherUnlocked = true;
      openSettings();
      return;
    }
    sfx.wrong();
    inp.value = '';
    $('pin-msg').textContent = 'Incorrect PIN.';
    const panel = $('pin-panel');
    panel.classList.remove('shake'); void panel.offsetWidth; panel.classList.add('shake');
    inp.focus();
  }
  $('pin-ok').onclick = checkPin;
  $('pin-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); checkPin(); }
    if (e.key === 'Escape') { e.preventDefault(); showScreen('title'); }
  });
  $('pin-input').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
  document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => showScreen('title')));
  $('pause-resume').onclick = resumeGame;
  $('pause-sound').onclick = () => { settings.sound = !settings.sound; saveSettings(); $('pause-sound').textContent = `Sound: ${settings.sound ? 'ON' : 'OFF'}`; };
  $('pause-quit').onclick = () => { G.mode = 'title'; G.run = null; G.room = null; showScreen('title'); };
  $('end-again').onclick = () => startRun();
  $('end-title-btn').onclick = () => { G.mode = 'title'; G.run = null; G.room = null; showScreen('title'); };
  $('end-continue').onclick = () => { G.run.endless = true; showScreen(null); G.mode = 'play'; newFloor(G.run.floor + 1); };
  window.addEventListener('keydown', (e) => {
    if (G.mode === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) { e.preventDefault(); resumeGame(); }
  });

  // ================= main loop =================
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (G.mode === 'play' && G.run) update(dt);
    for (const k in pressed) delete pressed[k];
    draw();
    requestAnimationFrame(frame);
  }
  showScreen('title');
  requestAnimationFrame(frame);

  // expose for debugging/testing in the console
  window.RatioRogue = { G, startRun, newFloor, giveItem, ITEMS, enterRoom, interact, pinHash };
})();
