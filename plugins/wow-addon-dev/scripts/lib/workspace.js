'use strict';
// The workspace as the checks see it: addons.json, which addons to check, and their files.

const fs = require('fs');
const path = require('path');
const { readManifest } = require('./manifest');
const { scanWorkspace } = require('./toc');

function loadWorkspace(root) {
  const manifest = readManifest(root);
  if (!manifest) throw new Error(`No addons.json in ${root}. Run /wow-addon-dev:init there first.`);
  const addons = manifest.addons && typeof manifest.addons === 'object' ? manifest.addons : {};
  return { root, manifest, addons };
}

// Top-level folders holding a matching .toc that addons.json doesn't declare. The checks never see
// them, so they're reported instead of passing in silence.
function undeclaredAddons(ws) {
  return scanWorkspace(ws.root).addons.map((a) => a.name).filter((name) => !ws.addons[name]);
}

// Named addons must be declared; with no names, every addon marked "active".
function selectAddons(ws, names) {
  if (names.length > 0) {
    const unknown = names.filter((n) => !ws.addons[n]);
    if (unknown.length) {
      throw new Error(`Not declared in addons.json: ${unknown.join(', ')}. Run /wow-addon-dev:init to declare it.`);
    }
    return names;
  }
  const active = Object.keys(ws.addons).filter((n) => ws.addons[n] && ws.addons[n].active === true);
  if (active.length === 0) {
    throw new Error('No addon is marked "active": true in addons.json, so there is nothing to check.');
  }
  return active.sort();
}

// Every .lua under dir, as paths relative to the workspace with forward slashes. Hidden folders
// are skipped, and so are folders whose name is in `skip` (compared without case).
function luaFiles(root, dir, skip = []) {
  const skipSet = new Set(skip.map((s) => s.toLowerCase()));
  const out = [];
  const walk = (abs) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && !skipSet.has(e.name.toLowerCase())) walk(path.join(abs, e.name));
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.lua')) {
        out.push(path.relative(root, path.join(abs, e.name)).split(path.sep).join('/'));
      }
    }
  };
  walk(dir);
  return out;
}

// Files matching "Sub/Dir/Name_*.lua" (a * only in the last part), relative to the workspace, sorted.
function globFiles(root, dir, pattern) {
  const parts = pattern.split(/[\\/]/);
  const base = path.join(dir, ...parts.slice(0, -1));
  const rx = new RegExp(
    '^' + parts[parts.length - 1].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    'i'
  );
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isFile() && rx.test(e.name))
    .map((e) => e.name)
    .sort()
    .map((name) => path.relative(root, path.join(base, name)).split(path.sep).join('/'));
}

module.exports = { loadWorkspace, undeclaredAddons, selectAddons, luaFiles, globFiles };
