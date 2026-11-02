# Ratio Rogue

A top-down roguelike dungeon crawler for reviewing **ratios and proportions**
(Geometry, Similarity unit, Day 1). It runs in any browser, including Chromebooks,
with nothing to install.

**Fun first, math second:** students fight monsters, dash around, and collect silly
power-ups. The math is the key to the good loot:

| In the game | Math practiced |
|---|---|
| 🔒 **Bow-Tie Chests** (power-ups) | Solving proportions with cross products: `4/x = 2/7`, word problems, `(x − 1)/6 = 12/18`, and x on both sides like `6/(x + 7) = 9/(3x + 3)` |
| 📐 **Angle Shrines** (full heal) | Extended ratios with angles: complementary/supplementary `3:7`, triangle angles `4:7:9` |
| 🌉 **Bridges** (treasure island) | Triangle side ratios with a perimeter: `2:8:9`, P = 76 |
| 🔮 **Boss shields** | A mix of everything above |
| 👺 **Ratio Goblin** (gold, optional) | Simplifying ratios (only shows up now and then) |

* **Every answer is a whole number.**
* Wrong answers never cost health. Students get up to 4 step-by-step hints, and after
  2 misses they can see the full worked solution. To earn the reward they must then
  solve a fresh problem.
* A **perfect solve** (first try, no hints) earns a bigger reward.
* Proportions get harder as you go deeper: Floor 1 has plain proportions, Floor 2 adds `(x + 3)`,
  and Floor 3 puts x on both sides.
* The end-of-run screen shows the student's name, problems solved by type, and a
  report code like `F3-S14-A16-P11-JJ8` (floor reached, solved, attempted, perfect).
  Students can screenshot it or type it into a Google Form.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Arrow keys, or hold the mouse/trackpad button | Shoot |
| Space | Dash (invincible while dashing) |
| E | Open chests, use shrines, shop, take the hatch down |
| P / Esc | Pause |
| M | Mute |

## Playing it

**Quickest:** download the repository as a ZIP, unzip it, and double-click `index.html`.

**For a class (recommended): host it free on GitHub Pages**
1. On GitHub, open the repository, then go to **Settings → Pages**.
2. Under *Build and deployment*, set **Source: Deploy from a branch**, pick the branch
   and the `/ (root)` folder, then click **Save**.
3. After a minute, the game is live at `https://<your-username>.github.io/ratios-proportions-game/`.

## Teacher settings

On the title screen, click **Teacher Settings** to:
* turn individual problem types on or off,
* turn on **Extra practice** (more math chests drop after fights),
* copy a **class link** that has those settings built in. For example, this link gives
  only cross-product problems:
  `.../index.html?types=simple,word,oneSide,twoSides&freq=high`

Problem type keys: `simple`, `word`, `oneSide`, `twoSides`, `angles2`, `triAngles`,
`perimeter`, `simplify`.

## Files

* `index.html`: page, screens, and the math-problem popup
* `js/problems.js`: problem generators (all whole-number answers) with hints and worked solutions
* `js/game.js`: the game (map generation, combat, enemies, bosses, items, drawing)
* `tests/problems.test.js`: run `node tests/problems.test.js` to check 24,000 generated
  problems for whole-number answers and correct worked solutions
