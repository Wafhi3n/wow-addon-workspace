'use strict';
// addons.json: the list of addons in the workspace. init only ever ADDS to it.

const fs = require('fs');
const path = require('path');

const FILE = 'addons.json';

function emptyManifest() {
  return {
    _comment:
      "Addons of this workspace, written by /wow-addon-dev:init. A top-level folder with a <Name>.toc " +
      "that isn't listed here is invisible to the workspace tools: run init again to add it. " +
      'Edit freely, init never changes an entry that is already here.',
    _fields: {
      kind: 'addon (shipped to players) | lib (embedded library, no .toc of its own) | tool (local dev tool, never published)',
      flavor: "the client it targets, a key of 'flavors' (a list when one addon ships for several clients)",
      active: 'true = included by default by the workspace tools',
    },
    flavors: {},
    addons: {},
  };
}

// Throws on a file that exists but doesn't parse: a broken manifest is never overwritten.
function readManifest(root) {
  const file = path.join(root, FILE);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`${FILE} exists but isn't valid JSON (${err.message}). Fix it by hand, init won't overwrite it.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${FILE} exists but isn't a JSON object. Fix it by hand, init won't overwrite it.`);
  }
  return data;
}

function flavorField(byFlavor) {
  const keys = Object.keys(byFlavor).sort();
  if (keys.length === 0) return undefined;
  return keys.length === 1 ? keys[0] : keys;
}

// Returns a new manifest plus what changed. Existing entries are left exactly as they are.
function mergeScan(existing, scan, today) {
  const manifest = existing ? JSON.parse(JSON.stringify(existing)) : emptyManifest();
  manifest.flavors = manifest.flavors || {};
  manifest.addons = manifest.addons || {};
  const changes = { addedAddons: [], addedFlavors: [], alreadyDeclared: [], missingOnDisk: [] };
  const onDisk = new Set(scan.addons.map((a) => a.name));

  for (const addon of scan.addons) {
    if (manifest.addons[addon.name]) {
      changes.alreadyDeclared.push(addon.name);
      continue;
    }
    const entry = { kind: 'addon' };
    const flavor = flavorField(addon.byFlavor);
    if (flavor !== undefined) entry.flavor = flavor;
    entry.active = true;
    manifest.addons[addon.name] = entry;
    changes.addedAddons.push(addon.name);

    for (const [flavor, iface] of Object.entries(addon.byFlavor)) {
      if (manifest.flavors[flavor]) continue;
      manifest.flavors[flavor] = { interface: iface, _source: `${addon.name} .toc, read by init on ${today}` };
      changes.addedFlavors.push(flavor);
    }
  }
  for (const name of Object.keys(manifest.addons)) {
    const kind = manifest.addons[name] && manifest.addons[name].kind;
    if (kind !== 'lib' && !onDisk.has(name)) changes.missingOnDisk.push(name);
  }
  return { manifest, changes };
}

function serialize(manifest) {
  return JSON.stringify(manifest, null, 2) + '\n';
}

module.exports = { FILE, emptyManifest, readManifest, mergeScan, serialize };
