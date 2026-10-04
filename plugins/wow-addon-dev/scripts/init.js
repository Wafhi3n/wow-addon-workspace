#!/usr/bin/env node
'use strict';
// Sets up a folder as a WoW addon workspace. Dry run by default: --write applies the plan.
//
//   node init.js [folder] [--write] [--force]
//
// Exit code 0 = plan shown (or applied), 1 = refused or unreadable input. Nothing is ever deleted,
// and an entry already in addons.json or .claude/settings.json is never changed.

const fs = require('fs');
const path = require('path');
const { scanWorkspace, tocFilesOf } = require('./lib/toc');
const { FILE, readManifest, mergeScan, serialize } = require('./lib/manifest');
const { planClaudeMd, planSettings } = require('./lib/claude-files');

function parseArgs(argv) {
  const opts = { target: null, write: false, force: false };
  for (const a of argv) {
    if (a === '--write') opts.write = true;
    else if (a === '--force') opts.force = true;
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}. Usage: init.js [folder] [--write] [--force]`);
    else opts.target = a;
  }
  return opts;
}

// Returns a refusal message, or null when the folder is a fine workspace root.
function checkRoot(root, force) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return `No folder at ${root}.`;
  if (/[\\/]interface[\\/]addons[\\/]?$/i.test(root) && !force) {
    return (
      `${root} looks like the game's own AddOns folder, which holds every addon you have installed. ` +
      'A workspace is the folder you develop in. Pass --force if this really is it.'
    );
  }
  const own = tocFilesOf(root);
  if (own.length > 0) {
    return (
      `${root} is itself an addon (it has ${own[0]}). Run init in the folder above it: ` +
      'the workspace holds your addon folders, and the addon itself stays as it is.'
    );
  }
  return null;
}

function readJsonOrNull(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    throw new Error(`${file} isn't valid JSON (${err.message}). Fix it by hand, init won't overwrite it.`);
  }
}

function buildPlan(root, today) {
  const scan = scanWorkspace(root);
  const existing = readManifest(root);
  const { manifest, changes } = mergeScan(existing, scan, today);
  const grew = changes.addedAddons.length + changes.addedFlavors.length > 0;
  const claudeMdFile = path.join(root, 'CLAUDE.md');
  const claudeMd = planClaudeMd(fs.existsSync(claudeMdFile) ? fs.readFileSync(claudeMdFile, 'utf8') : null);
  const settings = planSettings(readJsonOrNull(path.join(root, '.claude', 'settings.json')));
  return {
    scan,
    manifest,
    changes,
    manifestAction: existing === null ? 'create' : grew ? 'update' : 'unchanged',
    claudeMd,
    settings,
  };
}

function describeAddon(addon, declared) {
  const flavors = Object.entries(addon.byFlavor).map(([f, n]) => `${f} (${n})`);
  const target = flavors.length ? flavors.join(', ') : 'no ## Interface line, flavor left out';
  return `  ${addon.name.padEnd(28)} ${target}${declared ? '   [already declared]' : ''}`;
}

function fileLines(plan) {
  const c = plan.changes;
  const manifestNote = {
    create: `create, ${c.addedAddons.length} addon(s), ${c.addedFlavors.length} flavor(s)`,
    update: `add ${c.addedAddons.join(', ') || 'no addon'}${c.addedFlavors.length ? `; flavors ${c.addedFlavors.join(', ')}` : ''}`,
    unchanged: 'unchanged',
  }[plan.manifestAction];
  const claudeNote = {
    create: 'create, with the wow-addon-dev section',
    append: 'append the wow-addon-dev section, the rest is kept',
    update: 'refresh the wow-addon-dev section, the rest is kept',
    unchanged: 'unchanged',
  }[plan.claudeMd.action];
  const s = plan.settings;
  const settingsNote = s.action === 'unchanged' ? 'unchanged' : `${s.action}, add ${s.added.join(' and ')}`;
  return [
    `  ${FILE.padEnd(22)} ${manifestNote}`,
    `  ${'CLAUDE.md'.padEnd(22)} ${claudeNote}`,
    `  ${'.claude/settings.json'.padEnd(22)} ${settingsNote}`,
  ];
}

function printPlan(root, plan, write) {
  const declared = new Set(plan.changes.alreadyDeclared);
  const out = [`Workspace: ${root}`, '', `Addons found (${plan.scan.addons.length}):`];
  if (plan.scan.addons.length === 0) out.push('  none yet (a top-level folder <Name> holding <Name>.toc)');
  plan.scan.addons.forEach((a) => out.push(describeAddon(a, declared.has(a.name))));
  if (plan.scan.skipped.length) out.push('', `Folders without a matching .toc, left out: ${plan.scan.skipped.join(', ')}`);
  if (plan.changes.missingOnDisk.length) {
    out.push('', `Declared in ${FILE} but not found on disk (kept): ${plan.changes.missingOnDisk.join(', ')}`);
  }
  out.push('', 'Files:', ...fileLines(plan), '');
  out.push(write ? 'Written.' : 'Dry run, nothing written. Run again with --write to apply.');
  console.log(out.join('\n'));
}

function applyPlan(root, plan) {
  if (plan.manifestAction !== 'unchanged') fs.writeFileSync(path.join(root, FILE), serialize(plan.manifest), 'utf8');
  if (plan.claudeMd.action !== 'unchanged') fs.writeFileSync(path.join(root, 'CLAUDE.md'), plan.claudeMd.text, 'utf8');
  if (plan.settings.action !== 'unchanged') {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    const text = JSON.stringify(plan.settings.settings, null, 2) + '\n';
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), text, 'utf8');
  }
}

function main(argv) {
  try {
    const opts = parseArgs(argv);
    const root = path.resolve(opts.target || process.cwd());
    const refusal = checkRoot(root, opts.force);
    if (refusal) {
      console.error(refusal);
      return 1;
    }
    const plan = buildPlan(root, new Date().toISOString().slice(0, 10));
    if (opts.write) applyPlan(root, plan);
    printPlan(root, plan, opts.write);
    return 0;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, parseArgs, checkRoot, buildPlan, applyPlan };
