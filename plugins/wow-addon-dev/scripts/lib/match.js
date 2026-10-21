'use strict';
// Word matching for find-addon: a search phrase against an addon's name, folders and description.
// Words, not substrings ("craft" must not hit "Warcraft"), with camelCase split ("CraftOrders" is
// "craft orders") and a light stemming ("crafting" hits "craft", "orders" hits "order").

// Words that say nothing about what an addon does: in a phrase they would match every addon.
const STOP = new Set([
  'a', 'an', 'the', 'of', 'for', 'to', 'and', 'or', 'in', 'on', 'with', 'by', 'from', 'at', 'is',
  'your', 'my', 'that', 'this', 'it', 'addon', 'addons', 'add', 'wow', 'mod', 'mods', 'world',
  'warcraft',
]);

// Where a phrase hit counts most: an addon named after it says more than a description mentioning it.
const WEIGHT = { name: 3, folders: 2, description: 1 };

function words(text) {
  return String(text || '')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && /(ch|sh|ss|x)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

const stems = (text) => words(text).map(stem);

// The stems of a search phrase, without the words every addon page has.
function terms(phrase) {
  return words(phrase)
    .filter((w) => !STOP.has(w))
    .map(stem);
}

// A term hits a word when the stems are equal, or, for a term of 4 letters or more, when the word
// starts with it ("track" hits "tracker").
function hit(term, word) {
  return word === term || (term.length >= 4 && word.startsWith(term));
}

function consecutive(phraseTerms, fieldStems) {
  for (let i = 0; i + phraseTerms.length <= fieldStems.length; i++) {
    if (phraseTerms.every((t, j) => hit(t, fieldStems[i + j]))) return true;
  }
  return false;
}

// Every term found: twice the weight, three times when they follow each other. Some of them: a
// small share, enough to get the description of "CraftScan" read for "craft request", too little
// to outrank a full match (one word of "crafting order" is "order", which a lot of names have).
function fieldScore(phraseTerms, fieldStems, weight) {
  const n = phraseTerms.length;
  const hits = phraseTerms.filter((t) => fieldStems.some((w) => hit(t, w))).length;
  if (hits === n) return { score: weight * (2 + (n > 1 && consecutive(phraseTerms, fieldStems) ? 1 : 0)), full: true };
  return { score: (weight * hits) / n / 2, full: false };
}

// fields: { name: [stems], folders: [stems], description: [stems] | undefined }.
// Returns the total and, for each phrase that scored, the fields where it did: `where` with every
// word, `partly` with some.
function scoreEntry(phrases, fields) {
  let score = 0;
  const matched = [];
  for (const p of phrases) {
    const where = [];
    const partly = [];
    for (const field of Object.keys(WEIGHT)) {
      if (!fields[field]) continue;
      const s = fieldScore(p.terms, fields[field], WEIGHT[field]);
      if (s.score > 0) (s.full ? where : partly).push(field);
      score += s.score;
    }
    if (where.length || partly.length) matched.push({ phrase: p.text, where, partly });
  }
  return { score, matched };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// About `width` characters of the text around the first word starting with one of the terms, or
// its opening when none is found as written.
function snippet(text, phraseTerms, width = 180) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  let at = 0;
  if (phraseTerms.length) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${phraseTerms.map(escapeRegExp).join('|')})`, 'iu');
    const m = re.exec(flat);
    if (m) at = Math.max(0, m.index - Math.floor(width / 3));
  }
  const cut = flat.slice(at, at + width);
  return `${at > 0 ? '…' : ''}${cut}${at + width < flat.length ? '…' : ''}`;
}

module.exports = { words, stem, stems, terms, hit, fieldScore, scoreEntry, snippet, STOP };
