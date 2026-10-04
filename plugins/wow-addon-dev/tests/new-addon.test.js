'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { main } = require('../scripts/new-addon');
const { findLua } = require('../scripts/lib/lua');

const HAS_LUA = (() => {
  try {
    return !!findLua(os.tmpdir());
  } catch {
    return false;
  }
})();
const needsLua = HAS_LUA ? {} : { skip: 'no Lua 5.1 found: set WOW_ELUNE_DIR to an unzipped Elune to run this' };
const HAS_GIT = !spawnSync('git', ['--version']).error;

function workspace(flavors = { retail: { interface: 110205 } }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wad-new-'));
  fs.writeFileSync(path.join(root, 'addons.json'), JSON.stringify({ flavors, addons: {} }, null, 2));
  return root;
}

function run(args) {
  const out = [];
  const log = console.log;
  const error = console.error;
  console.log = (s) => out.push(String(s));
  console.error = (s) => out.push(String(s));
  try {
    return { code: main(args), out: out.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

const create = (root, ...args) => run(['--root', root, '--author', 'Tester', ...args]);
const files = (dir) =>
  fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath || e.path, e.name));

test('a dry run writes nothing', () => {
  const root = workspace();
  const before = fs.readFileSync(path.join(root, 'addons.json'), 'utf8');
  const r = create(root, 'BagCounter');
  assert.equal(r.code, 0);
  assert.match(r.out, /BagCounter\/BagCounter\.toc/);
  assert.match(r.out, /Dry run, nothing written/);
  assert.equal(fs.existsSync(path.join(root, 'BagCounter')), false);
  assert.equal(fs.readFileSync(path.join(root, 'addons.json'), 'utf8'), before);
});

test('--write fills every placeholder, writes no BOM, puts ## Interface first, declares the addon', () => {
  const root = workspace();
  create(root, 'BagCounter', '--title', 'Bag Counter', '--slash', 'bags', '--write');
  for (const f of files(path.join(root, 'BagCounter'))) {
    const text = fs.readFileSync(f, 'utf8');
    assert.notEqual(text.charCodeAt(0), 0xfeff, `${f} has a BOM`);
    assert.doesNotMatch(text, /__[A-Z]+__/, `${f} kept a placeholder`);
  }
  const toc = fs.readFileSync(path.join(root, 'BagCounter', 'BagCounter.toc'), 'utf8');
  assert.match(toc, /^## Interface: 110205\n## Title: Bag Counter\n/);
  assert.match(toc, /## Author: Tester/);
  assert.ok(fs.existsSync(path.join(root, 'BagCounter', '.pkgmeta')));
  assert.match(fs.readFileSync(path.join(root, 'BagCounter', 'BagCounter.lua'), 'utf8'), /SLASH_BAGCOUNTER1 = "\/bags"/);
  const m = JSON.parse(fs.readFileSync(path.join(root, 'addons.json'), 'utf8'));
  assert.deepEqual(m.addons.BagCounter, {
    kind: 'addon', flavor: 'retail', active: true,
    locale: { overlays: ['frFR', 'deDE', 'esES'], table: 'ns.L', files: ['Locales/enUS.lua', 'Locales/*.lua'] },
  });
  assert.ok(fs.existsSync(path.join(root, 'tests', 'test_BagCounter.lua')));
});

test('a new addon passes every check', needsLua, () => {
  const root = workspace();
  const r = create(root, 'BagCounter', '--write');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /All checks passed/);
  assert.match(r.out, /\[OK\]\s+locale\s+4 key\(s\) used, 3 overlay\(s\)/);
  assert.match(r.out, /\[OK\]\s+tests\s+1 file\(s\), 2 check\(s\) passed/);
});

test('refusals: bad name, game command, taken command, existing folder or entry, odd title', () => {
  const root = workspace();
  assert.match(create(root, '1Bad').out, /can't be an addon name/);
  assert.match(create(root, 'My-Addon').out, /can't be an addon name/);
  assert.match(create(root, 'Reload', '--slash', 'reload').out, /belongs to the game/);
  fs.mkdirSync(path.join(root, 'Other'));
  fs.writeFileSync(path.join(root, 'Other', 'Other.lua'), 'SLASH_OTHER1 = "/bags"\n');
  assert.match(create(root, 'Bags', '--slash', 'bags').out, /already registered by Other\/Other\.lua/);
  fs.mkdirSync(path.join(root, 'Taken'));
  assert.match(create(root, 'Taken').out, /already a Taken folder/);
  const m = JSON.parse(fs.readFileSync(path.join(root, 'addons.json'), 'utf8'));
  m.addons.Declared = { kind: 'addon' };
  fs.writeFileSync(path.join(root, 'addons.json'), JSON.stringify(m));
  assert.match(create(root, 'Declared').out, /already declared/);
  assert.match(create(root, 'Quoted', '--title', 'My "best" addon').out, /can't contain/);
  assert.equal(create(root, 'Fine', '--wat').code, 1);
});

test('the interface number comes from addons.json or --interface, never a guess', () => {
  assert.match(create(workspace({}), 'NoClient').out, /no client with an interface number.*GetBuildInfo/);
  const two = workspace({ retail: { interface: 110205 }, classic_era: { interface: 11507 } });
  assert.match(create(two, 'Which').out, /several clients \(retail, classic_era\): pass --flavor/);
  assert.match(create(two, 'Which', '--flavor', 'classic_era').out, /classic_era \(## Interface: 11507\)/);
  const frozen = workspace({ era: { _note: 'frozen' } });
  assert.match(create(frozen, 'Old', '--flavor', 'era').out, /no interface number for "era"/);
  const root = workspace({});
  create(root, 'Wrath', '--interface', '30403', '--write');
  const m = JSON.parse(fs.readFileSync(path.join(root, 'addons.json'), 'utf8'));
  assert.equal(m.addons.Wrath.flavor, 'wrath');
  assert.equal(m.flavors.wrath.interface, 30403);
});

test('no author: the ## Author line is left out; an existing test file is kept', () => {
  const root = workspace();
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests', 'test_Solo.lua'), '-- mine\n');
  run(['--root', root, 'Solo', '--author', '', '--write']);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'Solo', 'Solo.toc'), 'utf8'), /## Author/);
  assert.equal(fs.readFileSync(path.join(root, 'tests', 'test_Solo.lua'), 'utf8'), '-- mine\n');
});

test('--git makes the addon its own repository with one commit', { skip: !HAS_GIT && 'git not found' }, () => {
  const root = workspace();
  Object.assign(process.env, { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' });
  const r = create(root, 'Gitted', '--git', '--write');
  assert.match(r.out, /Gitted\/ is a git repository, branch main, one commit/);
  const log = spawnSync('git', ['log', '--oneline'], { cwd: path.join(root, 'Gitted'), encoding: 'utf8' });
  assert.equal(log.stdout.trim().split('\n').length, 1);
});
