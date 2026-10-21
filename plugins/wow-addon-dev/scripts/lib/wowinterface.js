'use strict';
// WoWInterface's public addon API (api.mmoui.com, the one addon managers use), with no key: the
// whole catalog in one file (name, author, folders, clients, dates, no description), and one page
// per addon for its description. Both are kept in a per-user cache: the catalog for a day, a
// description as long as the addon's upload date doesn't change (a month at most).

const fs = require('fs');
const os = require('os');
const path = require('path');

const API = 'https://api.mmoui.com/v3/game/WOW';
const USER_AGENT = 'wow-addon-dev (Claude Code plugin; +https://github.com/Wafhi3n/wow-addon-workspace)';
const DAY = 24 * 3600 * 1000;
const CATALOG_TTL = DAY;
const DESCRIPTION_TTL = 30 * DAY;
const PARALLEL = 4;
const TIMEOUT = 30000;

function cacheRoot(given) {
  const base = given || process.env.WOW_ADDON_DEV_CACHE || path.join(os.homedir(), '.cache', 'wow-addon-dev');
  return path.join(base, 'wowinterface');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

async function getJson(fetch, url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Only what the search and the report use: the raw catalog is about 5 MB.
function compact(a) {
  const clients = (a.UICompatibility || []).map((c) => String((c && c.name) || '').trim()).filter(Boolean);
  return {
    id: String(a.UID),
    name: String(a.UIName || '').trim(),
    author: String(a.UIAuthorName || '').trim(),
    date: Number(a.UIDate) || 0,
    url: String(a.UIFileInfoURL || ''),
    downloads: Number(a.UIDownloadTotal) || 0,
    clients: [...new Set(clients)],
    folders: (a.UIDir || []).map(String),
  };
}

// { fetchedAt, addons, from: 'cache' | 'network', warn? }. A catalog that can't be refreshed falls
// back on the cached one, whatever its age, and says so; with no cache at all, it throws.
async function loadCatalog({ cacheDir, fetch, now, refresh }) {
  const file = path.join(cacheRoot(cacheDir), 'catalog.json');
  const cached = readJson(file);
  const usable = cached && Array.isArray(cached.addons);
  if (usable && !refresh && now - cached.fetchedAt < CATALOG_TTL) return { ...cached, from: 'cache' };
  try {
    const raw = await getJson(fetch, `${API}/filelist.json`);
    if (!Array.isArray(raw) || raw.length === 0) throw new Error('unexpected answer');
    const catalog = { fetchedAt: now, addons: raw.filter((a) => a && a.UID).map(compact) };
    writeJson(file, catalog);
    return { ...catalog, from: 'network' };
  } catch (err) {
    if (!usable) throw new Error(`Couldn't get WoWInterface's catalog (${err.message}). Check the connection and try again.`);
    const day = new Date(cached.fetchedAt).toISOString().slice(0, 10);
    return { ...cached, from: 'cache', warn: `couldn't refresh WoWInterface's catalog (${err.message}); using the copy from ${day}.` };
  }
}

const BBCODE_TAGS = 'b|i|u|s|size|color|font|url|img|list|quote|code|center|left|right|indent|highlight|hr|email|youtube|video|spoiler|table|tr|td|th|php|html|lua|noparse|attach|h[1-6]';

// WoWInterface descriptions are BBCode. Plain text, keeping link labels and leaving alone brackets
// that aren't tags ("[Shift]").
function bbcodeToText(s) {
  return String(s || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, '')
    .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[\*\]/g, '- ')
    .replace(new RegExp(`\\[\\/?(?:${BBCODE_TAGS})(?:=[^\\]]*)?\\]`, 'gi'), '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchDescription(fetch, id) {
  const d = await getJson(fetch, `${API}/filedetails/${encodeURIComponent(id)}.json`);
  const row = Array.isArray(d) ? d[0] : null;
  if (!row) throw new Error((d && d.ERROR) || 'unexpected answer');
  return bbcodeToText(row.UIDescription);
}

// Descriptions of `entries` (from the catalog), as Map id -> text. The ones that couldn't be had
// are listed in `failed` and the search goes on without them.
async function loadDescriptions(entries, { cacheDir, fetch, now }) {
  const dir = path.join(cacheRoot(cacheDir), 'descriptions');
  const texts = new Map();
  const failed = [];
  const todo = [];
  for (const e of entries) {
    const c = readJson(path.join(dir, `${e.id}.json`));
    if (c && c.date === e.date && now - c.fetchedAt < DESCRIPTION_TTL) texts.set(e.id, c.text);
    else todo.push(e);
  }
  for (let i = 0; i < todo.length; i += PARALLEL) {
    await Promise.all(
      todo.slice(i, i + PARALLEL).map(async (e) => {
        try {
          const text = await fetchDescription(fetch, e.id);
          writeJson(path.join(dir, `${e.id}.json`), { fetchedAt: now, date: e.date, text });
          texts.set(e.id, text);
        } catch (err) {
          failed.push(`${e.name} (${err.message})`);
        }
      })
    );
  }
  return { texts, failed };
}

module.exports = { loadCatalog, loadDescriptions, bbcodeToText, compact, cacheRoot, API };
