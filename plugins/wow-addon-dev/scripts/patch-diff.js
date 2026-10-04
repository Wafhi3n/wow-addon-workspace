#!/usr/bin/env node
'use strict';
// After a game patch: what changed in Blizzard's UI code (a Gethe/wow-ui-source clone), and where
// the workspace's addons use it. The report itself comes from scripts/lua/ui_report.lua.
//
//   node patch-diff.js [--root <ws>] [--branch <b>] [--source <clone>] [--from <rev>] [--to <rev>]
//                      [--no-fetch] [--mark]
//
// The clone lives in Documentation/wow-ui-source-<branch>. A local tag, wow-addon-dev/reviewed-<b>,
// marks the last revision you read: the report runs from it to origin/<branch>, and --mark (after
// reading) moves the clone and the tag forward. Exit code 0 = a report (it's a reading aid, not a
// gate), 1 = an input missing or unreadable, never "nothing touches you" on a missing input.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { findLua, makeScratch, runLua } = require('./lib/lua');
const { loadWorkspace } = require('./lib/workspace');

const FLAVOR_BRANCH = { retail: 'live', forever: 'forever', classic_era: 'classic_era' };
const VALUE_OPTS = ['--root', '--branch', '--source', '--from', '--to'];

function parseArgs(argv) {
  const opts = { root: process.cwd(), fetch: true, mark: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_OPTS.includes(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value.`);
      opts[a.slice(2)] = v;
    } else if (a === '--no-fetch') opts.fetch = false;
    else if (a === '--mark') opts.mark = true;
    else throw new Error(`Unknown option ${a}.`);
  }
  opts.root = path.resolve(opts.root);
  return opts;
}

// The branch of the client the active addons target, unless --branch says otherwise.
function pickBranch(ws, given) {
  if (given) return given;
  const active = Object.values(ws.addons).filter((a) => a && a.active === true);
  const flavors = [...new Set(active.flatMap((a) => [].concat(a.flavor || [])))];
  const branches = [...new Set(flavors.map((f) => FLAVOR_BRANCH[f]).filter(Boolean))];
  if (branches.length === 1) return branches[0];
  if (branches.length > 1) throw new Error(`Your active addons target several clients (${branches.join(', ')}): pass --branch <one of them>.`);
  throw new Error(
    `No Gethe branch known for the client(s) your active addons target (${flavors.join(', ') || 'none'}): ` +
      'pass --branch (live, forever, classic_era, classic, classic_anniversary...).'
  );
}

function makeGit(source) {
  return (...args) => {
    const r = spawnSync('git', ['-c', 'core.quotepath=false', '-C', source, ...args], { encoding: 'utf8' });
    return { ok: !r.error && r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  };
}

function revOf(git, ref) {
  const r = git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  return r.ok ? r.out : null;
}

function versionOf(git, ref) {
  const r = git('cat-file', '-p', `${ref}:version.txt`);
  return r.ok ? r.out : '?';
}

function mark(git, branch, to, tag) {
  const current = git('symbolic-ref', '--short', 'HEAD').out;
  if (current !== branch) throw new Error(`The clone is on "${current}", not "${branch}": nothing moved.`);
  if (git('status', '--porcelain').out) throw new Error('The clone has local changes: nothing moved.');
  if (!git('merge', '--ff-only', '--quiet', to).ok) throw new Error(`Couldn't move the clone forward (merge --ff-only ${to}).`);
  git('tag', '-f', tag, to);
  return `Clone moved forward and ${tag} set on ${versionOf(git, tag)}.`;
}

// Every .lua, .xml and .toc of the declared addons that are on disk.
function ourFiles(ws) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== '.git') walk(path.join(dir, e.name));
      } else if (/\.(lua|xml|toc)$/i.test(e.name)) out.push(path.join(dir, e.name));
    }
  };
  for (const name of Object.keys(ws.addons)) {
    const dir = path.join(ws.root, name);
    if (fs.existsSync(dir)) walk(dir);
  }
  return out;
}

const IN_GAME =
  'Gethe mirrors the UI code only: changes to game data, assets and server behavior don\'t show here. ' +
  'Those you check in game.';

function report(opts, git, branch, from, to) {
  const files = ourFiles(loadWorkspace(opts.root));
  if (files.length === 0) throw new Error('None of the addons in addons.json is on disk: nothing to search.');
  const lua = findLua(opts.root);
  const scratch = makeScratch();
  try {
    const list = scratch.write('files.txt', files.join('\n') + '\n');
    const args = ['--src', opts.source, '--from', from, '--to', to, '--files', list, '--root', opts.root];
    const r = runLua(lua, 'ui_report.lua', args, opts.root);
    return { code: r.code === 0 ? 0 : 1, lines: r.lines };
  } finally {
    scratch.dispose();
  }
}

function run(opts) {
  const ws = loadWorkspace(opts.root);
  const branch = pickBranch(ws, opts.branch);
  opts.source = opts.source ? path.resolve(opts.source) : path.join(opts.root, 'Documentation', `wow-ui-source-${branch}`);
  if (!fs.existsSync(path.join(opts.source, 'version.txt'))) {
    throw new Error(
      `No clone of Blizzard's UI source in ${opts.source}. Get it with:\n` +
        `  git clone --depth 1 --branch ${branch} https://github.com/Gethe/wow-ui-source.git "${opts.source}"`
    );
  }
  const git = makeGit(opts.source);
  const tag = `wow-addon-dev/reviewed-${branch}`;
  const out = [];
  if (opts.fetch && !(opts.from && opts.to) && !git('fetch', '--quiet', 'origin', branch).ok) {
    out.push(`[WARN] couldn't fetch origin/${branch}; working from the last one fetched.`);
  }
  const to = opts.to || `origin/${branch}`;
  if (!revOf(git, to)) throw new Error(`Unknown revision: ${to}`);
  if (opts.mark) return { code: 0, text: [...out, mark(git, branch, to, tag)].join('\n') };
  let from = opts.from;
  if (!from) {
    from = revOf(git, tag) ? tag : 'HEAD';
    if (from === 'HEAD') out.push(`[NOTE] no ${tag} mark yet: starting from the clone's HEAD.`);
  }
  if (!revOf(git, from)) throw new Error(`Unknown revision: ${from}`);
  if (revOf(git, from) === revOf(git, to)) {
    out.push(`Nothing new in the UI: ${versionOf(git, to)} is the latest build Gethe published on ${branch}.`, '', IN_GAME);
    return { code: 0, text: out.join('\n') };
  }
  const r = report(opts, git, branch, from, to);
  out.push(...r.lines, '', IN_GAME);
  if (r.code === 0 && !opts.from && !opts.to) out.push('', 'Once you have read it: /wow-addon-dev:patch-diff --mark (moves the clone and the mark forward).');
  return { code: r.code, text: out.join('\n') };
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

module.exports = { main, parseArgs, pickBranch, run };
