# wow-addon-workspace

The Claude Code setup I use to write and maintain my World of Warcraft addons
([Crafting Order](https://www.curseforge.com/wow/addons/crafting-and-gathering-order-classic) and
[Ley Line / Elemental Convergence Tracker](https://www.curseforge.com/wow/addons/ley-lines-tracker)),
cleaned up so it works on your addons too.

## Where it's at

This is version 0.1. It has one plugin, `wow-addon-dev`, and so far one command: `init`, which turns
a folder into an addon workspace. The rest of my setup comes over next: the Lua checks (syntax, file
size, missing translations, headless tests), a new-addon generator, and the script that diffs
Blizzard's UI code after a patch and tells you which of your addons use something that changed.

## Install

In Claude Code:

```
/plugin marketplace add Wafhi3n/wow-addon-workspace
/plugin install wow-addon-dev@wow-addon-workspace
```

Then start Claude Code in the folder that holds your addon folders and run:

```
/wow-addon-dev:init
```

You need Node.js 20 or newer on your PATH. The scripts are plain Node with nothing tied to an OS,
but so far I've only run them on Windows.

## What init does

It goes through the top-level folders, keeps the ones with a matching `.toc` (`MyAddon/MyAddon.toc`,
or `MyAddon_Vanilla.toc` and the other names the client loads), and reads `## Interface` to work out
which client each addon targets. Then it shows you the plan and waits for your go:

```
Addons found (2):
  BagCounter                   retail (110205), classic_era (11507)
  MyAddon                      retail (110205)

Folders without a matching .toc, left out: Libs

Files:
  addons.json            create, 2 addon(s), 2 flavor(s)
  CLAUDE.md              create, with the wow-addon-dev section
  .claude/settings.json  create, add marketplace wow-addon-workspace and plugin wow-addon-dev@wow-addon-workspace
```

`addons.json` lists your addons and the client each one targets. Edit it as you like, since init
only ever adds to it. In `CLAUDE.md` it writes a short section between two markers and leaves the
rest of the file alone. In `.claude/settings.json` it enables the plugin for that folder.

Run it again whenever you add an addon folder. It won't run inside the game's `Interface/AddOns`
folder, or inside an addon folder (run it one level up, in the folder that holds your addons).

## Why a workspace

An agent writing WoW Lua from memory mixes up the clients: retail, Classic Era and the rest don't
share the same API, and the model can't tell which one it remembers. Blizzard's UI code is public,
one branch per client, at [Gethe/wow-ui-source](https://github.com/Gethe/wow-ui-source), and the
`workspace` skill has Claude check an API there before using it. The source can't tell you whether
something taints the UI in combat, though. You find that out in game, and it's worth writing down
with the date you saw it.

## Developing

```
npm test
```

## License

MIT
