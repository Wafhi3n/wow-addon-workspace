'use strict';
// The addon template: what a new addon is called, which slash command it may take, and the copy
// of template/addon with its placeholders filled in.

const fs = require('fs');
const path = require('path');
const { flavorOf } = require('./toc');

const TEMPLATE = path.join(__dirname, '..', '..', 'template');

// Commands the game already owns. An addon that registers one of them breaks it for the player.
const RESERVED_SLASH = new Set(
  ('reload rl run script dump console help who w s y g p r afk dnd macro cast use fstack etrace ' +
    'say yell guild party raid whisper tell t invite inv logout camp quit exit emote e me roll ' +
    'random target tar focus assist follow f stopmacro castsequence click join leave chatlist ' +
    'friends ignore played time calendar ready readycheck raidinfo combatlog framestack eventtrace')
    .split(/\s+/)
);

function checkName(name) {
  if (!/^[A-Za-z][A-Za-z0-9_]{1,40}$/.test(name || '')) {
    throw new Error(
      `"${name || ''}" can't be an addon name here: use 2 to 41 letters, digits or _, starting with a letter. ` +
        'It becomes the folder, the .toc and the saved variables (<Name>DB), so it has to be a valid Lua name.'
    );
  }
}

// Free text that ends up inside a Lua string and a .toc line.
function checkText(label, text) {
  if (/["\\|\r\n]/.test(text)) throw new Error(`The ${label} can't contain ", \\, | or a line break.`);
}

// Slash commands the workspace's addons already register: SLASH_<KEY><n> = "/cmd".
function usedSlashes(root) {
  const used = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.') && e.name.toLowerCase() !== 'libs') walk(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.lua')) {
        const text = fs.readFileSync(p, 'utf8');
        for (const m of text.matchAll(/SLASH_\w+?\d+\s*=\s*["']\/([^"'\s]+)["']/g)) {
          used.set(m[1].toLowerCase(), path.relative(root, p).split(path.sep).join('/'));
        }
      }
    }
  };
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(path.join(root, e.name));
  }
  return used;
}

function checkSlash(slash, root) {
  if (!/^[a-z][a-z0-9]{0,30}$/.test(slash)) {
    throw new Error(`"/${slash}" won't do as a slash command: lowercase letters and digits, starting with a letter.`);
  }
  if (RESERVED_SLASH.has(slash)) throw new Error(`/${slash} belongs to the game. Pick another with --slash.`);
  const owner = usedSlashes(root).get(slash);
  if (owner) throw new Error(`/${slash} is already registered by ${owner}. Pick another with --slash.`);
}

// Which client and ## Interface number: from --interface, else from addons.json. Never guessed.
function resolveTarget(flavors, opts) {
  if (opts.interface !== undefined) {
    const flavor = opts.flavor || flavorOf(opts.interface);
    if (!flavor) throw new Error(`${opts.interface} isn't a ## Interface number of any client I know.`);
    return { flavor, interface: opts.interface, newFlavor: !flavors[flavor] };
  }
  const known = Object.keys(flavors).filter((k) => flavors[k] && Number.isInteger(flavors[k].interface));
  const flavor = opts.flavor || (known.length === 1 ? known[0] : null);
  const hint = 'pass --interface <number> (in game: /dump select(4, GetBuildInfo()))';
  if (!flavor) {
    throw new Error(known.length ? `addons.json knows several clients (${known.join(', ')}): pass --flavor <one of them>.` : `addons.json has no client with an interface number: ${hint}.`);
  }
  if (!flavors[flavor] || !Number.isInteger(flavors[flavor].interface)) {
    throw new Error(`addons.json has no interface number for "${flavor}": ${hint}.`);
  }
  return { flavor, interface: flavors[flavor].interface, newFlavor: false };
}

function fill(text, values) {
  let out = text;
  if (!values.__AUTHOR__) out = out.replace(/^## Author: __AUTHOR__\r?\n/m, '');
  // __SLASHKEY__ before __SLASH__, the longer placeholder first.
  for (const key of Object.keys(values).sort((a, b) => b.length - a.length)) out = out.split(key).join(values[key]);
  return out;
}

// The files of template/addon as { rel (in the new addon), text }. dot.x becomes .x.
function renderAddon(values) {
  const src = path.join(TEMPLATE, 'addon');
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const rel = path.relative(src, p).split(path.sep).map((seg) => fill(seg.replace(/^dot\./, '.'), values));
        files.push({ rel: rel.join('/'), text: fill(fs.readFileSync(p, 'utf8'), values) });
      }
    }
  };
  walk(src);
  return files;
}

function renderTest(values) {
  return fill(fs.readFileSync(path.join(TEMPLATE, 'test.lua'), 'utf8'), values);
}

module.exports = { checkName, checkText, checkSlash, usedSlashes, resolveTarget, renderAddon, renderTest, RESERVED_SLASH };
