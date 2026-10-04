'use strict';
// The five checks. Each returns { gate, status: 'ok' | 'fail' | 'skip', summary, lines }.
// ctx = { root, ws, lua, scratch } (see check.js).

const fs = require('fs');
const path = require('path');
const { tocFilesOf } = require('./toc');
const { luaFiles, globFiles } = require('./workspace');
const { runLua, luaValue } = require('./lua');

const SIZE_DEFAULTS = { maxFile: 500, maxFunc: 60, exclude: ['Libs', 'Locale', 'Locales'] };

function result(gate, status, summary, lines = []) {
  return { gate, status, summary, lines };
}

// A Lua script's output: its "=> ..." line is the summary, the other lines the details. `keep`
// trims the details of a failure; when it would leave nothing (a crash, say), everything is shown.
function fromLua(gate, r, keep = () => true) {
  const summary = r.lines.filter((l) => l.startsWith('=> ')).pop();
  const all = r.lines.filter((l) => !l.startsWith('=> '));
  const kept = all.filter(keep);
  const status = r.code === 0 ? 'ok' : 'fail';
  return result(gate, status, summary ? summary.slice(3) : `exit code ${r.code}`, status === 'ok' ? [] : kept.length ? kept : all);
}

function writeList(ctx, name, files) {
  return ctx.scratch.write(name, files.join('\n') + '\n');
}

function syntaxGate(ctx, name) {
  const files = luaFiles(ctx.root, path.join(ctx.root, name));
  if (files.length === 0) return result('syntax', 'fail', 'no .lua file in the folder: nothing checked, which is not a pass');
  return fromLua('syntax', runLua(ctx.lua, 'check_syntax.lua', [writeList(ctx, 'syntax.txt', files)], ctx.root));
}

// The .lua lines of a .toc, lowercased with forward slashes.
function tocLuaSet(file) {
  const set = new Set();
  for (const raw of fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !line.startsWith('#') && line.toLowerCase().endsWith('.lua')) set.add(line.replace(/\\/g, '/').toLowerCase());
  }
  return set;
}

function parityProblems(dir, name, tocs) {
  const [refName, ...others] = tocs;
  const ref = tocLuaSet(path.join(dir, refName));
  const out = [];
  for (const toc of others) {
    const set = tocLuaSet(path.join(dir, toc));
    const missing = [...ref].filter((x) => !set.has(x));
    const extra = [...set].filter((x) => !ref.has(x));
    if (missing.length === 0 && extra.length === 0) continue;
    out.push(
      `[TOC PARITY] ${name}/${toc} doesn't list the same Lua files as ${refName}` +
        (missing.length ? `; missing: ${missing.join(', ')}` : '') +
        (extra.length ? `; extra: ${extra.join(', ')}` : '') +
        '. If that is on purpose, set "tocParity": false on this addon in addons.json.'
    );
  }
  return out;
}

function tocGate(ctx, name) {
  const entry = ctx.ws.addons[name];
  if (entry.kind === 'lib') return result('toc', 'skip', 'a lib has no .toc of its own');
  const dir = path.join(ctx.root, name);
  const tocs = tocFilesOf(dir);
  if (tocs.length === 0) return result('toc', 'fail', `no ${name}.toc in the folder`);
  const lines = [];
  for (const toc of tocs) {
    const head = fs.readFileSync(path.join(dir, toc)).subarray(0, 3);
    if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
      lines.push(`[BOM] ${name}/${toc} starts with a UTF-8 BOM, which can hide its first line from the game. Save it as UTF-8 without BOM.`);
    }
  }
  const parityOn = tocs.length > 1 && entry.tocParity !== false;
  if (parityOn) lines.push(...parityProblems(dir, name, tocs));
  if (lines.length) return result('toc', 'fail', `${lines.length} problem(s) in ${tocs.length} .toc file(s)`, lines);
  const note = tocs.length === 1 ? '' : parityOn ? ', same Lua files in each' : ', parity check off ("tocParity": false)';
  return result('toc', 'ok', `${tocs.length} .toc file(s)${note}`);
}

function sizeGate(ctx, name) {
  const cfg = ctx.ws.addons[name].size || {};
  const maxFile = Number.isInteger(cfg.maxFile) ? cfg.maxFile : SIZE_DEFAULTS.maxFile;
  const maxFunc = Number.isInteger(cfg.maxFunc) ? cfg.maxFunc : SIZE_DEFAULTS.maxFunc;
  const exclude = SIZE_DEFAULTS.exclude.concat(Array.isArray(cfg.exclude) ? cfg.exclude : []);
  const files = luaFiles(ctx.root, path.join(ctx.root, name), exclude);
  if (files.length === 0) {
    return result('size', 'fail', `no .lua file left once ${exclude.join(', ')} are skipped: nothing checked, which is not a pass`);
  }
  const args = [String(maxFile), String(maxFunc), writeList(ctx, 'size.txt', files)];
  return fromLua('size', runLua(ctx.lua, 'check_size.lua', args, ctx.root));
}

// Reads the addon's "locale" block. Returns { skip } | { error } | { config } for check_locale.lua.
function localePlan(ctx, name) {
  const entry = ctx.ws.addons[name];
  const l = entry.locale;
  if (l === 'skip') return { skip: '"locale": "skip" in addons.json' };
  if (!l || typeof l !== 'object' || Array.isArray(l)) {
    return { skip: 'not configured: add a "locale" block to this addon in addons.json to check it' };
  }
  if (!Array.isArray(l.overlays) || l.overlays.length === 0) {
    return { error: '"locale.overlays" must list the locales to check, for example ["frFR", "deDE"]' };
  }
  const dir = path.join(ctx.root, name);
  const patterns = Array.isArray(l.files) && l.files.length ? l.files : [`${name}_Locale.lua`, `${name}_Locale_*.lua`];
  const localeFiles = [...new Set(patterns.flatMap((p) => globFiles(ctx.root, dir, p)))];
  if (localeFiles.length === 0) return { error: `no locale file matches ${patterns.join(', ')} in ${name}/` };
  const isLocale = new Set(localeFiles);
  const whitelist = l.whitelist || entry.localeWhitelist;
  return {
    config: {
      addon: name,
      table: String(l.table || 'ns.L').split('.').filter(Boolean),
      overlays: l.overlays,
      localeFiles,
      codeFiles: luaFiles(ctx.root, dir, ['Libs']).filter((f) => !isLocale.has(f)),
      dynamicKeys: Array.isArray(l.dynamicKeys) ? l.dynamicKeys : [],
      untranslated: Array.isArray(l.untranslated) ? l.untranslated : [],
      whitelist: whitelist ? path.resolve(ctx.root, whitelist) : null,
    },
  };
}

function localeGate(ctx, name) {
  const plan = localePlan(ctx, name);
  if (plan.skip) return result('locale', 'skip', plan.skip);
  if (plan.error) return result('locale', 'fail', plan.error);
  const cfgFile = ctx.scratch.write('locale.lua', `return ${luaValue(plan.config)}\n`);
  return fromLua('locale', runLua(ctx.lua, 'check_locale.lua', [cfgFile], ctx.root), (l) => !l.startsWith('[DEAD'));
}

function testsGate(ctx) {
  const dir = path.join(ctx.root, 'tests');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^test_.+\.lua$/i.test(f)).sort().map((f) => `tests/${f}`)
    : [];
  if (files.length === 0) return result('tests', 'skip', 'no tests/test_*.lua yet');
  const r = runLua(ctx.lua, 'run_tests.lua', [ctx.root, writeList(ctx, 'tests.txt', files)], ctx.root);
  return fromLua('tests', r, (l) => /^\s*FAIL\b/.test(l));
}

const ADDON_GATES = { syntax: syntaxGate, toc: tocGate, size: sizeGate, locale: localeGate };

module.exports = { ADDON_GATES, testsGate, localePlan, SIZE_DEFAULTS };
