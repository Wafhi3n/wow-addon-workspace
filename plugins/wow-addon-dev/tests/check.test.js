'use strict';
// The checks, end to end on throwaway workspaces. The tests that run Lua need a Lua 5.1: they look
// for it like the checks do (WOW_ELUNE_DIR, then the PATH) and are skipped, saying so, without one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { main } = require('../scripts/check');
const { findLua, candidates, luaString } = require('../scripts/lib/lua');

const LUA = (() => {
  try {
    return findLua(os.tmpdir());
  } catch {
    return null;
  }
})();
const needsLua = LUA ? {} : { skip: 'no Lua 5.1 found: set WOW_ELUNE_DIR to an unzipped Elune to run this' };

function write(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// A small workspace that passes every check: one addon (ns-style locale, frFR overlay) and a test.
function workspace(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wad-check-'));
  write(root, 'Hello/Hello.toc', '## Interface: 110205\n## Title: Hello\nHello_Locale.lua\nHello_Locale_frFR.lua\nHello.lua\n');
  write(root, 'Hello/Hello_Locale.lua', 'local _, ns = ...\nns.L = setmetatable({}, { __index = function(_, k) return k end })\n');
  write(root, 'Hello/Hello_Locale_frFR.lua', 'local _, ns = ...\nif GetLocale() ~= "frFR" then return end\nns.L["Hello %s"] = "Bonjour %s"\n');
  write(root, 'Hello/Hello.lua', 'local _, ns = ...\nlocal L = ns.L\nfunction ns.Greet(n)\n  return L["Hello %s"]:format(n)\nend\n');
  write(root, 'tests/test_hello.lua', [
    'local ns = { L = setmetatable({}, { __index = function(_, k) return k end }) }',
    'assert(loadfile(WORKSPACE_ROOT .. "/Hello/Hello.lua"))("Hello", ns)',
    'check(ns.Greet("Bob") == "Hello Bob", "greets in English")',
    '',
  ].join('\n'));
  const entry = { kind: 'addon', flavor: 'retail', active: true, locale: { overlays: ['frFR'], files: ['Hello_Locale*.lua'] } };
  const manifest = { flavors: { retail: { interface: 110205 } }, addons: { Hello: Object.assign(entry, extra) } };
  write(root, 'addons.json', JSON.stringify(manifest, null, 2));
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

const check = (root, ...more) => run(['--root', root, ...more]);

// CI sets WOW_REQUIRE_LUA: there, an Elune that doesn't run must fail the suite, not skip half of it.
test('a Lua 5.1 is found when WOW_REQUIRE_LUA is set', { skip: !process.env.WOW_REQUIRE_LUA && 'WOW_REQUIRE_LUA not set' }, () => {
  assert.ok(LUA, 'no Lua 5.1 found although WOW_REQUIRE_LUA is set');
  assert.match(LUA.version, /Lua 5\.1/);
});

test('luaString escapes what Lua 5.1 needs escaped', () => {
  assert.equal(luaString('a"b\\c\nd\x01é'), '"a\\"b\\\\c\\nd\\001é"');
});

test('findLua refuses to go on without a Lua 5.1, and says where to get Elune', () => {
  const saved = { PATH: process.env.PATH, WOW_ELUNE_DIR: process.env.WOW_ELUNE_DIR };
  process.env.PATH = '';
  process.env.WOW_ELUNE_DIR = path.join(os.tmpdir(), 'no-elune-here');
  try {
    assert.throws(() => findLua(os.tmpdir()), /No Lua 5\.1 found.*github\.com\/Meorawr\/elune/);
  } finally {
    process.env.PATH = saved.PATH;
    if (saved.WOW_ELUNE_DIR === undefined) delete process.env.WOW_ELUNE_DIR;
    else process.env.WOW_ELUNE_DIR = saved.WOW_ELUNE_DIR;
  }
});

test('Elune is found where its archives put it: bin/lua.exe on Windows, bin/lua5.1 elsewhere, under a top folder or not', () => {
  const touch = (root, rel) => write(root, rel, '');
  const found = (root, platform) => candidates(root, platform).map((p) => path.relative(root, p).split(path.sep).join('/'));
  const saved = process.env.WOW_ELUNE_DIR;
  delete process.env.WOW_ELUNE_DIR;
  try {
    const linux = fs.mkdtempSync(path.join(os.tmpdir(), 'wad-elune-'));
    touch(linux, 'tools/elune/elune-3.1-linux-x86_64/bin/lua5.1');
    assert.ok(found(linux, 'linux').includes('tools/elune/elune-3.1-linux-x86_64/bin/lua5.1'));
    const win = fs.mkdtempSync(path.join(os.tmpdir(), 'wad-elune-'));
    touch(win, 'tools/elune/elune-3.1-windows-amd64/bin/lua.exe');
    assert.ok(found(win, 'win32').includes('tools/elune/elune-3.1-windows-amd64/bin/lua.exe'));
    const flat = fs.mkdtempSync(path.join(os.tmpdir(), 'wad-elune-'));
    touch(flat, 'tools/elune/bin/lua.exe');
    assert.ok(found(flat, 'win32').includes('tools/elune/bin/lua.exe'));
  } finally {
    if (saved !== undefined) process.env.WOW_ELUNE_DIR = saved;
  }
});

test('a real Elune unzipped as is under tools/elune runs the checks', { skip: !(LUA && process.platform === 'win32' && process.env.WOW_ELUNE_DIR) && 'needs WOW_ELUNE_DIR on Windows' }, () => {
  const root = workspace();
  const bin = path.join(root, 'tools', 'elune', 'elune-3.1-windows-amd64', 'bin');
  const source = path.dirname(LUA.exe);
  fs.mkdirSync(bin, { recursive: true });
  for (const f of fs.readdirSync(source)) fs.copyFileSync(path.join(source, f), path.join(bin, f));
  const saved = process.env.WOW_ELUNE_DIR;
  delete process.env.WOW_ELUNE_DIR;
  try {
    const r = check(root, '--only', 'syntax');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /elune-3\.1-windows-amd64[\\/]bin[\\/]lua\.exe/);
  } finally {
    process.env.WOW_ELUNE_DIR = saved;
  }
});

test('wrong input is a failure, never a pass', () => {
  const root = workspace();
  assert.match(check(root, '--wat').out, /Unknown option --wat/);
  assert.equal(check(root, '--wat').code, 1);
  assert.equal(check(root, '--only', 'speling').code, 1);
  assert.equal(check(root, 'Nope').code, 1);
  assert.match(check(root, 'Nope').out, /Not declared in addons\.json: Nope/);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wad-check-'));
  assert.match(check(empty).out, /No addons\.json/);
  assert.equal(check(empty).code, 1);
});

test('no active addon means nothing to check, which fails', () => {
  const root = workspace({ active: false });
  const r = check(root, '--only', 'toc');
  assert.equal(r.code, 1);
  assert.match(r.out, /No addon is marked "active"/);
});

test('an undeclared addon folder and a missing declared folder both fail', () => {
  const root = workspace();
  write(root, 'Stray/Stray.toc', '## Interface: 110205\n');
  const r = check(root, '--only', 'toc');
  assert.equal(r.code, 1);
  assert.match(r.out, /not in addons\.json, so never checked: Stray/);
  fs.rmSync(path.join(root, 'Stray'), { recursive: true });
  fs.rmSync(path.join(root, 'Hello'), { recursive: true });
  assert.match(check(root, '--only', 'toc').out, /Hello\/ isn't there/);
});

test('toc: a BOM fails, a parity gap fails unless tocParity is false', () => {
  const root = workspace();
  write(root, 'Hello/Hello_Vanilla.toc', '﻿## Interface: 11507\nHello_Locale.lua\nHello.lua\n');
  let r = check(root, '--only', 'toc');
  assert.equal(r.code, 1);
  assert.match(r.out, /\[BOM\] Hello\/Hello_Vanilla\.toc/);
  assert.match(r.out, /\[TOC PARITY\].*missing: hello_locale_frfr\.lua/);
  write(root, 'Hello/Hello_Vanilla.toc', '## Interface: 11507\nHello_Locale.lua\nHello.lua\n');
  const m = JSON.parse(fs.readFileSync(path.join(root, 'addons.json'), 'utf8'));
  m.addons.Hello.tocParity = false;
  fs.writeFileSync(path.join(root, 'addons.json'), JSON.stringify(m));
  r = check(root, '--only', 'toc');
  assert.equal(r.code, 0);
  assert.match(r.out, /parity check off/);
});

test('a clean workspace passes every check', needsLua, () => {
  const r = check(workspace());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\[OK\]\s+syntax/);
  assert.match(r.out, /\[OK\]\s+locale\s+1 key\(s\) used/);
  assert.match(r.out, /\[OK\]\s+tests\s+1 file\(s\), 1 check\(s\) passed/);
  assert.match(r.out, /All checks passed/);
});

test('syntax: an error is reported with its file and line', needsLua, () => {
  const root = workspace();
  write(root, 'Hello/Broken.lua', 'local x = = 1\n');
  const r = check(root, '--only', 'syntax');
  assert.equal(r.code, 1);
  assert.match(r.out, /\[SYNTAX\] Hello\/Broken\.lua:1:/);
});

test('syntax: code Lua 5.4 accepts but the game refuses is an error', needsLua, () => {
  const root = workspace();
  write(root, 'Hello/Modern.lua', 'local a = 7 // 2\n');
  assert.equal(check(root, '--only', 'syntax').code, 1);
});

test('size: a long function fails, Libs/ is left out, limits come from addons.json', needsLua, () => {
  const long = ['local function TooLong()', ...Array.from({ length: 65 }, (_, i) => `  local v${i} = ${i}`), 'end', ''].join('\n');
  const root = workspace();
  write(root, 'Hello/Long.lua', long);
  write(root, 'Hello/Libs/Big/Big.lua', long);
  let r = check(root, '--only', 'size');
  assert.equal(r.code, 1);
  assert.match(r.out, /\[FUNCTION\] Hello\/Long\.lua:1 TooLong\(\): 67 lines \(max 60, \+7\)/);
  assert.doesNotMatch(r.out, /Libs\/Big/);
  r = check(workspace({ size: { maxFunc: 80 } }), '--only', 'size');
  assert.equal(r.code, 0);
});

test('locale: a missing translation fails with where the key is used', needsLua, () => {
  const root = workspace();
  write(root, 'Hello/Extra.lua', 'local _, ns = ...\nlocal L = ns.L\nprint(L["Goodbye"])\n');
  const r = check(root, '--only', 'locale');
  assert.equal(r.code, 1);
  assert.match(r.out, /\[MISSING frFR\] Goodbye\s+\(Hello\/Extra\.lua:3\)/);
});

test('locale: keys in comments and inside other strings are not keys', needsLua, () => {
  const root = workspace();
  write(root, 'Hello/Notes.lua', '-- L["In a comment"]\n--[[ L["In a block"] ]]\nlocal s = "L[\\"In a string\\"]"\n');
  assert.equal(check(root, '--only', 'locale').code, 0);
});

test('locale: a placeholder mismatch fails, untranslated keys are allowed when listed', needsLua, () => {
  const root = workspace({ locale: { overlays: ['frFR'], files: ['Hello_Locale*.lua'], untranslated: ['OK'] } });
  write(root, 'Hello/Hello_Locale_frFR.lua', 'local _, ns = ...\nif GetLocale() ~= "frFR" then return end\nns.L["Hello %s"] = "Bonjour"\n');
  write(root, 'Hello/Ok.lua', 'local _, ns = ...\nprint(ns.L["OK"])\n');
  const r = check(root, '--only', 'locale');
  assert.equal(r.code, 1);
  assert.match(r.out, /\[PLACEHOLDER frFR\] Hello %s/);
  assert.doesNotMatch(r.out, /MISSING frFR\] OK/);
});

test('locale: a global table works too, and an unconfigured addon is skipped, not passed', needsLua, () => {
  const root = workspace({ locale: { overlays: ['frFR'], files: ['Hello_Locale*.lua'], table: 'HelloGlobal.L' } });
  write(root, 'Hello/Hello_Locale.lua', 'HelloGlobal.L = setmetatable({}, { __index = function(_, k) return k end })\n');
  write(root, 'Hello/Hello_Locale_frFR.lua', 'if GetLocale() ~= "frFR" then return end\nHelloGlobal.L["Hello %s"] = "Bonjour %s"\n');
  assert.equal(check(root, '--only', 'locale').code, 0);
  const plain = workspace({ locale: undefined });
  assert.match(check(plain, '--only', 'locale').out, /\[SKIP\]\s+locale\s+not configured/);
});

test('locale: files load in the listed order, each once (base file named first, then a pattern)', needsLua, () => {
  const root = workspace({ locale: { overlays: ['deDE', 'frFR'], files: ['Locales/enUS.lua', 'Locales/*.lua'] } });
  fs.rmSync(path.join(root, 'Hello/Hello_Locale.lua'));
  fs.rmSync(path.join(root, 'Hello/Hello_Locale_frFR.lua'));
  write(root, 'Hello/Locales/enUS.lua', 'local _, ns = ...\nns.L = setmetatable({}, { __index = function(_, k) return k end })\n');
  write(root, 'Hello/Locales/deDE.lua', 'local _, ns = ...\nif GetLocale() ~= "deDE" then return end\nns.L["Hello %s"] = "Hallo %s"\n');
  write(root, 'Hello/Locales/frFR.lua', 'local _, ns = ...\nif GetLocale() ~= "frFR" then return end\nns.L["Hello %s"] = "Bonjour %s"\n');
  const r = check(root, '--only', 'locale');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1 key\(s\) used, 2 overlay\(s\), 0 blocking/);
});

test('tests: a failing check names its file, a file that crashes is a failure', needsLua, () => {
  const root = workspace();
  write(root, 'tests/test_wrong.lua', 'check(1 == 2, "one is two")\n');
  write(root, 'tests/test_crash.lua', 'error("boom")\n');
  const r = check(root, '--only', 'tests');
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL \[test_wrong\.lua\] one is two/);
  assert.match(r.out, /FAIL \[test_crash\.lua\] didn't load: .*boom/);
});

test('tests: a global set by one test file is gone in the next', needsLua, () => {
  const root = workspace();
  write(root, 'tests/test_a.lua', 'C_Fake = { value = 1 }\ncheck(true, "sets a global")\n');
  write(root, 'tests/test_b.lua', 'check(C_Fake == nil, "does not see test_a\'s global")\n');
  assert.equal(check(root, '--only', 'tests').code, 0);
});
