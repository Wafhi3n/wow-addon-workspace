'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { main, parseArgs, run } = require('../scripts/find-addon');
const { words, terms, hit, fieldScore, stems } = require('../scripts/lib/match');
const { bbcodeToText, API } = require('../scripts/lib/wowinterface');

const NOW = Date.UTC(2026, 9, 21);
const DAY = 24 * 3600 * 1000;

const CATALOG = [
  { UID: '1', UIName: 'CraftOrders', UIAuthorName: 'Ann', UIDate: NOW - 30 * DAY, UIDownloadTotal: '1200', UIDir: ['CraftOrders'], UICompatibility: [{ name: 'Classic' }], UIFileInfoURL: 'https://wowi/1' },
  { UID: '2', UIName: 'Warcraft Logs Helper', UIAuthorName: 'Bob', UIDate: NOW - DAY, UIDownloadTotal: '50', UIDir: ['WCLHelper'], UIFileInfoURL: 'https://wowi/2' },
  { UID: '3', UIName: 'OldOrders', UIAuthorName: 'Cid', UIDate: Date.UTC(2010, 0, 1), UIDownloadTotal: '9', UIDir: ['OldOrders'], UIFileInfoURL: 'https://wowi/3' },
  { UID: '4', UIName: 'Request Board', UIAuthorName: 'Dee', UIDate: NOW - 2 * DAY, UIDownloadTotal: '300', UIDir: ['RequestBoard'], UIFileInfoURL: 'https://wowi/4' },
  { UID: '5', UIName: 'Bagnon', UIAuthorName: 'Eve', UIDate: NOW - 3 * DAY, UIDownloadTotal: '7', UIDir: ['btmlvldirs'], UIFileInfoURL: 'https://wowi/5' },
];

const DETAILS = {
  1: '[B]CraftOrders[/B] lets players send each other crafting orders.',
  3: 'Keeps your orders.',
  4: 'A board where you post [URL=https://x]crafting orders[/URL] to your guild. Press [Shift] to pin one.',
  5: 'Bags.',
};

// A fetch answering from the fixtures; `down` makes every call fail, `missing` lists ids with no page.
function fakeFetch({ down = false, missing = [], calls = [] } = {}) {
  return async (url) => {
    calls.push(url);
    if (down) throw new Error('offline');
    if (url === `${API}/filelist.json`) return { ok: true, status: 200, json: async () => CATALOG };
    const m = /filedetails\/(\w+)\.json$/.exec(url);
    if (m && DETAILS[m[1]] !== undefined && !missing.includes(m[1])) {
      return { ok: true, status: 200, json: async () => [{ UID: m[1], UIDescription: DETAILS[m[1]] }] };
    }
    return { ok: false, status: 404, json: async () => ({ ERROR: 'No AddOn found.' }) };
  };
}

const tmpCache = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wad-fa-'));

async function find(args, deps) {
  return run(parseArgs(args), { now: NOW, ...deps });
}

async function capture(args, deps) {
  const out = [];
  const log = console.log;
  const error = console.error;
  console.log = (s) => out.push(String(s));
  console.error = (s) => out.push(String(s));
  try {
    return { code: await main(args, { now: NOW, ...deps }), out: out.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test('words: camelCase split, light stemming, whole words only', () => {
  assert.deepEqual(words('CraftOrders UI'), ['craft', 'orders', 'ui']);
  assert.deepEqual(terms('Crafting Orders for the addon'), ['craft', 'order']);
  assert.deepEqual(stems('tracking bodies boxes'), ['track', 'body', 'box']);
  assert.equal(hit('craft', 'warcraft'), false);
  assert.equal(hit('track', 'tracker'), true);
  assert.equal(hit('ley', 'leyline'), false, 'a short term only hits the same word');
});

test('a phrase scores more in order, less scattered, a little with some words', () => {
  const t = terms('crafting order');
  assert.deepEqual(fieldScore(t, stems('Craft Order Board'), 3), { score: 9, full: true });
  assert.deepEqual(fieldScore(t, stems('Order of the Craft'), 3), { score: 6, full: true });
  assert.deepEqual(fieldScore(t, stems('Order Book'), 3), { score: 0.75, full: false });
  assert.deepEqual(fieldScore(t, stems('Bag Book'), 3), { score: 0, full: false });
});

test('BBCode becomes plain text, keeping link labels and brackets that are not tags', () => {
  const text = bbcodeToText('[SIZE="4"][B]Hi[/B][/SIZE]\r\n[IMG]https://x/y.png[/IMG][URL=https://x]the page[/URL] &amp; [Shift]\n[LIST][*]one[/LIST]');
  assert.equal(text, 'Hi\nthe page & [Shift]\n- one');
});

test('search: names first, then descriptions read, Warcraft never hits craft', async () => {
  const calls = [];
  const { code, text } = await find(['crafting order', 'craft request'], { fetch: fakeFetch({ calls }), cacheDir: tmpCache() });
  assert.equal(code, 0);
  assert.ok(text.includes('WoWInterface: 5 addons'), text);
  assert.doesNotMatch(text, /Warcraft Logs Helper/);
  const order = ['CraftOrders', 'Request Board', 'OldOrders'].map((n) => text.indexOf(`. ${n}`));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], text);
  assert.match(text, /"crafting order" in description/);
  assert.match(text, /post crafting orders to your guild/);
  assert.match(text, /updated 2010-01-01 \(over 2 years ago\)/);
  assert.match(text, /Not searched here: CurseForge/);
  assert.equal(calls.filter((u) => u.includes('filedetails')).length, 3, 'one description per candidate');
});

test('the cache answers the second run, with no network at all', async () => {
  const cacheDir = tmpCache();
  await find(['crafting order', 'craft request'], { fetch: fakeFetch(), cacheDir });
  const { text } = await find(['crafting order', 'craft request'], { fetch: fakeFetch({ down: true }), cacheDir });
  assert.match(text, /catalog of 2026-10-21 \(cached\)/);
  assert.match(text, /post crafting orders/, 'descriptions come from the cache too');
  assert.doesNotMatch(text, /WARN/);
});

test('a catalog that cannot be refreshed: the cached one, said; none cached: exit 1', async () => {
  const cacheDir = tmpCache();
  await find(['order'], { fetch: fakeFetch(), cacheDir });
  const stale = await find(['order', '--refresh'], { fetch: fakeFetch({ down: true }), cacheDir, now: NOW + 3 * DAY });
  assert.match(stale.text, /\[WARN\] couldn't refresh WoWInterface's catalog \(offline\); using the copy from 2026-10-21/);
  const none = await capture(['order'], { fetch: fakeFetch({ down: true }), cacheDir: tmpCache() });
  assert.equal(none.code, 1);
  assert.match(none.out, /Couldn't get WoWInterface's catalog \(offline\)/);
});

test('a description that cannot be read is named, and the search goes on', async () => {
  const { code, text } = await find(['crafting order'], { fetch: fakeFetch({ missing: ['1'] }), cacheDir: tmpCache() });
  assert.equal(code, 0);
  assert.match(text, /\[WARN\] description not read for: CraftOrders \(HTTP 404\)/);
  assert.match(text, /\. CraftOrders/);
});

test('nothing in common: said plainly, and words in common are not passed off as the idea', async () => {
  const deps = { fetch: fakeFetch(), cacheDir: tmpCache() };
  assert.match((await find(['ley line'], deps)).text, /No WoWInterface addon has any of these words/);
  assert.match((await find(['order tracker'], deps)).text, /None has every word of a phrase/);
});

test('--folder: who ships it, or is called that, without case', async () => {
  const { text } = await find(['--folder', 'craftorders', '--folder', 'Bagnon', '--folder', 'Free'], { fetch: fakeFetch(), cacheDir: tmpCache() });
  assert.match(text, /ships it: CraftOrders, by Ann/);
  assert.match(text, /same name: Bagnon, by Eve/);
  assert.match(text, /Folder "Free": no WoWInterface addon ships one, or is called that\./);
});

test('--details: the whole description as plain text; an unknown id is an error', async () => {
  const deps = { fetch: fakeFetch(), cacheDir: tmpCache() };
  const { text } = await find(['--details', '4'], deps);
  assert.match(text, /^Request Board, by Dee {3}\(id 4\)/);
  assert.match(text, /post crafting orders to your guild\. Press \[Shift\] to pin one\./);
  const r = await capture(['--details', '99'], deps);
  assert.equal(r.code, 1);
  assert.match(r.out, /No addon with id 99/);
});

test('bad input is refused before any download', async () => {
  assert.throws(() => parseArgs([]), /Say what the addon would do/);
  assert.throws(() => parseArgs(['x', '--limit', '0']), /--limit needs a whole number, 1 or more/);
  assert.throws(() => parseArgs(['x', '--nope']), /Unknown option --nope/);
  assert.throws(() => parseArgs(['--folder']), /--folder needs a value/);
  const r = await capture(['the addon', 'wow'], { fetch: fakeFetch(), cacheDir: tmpCache() });
  assert.equal(r.code, 1);
  assert.match(r.out, /only hold words every addon page has/);
});
