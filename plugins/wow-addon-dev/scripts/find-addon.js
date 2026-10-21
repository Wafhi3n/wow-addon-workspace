#!/usr/bin/env node
'use strict';
// Before you build an addon: is there one already? Searches WoWInterface's whole catalog for the
// words of the idea, in names and folder names first, then reads the descriptions of the best
// candidates and ranks again. CurseForge has no API without a key: the find-addon command has
// Claude search it on the web instead.
//
//   node find-addon.js "<phrase>" ["<phrase>"...] [--limit <n>] [--read <n>] [--refresh]
//   node find-addon.js --folder <Name>      who ships a folder by that name
//   node find-addon.js --details <id>       the whole description of one addon
//
// Words are matched, not meaning: pass several short phrases, in English. Exit code 0 = a report
// (also when nothing matches), 1 = bad input or no catalog to search.

const { loadCatalog, loadDescriptions } = require('./lib/wowinterface');
const { stems, terms, scoreEntry, snippet } = require('./lib/match');

const STALE_YEARS = 2;
const DESCRIPTION_MAX = 6000;
const NOT_SEARCHED = 'Not searched here: CurseForge (where most current addons are), Wago, GitHub.';
const FIELD_LABEL = { name: 'name', folders: 'folders', description: 'description' };

function count(v, name, min) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} needs a whole number, ${min} or more.`);
  return n;
}

function parseArgs(argv) {
  const opts = { phrases: [], folders: [], limit: 10, read: 15, refresh: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--limit', '--read', '--folder', '--details', '--cache'].includes(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value.`);
      if (a === '--limit') opts.limit = count(v, a, 1);
      else if (a === '--read') opts.read = count(v, a, 0);
      else if (a === '--folder') opts.folders.push(v);
      else opts[a.slice(2)] = v;
    } else if (a === '--refresh') opts.refresh = true;
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}.`);
    else opts.phrases.push(a);
  }
  if (!opts.phrases.length && !opts.folders.length && !opts.details) {
    throw new Error('Say what the addon would do: find-addon.js "<words>" ["<other words>"...], or --folder <Name>, or --details <id>.');
  }
  return opts;
}

const day = (ms) => new Date(ms).toISOString().slice(0, 10);

function updated(e, now) {
  if (!e.date) return 'upload date unknown';
  const stale = now - e.date > STALE_YEARS * 365.25 * 24 * 3600 * 1000;
  return `updated ${day(e.date)}${stale ? ` (over ${STALE_YEARS} years ago)` : ''}`;
}

function header(catalog) {
  const lines = [];
  if (catalog.warn) lines.push(`[WARN] ${catalog.warn}`);
  const how = catalog.from === 'network' ? 'downloaded now' : 'cached';
  lines.push(`WoWInterface: ${catalog.addons.length} addons, catalog of ${day(catalog.fetchedAt)} (${how}).`);
  return lines;
}

function describeMatch(m) {
  const parts = [];
  if (m.where.length) parts.push(`in ${m.where.map((w) => FIELD_LABEL[w]).join(' + ')}`);
  if (m.partly.length) parts.push(`some words in ${m.partly.map((w) => FIELD_LABEL[w]).join(' + ')}`);
  return `"${m.phrase}" ${parts.join(', ')}`;
}

function describeHit(x, rank, now) {
  const e = x.e;
  const facts = [updated(e, now), `${e.downloads.toLocaleString('en-US')} downloads`];
  if (e.clients.length) facts.push(`clients: ${e.clients.slice(0, 4).join(', ')}${e.clients.length > 4 ? ', …' : ''}`);
  const lines = [
    `${String(rank).padStart(2)}. ${e.name}${e.author ? `, by ${e.author}` : ''}   (id ${e.id})`,
    `    ${e.url}`,
    `    ${facts.join('; ')}`,
    `    folders: ${e.folders.join(', ') || '(none listed)'}`,
    `    matched: ${x.r.matched.map(describeMatch).join('; ')}`,
  ];
  if (x.desc) {
    const best = x.phrases.find((p) => x.r.matched.some((m) => m.phrase === p.text)) || x.phrases[0];
    lines.push(`    "${snippet(x.desc, best.terms)}"`);
  }
  return lines.join('\n');
}

// Every word of a phrase in one place comes before words scattered, whatever the score.
const full = (x) => x.r.matched.some((m) => m.where.length > 0);
const byScore = (a, b) => full(b) - full(a) || b.r.score - a.r.score || b.e.date - a.e.date;

// Names and folder names over the whole catalog, then the descriptions of the best `read` of them
// (the catalog has none), and ranked again.
async function rank(catalog, phrases, read, deps) {
  const ranked = [];
  for (const e of catalog.addons) {
    const fields = { name: stems(e.name), folders: stems(e.folders.join(' ')) };
    const r = scoreEntry(phrases, fields);
    if (r.score > 0) ranked.push({ e, fields, r, phrases });
  }
  ranked.sort(byScore);
  const toRead = ranked.slice(0, read);
  const { texts, failed } = await loadDescriptions(toRead.map((x) => x.e), deps);
  for (const x of toRead) {
    if (!texts.has(x.e.id)) continue;
    x.desc = texts.get(x.e.id);
    x.r = scoreEntry(phrases, { ...x.fields, description: stems(x.desc) });
  }
  ranked.sort(byScore);
  return { ranked, read: toRead.length, failed };
}

async function search(opts, deps, catalog) {
  const phrases = opts.phrases.map((text) => ({ text, terms: terms(text) })).filter((p) => p.terms.length);
  if (!phrases.length) throw new Error('These phrases only hold words every addon page has (addon, wow, the...): say what it does.');
  const out = header(catalog);
  out.push(`Searched for: ${phrases.map((p) => `"${p.text}"`).join(', ')}.`);
  const dropped = opts.phrases.filter((t) => !phrases.some((p) => p.text === t));
  if (dropped.length) out.push(`[NOTE] skipped, nothing but common words: ${dropped.map((t) => `"${t}"`).join(', ')}.`);
  const { ranked, read, failed } = await rank(catalog, phrases, opts.read, deps);
  if (failed.length) out.push(`[WARN] description not read for: ${failed.join(', ')}.`);
  const whole = ranked.filter(full).length;
  if (!ranked.length) {
    out.push('', 'No WoWInterface addon has any of these words in its name or folder names.');
  } else {
    const shown = ranked.slice(0, opts.limit);
    out.push(
      `${whole} addons have every word of a phrase (in the name, the folders, or a description that was read); ` +
        `${ranked.length - whole} more share only some words. Descriptions read for the best ${read}.`
    );
    if (!whole) out.push('None has every word of a phrase: the list below shares words, not necessarily the idea.');
    out.push('', ...shown.map((x, i) => describeHit(x, i + 1, deps.now)));
  }
  out.push('', 'Read one in full: --details <id>.', NOT_SEARCHED);
  return out.join('\n');
}

const squash = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// The folder lists are as uploaded, and some are wrong (Bagnon's lists one folder, "btmlvldirs"):
// an addon called by the folder's name counts too.
function folders(opts, deps, catalog) {
  const out = header(catalog);
  for (const name of opts.folders) {
    const lower = name.toLowerCase();
    const users = catalog.addons
      .map((e) => ({ e, ships: e.folders.some((f) => f.toLowerCase() === lower) }))
      .filter((x) => x.ships || squash(x.e.name) === squash(name));
    if (!users.length) {
      out.push(`Folder "${name}": no WoWInterface addon ships one, or is called that.`);
      continue;
    }
    out.push(`Folder "${name}" (two addons with the same folder can't be installed side by side):`);
    for (const { e, ships } of users) {
      out.push(`  ${ships ? 'ships it' : 'same name'}: ${e.name}, by ${e.author || '?'}, ${updated(e, deps.now)}`, `    ${e.url}`);
    }
  }
  out.push(NOT_SEARCHED);
  return out.join('\n');
}

async function details(opts, deps, catalog) {
  const e = catalog.addons.find((a) => a.id === String(opts.details));
  if (!e) throw new Error(`No addon with id ${opts.details} in WoWInterface's catalog. The ids are in the search results.`);
  const { texts, failed } = await loadDescriptions([e], deps);
  if (!texts.has(e.id)) throw new Error(`Couldn't read the description of ${e.name}: ${failed.join(', ')}.`);
  const text = texts.get(e.id);
  const cut = text.length > DESCRIPTION_MAX;
  return [
    `${e.name}, by ${e.author || '?'}   (id ${e.id})`,
    e.url,
    `${updated(e, deps.now)}; ${e.downloads.toLocaleString('en-US')} downloads; clients: ${e.clients.join(', ') || '(none listed)'}`,
    `folders: ${e.folders.join(', ') || '(none listed)'}`,
    '',
    "Description, as the addon's author wrote it:",
    '',
    cut ? `${text.slice(0, DESCRIPTION_MAX)}\n[… cut at ${DESCRIPTION_MAX} characters: the rest is on the page above]` : text || '(empty)',
  ].join('\n');
}

async function run(opts, deps = {}) {
  const d = { fetch: deps.fetch || globalThis.fetch, now: deps.now || Date.now(), cacheDir: deps.cacheDir || opts.cache };
  const catalog = await loadCatalog({ ...d, refresh: opts.refresh });
  const parts = [];
  if (opts.details) parts.push(await details(opts, d, catalog));
  if (opts.folders.length) parts.push(folders(opts, d, catalog));
  if (opts.phrases.length) parts.push(await search(opts, d, catalog));
  return { code: 0, text: parts.join('\n\n') };
}

async function main(argv, deps) {
  try {
    const { code, text } = await run(parseArgs(argv), deps);
    console.log(text);
    return code;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

if (require.main === module) main(process.argv.slice(2)).then((code) => (process.exitCode = code));

module.exports = { main, parseArgs, run };
