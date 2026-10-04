'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { main, pickBranch } = require('../scripts/patch-diff');
const { findLua, makeScratch, runLua } = require('../scripts/lib/lua');

const LUA = (() => {
  try {
    return findLua(os.tmpdir());
  } catch {
    return null;
  }
})();
const HAS_GIT = !spawnSync('git', ['--version']).error;
const needsLua = LUA ? {} : { skip: 'no Lua 5.1 found: set WOW_ELUNE_DIR to an unzipped Elune to run this' };
const needsBoth = LUA && HAS_GIT ? {} : { skip: 'needs a Lua 5.1 and git' };
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };

function write(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
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

const ws = (addons) => ({ addons });

test('the branch comes from the active addons, or from --branch', () => {
  assert.equal(pickBranch(ws({ A: { flavor: 'forever', active: true } })), 'forever');
  assert.equal(pickBranch(ws({ A: { flavor: 'retail', active: true }, B: { flavor: 'classic_era' } })), 'live');
  assert.equal(pickBranch(ws({ A: { flavor: ['classic_era', 'retail'], active: true } }), 'live'), 'live');
  assert.throws(() => pickBranch(ws({ A: { flavor: ['classic_era', 'retail'], active: true } })), /several clients \(classic_era, live\)/);
  assert.throws(() => pickBranch(ws({ A: { flavor: 'mists', active: true } })), /pass --branch/);
});

test('no clone: the error gives the command to get one', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wad-pd-'));
  write(root, 'addons.json', JSON.stringify({ addons: { A: { kind: 'addon', flavor: 'forever', active: true } } }));
  const r = run(['--root', root]);
  assert.equal(r.code, 1);
  assert.match(r.out, /git clone --depth 1 --branch forever https:\/\/github\.com\/Gethe\/wow-ui-source\.git/);
});

test('the Lua tests of the diff reader pass', needsLua, () => {
  const plugin = path.join(__dirname, '..');
  const scratch = makeScratch();
  try {
    const list = scratch.write('t.txt', path.join(__dirname, 'lua', 'test_ui_diff.lua') + '\n');
    const r = runLua(LUA, 'run_tests.lua', [plugin.split(path.sep).join('/'), list], plugin);
    assert.equal(r.code, 0, r.lines.join('\n'));
    assert.match(r.lines.join('\n'), /check\(s\) passed, 0 failed/);
  } finally {
    scratch.dispose();
  }
});

// A tiny "Gethe" origin, a workspace with a clone of it, then a new build upstream.
function fixture() {
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'wad-gethe-'));
  git(origin, 'init', '-q', '-b', 'forever');
  write(origin, 'version.txt', '1.60.1.1\n');
  write(origin, 'Interface/AddOns/Blizzard_Thing/Thing.lua', 'function ThingFrame_Open()\n\treturn 1;\nend\nTHING_LIMIT = 5;\n');
  git(origin, 'add', '-A');
  git(origin, 'commit', '-q', '-m', 'build 1');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wad-pdws-'));
  write(root, 'addons.json', JSON.stringify({ flavors: { forever: { interface: 16001 } }, addons: { Hello: { kind: 'addon', flavor: 'forever', active: true } } }));
  write(root, 'Hello/Hello.toc', '## Interface: 16001\nHello.lua\n');
  write(root, 'Hello/Hello.lua', 'if THING_LIMIT > 3 then\n  ThingFrame_Open()\nend\n');
  git(root, 'clone', '-q', '--branch', 'forever', origin, path.join('Documentation', 'wow-ui-source-forever'));
  write(origin, 'version.txt', '1.60.1.2\n');
  write(origin, 'Interface/AddOns/Blizzard_Thing/Thing.lua', 'THING_LIMIT = 10;\n');
  git(origin, 'commit', '-q', '-am', 'build 2');
  return root;
}

test('end to end: fetch, report what touches the addon, --mark, then nothing new', needsBoth, () => {
  const root = fixture();
  Object.assign(process.env, GIT_ENV);
  let r = run(['--root', root]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /no wow-addon-dev\/reviewed-forever mark yet/);
  assert.match(r.out, /from 1\.60\.1\.1 .* to 1\.60\.1\.2/);
  assert.match(r.out, /\[1\] TOUCHES YOUR CODE.*\(2\)/);
  assert.match(r.out, /global set\s+THING_LIMIT\s+\(5;\s+->\s+10;\)/);
  assert.match(r.out, /REMOVED\s+function\s+ThingFrame_Open/);
  assert.match(r.out, /Hello\/Hello\.lua:2\s+ThingFrame_Open\(\)/);
  assert.match(r.out, /--mark/);

  r = run(['--root', root, '--mark']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /reviewed-forever set on 1\.60\.1\.2/);

  r = run(['--root', root, '--no-fetch']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Nothing new in the UI: 1\.60\.1\.2/);
});
