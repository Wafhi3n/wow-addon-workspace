# Secret values and restriction lockdowns

Everything on this page holds for **Forever** (Midnight layer). None of it exists on Era.

## A secret value travels quietly and blows up far away

Seen in a dungeon on 2026-09-20: `UnitName(unit)` read from the mouseover tooltip, then
`roster[name]` three calls later → `attempted to index a table that cannot be indexed with secret
keys`. A secret breaks **table indexing AND comparison**, `n ~= ""` included: any secret test has
to come BEFORE any comparison.

Client API (`FrameScriptDocumentation.lua`): `issecretvalue(v)`, `hasanysecretvalues(...)`,
`issecrettable(t)`, `scrubsecretvalues(...)`, `canaccesssecrets()`.

Never try to "un-secret" a value: treat a secret as an **absent** value, as close as possible to
the API that produced it (a `UnitNameSafe(unit)` that returns `nil` for a secret, say).
`UnitName("player")` stays plain. The nastiest case: a secret **saved** into SavedVariables
poisons a database that then won't load.

**"player" is not a blanket exemption.** Measured on 2026-10-14 (build 70374), on a paladin, in a
city, in a dungeon out of combat, in a dungeon on trash, and during a boss fight:
`UnitGUID("player")`, the class and race tokens (`select(2, UnitClass("player"))`,
`select(2, UnitRace("player"))`) and `UnitIsUnit("player", "player")` stayed plain everywhere, but
**`UnitIsAFK("player")` came back SECRET during the boss fight** (plain on trash). That matches its
doc flag, `SecretInChatMessagingLockdown`, which says nothing about whose unit it is: read the
function's flag in Blizzard's generated docs, not the unit token. Battlegrounds not measured yet.

A headless test can't make a real secret: lock down the CONTRACT there ("a secret name means no
name"), not the symptom.

## A frame's strata can turn secret (docs of build 70291, not seen in game yet)

Read on 2026-10-09 in Blizzard's generated API docs for build 70291
(`SimpleFrameAPIDocumentation.lua`, `SecretAspectConstantsDocumentation.lua`); no secret strata
has been seen in game yet, and nobody has measured what makes one secret:
- `Enum.SecretAspect.FrameStrata` (16777216) is new.
- `GetFrameStrata` gets `SecretReturnsForAspect = { FrameStrata }`: once that aspect is secret on
  a frame, it returns a secret.
- `SetFrameStrata` went from `SecretArguments = "NotAllowed"` (build 70245) to
  `"AllowedWhenUntainted"` and adds the aspect: Blizzard's secure code may now pass it a secret,
  which makes that frame's strata secret; addon (tainted) code passing a secret is refused.

That's the declaration `GetFrameLevel` / `SetFrameLevel` already had. The trap is copying a host
frame's strata: `mine:SetFrameStrata(host:GetFrameStrata() or "MEDIUM")` hands a secret back
through tainted code once the host's strata is secret. Test `issecretvalue(s)` on the value
before any fallback or comparison, and use a fixed strata when it's secret. To check it again:
`/dump issecretvalue(SomeFrame:GetFrameStrata())` in game, and the two doc files above.

## A CALL can throw, not just return a secret

Seen in combat on 2026-09-20: `C_UnitAuras.GetAuraDataByIndex()` → "Auras cannot be accessed when
secret while tainted by '<addon>'". It's not a `nil` to test: a `pcall` around the comparison
protects nothing, **the call** is what needs guarding. What follows:
- a polling loop (once a second) turns one refusal into a shower of errors, so any refusal
  **pauses the reading for a few seconds**, and the pause lifts on its own;
- a targeted read on a known id costs one call instead of 40, but it fails the other way (next
  section).

## ...or return `nil` without a word: in combat, "no buff" and "hidden buff" look the same

Not every aura call fails the same way. The client's own documentation (Forever build 70338,
`UnitAuraDocumentation.lua` and `SecretPredicatesDocumentation.lua`) tags each one:
- `RequiresUnitAuraAccess` (`GetAuraDataByIndex`, `GetAuraDataBySlot`…): failure mode `Error`, the
  call **throws** (the case above);
- `RequiresNonSecretAura` (`GetPlayerAuraBySpellID`): "This does not raise a blocked action error -
  instead, protected APIs will return no values". When the aura is secret, the call returns
  **`nil`, no error**.

Measured in game on 2026-10-11 (build 70338, player's own 15-minute buff, open world, trash mob):
out of combat, `GetPlayerAuraBySpellID` read the buff; in combat it returned `nil` with no error.
An addon that took that `nil` for "the buff is gone" re-armed a one-shot reminder in every fight,
and the reminder fired again at every `PLAYER_REGEN_ENABLED`: a toast after each kill. A first fix
that waited for an error changed nothing, because no error ever comes on that path.
- **Never conclude "absent" from a `nil` read under a restriction.** Tie a one-shot state to the
  aura **instance**, for example its `expirationTime` (read under `pcall`; a refreshed buff gets a
  new one, allow a second or two of drift), and let absences change nothing.
- `C_Secrets.ShouldSpellAuraBeSecret(spellID)` answers "would this aura be secret right now?".
  Measured the same day on that buff: `false` out of combat, `true` in combat. That's one buff and
  one session. `C_Secrets.ShouldAurasBeSecret()` exists too, not measured.
- Code that relied on `GetPlayerAuraBySpellID` throwing in combat may still work by accident:
  in that addon, the targeted read returned `nil` and the fallback sweep over `GetAuraDataByIndex`
  is what threw and deferred the verdict to the end of combat. Check which call actually raises.

## Two separate lockdowns

Measured on 2026-09-30 with `C_RestrictedActions.GetAddOnRestrictionState(0..5)`:
- **`Map` (4)** is on as soon as you enter a dungeon: unit names are secret. Not all of them: on
  2026-10-04 (build 70205), four players in a dungeon, most likely the group, had plain names
  through their nameplate tokens, out of combat (see "Nameplates" in
  `taint-and-protected-frames.md`). On 2026-10-05 (Forever 1.60.1), a buff addon running in a
  dungeon read its group through `partyN` / `raidN` out of combat: every member listed by name,
  1644 aura reads by spell name, none unreadable, and the player buffed the whole group from it.
  So your own group stays readable out of combat; guard every name anyway.
- **`Chat` (5)** only goes up during a **BOSS fight** (`Encounter` = 2), not on trash. It makes
  the text and sender of `CHAT_MSG_*` secret, along with `C_Club.GetClubMembers` /
  `GetMemberInfo`, and blocks addon sends (`SendChatMessage` on a channel →
  `ADDON_ACTION_BLOCKED`). Under this lockdown `CHAT_MSG_SKILL` arrives with a secret `arg1`
  (Questie crashes using it as a table key).

The state reads `0` when off and `2` when on (measured 2026-10-14, build 70374: `Map` = 2 in a
dungeon in and out of combat, `Chat` = 2 only during the boss fight). Test `~= 0`, not `== true`.
On trash and on a boss, reading the player's own auras by index **throws** ("Auras cannot be
accessed when secret while tainted by …"); out of combat in the same dungeon it returns a plain
table.

**Testing a "chat" fix means probing DURING a boss fight.** A test in a city or on trash proves
nothing. Instance predicates for sending: `C_ChatInfo.InChatMessagingLockdown()`,
`AreOutgoingAddonChatMessagesRestricted()` (true doesn't mean everything is blocked, see
`missing-apis-and-guards.md`).

`C_Secrets` makes combat data opaque too, and the combat log is restricted: see
`COMBAT_LOG_EVENT_UNFILTERED` in `missing-apis-and-guards.md`.
