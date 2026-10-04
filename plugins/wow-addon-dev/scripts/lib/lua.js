'use strict';
// Finding a Lua 5.1 to run the checks with, and running a Lua script with it.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const EXE = process.platform === 'win32' ? '.exe' : '';
const ELUNE_URL = 'https://github.com/Meorawr/elune/releases';

function versionOf(exe) {
  const r = spawnSync(exe, ['-v'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) return null;
  return `${r.stdout || ''}${r.stderr || ''}`.trim();
}

// Elune first (a Lua 5.1 built to behave like the game's), then any Lua 5.1 on the PATH.
function candidates(root) {
  const list = [];
  if (process.env.WOW_ELUNE_DIR) list.push(path.join(process.env.WOW_ELUNE_DIR, 'bin', `lua${EXE}`));
  list.push(path.join(root, 'tools', 'elune', 'bin', `lua${EXE}`));
  list.push('lua5.1', 'lua');
  return list;
}

// Returns { exe, version }. Throws with what to install when there's no Lua 5.1 around: a Lua 5.4
// accepts syntax the game refuses, so it is never used instead.
function findLua(root) {
  const rejected = [];
  for (const exe of candidates(root)) {
    if (path.isAbsolute(exe) && !fs.existsSync(exe)) continue;
    const v = versionOf(exe);
    if (!v) continue;
    if (/^Lua 5\.1\b/m.test(v)) return { exe, version: v.match(/(?:Lua|Elune) [\d.]+/g).join(', ') };
    rejected.push(`${exe} (${v.split(/\r?\n/)[0]})`);
  }
  throw new Error(
    'No Lua 5.1 found. The checks need Elune, a Lua 5.1 that behaves like the game: download it from ' +
      `${ELUNE_URL}, unzip it into ${path.join(root, 'tools', 'elune')} (so that tools/elune/bin/lua${EXE} ` +
      'exists), or set WOW_ELUNE_DIR to where you unzipped it.' +
      (rejected.length ? ` Found but not 5.1: ${rejected.join('; ')}.` : '')
  );
}

// A scratch folder for the file lists and configs handed to Lua (never the command line: Windows
// caps it at 32767 characters, which a big addon's file list reaches).
function makeScratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wow-addon-dev-'));
  let n = 0;
  return {
    write(name, text) {
      const file = path.join(dir, `${++n}-${name}`);
      fs.writeFileSync(file, text, 'utf8');
      return file;
    },
    dispose() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

// Runs a script from scripts/lua with the workspace as working directory.
function runLua(lua, script, args, cwd) {
  const file = path.join(__dirname, '..', 'lua', script);
  const r = spawnSync(lua.exe, [file, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new Error(`Couldn't run ${lua.exe}: ${r.error.message}`);
  const lines = `${r.stdout || ''}${r.stderr || ''}`.split(/\r?\n/).filter((l) => l.trim() !== '');
  return { code: r.status, lines };
}

// A Lua string literal for any JS string (Lua 5.1 has no \u escape: control characters go out as \ddd).
function luaString(s) {
  return (
    '"' +
    String(s).replace(/[\\"\x00-\x1f\x7f]/g, (c) => {
      if (c === '\\' || c === '"') return '\\' + c;
      if (c === '\n') return '\\n';
      if (c === '\r') return '\\r';
      if (c === '\t') return '\\t';
      return '\\' + String(c.charCodeAt(0)).padStart(3, '0');
    }) +
    '"'
  );
}

// A Lua table constructor for plain data: strings, numbers, booleans, arrays and objects.
function luaValue(v) {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'string') return luaString(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `{ ${v.map(luaValue).join(', ')} }`;
  const fields = Object.entries(v).map(([k, x]) => `[${luaString(k)}] = ${luaValue(x)}`);
  return `{ ${fields.join(', ')} }`;
}

module.exports = { findLua, makeScratch, runLua, luaString, luaValue, ELUNE_URL };
