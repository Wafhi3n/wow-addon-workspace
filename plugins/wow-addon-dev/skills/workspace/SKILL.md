---
name: workspace
description: "How a WoW addon workspace set up by wow-addon-dev is organized: addons.json (which folders are addons, the client each one targets, which ones the tools include), how a flavor is read from the .toc ## Interface line, and how to check a Blizzard API against the UI source of the targeted client instead of from memory. Use when adding or renaming an addon, when a folder seems ignored, when deciding which client an addon targets, or before calling or keeping a Blizzard API."
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
- Keys starting with `_` are comments. Any other key you add is kept.

init never changes an entry that's already there and never removes one. A folder you deleted is
reported as "declared but not found on disk" and left for you to remove.

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
