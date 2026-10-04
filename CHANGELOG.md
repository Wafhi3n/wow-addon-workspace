# Changelog

The plugin's `version` in `plugins/wow-addon-dev/.claude-plugin/plugin.json` goes up with every
release: Claude Code files an installed plugin by its version, so an update that keeps the same
number may never reach people who already installed it.

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
