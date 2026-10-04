# wow-addon-workspace

The Claude Code setup I use to write and maintain my World of Warcraft addons
([Crafting Order](https://www.curseforge.com/wow/addons/crafting-and-gathering-order-classic) and
[Ley Line / Elemental Convergence Tracker](https://www.curseforge.com/wow/addons/ley-lines-tracker)),
cleaned up so it works on your addons too.

## Where it's at

It's early. There's one plugin, `wow-addon-dev`, with three commands: `init` turns a folder into an
addon workspace, `check` runs the checks I use before every commit, and `new-addon` creates an addon
that passes them from the start. It also carries what my sessions read before touching the API (see
below). Still to come over from my setup: the script that diffs Blizzard's UI code after a patch
and tells you which of your addons use something that changed.

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

## The checks

`/wow-addon-dev:check` runs five of them on every addon marked active in `addons.json`:

```
== Hello ==
  [OK]   syntax  4 file(s) checked, 0 error(s)
  [OK]   toc     2 .toc file(s), same Lua files in each
  [FAIL] size    3 file(s) checked, 1 over the limit
         [FUNCTION] Hello/Core.lua:12 OnEvent(): 74 lines (max 60, +14)
  [FAIL] locale  12 key(s) used, 2 overlay(s), 1 blocking problem(s), 0 dead key(s)
         [MISSING deDE] Bags full   (Hello/Bags.lua:40)

== tests ==
  [OK]   tests   2 file(s), 18 check(s) passed, 0 failed
```

Syntax is checked with the same Lua 5.1 the game runs, so `//` or `goto` that a modern Lua would
accept get caught. The `.toc` check catches a BOM and two `.toc` files that don't load the same Lua
files. Size flags functions over 60 lines and files over 500, the point where I stop being able to
change something without breaking something else (an agent too). Locale runs your locale files for
each language and lists every `L["..."]` the code uses that a language lacks, with the line it's
used on. Tests are plain Lua files in `tests/` that run without the game.

The checks need [Elune](https://github.com/Meorawr/elune/releases), a Lua 5.1 built to behave like
the game's (MIT, builds for Windows, macOS and Linux). Unzip it into `tools/elune` in your workspace,
or set `WOW_ELUNE_DIR` to wherever you put it. If the only Lua around is 5.4, the checks stop and
say so rather than give you a green result that means nothing.

Translations are only checked for an addon whose entry in `addons.json` has a `locale` block, and
the `workspace` skill shows how to write one. Without it the addon shows `[SKIP]`, not `[OK]`.

## A new addon

```
/wow-addon-dev:new-addon BagCounter --title "Bag Counter"
```

It shows what it's about to create and waits for your go: a `.toc`, a core file with saved
variables and a `/bagcounter` command, locales (English keys, French, German and Spanish), a test
in `tests/` that runs without the game, a `docs/verified-in-game.md` log for what you've actually
seen work, and the addon's entry in `addons.json`. Then it runs the checks on it. The `## Interface`
number comes from `addons.json` or from `--interface`; it's never guessed. Add `--git` to make the
addon its own repository.

## What Claude reads

Skills load when the subject comes up, and agents are helpers Claude can hand a job to:

- `wow-forever-api` holds what I measured on the WoW: Forever client while porting two addons to it
  during the beta: the Classic APIs that are gone and fail without an error, taint and protected
  frames, secret values, which channels swallow addon messages, professions, mail. Every fact has
  its date. A lot of it holds on retail too, since Forever runs the same UI layer.
- `workspace` explains the layout, the checks, and the habits that saved my releases.
- `curseforge-copy` keeps your CurseForge page and changelog from sounding like a chatbot wrote
  them.
- The `wow-api-lookup` agent looks an API up in Blizzard's UI source for the client your addon
  targets (clone [Gethe/wow-ui-source](https://github.com/Gethe/wow-ui-source) into
  `Documentation/wow-ui-source-<branch>`), and never treats a missing doc entry as proof the API is
  gone.
- The `api-gotcha-reviewer` agent reads your diff before a release and flags the traps above, each
  with the measured fact behind it.

## Why a workspace

An agent writing WoW Lua from memory mixes up the clients: retail, Classic Era and the rest don't
share the same API, and the model can't tell which one it remembers. Blizzard's UI code is public,
one branch per client, at [Gethe/wow-ui-source](https://github.com/Gethe/wow-ui-source), and the
`workspace` skill has Claude check an API there before using it. The source can't tell you whether
something taints the UI in combat, though. You find that out in game, and it's worth writing down
with the date you saw it.

## Developing

```
WOW_ELUNE_DIR=/path/to/elune npm test
```

Without `WOW_ELUNE_DIR` (or a Lua 5.1 on your PATH), the tests that run Lua are skipped and say so.

## License

MIT
