# Missing APIs, guards, and calls that throw

Everything on this page holds for **Forever** (measured September 2026, builds 69913 to 70170),
unless marked "Era".

## A missing Classic global doesn't shout

On Forever, a Classic global simply isn't there: the guard `if not get then return end` exits
**silently**, and the damage shows up at the other end of the chain. Seen twice on 2026-09-19:

| What the code read | What the player saw | What was actually dead |
|---|---|---|
| `GetNumSkillLines` / `GetSkillLineInfo` | an empty right-click menu, an empty "my crafters" list | no profession was ever announced on the network |
| `GetTradeSkillLine` / `GetNumTradeSkills` | two known enchants missing | no recipe list was ever sent |

**Any module that reads a Classic global is suspect until it has run on a real client.**

## Renaming the call isn't enough: rename the guard

`if GetItemInfo then MyApi.GetItemInfo(x) end` still tests the dead global: the guard is false, so
**the call never happens**. When porting one addon, 42 guards out of 87 call sites were like this.
Same family: `local API = GetItemStats or (C_Item and C_Item.GetItemStats)`. A dead global used as
a **value** slips past a search for calls.

Replacements found: `GetItemInfo`/`GetItemCount` → `C_Item.*`, `GetSpellInfo` → `C_Spell.*`,
`IsAddOnLoaded` → `C_AddOns.*`, `GuildRoster` → `C_GuildInfo.*`, the quest log → `C_QuestLog.*`.
Quests are selected by **index** on Classic and by **questID** on Mainline: an index passed as is
targets the wrong quest. A name documented only under a `C_*` namespace doesn't mean the bare
global is dead (`SendChatMessage`, `GetInventorySlotInfo`, `GetGuildRosterInfo` are alive;
`GetNumTrainerServices` and `GetTrainerServiceInfo` too, established 2026-09-23 by code that
reads trainers and works in game).

## What you name with a string THROWS instead of returning nil

- `RegisterEvent` on an unknown event: "Attempt to register unknown event". One unguarded line
  takes the whole file down with it. `TRADE_SKILL_UPDATE` and the `CRAFT_*` events don't exist on
  Forever; `TRADE_SKILL_LIST_UPDATE` exists on both.
- `HookScript` on a script type the widget doesn't have: `OnTooltipSetUnit` is **dead on
  Forever** (alive on Era, where it's still the way to read the world tooltip).
- `CreateFrame` with an unknown XML template ("Couldn't find inherited node"). Names changed:
  `TabButtonTemplate` (Era) against `PanelTabButtonTemplate` (Forever). **Ask** the client with
  `C_XMLUtil.GetTemplateInfo(name)` rather than trying and catching.

Wrap these three in your own helpers that check first. A library that loads before its host addon
has to do it on its own side too.

## What you reach through a path in Blizzard's own frames has MOVED

On `PortraitFrameTemplate`: `frame.TitleText` (Era) → `frame.TitleContainer.TitleText` (Forever);
`frame.portrait` → `frame.PortraitContainer.portrait`, with its circular mask already applied
(adding another overwrites it). The title threw an error, so it was seen and fixed fast; the
portrait failed silently behind `if not f.portrait then return end`. To **write** a title,
`frame:SetTitle()` reaches the right font string on both.

## A `pcall` around a BLOCK turns a crash into a missing feature

Seen 2026-09-18: `HookScript("OnTooltipSetUnit")` sat inside a `pcall` that wrapped a whole
`Start()` function, so menus, tooltips and discovery were all skipped without a message. Protect
**the risky call**, never the block. Same lesson for a defensive guard that "exits cleanly".

## Tell clients apart by SHAPE, never by assumed flavor

A per-flavor guard turns wrong at the next port (and `WOW_PROJECT_ID` changed value during the
beta). Dispatch on what the API returns: the type of the result, whether the modern enumerator
exists. `C_TradeSkillUI` **exists on Era too**: the tell is `GetAllRecipeIDs` /
`GetFilteredRecipeIDs`, not the table. A file meant for one client checks it at the top and
refuses to register anywhere else.

## When you add a data shape, find ALL its readers

Switching a registry to be keyed by `recipeID`: seven places read the old shape, the first search
had found four, and one reader even called a helper without a version guard. A sweep of the calls
only sees the files that existed the day it ran.

## Restricted events, and globals other addons set

- **`COMBAT_LOG_EVENT_UNFILTERED` carries `HasRestrictions = true`**: `RegisterEvent` doesn't
  throw, it raises `ADDON_ACTION_FORBIDDEN` blamed on your addon, **invisible to `pcall`**.
  `CombatLogGetCurrentEventInfo` is dead. Test `C_CombatLog.IsCombatLogRestricted()` before any
  registration (it returned `true` in a city on 2026-09-21). Never register "just to see".
- **Questie** (`Modules\ForeverCompat.lua`) re-injects about 35 Classic globals
  (`GetQuestLogTitle`, `GetNumSkillLines`, `GetSkillLineInfo`, `UnitAura`, `GetFactionInfo`,
  `SetDesaturation`...). An `if Global then`, or a dispatch that tries the old API first, then runs
  another addon's code, and behaves differently from one player to the next. Always try **the
  modern form first**.
- **Addon message prefixes don't survive the session** (`IsAddonMessagePrefixRegistered` returns
  `false` at the next login): register them again on every login.
- `AreOutgoingAddonChatMessagesRestricted() == true` does **not** mean "sending is blocked": a
  whisper to yourself went through in the open world (2026-09-18).

## Blizzard modules that load on demand

`hooksecurefunc("Name", ...)` on a function that isn't in `_G` yet is a **permanent no-op**. Wait
for the `ADDON_LOADED` of the module that defines it (`Blizzard_Professions`,
`Blizzard_UIPanels_Game`...) before hooking. And a FrameXML `<OnEnter function="Foo"/>` captures a
direct reference: `hooksecurefunc("Foo")` then only fires on calls by name, so hook the FRAME
(`HookScript("OnShow")`) instead (measured on Era, July 2026, not re-checked on Forever). Loading
on demand itself is checked on Forever for `Blizzard_Professions`.

## Protected functions met on the way

- `CastSpellByName` is **protected** on Forever (2026-09-19), like
  `C_SpellBook.CastSpellBookItem`. To cast from a click: a `SecureActionButton` (`type="spell"`,
  or `type2="click"` + `clickbutton2=ProfessionMicroButton`).
- `C_Club.SendMessage`, and `SendChatMessage` on a channel, need a hardware event (see
  `chat-channels-and-communities.md`).

## Spell ranks still exist

Measured on Forever, build 70205, 2026-10-04, on a paladin.

- Each rank has its own spell ID: Blessing of Might rank 1 is 19740, rank 2 is 19834. The rank-1
  ID tested as known (`C_SpellBook.IsSpellKnown`, falling back to `IsPlayerSpell`).
- `C_Spell.GetSpellInfo("Blessing of Might")` resolves to the **highest known rank** (19834).
  Casting by name casts that rank.
- An aura carries the `spellId` of the rank that was cast. Other players had 19740 or 19835 on
  them. `GetUnitAuraBySpellID(unit, 19834)` misses those; `GetAuraDataBySpellName(unit, name,
  "HELPFUL")` finds any rank. To ask "does this player have the buff", read by name.
- Game data, not API: right after a cast, Blessing of Might showed **59 min 58 s** left, so it
  lasts one hour on Forever (5 minutes in vanilla). Read durations off the aura, never hard-code
  them.

## Lua: `and`/`or` cut multiple returns down to one

`local a, b = X and X:f()` returns **one** value: `b` is `nil`, no error. Hit four times in one
addon (a sort that crashed deep in its comparator, a lost item slot, a wrong cap, a click that set
no waypoint). At four times, it's the shape of the API that invites the mistake: have functions
whose several results you keep return **a table**, and write the test with the guard the way a
caller will write it. Worth searching for in review: `grep -E 'local .*, .* = .* (and|or) '`. In
a sort comparator, give ranks a fallback.
