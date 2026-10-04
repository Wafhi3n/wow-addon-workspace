---
name: workspace
description: "How a WoW addon workspace set up by wow-addon-dev is organized: addons.json (which folders are addons, the client each one targets, which ones the tools include, the settings of the checks), how a flavor is read from the .toc ## Interface line, what each check of /wow-addon-dev:check catches and how to configure it (Elune, size limits, the locale block, toc parity, headless tests), and how to check a Blizzard API against the UI source of the targeted client instead of from memory. Use when adding or renaming an addon, when a folder seems ignored, when a check fails or is skipped, when writing a headless test, or before calling or keeping a Blizzard API."
---

# WoW addon workspace

A workspace is one folder that holds your addon folders side by side, plus the files the tools
read. `/wow-addon-dev:init` sets it up and can be run again at any time: it only adds.

```
MyWorkspace/
  addons.json          which folders are addons, and what they target
  CLAUDE.md            a short section written by init, the rest is yours
  .claude/settings.json
  MyAddon/             one addon = one folder; its own git repo works well
    MyAddon.toc
    MyAddon.lua
  MyOtherAddon/
    MyOtherAddon_Vanilla.toc
    MyOtherAddon_Mainline.toc
```

Keep the workspace out of the game's `Interface/AddOns` folder. The game gets copies (or links) of
the addon folders; the workspace is where you work.

## addons.json

```json
{
  "flavors": { "retail": { "interface": 110205 } },
  "addons": {
    "MyAddon": { "kind": "addon", "flavor": "retail", "active": true }
  }
}
```

- `kind`: `addon` is shipped to players, `lib` is an embedded library (no `.toc` of its own),
  `tool` is a local dev addon you never publish.
- `flavor`: a key of `flavors`. A list (`["classic_era", "retail"]`) when one addon ships for
  several clients.
- `active`: `true` puts the addon in the default set of the workspace tools.
- `size`, `locale`, `tocParity`: settings of the checks, below.
- Keys starting with `_` are comments. Any other key you add is kept.

init never changes an entry that's already there and never removes one. A folder you deleted is
reported as "declared but not found on disk" and left for you to remove.

## The checks (`/wow-addon-dev:check`)

They run with **Elune**, a Lua 5.1 built to behave like the game's
(`https://github.com/Meorawr/elune/releases`, MIT, Windows, macOS and Linux builds). Unzip it into
`<workspace>/tools/elune` or point `WOW_ELUNE_DIR` at it. A system Lua 5.4 is refused on purpose: it
accepts `//`, `goto` and bitwise operators, which the game rejects.

| Check | What fails it | Settings in the addon's entry |
|---|---|---|
| `syntax` | a `.lua` file (any, `Libs/` included) that doesn't compile under Lua 5.1 | none |
| `toc` | a `.toc` saved with a UTF-8 BOM; two `.toc` files that don't list the same `.lua` files | `"tocParity": false` when the difference is on purpose |
| `size` | a file over 500 lines or a function over 60 | `"size": { "maxFile": 500, "maxFunc": 60, "exclude": ["Data"] }`; `Libs`, `Locale`, `Locales` are always left out |
| `locale` | a key the code uses through `L["..."]` that an overlay lacks, a `%s`/`%d` mismatch, overlays that don't hold the same keys | the `locale` block below; without it the addon is skipped, not passed |
| `tests` | a `check(...)` that's false in `tests/test_*.lua`, or a test file that errors | none |

Something the checks can't read is a failure, never a pass: no file to check, an addon declared but
missing on disk, an addon folder that isn't declared, an unknown option.

### The locale block

```json
"locale": {
  "overlays": ["frFR", "deDE"],
  "table": "ns.L",
  "files": ["Locales/enUS.lua", "Locales/*.lua"],
  "untranslated": ["OK"],
  "dynamicKeys": ["Built at run time"]
}
```

- `overlays`: the locales to check. The language your keys are written in is not one of them.
- `table`: where the strings end up once the locale files ran. `ns.L` is the addon's private table
  (the second value of `...`); `MyAddon.L` is a global.
- `files`: the locale files in load order, relative to the addon folder, `*` allowed in the file
  name. A pattern's matches load in name order and a file is loaded once, so name the base file
  first. Default: `<Name>_Locale.lua` then `<Name>_Locale_*.lua`.
- `untranslated`: keys allowed to stay as they are in every language. `dynamicKeys`: keys the code
  builds at run time, which the scan can't see. `whitelist`: a Lua file returning
  `{ dynamic = {...}, allowedUntranslated = {...} }`, relative to the workspace, for long lists.

The locale files are really run, once per overlay, with `GetLocale()` returning that overlay: the
expected shape is a base file that creates the table with a key-to-key fallback, and one file per
language that returns early unless `GetLocale()` matches. AceLocale-3.0 isn't supported.
`L["..."]` inside comments and other strings is ignored.

### Tests

`tests/test_*.lua` at the workspace root, plain Lua run without the game. A test loads the code it
exercises, stubs the game API it needs, and calls `check(condition, "what should be true")`.
`WORKSPACE_ROOT` holds the workspace path, and each file starts from a clean `_G`:

```lua
local ns = { L = setmetatable({}, { __index = function(_, k) return k end }) }
assert(loadfile(WORKSPACE_ROOT .. "/MyAddon/Core.lua"))("MyAddon", ns)
check(ns.FormatGold(12345) == "1g 23s 45c", "formats gold")
```

Test the logic that doesn't need the game (parsing, formatting, data rules). What only the game can
show (frames, events, taint) is checked in game.

## Flavor from ## Interface

init reads every `<Folder>.toc`, `<Folder>_<Suffix>.toc` and `<Folder>-<Suffix>.toc` (the names the
client itself loads) and maps each `## Interface` value:

| Interface | flavor |
|---|---|
| 100000 and up | `retail` |
| 50000 to 59999 | `mists` |
| 40000 to 49999 | `cata` |
| 30000 to 39999 | `wrath` |
| 20000 to 29999 | `tbc` |
| 16000 to 19999 | `forever` (WoW: Forever; 16001 was read off the 1.60.1 client) |
| 10000 to 15999 | `classic_era` (also Hardcore and Season of Discovery) |

The ranges come from Blizzard's usual `major * 10000` numbering. When a client ships with a number
that lands in the wrong bucket, fix `flavor` by hand: init won't touch it again.

## Check an API against the client's own UI source

An agent writing WoW Lua from memory mixes up clients: an API that exists on retail can be missing on
Classic, and the other way round. Blizzard's UI code is mirrored, one branch per client, at
`https://github.com/Gethe/wow-ui-source`. Branches seen on 2026-10-04: `live`, `ptr`, `beta`,
`classic`, `classic_era`, `classic_anniversary`, `forever` and their `_ptr` / `_beta` variants.

```
git clone --depth 1 --branch <branch> https://github.com/Gethe/wow-ui-source.git wow-ui-source-<branch>
```

Then, before calling or keeping an API:

1. Search the API name in the clone of the branch the addon targets (`Interface/AddOns/Blizzard_*`
   and the `Blizzard_APIDocumentationGenerated` folder, which lists signatures).
2. If Blizzard's own UI calls it, copy how they call it: argument order, return values, the event
   they wait for first.
3. If it isn't there, don't assume it exists on that client. Find what Blizzard's code uses instead.

The source says what the client *declares*. Whether it works in game is only settled in game; write
down what you saw and when, so the next session doesn't re-learn it.
