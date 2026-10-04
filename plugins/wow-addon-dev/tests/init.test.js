'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { main, checkRoot } = require('../scripts/init');
const { BEGIN, END, PLUGIN_KEY, MARKETPLACE } = require('../scripts/lib/claude-files');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wad-init-'));
}

function addon(root, name, iface) {
  fs.mkdirSync(path.join(root, name), { recursive: true });
  fs.writeFileSync(path.join(root, name, `${name}.toc`), `## Interface: ${iface}\n## Title: ${name}\n`);
}

// Runs main() with console output captured; returns { code, out, err }.
function run(args) {
  const out = [];
  const err = [];
  const log = console.log;
  const error = console.error;
  console.log = (s) => out.push(String(s));
  console.error = (s) => err.push(String(s));
  try {
    return { code: main(args), out: out.join('\n'), err: err.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

function snapshot(root) {
  const files = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files[path.relative(root, p)] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(root);
  return files;
}

const read = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');
const json = (root, f) => JSON.parse(read(root, f));

test('a dry run shows the plan and writes nothing', () => {
  const root = tmp();
  addon(root, 'Alpha', 110205);
  const before = snapshot(root);
  const r = run([root]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Alpha\s+retail \(110205\)/);
  assert.match(r.out, /Dry run, nothing written/);
  assert.deepEqual(snapshot(root), before);
});

test('--write creates the three files, no BOM, valid JSON', () => {
  const root = tmp();
  addon(root, 'Alpha', 110205);
  addon(root, 'Beta', 16001);
  assert.equal(run([root, '--write']).code, 0);
  for (const f of ['addons.json', 'CLAUDE.md', path.join('.claude', 'settings.json')]) {
    assert.notEqual(read(root, f).charCodeAt(0), 0xfeff, `${f} starts with a BOM`);
  }
  const m = json(root, 'addons.json');
  assert.deepEqual(m.addons.Alpha, { kind: 'addon', flavor: 'retail', active: true });
  assert.deepEqual(m.addons.Beta, { kind: 'addon', flavor: 'forever', active: true });
  assert.equal(m.flavors.retail.interface, 110205);
  assert.equal(m.flavors.forever.interface, 16001);
  const s = json(root, path.join('.claude', 'settings.json'));
  assert.equal(s.enabledPlugins[PLUGIN_KEY], true);
  assert.equal(s.extraKnownMarketplaces[MARKETPLACE].source.source, 'github');
  assert.ok(read(root, 'CLAUDE.md').includes(BEGIN));
});

test('a second run changes nothing', () => {
  const root = tmp();
  addon(root, 'Alpha', 110205);
  run([root, '--write']);
  const before = snapshot(root);
  const r = run([root, '--write']);
  assert.match(r.out, /addons\.json\s+unchanged/);
  assert.match(r.out, /CLAUDE\.md\s+unchanged/);
  assert.deepEqual(snapshot(root), before);
});

test('existing entries are kept as they are, a new addon is added', () => {
  const root = tmp();
  addon(root, 'Alpha', 110205);
  addon(root, 'Gamma', 11507);
  const mine = {
    _note: 'mine',
    flavors: { retail: { interface: 110000 } },
    addons: { Alpha: { kind: 'tool', flavor: 'retail', active: false, custom: 1 }, Gone: { kind: 'addon' } },
  };
  fs.writeFileSync(path.join(root, 'addons.json'), JSON.stringify(mine));
  const r = run([root, '--write']);
  const m = json(root, 'addons.json');
  assert.deepEqual(m.addons.Alpha, mine.addons.Alpha);
  assert.deepEqual(m.addons.Gone, { kind: 'addon' });
  assert.deepEqual(m.addons.Gamma, { kind: 'addon', flavor: 'classic_era', active: true });
  assert.equal(m.flavors.retail.interface, 110000);
  assert.equal(m._note, 'mine');
  assert.match(r.out, /not found on disk \(kept\): Gone/);
});

test('CLAUDE.md: the user text is kept, the section is added once and refreshed in place', () => {
  const root = tmp();
  addon(root, 'Alpha', 110205);
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Mine\n\nMy rules.\n');
  run([root, '--write']);
  const once = read(root, 'CLAUDE.md');
  assert.ok(once.startsWith('# Mine\n\nMy rules.\n'));
  assert.equal(once.split(BEGIN).length, 2);
  const stale = once.replace(/## WoW addon workspace[\s\S]*?(?=<!-- wow-addon-dev:end)/, 'old text\n');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), stale + 'After.\n');
  const r = run([root, '--write']);
  assert.match(r.out, /refresh the wow-addon-dev section/);
  const twice = read(root, 'CLAUDE.md');
  assert.equal(twice, once + 'After.\n');
  assert.equal(twice.split(END).length, 2);
});

test('settings.json: existing keys survive, an explicit false is respected', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude'));
  const mine = { env: { X: '1' }, enabledPlugins: { [PLUGIN_KEY]: false, other: true } };
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify(mine));
  run([root, '--write']);
  const s = json(root, path.join('.claude', 'settings.json'));
  assert.deepEqual(s.env, { X: '1' });
  assert.equal(s.enabledPlugins[PLUGIN_KEY], false);
  assert.equal(s.enabledPlugins.other, true);
  assert.ok(s.extraKnownMarketplaces[MARKETPLACE]);
});

test('refuses an addon folder, the game AddOns folder, and broken JSON', () => {
  const root = tmp();
  addon(root, 'Alpha', 110205);
  assert.match(checkRoot(path.join(root, 'Alpha'), false), /is itself an addon/);

  const game = path.join(root, 'World of Warcraft', '_retail_', 'Interface', 'AddOns');
  fs.mkdirSync(game, { recursive: true });
  assert.match(checkRoot(game, false), /AddOns folder/);
  assert.equal(checkRoot(game, true), null);

  fs.writeFileSync(path.join(root, 'addons.json'), '{ broken');
  const r = run([root, '--write']);
  assert.equal(r.code, 1);
  assert.match(r.err, /isn't valid JSON/);
  assert.equal(read(root, 'addons.json'), '{ broken');
  assert.equal(fs.existsSync(path.join(root, 'CLAUDE.md')), false);
});

test('an unknown option is refused', () => {
  const r = run(['--wirte']);
  assert.equal(r.code, 1);
  assert.match(r.err, /Unknown option --wirte/);
});
