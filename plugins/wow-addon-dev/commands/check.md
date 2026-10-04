---
description: "Run the addon checks on the workspace: Lua 5.1 syntax (as the game parses it), .toc files (BOM, same Lua files in every .toc), file and function size, missing translations, and the headless tests in tests/. With no argument, checks every addon marked active in addons.json."
argument-hint: "[addon ...] [--only syntax,toc,size,locale,tests]"
allowed-tools: Bash(node:*)
---

# Check the workspace's addons

Run, from the workspace folder (the one holding `addons.json`):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/check.js" $ARGUMENTS
```

Then:

1. If it stops before checking anything (exit code 1 with a single message), relay that message
   and what to do about it. The usual ones: no `addons.json` (run `/wow-addon-dev:init`), or no
   Lua 5.1 found (the message says where to get Elune and where to unzip it).
2. Otherwise give the verdict first: all passed, or which checks failed on which addon.
3. For each failure, read the lines under it and fix the cause when the fix is clear and inside
   the addon's code: a syntax error, a missing translation, a .toc line. For a size failure, say
   which function or file is over and propose how to split it before doing it. Never edit
   `addons.json` to make a check pass (raising a limit, turning `tocParity` off, adding to
   `untranslated`) without the user's go: that hides the problem instead of fixing it.
4. After fixing, run the same command again and report the new verdict.

A `[SKIP]` is not a pass. `locale ... not configured` means that addon's translations are not
checked at all; the `wow-addon-dev:workspace` skill shows the `locale` block that turns it on.
