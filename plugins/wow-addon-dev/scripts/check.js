#!/usr/bin/env node
'use strict';
// Runs the checks on the workspace's addons: syntax (Lua 5.1), toc, size, locale, then the tests.
//
//   node check.js [addon ...] [--root <workspace>] [--only syntax,toc,size,locale,tests]
//
// With no addon named, checks every addon marked "active" in addons.json. Exit code 0 = every
// check passed or was skipped, 1 = a check failed or the input was wrong. Never 0 on an input it
// didn't understand, and never 0 when nothing was checked.

const fs = require('fs');
const path = require('path');
const { findLua, makeScratch } = require('./lib/lua');
const { loadWorkspace, undeclaredAddons, selectAddons } = require('./lib/workspace');
const { ADDON_GATES, testsGate } = require('./lib/gates');

const ALL = ['syntax', 'toc', 'size', 'locale', 'tests'];
const USAGE = 'Usage: check.js [addon ...] [--root <workspace>] [--only syntax,toc,size,locale,tests]';

function parseArgs(argv) {
  const opts = { names: [], root: process.cwd(), only: ALL };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root' || a === '--only') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value. ${USAGE}`);
      if (a === '--root') opts.root = path.resolve(v);
      else opts.only = v.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--')) {
      throw new Error(`Unknown option ${a}. ${USAGE}`);
    } else {
      opts.names.push(a);
    }
  }
  const bad = opts.only.filter((g) => !ALL.includes(g));
  if (bad.length || opts.only.length === 0) throw new Error(`Unknown check in --only: ${bad.join(', ') || '(empty)'}. ${USAGE}`);
  return opts;
}

const TAG = { ok: '[OK]  ', fail: '[FAIL]', skip: '[SKIP]' };

function printResult(out, r) {
  out.push(`  ${TAG[r.status]} ${r.gate.padEnd(7)} ${r.summary}`);
  for (const line of r.lines) out.push(`         ${line}`);
}

function checkAddon(ctx, name, gates) {
  const dir = path.join(ctx.root, name);
  if (!fs.existsSync(dir)) return [{ gate: 'folder', status: 'fail', summary: `declared in addons.json, but ${name}/ isn't there`, lines: [] }];
  return gates.filter((g) => ADDON_GATES[g]).map((g) => ADDON_GATES[g](ctx, name));
}

function run(opts) {
  const ws = loadWorkspace(opts.root);
  const names = selectAddons(ws, opts.names);
  const out = [`Workspace: ${opts.root}`];
  const results = [];
  const undeclared = undeclaredAddons(ws);
  if (undeclared.length) {
    const r = { gate: 'addons', status: 'fail', summary: `not in addons.json, so never checked: ${undeclared.join(', ')}. Run /wow-addon-dev:init.`, lines: [] };
    results.push(r);
    printResult(out, r);
  }
  const needsLua = opts.only.some((g) => g !== 'toc');
  const lua = needsLua ? findLua(opts.root) : null;
  if (lua) out.push(`Lua: ${lua.exe} (${lua.version})`);
  const scratch = makeScratch();
  try {
    const ctx = { root: opts.root, ws, lua, scratch };
    for (const name of names) {
      out.push('', `== ${name} ==`);
      for (const r of checkAddon(ctx, name, opts.only)) results.push(r), printResult(out, r);
    }
    if (opts.only.includes('tests')) {
      out.push('', '== tests ==');
      const r = testsGate(ctx);
      results.push(r);
      printResult(out, r);
    }
  } finally {
    scratch.dispose();
  }
  const failed = results.filter((r) => r.status === 'fail').length;
  out.push('', failed ? `${failed} check(s) failed. Fix what's listed above and run the checks again.` : 'All checks passed.');
  return { code: failed ? 1 : 0, text: out.join('\n') };
}

function main(argv) {
  try {
    const { code, text } = run(parseArgs(argv));
    console.log(text);
    return code;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, parseArgs, run };
