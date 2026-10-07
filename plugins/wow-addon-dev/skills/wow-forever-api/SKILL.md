---
name: wow-forever-api
description: "Facts MEASURED on the WoW: Forever client (1.60.1, Mainline UI layer on vanilla content) and the traps they lead to: Classic APIs that are gone and fail silently, taint and protected frames, secret values, chat channels and communities, professions, mail, rendering and assets, SavedVariables. Use before calling or keeping a Blizzard API in a Forever addon, before concluding an API is dead or alive, and when something in game behaves unexpectedly. Every fact carries its target and the date it was measured. Many also hold on modern Retail, which shares the UI layer."
---

# Measured facts about the WoW: Forever API

What the client **actually did**, seen in game or read in Blizzard's source, with the date and the
target of each observation. Collected while porting two addons to Forever during its beta
(September and October 2026).

## The target

- Client folder `_classic_beta_` during the beta, version **1.60.1**, `## Interface: 16001`.
  Vanilla level-60 content, but the **Mainline UI layer** (about 12.1.5, "Midnight"), addon
  restrictions included. Code written for Classic Era breaks in many places; code written for
  modern Retail mostly works.
- **`WOW_PROJECT_ID` was 1 up to build 70124, then 18 (`WOW_PROJECT_CAMELOT`) from build 70170**
  (seen in game, 2026-10-02). A check that compares to `WOW_PROJECT_MAINLINE` or to `1` alone
  turns false without a sound: accept both, and guard `WOW_PROJECT_CAMELOT` against `nil`.
- Read the current build in game (`/dump GetBuildInfo()`) and in Blizzard's UI source
  (Gethe/wow-ui-source, branch `forever`).
- **After a client update**, run `/wow-addon-dev:patch-diff`: it lists what changed in the UI
  code and where your addons use it. Re-check any fact here that the update could have touched;
  data and server behavior only show in game. A fact that changed gets corrected with its new date.

## Who's right when sources disagree

1. **The live client** is the only proof that something exists. A small probe addon that walks
   `_G` and every `C_*` namespace and writes the names into its SavedVariables gives you the real
   list; read the file after logging out, and copy what you need right away.
2. **Code of yours that already works in game**: a function that a working feature calls exists.
3. **Blizzard's UI source**, branch `forever`. Look in **`Camelot/`** first: when both `Camelot/`
   and `Mainline/` exist, `Camelot/` is what the client loads. `Classic/`, `Vanilla/`, `TBC/`,
   `Wrath/`, `Cata/` and `WoWLabs/` are **not** loaded (`GetSpellInfo` is everywhere in them, and
   it's dead).
4. **The generated API docs** (`Blizzard_APIDocumentationGenerated`): signatures, enums, and
   `HasRestrictions`, which **means protected** against a call from an addon. They are incomplete
   (89 of the 146 real members of `C_TradeSkillUI`): **they never prove that something is absent**.
5. **Textures**: a texture dump of the client. The code export holds no assets, so a texture it
   doesn't mention can very well exist.

A Classic global that is **present** doesn't prove Blizzard set it: Questie re-injects about thirty
of them on Forever. `issecurevariable(_G, name)` returns `false, "<Addon>"` for a global an addon
set.

## Before blaming your code

- **The beta crashes on its own** (recurring graphics assertions, Lua errors in Blizzard's own
  `Camelot/` files): read the client's `Errors\` folder, "Lua Stack" section, which the crash
  dialog doesn't show. A symptom that goes away on `/reload` usually comes from the client.
- **List the installed addons** (with dates) and redo the gesture without the last one added.
  Auctionator, for one, breaks the profession window.
- **Change one thing at a time.** Removing three things and seeing the symptom go doesn't say
  which one was the cause.

## Tools that answer

| Tool | What it tells you |
|---|---|
| `/console taintLog 1`, then `2` | `Logs\taint.log`: level 1 gives what was blocked, **only level 2 names the write that tainted** |
| `/dump expr` | a value, a table, a function's existence; `/dump select(4, GetBuildInfo())` gives the interface number |
| `issecurevariable(_G, "Name")` | whether Blizzard or an addon set a global |
| a probe addon (above) | the full list of globals and `C_*` members on the live client |
| a minimal test addon, one gesture per session, your addon disabled | proof that a gesture taints, before touching your code |
| `/run ...` | **255 characters at most** (past that: "unfinished string"); write `\124` instead of a typed `|` |

## References: load the one for your subject

| File | Read it when... |
|---|---|
| `references/missing-apis-and-guards.md` | porting Classic code, guarding a call, a feature that's silent with no error, spell ranks |
| `references/taint-and-protected-frames.md` | `ADDON_ACTION_BLOCKED`/`FORBIDDEN`, attaching to a Blizzard frame, combat, menus, panels, nameplates, casting on another player |
| `references/secret-values-and-lockdowns.md` | a "secret" error, dungeons, boss fights, addon messages refused in an instance |
| `references/chat-channels-and-communities.md` | channels, addon messages, communities, whispers, player names, "No player named" arriving ~110 s late, messages silently cut at 255 bytes, a channel (custom or the game's Trade) that stops at your underlying realm, the realm that follows the account, channel numbers kept between sessions |
| `references/professions-and-items.md` | `C_TradeSkillUI`, recipes, opening a profession, profession links |
| `references/mail-trade-auction.md` | attachments, mail between players, trade, auction house |
| `references/ui-rendering-and-assets.md` | textures, icons, world map, minimap, lists, layout |
| `references/client-and-tooling.md` | SavedVariables, `.toc`, `/reload`, Lua 5.1, deploying |

## Adding a fact

A fact goes in only once it was **observed**: in game, in the source, or with a probe.

- State it, then **the target** (Forever, Era, Retail) and **the date** (and the build if known).
- Say how to check it again: the gesture, the probe, the source file.
- Something still being investigated is not a fact yet. Keep it out until it's settled.
