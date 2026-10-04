---
description: "Set up a folder as a WoW addon workspace: find the addons already in it, declare them in addons.json, add a short section to CLAUDE.md and enable this plugin in .claude/settings.json. Shows the plan first and writes nothing without the user's go."
argument-hint: "[folder]"
allowed-tools: Bash(node:*)
---

# Set up a WoW addon workspace

The folder is `$ARGUMENTS` if given, otherwise the current working directory.

1. Show the plan. This is a dry run and writes nothing:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" "<folder>"
   ```

2. If the script refuses (exit code 1), tell the user why in a sentence, in their language, and stop.
   The usual cases: the folder is itself an addon (init belongs in the folder above it), or it's the
   game's own `Interface/AddOns` folder. Never pass `--force` unless the user asks for it after
   reading the reason.

3. Otherwise relay the plan: which addons were found and the client each one targets, which folders
   were left out, and what happens to `addons.json`, `CLAUDE.md` and `.claude/settings.json`. Point
   out anything that looks off, for example an addon with no `## Interface` line, or a folder left
   out that the user probably expects to see.

4. Ask the user to confirm. Only on a yes, run the same command with `--write` and report the result.

5. Then say what this changed in one or two sentences: each addon is now declared in `addons.json`,
   and a new addon folder is picked up by running `/wow-addon-dev:init` again. An entry already in
   `addons.json` is never changed, so the user can edit `kind`, `flavor` and `active` by hand.
