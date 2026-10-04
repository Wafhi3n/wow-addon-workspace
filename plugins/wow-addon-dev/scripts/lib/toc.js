'use strict';
// Reading .toc files: which top-level folders are addons, and which client each one targets.

const fs = require('fs');
const path = require('path');

// ## Interface ranges, highest first. Only 16001 (WoW: Forever 1.60.1) was read off a live
// client; the other ranges follow Blizzard's usual major*10000 numbering.
const FLAVOR_RANGES = [
  [100000, 'retail'],
  [50000, 'mists'],
  [40000, 'cata'],
  [30000, 'wrath'],
  [20000, 'tbc'],
  [16000, 'forever'],
  [10000, 'classic_era'],
];

function flavorOf(iface) {
  for (const [min, name] of FLAVOR_RANGES) if (iface >= min) return name;
  return null;
}

// "## Key: value" lines only; a UTF-8 BOM and CRLF endings are common in the wild.
function parseToc(text) {
  const fields = {};
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^##\s*([^:]+?)\s*:\s*(.*?)\s*$/.exec(raw);
    if (m) fields[m[1]] = m[2];
  }
  const interfaces = (fields.Interface || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  return { title: fields.Title || null, interfaces };
}

// The client loads <Folder>.toc, <Folder>_<Suffix>.toc and <Folder>-<Suffix>.toc.
function tocFilesOf(dir) {
  const name = path.basename(dir).toLowerCase();
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.toc'))
    .map((e) => e.name)
    .filter((f) => {
      const stem = f.slice(0, -4).toLowerCase();
      return stem === name || stem.startsWith(name + '_') || stem.startsWith(name + '-');
    })
    .sort();
}

function readAddon(dir) {
  const tocs = tocFilesOf(dir);
  if (tocs.length === 0) return null;
  const interfaces = new Set();
  let title = null;
  for (const toc of tocs) {
    const info = parseToc(fs.readFileSync(path.join(dir, toc), 'utf8'));
    info.interfaces.forEach((n) => interfaces.add(n));
    title = title || info.title;
  }
  const byFlavor = {};
  for (const n of interfaces) {
    const flavor = flavorOf(n);
    if (flavor) byFlavor[flavor] = Math.max(byFlavor[flavor] || 0, n);
  }
  return { name: path.basename(dir), tocs, title, byFlavor };
}

// Hidden folders (.git, .claude, .vscode...) are never addons and aren't worth listing.
const SKIP = new Set(['node_modules']);

// Top-level folders only: libraries embedded inside an addon are the addon's business.
function scanWorkspace(root) {
  const addons = [];
  const skipped = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const addon = readAddon(path.join(root, e.name));
    if (addon) addons.push(addon);
    else skipped.push(e.name);
  }
  addons.sort((a, b) => a.name.localeCompare(b.name));
  skipped.sort();
  return { addons, skipped };
}

module.exports = { flavorOf, parseToc, tocFilesOf, readAddon, scanWorkspace };
