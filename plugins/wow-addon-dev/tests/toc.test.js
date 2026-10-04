'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { flavorOf, parseToc, tocFilesOf, scanWorkspace } = require('../scripts/lib/toc');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wad-toc-'));
}

function addon(root, name, files) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
}

test('flavorOf maps ## Interface values to clients', () => {
  assert.equal(flavorOf(110205), 'retail');
  assert.equal(flavorOf(120000), 'retail');
  assert.equal(flavorOf(50500), 'mists');
  assert.equal(flavorOf(40402), 'cata');
  assert.equal(flavorOf(30403), 'wrath');
  assert.equal(flavorOf(20505), 'tbc');
  assert.equal(flavorOf(16001), 'forever');
  assert.equal(flavorOf(11507), 'classic_era');
  assert.equal(flavorOf(900), null);
});

test('parseToc reads a BOM, CRLF endings and a comma list', () => {
  const info = parseToc('﻿## Interface: 11507, 110205\r\n## Title: My Addon\r\nMyAddon.lua\r\n');
  assert.deepEqual(info.interfaces, [11507, 110205]);
  assert.equal(info.title, 'My Addon');
});

test('parseToc survives a toc without Interface', () => {
  assert.deepEqual(parseToc('## Title: X\n').interfaces, []);
});

test('tocFilesOf keeps <Folder>.toc and suffixed variants, ignores the rest', () => {
  const root = tmp();
  const dir = addon(root, 'MyAddon', {
    'MyAddon.toc': '',
    'MyAddon_Vanilla.toc': '',
    'MyAddon-Mainline.toc': '',
    'OtherThing.toc': '',
    'MyAddonExtra.toc': '',
    'MyAddon.lua': '',
  });
  assert.deepEqual(tocFilesOf(dir), ['MyAddon-Mainline.toc', 'MyAddon.toc', 'MyAddon_Vanilla.toc']);
});

test('scanWorkspace finds top-level addons and lists the other folders', () => {
  const root = tmp();
  addon(root, 'Alpha', { 'Alpha.toc': '## Interface: 110205\n' });
  addon(root, 'Beta', { 'Beta_Vanilla.toc': '## Interface: 11507\n', 'Beta_Mainline.toc': '## Interface: 110200\n' });
  addon(root, 'Libs', { 'readme.txt': '' });
  addon(path.join(root, 'Alpha'), 'Nested', { 'Nested.toc': '## Interface: 110205\n' });
  fs.mkdirSync(path.join(root, '.git'));
  const scan = scanWorkspace(root);
  assert.deepEqual(scan.addons.map((a) => a.name), ['Alpha', 'Beta']);
  assert.deepEqual(scan.addons[1].byFlavor, { classic_era: 11507, retail: 110200 });
  assert.deepEqual(scan.skipped, ['Libs']);
});
