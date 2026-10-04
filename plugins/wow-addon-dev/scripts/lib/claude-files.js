'use strict';
// The two Claude Code files init touches: a marked section of CLAUDE.md, and .claude/settings.json.

const MARKETPLACE = 'wow-addon-workspace';
const MARKETPLACE_REPO = 'Wafhi3n/wow-addon-workspace';
const PLUGIN_KEY = `wow-addon-dev@${MARKETPLACE}`;

// The section is found by the tag alone, so a later version can reword the rest of the line.
const BEGIN_TAG = '<!-- wow-addon-dev:begin';
const BEGIN = `${BEGIN_TAG} (rewritten by /wow-addon-dev:init, edit outside these markers) -->`;
const END = '<!-- wow-addon-dev:end -->';

const SECTION = `${BEGIN}
## WoW addon workspace

This folder is a World of Warcraft addon workspace set up by the \`wow-addon-dev\` plugin.

- The addons live in \`addons.json\`: which folders are addons, which client each one targets
  (\`flavor\`), and which ones the workspace tools include by default (\`active\`). A top-level folder
  with a \`<Name>.toc\` that isn't declared there is invisible to them: run \`/wow-addon-dev:init\` again.
- Before committing, run \`/wow-addon-dev:check\` (Lua 5.1 syntax, .toc files, size, translations,
  the tests in \`tests/\`). A \`[SKIP]\` is not a pass.
- Before calling or keeping a Blizzard API, check it in the UI source of the client the addon targets
  rather than from memory: the \`wow-addon-dev:workspace\` skill says how.
${END}`;

// Returns { action: 'create' | 'append' | 'update' | 'unchanged', text }.
function planClaudeMd(existing) {
  if (existing === null) return { action: 'create', text: `# CLAUDE.md\n\n${SECTION}\n` };
  const start = existing.indexOf(BEGIN_TAG);
  const stop = existing.indexOf(END);
  if (start === -1 || stop === -1 || stop < start) {
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    return { action: 'append', text: `${existing}${sep}${SECTION}\n` };
  }
  const text = existing.slice(0, start) + SECTION + existing.slice(stop + END.length);
  return { action: text === existing ? 'unchanged' : 'update', text };
}

// Adds the marketplace and enables the plugin. Never overwrites a key that's already set.
function planSettings(existing) {
  const settings = existing ? JSON.parse(JSON.stringify(existing)) : {};
  const added = [];
  settings.extraKnownMarketplaces = settings.extraKnownMarketplaces || {};
  if (!settings.extraKnownMarketplaces[MARKETPLACE]) {
    settings.extraKnownMarketplaces[MARKETPLACE] = { source: { source: 'github', repo: MARKETPLACE_REPO } };
    added.push(`marketplace ${MARKETPLACE}`);
  }
  settings.enabledPlugins = settings.enabledPlugins || {};
  if (!(PLUGIN_KEY in settings.enabledPlugins)) {
    settings.enabledPlugins[PLUGIN_KEY] = true;
    added.push(`plugin ${PLUGIN_KEY}`);
  }
  const action = existing === null ? 'create' : added.length ? 'update' : 'unchanged';
  return { action, settings, added };
}

module.exports = { MARKETPLACE, MARKETPLACE_REPO, PLUGIN_KEY, BEGIN, END, SECTION, planClaudeMd, planSettings };
