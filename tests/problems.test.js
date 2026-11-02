// Run with:  node tests/problems.test.js
// Generates thousands of problems of every type and checks that every answer is a
// positive whole number and that the math is actually correct.
'use strict';
const assert = require('assert');
const P = require('../js/problems.js');

const N = 3000;
let total = 0;

function checkText(p) {
  const all = [p.promptHTML, ...(p.hints || []), ...(p.solution || [])].join(' ');
  assert(!/undefined|NaN|null|Infinity/.test(all), `bad text in ${p.type}: ${all}`);
}

function evalLin(e, x) { return e.a * x + e.b; }

for (const [key, t] of Object.entries(P.TYPES)) {
  for (let i = 0; i < N; i++) {
    const p = t.gen();
    total++;
    assert.strictEqual(p.type === key || (key === 'oneSide' || key === 'twoSides'), true);
    checkText(p);
    assert(p.hints.length >= 2, `${key}: needs hints`);
    assert(p.solution.length >= 2, `${key}: needs solution`);
    if (p.choices) {
      assert.strictEqual(p.choices.filter((c) => c.correct).length, 1, `${key}: exactly one correct choice`);
      assert(p.choices.length >= 3, `${key}: at least 3 choices`);
      assert.strictEqual(new Set(p.choices.map((c) => c.label)).size, p.choices.length, 'unique choices');
      continue;
    }
    assert(p.fields.length >= 1);
    for (const f of p.fields) {
      assert(Number.isInteger(f.answer), `${key}: answer ${f.answer} not whole`);
      assert(f.answer > 0, `${key}: answer ${f.answer} not positive`);
      assert(f.answer < 400, `${key}: answer ${f.answer} too big`);
    }
    if (key === 'angles2') {
      if (p.fields.length === 2) assert([90, 180].includes(p.fields[0].answer + p.fields[1].answer));
    }
    if (key === 'triAngles' && p.fields.length === 3) {
      assert.strictEqual(p.fields.reduce((s, f) => s + f.answer, 0), 180);
    }
  }
}

// Cross-product problems: re-derive x independently from the expressions.
const { crossWork, lin } = P._internal;
const teacher = { N1: lin(0, 6), D1: lin(1, 16), N2: lin(0, 7), D2: lin(3, 3) };
assert.throws(() => crossWork(teacher, 8), 'teacher example is not a whole number, should be rejected');
const key5 = crossWork({ N1: lin(0, 4), D1: lin(1, 0), N2: lin(0, 2), D2: lin(0, 7) }, 14);
assert(key5.productLine === '4 · 7 = x · 2', key5.productLine);

// parseAnswer
assert.strictEqual(P.parseAnswer('14'), 14);
assert.strictEqual(P.parseAnswer(' x = 14 '), 14);
assert.strictEqual(P.parseAnswer('27°'), 27);
assert.strictEqual(P.parseAnswer('28/2'), 14);
assert(Number.isNaN(P.parseAnswer('')));

// generate() respects teacher settings
for (let i = 0; i < 500; i++) {
  const p = P.generate(['simple', 'oneSide', 'twoSides'], { simple: false, oneSide: false, twoSides: true }, 3);
  assert.strictEqual(p.type, 'twoSides');
  const q = P.generate(['twoSides'], {}, 1); // locked on floor 1 -> falls back
  assert(q.type);
  const r = P.generate(['angles2'], { angles2: false }, 1);
  assert(r.type !== 'angles2');
}

// sample output for eyeballing
for (const key of Object.keys(P.TYPES)) {
  const p = P.TYPES[key].gen();
  const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`\n[${key}] ${strip(p.promptHTML)}`);
  console.log('   answer:', p.fields ? p.fields.map((f) => `${f.label} ${f.answer}`).join(', ') : p.choices.find((c) => c.correct).label);
  console.log('   solution:', p.solution.map(strip).join(' | '));
}

console.log(`\nOK: ${total} problems checked.`);

// expression problems: the two fractions should never be identical-looking (equal multipliers)
for (let i = 0; i < 3000; i++) {
  const p = P.TYPES.twoSides.gen();
  const nums = p.promptHTML.match(/<span class="(?:num|den) ?">([^<]*)<\/span>/g).map((s) => s.replace(/<[^>]+>/g, ''));
  assert(!(nums[1] === nums[3] && !nums[1].includes('x')), 'equal constant denominators: ' + nums.join(' | '));
  assert(!(nums[0] === nums[2] && !nums[0].includes('x')), 'equal constant numerators: ' + nums.join(' | '));
}
console.log('OK: twoSides variety check');
