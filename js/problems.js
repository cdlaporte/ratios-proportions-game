/*
 * Ratio Rogue — math problem generators.
 *
 * Every generator returns a problem whose answers are WHOLE NUMBERS.
 * Problem shape:
 * {
 *   type, title, promptHTML,
 *   fields:  [{ label, answer, unit }]      // typed-answer problems
 *   choices: [{ label, correct }]          // multiple-choice problems (simplify only)
 *   hints:   [html, ...]                    // revealed one at a time
 *   solution:[html, ...]                    // full worked solution
 * }
 */
(function (root) {
  'use strict';

  // ---------- helpers ----------
  const int = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const gcd = (a, b) => {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { [a, b] = [b, a % b]; }
    return a;
  };
  const gcd3 = (a, b, c) => gcd(gcd(a, b), c);
  const MINUS = '−';
  const neg = (n) => (n < 0 ? MINUS + Math.abs(n) : String(n));
  const cx = (n) => (n === 1 ? 'x' : n + 'x'); // 1x -> x

  // ---------- linear expressions  a*x + b ----------
  const lin = (a, b) => ({ a, b });
  const isConst = (e) => e.a === 0;

  function fmtLin(e) {
    const { a, b } = e;
    if (a === 0) return neg(b);
    let s = a === 1 ? 'x' : a === -1 ? MINUS + 'x' : neg(a) + 'x';
    if (b > 0) s += ' + ' + b;
    else if (b < 0) s += ' ' + MINUS + ' ' + Math.abs(b);
    return s;
  }

  // product of two expressions where at most one contains x
  function mul(p, q) {
    if (!isConst(p) && !isConst(q)) throw new Error('quadratic');
    if (isConst(p)) return lin(q.a * p.b, q.b * p.b);
    return lin(p.a * q.b, p.b * q.b);
  }

  // how a product is written BEFORE distributing, e.g. "4 · 7", "x · 2", "6(3x + 3)"
  function fmtProduct(p, q) {
    if (isConst(p) && isConst(q)) return `${neg(p.b)} · ${neg(q.b)}`;
    const c = isConst(p) ? p : q;
    const v = isConst(p) ? q : p;
    if (v.b === 0) {
      // plain "x" or "2x": keep the natural left-to-right order
      return isConst(p) ? `${neg(c.b)} · ${fmtLin(v)}` : `${fmtLin(v)} · ${neg(c.b)}`;
    }
    return `${neg(c.b)}(${fmtLin(v)})`;
  }

  const frac = (n, d, cn, cd) =>
    `<span class="frac"><span class="num ${cn || ''}">${n}</span><span class="den ${cd || ''}">${d}</span></span>`;

  function proportionHTML(s, colored) {
    const A = colored ? 'diag-a' : '';
    const B = colored ? 'diag-b' : '';
    return `<span class="prop">${frac(fmtLin(s.N1), fmtLin(s.D1), A, B)}<span class="eq">=</span>${frac(fmtLin(s.N2), fmtLin(s.D2), B, A)}</span>`;
  }

  // Build all of the work for  N1/D1 = N2/D2  (cross product a·d = b·c)
  function crossWork(s, x) {
    const left = mul(s.N1, s.D2);
    const right = mul(s.D1, s.N2);
    const productLine = `${fmtProduct(s.N1, s.D2)} = ${fmtProduct(s.D1, s.N2)}`;
    const distLine = `${fmtLin(left)} = ${fmtLin(right)}`;
    let A = left.a - right.a;
    let B = right.b - left.b;
    if (A < 0) { A = -A; B = -B; }
    if (A === 0 || B / A !== x) throw new Error('bad cross problem');

    const steps = [];
    steps.push(`<b>Cross multiply</b> (multiply along the X): ${productLine}`);
    if (distLine !== productLine) steps.push(`<b>Multiply / distribute:</b> ${distLine}`);
    const needsCollect = (left.a !== 0 && left.b !== 0) || (right.a !== 0 && right.b !== 0) || (left.a !== 0 && right.a !== 0);
    const axb = `${A === 1 ? '' : A}x = ${neg(B)}`;
    if (A === 1) {
      steps.push(`<b>Get x by itself:</b> x = <b>${x}</b>`);
    } else {
      if (needsCollect) steps.push(`<b>Get x-terms on one side, numbers on the other:</b> ${axb}`);
      steps.push(`<b>Divide both sides by ${A}:</b> x = ${neg(B)} ÷ ${A} = <b>${x}</b>`);
    }
    return { steps, productLine, distLine, A, B };
  }

  function crossProblem(type, s, x, opts) {
    opts = opts || {};
    const work = crossWork(s, x);
    const prompt = (opts.storyHTML ? `<p class="story">${opts.storyHTML}</p>` : '') +
      `<div class="big">${proportionHTML(s, false)}</div>` +
      `<p>${opts.ask || 'Solve for <b>x</b>.'}</p>`;
    const hints = [];
    if (opts.setupHint) hints.push(opts.setupHint);
    hints.push(`Multiply along the X. The <span class="diag-a">red</span> numbers multiply together, and the <span class="diag-b">blue</span> numbers multiply together:<div class="big">${proportionHTML(s, true)}</div>`);
    hints.push(`Your equation is: <b>${work.productLine}</b>` + (work.distLine !== work.productLine ? `<br>which becomes <b>${work.distLine}</b>` : ''));
    if (work.steps.length > 2) hints.push(work.steps[work.steps.length - 2] + '<br>Now finish solving for x.');
    const solution = (opts.setupHint ? [opts.setupHint] : []).concat(work.steps);
    if (opts.finalLine) solution.push(opts.finalLine);
    return {
      type,
      title: opts.title || 'Solve the proportion',
      promptHTML: prompt,
      fields: [{ label: opts.label || 'x =', answer: x, unit: opts.unit || '' }],
      hints, solution,
    };
  }

  // Four numbers that make a true proportion: p*m1/q*m1 = p*m2/q*m2
  function baseProportion(maxVal) {
    for (let tries = 0; tries < 500; tries++) {
      const p = int(1, 9), q = int(2, 9);
      if (p === q) continue;
      const m1 = int(1, 6), m2 = int(1, 6);
      if (m1 === m2) continue;
      const v = [p * m1, q * m1, p * m2, q * m2];
      if (Math.max(...v) > maxVal) continue;
      return v;
    }
    return [2, 7, 4, 14];
  }

  // ---------- 1. simple proportions: 4/x = 2/7 ----------
  function genSimple() {
    for (;;) {
      const v = baseProportion(60);
      const hide = int(0, 3);
      const x = v[hide];
      if (x < 2) continue;
      const e = v.map((n, i) => (i === hide ? lin(1, 0) : lin(0, n)));
      const s = { N1: e[0], D1: e[1], N2: e[2], D2: e[3] };
      return crossProblem('simple', s, x, { title: 'Solve the proportion' });
    }
  }

  // ---------- 2. word problems ----------
  const WORD_TEMPLATES = [
    { a: 'mushrooms', b: 'bowls of goblin stew', story: (A, B, C) => `A recipe for goblin stew uses <b>${A} mushrooms</b> for every <b>${B} bowls</b>. How many mushrooms are needed for <b>${C} bowls</b>?` },
    { a: 'miles', b: 'inches', story: (A, B, C) => `On a treasure map, <b>${B} inches</b> stands for <b>${A} miles</b>. Two caves are <b>${C} inches</b> apart on the map. How many miles apart are they really?` },
    { a: 'miles', b: 'minutes', story: (A, B, C) => `A dragon flies <b>${A} miles</b> in <b>${B} minutes</b>. At the same rate, how many miles does it fly in <b>${C} minutes</b>?` },
    { a: 'swords', b: 'iron bars', story: (A, B, C) => `A blacksmith can forge <b>${A} swords</b> from <b>${B} iron bars</b>. How many swords can she forge from <b>${C} iron bars</b>?` },
    { a: 'green slimes', b: 'slimes', story: (A, B, C) => `In the swamp, <b>${A} out of every ${B}</b> slimes are green. If there are <b>${C} slimes</b>, how many are green?` },
    { a: 'gold coins', b: 'gems', story: (A, B, C) => `A merchant trades <b>${A} gold coins</b> for every <b>${B} gems</b>. How many gold coins would you get for <b>${C} gems</b>?` },
    { a: 'dollars', b: 'hours', story: (A, B, C) => `You earn <b>$${A}</b> for every <b>${B} hours</b> of work. How many dollars do you earn in <b>${C} hours</b>?` },
    { a: 'cups of flour', b: 'batches of cookies', story: (A, B, C) => `A cookie recipe uses <b>${A} cups of flour</b> for <b>${B} batches</b>. How many cups of flour are needed for <b>${C} batches</b>?` },
    { a: 'feet tall', b: 'inches', story: (A, B, C) => `A scale model of a castle uses <b>${B} inches</b> for every <b>${A} feet</b> of the real castle. The model tower is <b>${C} inches</b> tall. How many feet tall is the real tower?` },
    { a: 'laps', b: 'minutes', story: (A, B, C) => `A knight runs <b>${A} laps</b> around the castle in <b>${B} minutes</b>. At the same rate, how many laps in <b>${C} minutes</b>?` },
  ];

  function genWord() {
    for (;;) {
      const t = pick(WORD_TEMPLATES);
      const p = int(1, 9), q = int(2, 9);
      if (p === q) continue;
      const m1 = int(1, 5), m2 = int(1, 8);
      if (m1 === m2) continue;
      const A = p * m1, B = q * m1, C = q * m2, ans = p * m2;
      if (t.a === 'green slimes' && A >= B) continue; // "A out of every B" needs A < B
      if (Math.max(A, B, C) > 60 || ans > 99 || ans < 2) continue;
      const s = { N1: lin(0, A), D1: lin(0, B), N2: lin(1, 0), D2: lin(0, C) };
      const setup = `<b>Set up a proportion</b> (keep the same units on top and bottom): ${proportionHTML(s, false)} <span class="small">(${t.a} over ${t.b})</span>`;
      const prob = crossProblem('word', s, ans, {
        title: 'Word problem',
        setupHint: setup,
        label: 'Answer:',
        unit: t.a,
      });
      // don't show the proportion in the prompt: setting it up is part of the problem
      prob.promptHTML = `<p class="story">${t.story(A, B, C)}</p><p>Set up a proportion and use cross products to solve it.</p>`;
      return prob;
    }
  }

  // ---------- 3/4. proportions with expressions ----------
  // Turn some of the four slots into expressions like (x + 3) or (3x - 2).
  function genExpr(type, varSlots) {
    for (let tries = 0; tries < 2000; tries++) {
      const p = int(2, 9), q = int(2, 9);
      if (p === q) continue;
      const m1 = int(1, 5), m2 = int(1, 5);
      if (m1 === m2) continue;
      const v = [p * m1, q * m1, p * m2, q * m2];
      if (Math.max(...v) > 60) continue;
      const x = int(2, 12);
      const slots = v.map((n) => lin(0, n));
      let ok = true;
      for (const i of varSlots) {
        const a = type === 'oneSide' ? pick([1, 1, 1, 2, 3]) : pick([1, 1, 2, 3, 4]);
        const b = v[i] - a * x;
        if (b === 0 || Math.abs(b) > 20) { ok = false; break; }
        if (b < 0 && Math.random() < 0.6) { ok = false; break; } // mostly "x + 3" style, sometimes "x - 3"
        slots[i] = lin(a, b);
      }
      if (!ok) continue;
      const s = { N1: slots[0], D1: slots[1], N2: slots[2], D2: slots[3] };
      // x must be cross-multiplied with a constant only, and the equation must have one solution
      let work;
      try { work = crossWork(s, x); } catch (e) { continue; }
      if (work.A > 20 || Math.abs(work.B) > 400) continue;
      return crossProblem(type, s, x, { title: type === 'oneSide' ? 'Solve the proportion' : 'Boss-level proportion' });
    }
    return genSimple();
  }

  function genOneSide() {
    return genExpr('oneSide', [int(0, 3)]);
  }

  function genTwoSides() {
    // x on both sides: both numerators or both denominators (never multiplied together)
    return genExpr('twoSides', pick([[1, 3], [1, 3], [0, 2]]));
  }

  // ---------- 5. complementary / supplementary ----------
  function genAngles2() {
    const supp = Math.random() < 0.5;
    const T = supp ? 180 : 90;
    const word = supp ? 'supplementary' : 'complementary';
    const pairs = [];
    for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) {
      if (a !== b && gcd(a, b) === 1 && T % (a + b) === 0 && T / (a + b) >= 3) pairs.push([a, b]);
    }
    const [a, b] = pick(pairs);
    const x = T / (a + b);
    const one = Math.random() < 0.3;
    const which = one ? (Math.random() < 0.5 ? 'larger' : 'smaller') : null;
    const fields = one
      ? [{ label: `The ${which} angle =`, answer: (which === 'larger' ? Math.max(a, b) : Math.min(a, b)) * x, unit: '°' }]
      : [{ label: '1st angle =', answer: a * x, unit: '°' }, { label: '2nd angle =', answer: b * x, unit: '°' }];
    const sumFact = `${word[0].toUpperCase() + word.slice(1)} angles add up to <b>${T}°</b>.`;
    const eq = `${cx(a)} + ${cx(b)} = ${T}`;
    const prompt = `<p>The ratio of two <b>${word}</b> angles is <b class="ratio">${a}:${b}</b>.</p><p>${one ? `Find the measure of the <b>${which}</b> angle.` : 'Find the measures of <b>both</b> angles.'}</p>`;
    return {
      type: 'angles2', title: 'Angle ratio', promptHTML: prompt, fields,
      hints: [
        sumFact + ` The ratio ${a}:${b} means the angles are <b>${cx(a)}</b> and <b>${cx(b)}</b>.`,
        `Write the equation: <b>${eq}</b>`,
        `${a + b}x = ${T}, so <b>x = ${x}</b>. Now multiply: ${a}(${x}) and ${b}(${x}).`,
      ],
      solution: [
        sumFact,
        `Let the angles be ${cx(a)} and ${cx(b)}: <b>${eq}</b>`,
        `Combine: ${a + b}x = ${T}, so x = ${T} ÷ ${a + b} = <b>${x}</b>`,
        `${a}(${x}) = <b>${a * x}°</b> and ${b}(${x}) = <b>${b * x}°</b>`,
        `Check: ${a * x} + ${b * x} = ${T} ✔`,
      ],
    };
  }

  // ---------- 6. triangle angle ratio a:b:c ----------
  function genTriAngles() {
    const triples = [];
    for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) for (let c = 1; c <= 12; c++) {
      const s = a + b + c;
      if (180 % s !== 0 || 180 / s < 3) continue;
      if (gcd3(a, b, c) !== 1) continue;
      if (a === b && b === c) continue;
      triples.push([a, b, c]);
    }
    const [a, b, c] = pick(triples);
    const S = a + b + c, x = 180 / S;
    const r = Math.random();
    const mode = r < 0.5 ? 'all' : r < 0.75 ? 'largest' : 'smallest';
    const fields = mode === 'all'
      ? [{ label: '1st angle =', answer: a * x, unit: '°' }, { label: '2nd angle =', answer: b * x, unit: '°' }, { label: '3rd angle =', answer: c * x, unit: '°' }]
      : [{ label: `The ${mode} angle =`, answer: (mode === 'largest' ? Math.max(a, b, c) : Math.min(a, b, c)) * x, unit: '°' }];
    const eq = `${cx(a)} + ${cx(b)} + ${cx(c)} = 180`;
    return {
      type: 'triAngles', title: 'Triangle angles',
      promptHTML: `<p>The ratio of the measures of the angles in a triangle is <b class="ratio">${a}:${b}:${c}</b>.</p><p>${mode === 'all' ? 'Find the measures of <b>all three</b> angles.' : `Find the measure of the <b>${mode}</b> angle.`}</p>`,
      fields,
      hints: [
        `The angles in a triangle add up to <b>180°</b>. The angles are <b>${cx(a)}</b>, <b>${cx(b)}</b>, and <b>${cx(c)}</b>.`,
        `Write the equation: <b>${eq}</b>`,
        `${S}x = 180, so <b>x = ${x}</b>. Now multiply each part by ${x}.`,
      ],
      solution: [
        'Angles in a triangle add up to 180°.',
        `<b>${eq}</b>`,
        `${S}x = 180, so x = 180 ÷ ${S} = <b>${x}</b>`,
        `${a}(${x}) = <b>${a * x}°</b>, ${b}(${x}) = <b>${b * x}°</b>, ${c}(${x}) = <b>${c * x}°</b>`,
        `Check: ${a * x} + ${b * x} + ${c * x} = 180 ✔`,
      ],
    };
  }

  // ---------- 7. triangle sides with perimeter ----------
  function genPerimeter() {
    const units = ['inches', 'meters', 'feet', 'centimeters', 'yards'];
    for (;;) {
      const a = int(2, 15), b = int(2, 15), c = int(2, 15);
      if (gcd3(a, b, c) !== 1) continue;
      const mx = Math.max(a, b, c);
      if (mx >= a + b + c - mx) continue; // must be a real triangle
      if (a === b && b === c) continue;
      const x = int(2, 9);
      const S = a + b + c, P = S * x;
      if (P > 300) continue;
      const u = pick(units);
      const r = Math.random();
      const mode = r < 0.5 ? 'all' : r < 0.75 ? 'shortest' : 'longest';
      const fields = mode === 'all'
        ? [{ label: '1st side =', answer: a * x, unit: u }, { label: '2nd side =', answer: b * x, unit: u }, { label: '3rd side =', answer: c * x, unit: u }]
        : [{ label: `The ${mode} side =`, answer: (mode === 'shortest' ? Math.min(a, b, c) : Math.max(a, b, c)) * x, unit: u }];
      const eq = `${cx(a)} + ${cx(b)} + ${cx(c)} = ${P}`;
      return {
        type: 'perimeter', title: 'Triangle sides',
        promptHTML: `<p>The ratio of the measures of the sides of a triangle is <b class="ratio">${a}:${b}:${c}</b>. The perimeter of the triangle is <b>${P} ${u}</b>.</p><p>${mode === 'all' ? 'Find the length of <b>each</b> side.' : `Find the length of the <b>${mode}</b> side.`}</p>`,
        fields,
        hints: [
          `The <b>perimeter</b> is all the sides added together. The sides are <b>${cx(a)}</b>, <b>${cx(b)}</b>, and <b>${cx(c)}</b>.`,
          `Write the equation: <b>${eq}</b>`,
          `${S}x = ${P}, so <b>x = ${x}</b>. Now multiply each part by ${x}.`,
        ],
        solution: [
          'Perimeter = side + side + side',
          `<b>${eq}</b>`,
          `${S}x = ${P}, so x = ${P} ÷ ${S} = <b>${x}</b>`,
          `${a}(${x}) = <b>${a * x}</b>, ${b}(${x}) = <b>${b * x}</b>, ${c}(${x}) = <b>${c * x}</b> ${u}`,
          `Check: ${a * x} + ${b * x} + ${c * x} = ${P} ✔`,
        ],
      };
    }
  }

  // ---------- 8. simplify a ratio (multiple choice, used rarely) ----------
  const LOOT = ['gold coins', 'rubies', 'potions', 'arrows', 'scrolls', 'keys', 'emeralds', 'apples'];
  function genSimplify() {
    for (;;) {
      const [n1, n2, n3] = shuffle(LOOT);
      const totalMode = Math.random() < 0.35;
      const p = int(1, 9), q = int(1, 9);
      if (p === q || gcd(p, q) !== 1) continue;
      const g = int(2, 8);
      let A = p * g, B = q * g, C = 0, num, den, ask, pp, qq;
      if (totalMode) {
        // part : total. pick a third count so the part/total still simplifies
        C = int(2, 30);
        const T = A + B + C;
        if (gcd(A, T) === 1 || T > 120) continue;
        const gg = gcd(A, T);
        if (T / gg > 20) continue; // keep the simplified numbers friendly
        num = A; den = T; pp = A / gg; qq = T / gg;
        ask = `<b>${n1}</b> to <b>total items</b>`;
      } else {
        num = A; den = B; pp = p; qq = q;
        ask = `<b>${n1}</b> to <b>${n2}</b>`;
      }
      if (Math.max(A, B) > 72) continue;
      const correct = `${pp} : ${qq}`;
      const opts = new Set([correct]);
      opts.add(`${qq} : ${pp}`);
      opts.add(`${num} : ${den}`);
      // partly simplified (divided by 2 only)
      if (num % 2 === 0 && den % 2 === 0 && num / 2 !== pp) opts.add(`${num / 2} : ${den / 2}`);
      let guard = 0;
      while (opts.size < 4 && guard++ < 50) opts.add(`${pp + int(1, 3)} : ${qq}`);
      const choices = shuffle([...opts].slice(0, 4)).map((label) => ({ label, correct: label === correct }));
      if (!choices.some((c) => c.correct)) continue;
      const story = totalMode
        ? `A goblin's stash has <b>${A} ${n1}</b>, <b>${B} ${n2}</b>, and <b>${C} ${n3}</b>.`
        : `A goblin's stash has <b>${A} ${n1}</b> and <b>${B} ${n2}</b>.`;
      const g2 = gcd(num, den);
      return {
        type: 'simplify', title: 'Simplify the ratio',
        promptHTML: `<p class="story">${story}</p><p>What is the ratio of ${ask} in <b>simplest form</b>?</p>`,
        choices,
        hints: [
          totalMode ? `First find the total: ${A} + ${B} + ${C} = <b>${den}</b>. The ratio is ${num} : ${den}.` : `Start with the ratio <b>${num} : ${den}</b> (in that order!).`,
          `Divide both numbers by their greatest common factor, <b>${g2}</b>.`,
        ],
        solution: [
          totalMode ? `Total = ${A} + ${B} + ${C} = ${den}` : `Ratio: ${num} : ${den}`,
          `Divide both by ${g2}: ${num} ÷ ${g2} = ${pp}, ${den} ÷ ${g2} = ${qq}`,
          `Answer: <b>${correct}</b>`,
        ],
      };
    }
  }

  // ---------- registry ----------
  const TYPES = {
    simple:    { name: 'Proportions: 4/x = 2/7',               gen: genSimple,    tier: 1, weight: 3 },
    word:      { name: 'Proportion word problems',             gen: genWord,      tier: 1, weight: 2 },
    oneSide:   { name: 'Proportions with (x + 3)',             gen: genOneSide,   tier: 2, weight: 3 },
    twoSides:  { name: 'Proportions with x on both sides',     gen: genTwoSides,  tier: 3, weight: 3 },
    angles2:   { name: 'Complementary / supplementary ratios', gen: genAngles2,   tier: 1, weight: 2 },
    triAngles: { name: 'Triangle angle ratios (a:b:c)',        gen: genTriAngles, tier: 1, weight: 2 },
    perimeter: { name: 'Triangle side ratios + perimeter',     gen: genPerimeter, tier: 1, weight: 2 },
    simplify:  { name: 'Simplifying ratios',                   gen: genSimplify,  tier: 1, weight: 1 },
  };

  /**
   * Pick and generate a problem.
   * preferred: list of type keys suited to the game object (e.g. chests -> cross products)
   * enabled:   set/object of type keys the teacher has turned on
   * floor:     dungeon floor (1, 2, 3, ...) — unlocks harder types
   */
  function generate(preferred, enabled, floor) {
    const on = (k) => !enabled || enabled[k] !== false;
    const unlocked = (k) => TYPES[k].tier <= Math.max(1, floor || 1);
    let pool = preferred.filter((k) => on(k) && unlocked(k));
    if (!pool.length) pool = preferred.filter(on);
    if (!pool.length) pool = Object.keys(TYPES).filter((k) => on(k) && unlocked(k) && k !== 'simplify');
    if (!pool.length) pool = Object.keys(TYPES).filter(on);
    if (!pool.length) pool = ['simple'];
    // favor the hardest unlocked types a little so later floors feel different
    const maxTier = Math.max(...pool.map((k) => (unlocked(k) ? TYPES[k].tier : 0)));
    const weights = pool.map((k) => TYPES[k].weight * (TYPES[k].tier === maxTier && maxTier > 1 ? 2 : 1));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return TYPES[pool[i]].gen();
    }
    return TYPES[pool[pool.length - 1]].gen();
  }

  /** Parse what a student typed: "14", "x = 14", "27°", "-3", "28/2". Returns a number or NaN. */
  function parseAnswer(str) {
    if (str == null) return NaN;
    const s = String(str).replace(/−/g, '-').replace(/[^0-9.\-/]/g, '');
    if (!s) return NaN;
    if (s.includes('/')) {
      const [n, d] = s.split('/').map(Number);
      return d ? n / d : NaN;
    }
    return Number(s);
  }

  const api = { TYPES, generate, parseAnswer, gcd, _internal: { crossWork, fmtLin, lin } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Problems = api;
})(typeof window !== 'undefined' ? window : globalThis);
