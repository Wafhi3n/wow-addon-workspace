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
`UnitName("player")` stays plain (you're never secret to yourself). The nastiest case: a secret
**saved** into SavedVariables poisons a database that then won't load.

A headless test can't make a real secret: lock down the CONTRACT there ("a secret name means no
name"), not the symptom.

## A CALL can throw, not just return a secret

Seen in combat on 2026-09-20: `C_UnitAuras.GetAuraDataByIndex()` → "Auras cannot be accessed when
secret while tainted by '<addon>'". It's not a `nil` to test: a `pcall` around the comparison
protects nothing, **the call** is what needs guarding. What follows:
- a polling loop (once a second) turns one refusal into a shower of errors, so any refusal
  **pauses the reading for a few seconds**, and the pause lifts on its own;
- prefer a **targeted** read (`GetPlayerAuraBySpellID` on a known id) to sweeping all 40 slots.

## Two separate lockdowns

Measured on 2026-09-30 with `C_RestrictedActions.GetAddOnRestrictionState(0..5)`:
- **`Map` (4)** is on as soon as you enter a dungeon: unit names are secret.
- **`Chat` (5)** only goes up during a **BOSS fight** (`Encounter` = 2), not on trash. It makes
  the text and sender of `CHAT_MSG_*` secret, along with `C_Club.GetClubMembers` /
  `GetMemberInfo`, and blocks addon sends (`SendChatMessage` on a channel →
  `ADDON_ACTION_BLOCKED`). Under this lockdown `CHAT_MSG_SKILL` arrives with a secret `arg1`
  (Questie crashes using it as a table key).

**Testing a "chat" fix means probing DURING a boss fight.** A test in a city or on trash proves
nothing. Instance predicates for sending: `C_ChatInfo.InChatMessagingLockdown()`,
`AreOutgoingAddonChatMessagesRestricted()` (true doesn't mean everything is blocked, see
`missing-apis-and-guards.md`).

`C_Secrets` makes combat data opaque too, and the combat log is restricted: see
`COMBAT_LOG_EVENT_UNFILTERED` in `missing-apis-and-guards.md`.
