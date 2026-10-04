---
description: "After a game patch: what changed in Blizzard's UI code for the client your addons target, and where your addons use it. Compares the last build you reviewed with the latest one Gethe published, puts what touches your code first (globals set, functions removed or changed, documented API changes), then what to read. --mark records the build as reviewed once read."
argument-hint: "[--branch live|forever|classic_era|...] [--mark] [--from <rev> --to <rev>]"
allowed-tools: Bash(node:*)
---

# What the patch changed, and where it touches your addons

Run, from the workspace folder:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/patch-diff.js" $ARGUMENTS
```

1. If it stops (exit code 1 with one message), relay it. The usual ones: no clone of Blizzard's UI
   source yet (the message gives the `git clone` command; offer to run it), several clients among
   the active addons (ask which one, then pass `--branch`), no Lua 5.1 (the message says where to
   get Elune).

2. Otherwise read the report and lead with section **[1] TOUCHES YOUR CODE**: for each symbol,
   what changed at Blizzard (removed, changed, a global's new value) and the lines of the addons
   that use it. Open Blizzard's changed file in the clone (`Documentation/wow-ui-source-<branch>`)
   when the report alone doesn't say whether the addon breaks, and say plainly which lines need a
   change and which are fine. A global set comes first even when "added": a new value for a name
   the addon reads is the classic silent break.

3. Then **[2] READ FIRST** (API docs, `.toc` load lists, project constants, Blizzard addons your
   code names) and **[4] WEAK CLUES** (same method name, your call): summarize, don't paste.

4. Say what the report can't see: Gethe mirrors the UI code only. Data, assets and server behavior
   changes are checked in game. If the game says a newer build than the report's "to" version,
   Gethe hasn't published it yet: run it again later.

5. Don't run `--mark` on your own. Once the user has gone through the report, offer it: it moves the
   clone forward and records this build as reviewed, so the next run starts from here.
