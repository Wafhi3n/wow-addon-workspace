---
description: "Create a new WoW addon in the workspace from the plugin's template: .toc, core file with saved variables and a slash command, English/French/German/Spanish locales, a headless test, a verified-in-game log, and its entry in addons.json. Shows the plan first, writes nothing without the user's go, then runs the checks on the new addon."
argument-hint: "<Name> [--title \"My Addon\"] [--slash cmd] [--flavor retail | --interface 110205] [--git]"
allowed-tools: Bash(node:*)
---

# Create a new addon

Arguments: `$ARGUMENTS`. If no name was given, ask for one before anything else, and ask what the
addon is for: it makes a better title.

1. Show the plan (a dry run, nothing written), from the workspace folder:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/new-addon.js" $ARGUMENTS
   ```

2. If it refuses, relay why in a sentence and what to pass instead. The usual cases: no
   `addons.json` (run `/wow-addon-dev:init` first), a slash command the game or another addon
   already owns (suggest a free one with `--slash`), or no `## Interface` number known for the
   client. For that last one, never make a number up: the user reads it in game with
   `/dump select(4, GetBuildInfo())`, or from the `.toc` of an addon that already loads on that
   client, and passes `--interface`.

3. Relay the plan: name, title, slash command, client and interface number, the files, and the
   entry added to `addons.json`. Mention `--git` if they want the addon to be its own repository.

4. On the user's go, run the same command with `--write` added. It creates the addon and runs the
   checks on it: a new addon passes them all. If one fails, say so plainly, since that's a bug in
   the template.

5. Then tell them how to try it in game: put the folder (or a link to it) in the game's
   `Interface/AddOns`, restart the game client (the game lists its addons at startup, so `/reload`
   may not pick up a brand-new folder), and type the slash command. When they've seen it work, a line goes in the addon's
   `docs/verified-in-game.md`.
