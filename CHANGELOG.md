# Changelog

Each plugin's `version` in `plugins/<plugin>/.claude-plugin/plugin.json` goes up with every
release: Claude Code files an installed plugin by its version, so an update that keeps the same
number may never reach people who already installed it.

## wow-addon-dev 0.3.1 - 2026-10-04

New facts in `wow-forever-api`, measured on Forever build 70205 while writing a buff addon:

- Nameplates are for reading, not for casting: friendly player plates are forbidden inside an
  instance; name, range and auras still read through a `nameplateN` token; a spell cast on that
  token is ignored without a sound. A `type="macro"` button that targets by full name
  (`/targetexact First Surname`) does cast on a stranger.
- Who cast a buff on someone else is `sourceUnit`; `isFromPlayerOrPlayerPet` means "a player",
  not "you".
- A `CLICK` key binding declared in `Bindings.xml` works.
- Spell ranks still exist (read auras by name); a refused spell comes as the generic
  `ERR_SPELL_FAILED_S`, the reason being in the text.

## dev-workflow-core 2.0.0 - 2026-10-04

First public version. The 1.x line lived in a private marketplace, in French; this one is the same
code with its messages, docs and records in English.

- Hooks: the project's checks before Claude hands back (`testGuard`), files and functions measured
  after every write (`fileSizeGuard`), writes to read-only paths blocked (`readonlyPathGuard`), a
  warning before editing a file that changed on origin (`coordinationGuard`). All off until a
  project has a `.claude/dev-workflow.json`.
- `/dev-workflow-core:setup-project`, the `feature-spec` and `human-verification` skills, the
  `spec-updater` and `docs-consistency-auditor` agents.
- Coming from 1.x: size baselines with French keys (`[FICHIER]`, `[FONCTION] name`) still work, they
  are read as `[FILE]` and `[FUNCTION] name`. `braces.js --porcelain` moved to contract 2: its
  records are now `CONTRACT`, `FILE`, `FUNCTION`, `UNREADABLE`, `UNKNOWN-DIALECT`, so a script that
  looks for `CONTRAT` will report the analysis as not done until it's updated. The Stop hook is now
  `stop-test-guard.js` (`node --test` took `test-guard.js` for a test file and waited on its stdin
  forever). The `apiReference` hooks (generated API corpus for Unity/IL2CPP projects) are not part
  of this version.

## wow-addon-dev 0.3.0 - 2026-10-04

- `/wow-addon-dev:patch-diff`: after a patch, what changed in Blizzard's UI code (a Gethe clone in
  `Documentation/wow-ui-source-<branch>`, the branch picked from your addons' client) and where your
  addons use it. Globals set and removed functions first, then the documented API, the files to
  read, weak clues. `--mark` records the build as reviewed. Replayed on Forever builds
  70124 → 70170: same report as the tool it comes from, `WOW_PROJECT_ID` at the top.

## wow-addon-dev 0.2.2 - 2026-10-04

- macOS: Elune runs. Its macOS build can't find `lib/liblua5.1.dylib` on its own ("Library not
  loaded"); the checks now start it with that folder in `DYLD_LIBRARY_PATH`.
- The tests run on Windows, Linux and macOS for every change, with the real Elune archives.
- Issue forms: "Something doesn't work" and "Claude got WoW wrong".

## wow-addon-dev 0.2.1 - 2026-10-04

- Elune is found the way its archives come: unzipped as is into `tools/elune` (the
  `elune-3.1-<system>/` folder inside can stay), and as `bin/lua5.1` on macOS and Linux. Before,
  only `tools/elune/bin/lua` was looked for, which none of the archives give you.

## wow-addon-dev 0.2.0 - 2026-10-04

First public version.

- `/wow-addon-dev:init` declares the addons already in a folder in `addons.json`, with the client
  each one targets read from its `.toc`.
- `/wow-addon-dev:check`: Lua 5.1 syntax with Elune, `.toc` files, size, translations, headless
  tests.
- `/wow-addon-dev:new-addon` creates an addon that passes those checks.
- Skills `wow-forever-api`, `workspace`, `curseforge-copy`; agents `wow-api-lookup` and
  `api-gotcha-reviewer`.
