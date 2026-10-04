# The client, SavedVariables and tooling

## The beta crashes on its own

Seen in the client's `Errors\` folder from 2026-09-17, before any of our addons were installed:
recurring graphics assertions (`CAS_LOCALITY_ERROR`, `texture->GetSize() ==
texturePool.resolution`, `GxResourceStateTracker.h:419`) and Lua errors in Blizzard's own
`Camelot/` files (`PaperDollFrameStats.lua:286`). Typical symptom: action bars and unit frames
"gone", actually **there but empty** (a failed texture binding, not a `Hide()`), fixed by
`/reload`. An addon bug reproduces the same way every time. Crash reports have a "Lua Stack"
section the dialog doesn't show: always read it. Crashes with different signatures
(autocompletion, GxDevicePrism, TurnOrActionStop) shouldn't be lumped together.

## SavedVariables

- **Per ACCOUNT, not per character**: two characters on the same account don't make a network test,
  and two clients on the same account at once corrupt the database.
- **The September 2026 loading outage, fixed on 2026-09-25.** The client WROTE the files but didn't
  RESTORE them on load (worked out by the `nobewayo/ForeverSVFix` repository). What still holds if
  it comes back:
  - it **can't be detected from inside**: `MyDB == nil` means "not restored" just as much as
    "first install", and telling them apart would need persistence. A warning to the player can't
    be honest;
  - **no fallback channel**: an addon CVar (`C_CVar.RegisterCVar`) returns `nil` after a full
    restart (measured 2026-09-23);
  - what survives: data **shipped in the package** (a table in a `.lua`), a **text export** the
    player copies;
  - during the outage, any scenario checked after a `/reload` is invalid.
- **A SavedVariables file can vanish** (seen three times, once emptied without a single write from
  us, cause unknown): copy what you need as soon as you read it, and copy the file before
  launching the client again.
- **Never store binary or compressed data in SavedVariables**: Auctionator's price database (a 60 KB
  binary string) came back empty while Questie (7.5 MB of text) reloads intact (reported
  2026-09-21, not proven from the disk).

## `.toc` and reloading

- **On Forever, a new `.lua` added to the `.toc` loads on `/reload`** (measured with a canary file
  on 2026-09-26, confirmed again 2026-09-30). A **brand-new addon** in the folder still needs a
  restart. You can deploy with the client open.
- On **Era** (measured 2026-06-29) it was the other way round: a full restart for any new file.
- **Never `/reload` while a deploy is still copying files**: the addon loads half-copied (a library
  missing, errors in a chain). Wait for the copy to finish.
- `.toc` metadata (icon, compartment) is read at client launch.

## Lua 5.1 and validation

The client runs **Lua 5.1**. A system `luac` is usually 5.4: it accepts syntax WoW refuses. The
judge is **Elune** (`github.com/Meorawr/elune`, Lua 5.1 built to WoW's specs), which
`/wow-addon-dev:check` uses. To check that a file *runs* (not just that it parses), execute it with
Elune's `lua` under a harness that stubs the game, like the workspace's `tests/`.

## Measure before deducing

A hidden column, a frame that seems missing and an empty frame all look the same on screen. A few
trace lines written to SavedVariables answer in one round trip what deduction chases in five. Two
rules learned: a trace must **never** be able to break what it observes; and when you take a job
away from a module, check that another one **picks it up** (removing one module's refresh left a
column nobody refreshed any more).

## Commands you give the player

- `/run`: **255 characters at most**, prefix included. Past that, the input box cuts silently and
  Lua raises "unfinished string near '<eof>'". For longer code: define a prefixed global function
  on a first line, call it on the next.
- **The chat box doubles `|` characters** typed or pasted: `m:match("|H...")` never finds anything.
  Write `\124`. One line per paste.
