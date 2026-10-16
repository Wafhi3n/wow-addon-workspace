# Changelog

Each plugin's `version` in `plugins/<plugin>/.claude-plugin/plugin.json` goes up with every
release: Claude Code files an installed plugin by its version, so an update that keeps the same
number may never reach people who already installed it.

## wow-addon-dev 0.4.2 - 2026-10-16

Two additions to `wow-forever-api`, read in Blizzard's UI source for Forever build 70425 (the
October 16 client update). Neither has been seen in game yet, and both pages say so.

- `mail-trade-auction.md`: taking the gold of a mail can now bring up a confirmation first, when the
  server considers the sender a stranger. Accept stays greyed for a second, the dialog warns about
  buying gold, and the player can cancel. So `TakeInboxMoney` is a request, not a payment: a hook on
  it sees the click, not the gold. Also: `C_SecureTransfer.GetMailInfo` is split into
  `GetMailSendInfo` and `GetMailReceiveInfo`, Open All stops on `MAIL_OPEN_ALL_CANCELED`, and the
  trade confirmation can carry the same gold-buying warning.
- `secret-values-and-lockdowns.md`: `C_PvP.GetScoreInfo` is tagged `SecretInActivePvPMatch`. The
  page lists the scoreboard fields the docs promise are never secret (`honorLevel`, which is the PvP
  rank on Forever, and a new `gender` joined them in this build), and says to test the others.

`api-gotcha-reviewer` flags both.

## wow-addon-dev 0.4.1 - 2026-10-11

A correction in `wow-forever-api` (`secret-values-and-lockdowns.md`, Forever build 70338). The page
recommended a targeted `GetPlayerAuraBySpellID` read as the safer way to read an aura in combat. It
doesn't throw there: it returns `nil` with no error when the aura is secret, as its
`RequiresNonSecretAura` tag in the client's documentation says. In combat, "no buff" and "hidden
buff" read the same. One of our addons took that `nil` for "the buff is gone" and showed the same
reminder toast after every fight. The page now says to tie one-shot state to the aura instance (its
`expirationTime`) and never to conclude "absent" from a read under a restriction.

Also measured: `C_Secrets.ShouldSpellAuraBeSecret(spellID)` returned `false` out of combat and `true`
in combat for that buff. `api-gotcha-reviewer` now flags a `nil` from `GetPlayerAuraBySpellID` taken
for "buff gone".

## wow-addon-dev 0.4.0 - 2026-10-11

A new skill, `chat-output`: what an addon may print to the chat frame, and when. It started with a
player's comment on one of our addons, "Too much chat spam, and the /ley signal off just turns
itself back on".

- The chat only answers something the player just did: a slash command, a click on the addon's own
  frames, a keybinding. Nothing at login except one line after an install or an update. A repeated
  game event or another player's message never writes to chat, and a debug mode the player turns on
  by command is the one exception.
- An on/off command typed alone shows the state and the word that changes it. Only `on` and `off`
  change it.
- What doesn't belong in chat goes to a toast in the game's own stack (`AlertFrame`), or to an icon
  for a state that lasts. A toast is for news: coming back to something the addon already knows
  shows nothing.
- `api-gotcha-reviewer` loads the skill and flags new lines that break it.
- The `new-addon` template stops printing "loaded" at every login. It says so once after an install
  or an update, and its test checks that.

New in `wow-forever-api` (`taint-and-protected-frames.md`, Forever build 70338): the game's toast
stack is open to addons. Toasts registered with `AlertFrame:AddQueuedAlertFrameSubSystem` showed in
combat with nothing blocked, two at once sat one above the other, and a Blizzard toast after ours
went through. A toast fed by an aura read gets nothing in combat, because the read itself throws;
deciding once combat ends was seen working.

## wow-addon-dev 0.3.11 - 2026-10-10

One more Discord fact in `wow-forever-api`, measured on Forever build 70338: a Discord bot can't post
in a guild's linked channel, but with "Manage Messages" on it, it can delete a line relayed from the
game, and that line then disappears from the guild's Discord stream in game too.

## wow-addon-dev 0.3.10 - 2026-10-10

More in `wow-forever-api`: guild chat linked to a Discord channel, measured on Forever build 70338
with two accounts in one guild.

- A line written on Discord reaches the game as `CHAT_MSG_GUILD`, or as `CHAT_MSG_GUILD_DISCORD` when
  the guild keeps Discord in a separate stream. Its text is an opaque K-string you can't read, and
  its sender is a Discord name, not a character. Check `discordInfo.fromDiscord` (the 18th argument)
  before you treat the sender as a player.
- Your addon can post to the guild's Discord stream with `C_Club.SendMessage`, from a click, even
  for a regular member. That stream only exists when the separate stream is on, so it's also the
  only way to tell that a guild is linked.
- Nearly all of `C_Discord` is protected, read-only getters included.
- On Discord, item and profession links turn into plain text, and a Discord bot can't post in a
  linked channel (error 20062).

## wow-addon-dev 0.3.9 - 2026-10-09

More in `wow-forever-api`, measured on Forever between 2026-10-05 and 2026-10-09:

- Addon messages to your own group work outdoors. In a raid, `PARTY` only reaches your own
  subgroup, while `RAID` crosses subgroups, so pick `RAID` when `IsInRaid()`. Every message also
  comes back to you once, so drop your own.
- Dragging a panel that holds secure buttons is blocked in combat. If `StartMoving` is the script
  itself, BugGrabber blames `UNKNOWN()`. Refusing the drag while `InCombatLockdown()` and finishing
  it when combat ends was checked in game and leaves no error.

## wow-addon-dev 0.3.8 - 2026-10-09

One fact in `wow-forever-api`, checked by a player on Forever build 70291: an addon can open the
game's Keybindings page already scrolled to its own section, with
`Settings.OpenToCategory(Settings.KEYBINDINGS_CATEGORY_ID, <section name>)`. The section name is the
value of the global named in your `Bindings.xml` `category=`. The page ID only exists once the
game's settings have loaded, so read it on click. `GetBindingKey` plus `GetBindingText(key, 1)` show
the current key, and `UPDATE_BINDINGS` tells you when the player changed it on that page.

## wow-addon-dev 0.3.7 - 2026-10-09

One fact in `wow-forever-api`, read in Blizzard's API docs for Forever build 70291 and not seen in
game yet: a frame's strata can turn secret. `GetFrameStrata` may return a secret, and
`SetFrameStrata` now takes a secret from Blizzard's own code but not from an addon, the same rules
`GetFrameLevel` / `SetFrameLevel` already had. Code that copies a Blizzard frame's strata onto its
own frame should check `issecretvalue` first.

## wow-addon-dev 0.3.6 - 2026-10-07

Three more facts in `wow-forever-api`, measured the same day on Forever build 70245:

- `C_ChatInfo.SwapChatChannelsByChannelIndex(1, n)` works from addon code, even from a timer, and the
  new order survives a `/reload`. An addon whose hidden channel took `/1` can hand it back to the
  game's General. Compare the channel names only after checking they aren't secret (boss fights), and
  note that the chat colors aren't swapped.
- Guilds seem to cross the hidden realms: a character on one realm signed a guild charter offered by
  a character on the other. Guild chat between realms isn't measured yet.
- The game's friend list is back after a week off. Two characters on the same Battle.net still can't
  add each other.

## wow-addon-dev 0.3.5 - 2026-10-07

More on Forever's realms in `wow-forever-api`, measured the same day with three accounts:

- The game's own Trade channel is split by realm too. Two characters on different realms, side by
  side in Ironforge, had Trade member lists with no name in common and two unrelated conversations
  at the same moment. A Trade scanner only sees its own realm, and a line posted there only reaches
  that realm.
- The realm follows the account: every PvE character of an account sat on the same realm, whatever
  its race or faction. Grouping, a quest together and 30 minutes offline didn't move a character.
- The game keeps each character's channel numbers between sessions: a custom channel that took `/1`
  at the first login keeps it, so wait for a game channel on `/1` before joining.

## wow-addon-dev 0.3.4 - 2026-10-07

One more fact in `wow-forever-api`, measured on Forever build 70245 with three accounts:

- Realms still exist under the megaserver, and a custom channel only reaches your own underlying
  realm. Players pick PvE or PvP and the game assigns the realm, so two players in the same city
  can sit in two copies of the same channel while their whispers go through. `GetRealmID()` gives
  the realm (it's the server part of the GUID); `instanceID` is 0 in every copy, and no API lists
  the realms.

## wow-addon-dev 0.3.3 - 2026-10-05

One more fact in `wow-forever-api`, measured on Forever build 70205 with two accounts:

- An addon whisper longer than 255 bytes still returns `Success`, and the other side gets the
  first 255 bytes, with no error anywhere. A list cut that way can end with a wrong last item.
  Split anything that grows (ID lists, registries) into parts that each fit and read on their own.

## wow-addon-dev 0.3.2 - 2026-10-05

Three more facts in `wow-forever-api`, measured on Forever 1.60.1 with the same buff addon, this
time in a group and in a dungeon:

- For your own party, the unit token works in a macro conditional: `/cast [@party1,help,nodead]
  <spell>` buffs the member and leaves your target alone, which the by-name macro for strangers
  can't do. Nothing in secure code can check that `raid3` is still the same player, though.
- In a dungeon, your group's names and auras still read plainly through `partyN` / `raidN` out of
  combat (1644 aura reads, none unreadable).
- Which buffs came back "Target is too low level" on a level 2 player (Kings, Wisdom rank 1), and
  how an addon can learn that threshold per spell rank instead of hard-coding it.

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
