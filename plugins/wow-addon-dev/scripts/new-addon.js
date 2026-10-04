#!/usr/bin/env node
'use strict';
// Creates a new addon in the workspace from template/addon, declares it in addons.json (with its
// locale block, so the translation check covers it from day one) and adds a headless test.
// Dry run by default: --write creates the files, then runs the checks on the new addon.
//
//   node new-addon.js <Name> [--root <workspace>] [--title "My Addon"] [--slash cmd]
//                     [--flavor retail] [--interface 110205] [--author "Me"]
//                     [--tool] [--inactive] [--git] [--write]

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readManifest, serialize, FILE } = require('./lib/manifest');
const T = require('./lib/template');
const check = require('./check');

const VALUE_OPTS = ['--root', '--title', '--slash', '--flavor', '--interface', '--author'];
const FLAGS = ['--tool', '--inactive', '--git', '--write'];

function parseArgs(argv) {
  const opts = { root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_OPTS.includes(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value.`);
      opts[a.slice(2)] = v;
    } else if (FLAGS.includes(a)) opts[a.slice(2)] = true;
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}.`);
    else if (opts.name) throw new Error(`One addon at a time ("${opts.name}", then "${a}").`);
    else opts.name = a;
  }
  opts.root = path.resolve(opts.root);
  if (opts.interface !== undefined) {
    if (!/^\d+$/.test(opts.interface)) throw new Error('--interface takes a number, like 110205.');
    opts.interface = Number(opts.interface);
  }
  return opts;
}

function gitAuthor(root) {
  const r = spawnSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

// Everything is decided and validated here, before anything is written.
function buildPlan(opts) {
  T.checkName(opts.name);
  const manifest = readManifest(opts.root);
  if (!manifest) throw new Error(`No ${FILE} in ${opts.root}. Run /wow-addon-dev:init there first.`);
  const addons = manifest.addons || {};
  if (addons[opts.name]) throw new Error(`${opts.name} is already declared in ${FILE}.`);
  const dir = path.join(opts.root, opts.name);
  if (fs.existsSync(dir)) throw new Error(`There is already a ${opts.name} folder in the workspace.`);
  const slash = opts.slash ? opts.slash.replace(/^\//, '') : opts.name.toLowerCase();
  T.checkSlash(slash, opts.root);
  const title = opts.title || opts.name;
  const author = opts.author !== undefined ? opts.author : gitAuthor(opts.root);
  T.checkText('title', title);
  T.checkText('author', author);
  const target = T.resolveTarget(manifest.flavors || {}, opts);
  const values = {
    __NAME__: opts.name, __TITLE__: title, __SLASHKEY__: opts.name.toUpperCase(), __SLASH__: slash,
    __INTERFACE__: String(target.interface), __AUTHOR__: author, __FLAVOR__: target.flavor,
    __DATE__: new Date().toISOString().slice(0, 10),
  };
  const entry = {
    kind: opts.tool ? 'tool' : 'addon',
    flavor: target.flavor,
    active: !opts.inactive,
    locale: { overlays: ['frFR', 'deDE', 'esES'], table: 'ns.L', files: ['Locales/enUS.lua', 'Locales/*.lua'] },
  };
  const testRel = `tests/test_${opts.name}.lua`;
  return { opts, manifest, dir, values, target, entry, files: T.renderAddon(values), test: { rel: testRel, text: T.renderTest(values), exists: fs.existsSync(path.join(opts.root, testRel)) } };
}

function writePlan(plan) {
  const { opts, manifest } = plan;
  for (const f of plan.files) {
    const p = path.join(plan.dir, ...f.rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, f.text, 'utf8');
  }
  if (!plan.test.exists) {
    fs.mkdirSync(path.join(opts.root, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(opts.root, plan.test.rel), plan.test.text, 'utf8');
  }
  manifest.flavors = manifest.flavors || {};
  if (plan.target.newFlavor) manifest.flavors[plan.target.flavor] = { interface: plan.target.interface, _source: `given to new-addon on ${plan.values.__DATE__}` };
  manifest.addons = manifest.addons || {};
  manifest.addons[opts.name] = plan.entry;
  fs.writeFileSync(path.join(opts.root, FILE), serialize(manifest), 'utf8');
}

function initGit(plan) {
  const git = (...args) => spawnSync('git', args, { cwd: plan.dir, encoding: 'utf8' });
  for (const args of [['init', '-q', '-b', 'main'], ['add', '-A'], ['commit', '-q', '-m', 'First version, from wow-addon-dev new-addon']]) {
    const r = git(...args);
    if (r.error || r.status !== 0) return `git ${args[0]} failed: ${(r.stderr || (r.error && r.error.message) || '').trim()}`;
  }
  return `${plan.opts.name}/ is a git repository, branch main, one commit.`;
}

function describe(plan) {
  const v = plan.values;
  return [
    `New addon ${v.__NAME__} in ${plan.opts.root}`,
    `  title "${v.__TITLE__}", command /${v.__SLASH__}, ${v.__FLAVOR__} (## Interface: ${v.__INTERFACE__})` +
      (plan.target.newFlavor ? `, a client ${FILE} doesn't list yet: it gets added` : ''),
    `  author: ${v.__AUTHOR__ || '(none, the ## Author line is left out)'}`,
    '',
    'Files:',
    ...plan.files.map((f) => `  ${v.__NAME__}/${f.rel}`),
    `  ${plan.test.rel}${plan.test.exists ? '   (already there, kept)' : ''}`,
    `  ${FILE}   declare ${v.__NAME__} (${plan.entry.kind}, ${plan.entry.active ? 'active' : 'inactive'}, locale overlays ${plan.entry.locale.overlays.join(', ')})`,
  ].join('\n');
}

function main(argv) {
  try {
    const opts = parseArgs(argv);
    if (!opts.name) throw new Error('Name the addon: new-addon.js <Name> [options].');
    const plan = buildPlan(opts);
    console.log(describe(plan));
    if (!opts.write) {
      console.log('\nDry run, nothing written. Run again with --write to create it.');
      return 0;
    }
    writePlan(plan);
    if (opts.git) console.log(`\n${initGit(plan)}`);
    console.log('\nCreated. Running the checks on it:\n');
    try {
      const r = check.run({ names: [opts.name], root: opts.root, only: ['syntax', 'toc', 'size', 'locale', 'tests'] });
      console.log(r.text);
      return r.code;
    } catch (err) {
      console.log(`The checks didn't run: ${err.message}`);
      return 0;
    }
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, parseArgs, buildPlan };
