# Taint, protected frames and menus

## What changed on Forever

On Era, taint gave at worst `ADDON_ACTION_BLOCKED`, with blame that drifted from one addon to
another. On Forever (Midnight layer), it makes **Blizzard's own code crash** as soon as it reads a
secret value, and the blame **names** the addon. Seen 2026-09-18, entering Edit Mode:
`CompactUnitFrame.lua:699: attempt to compare local 'oldR' (a secret number value, while execution
tainted by '<YourAddon>')`. Taint can finally be diagnosed.

## Never write into the UI panel system

**Forever, 2026-09-18.** `SetUIPanelAttribute(frame, ...)` from addon code: `RegisterUIPanel` fills
`UIPanelWindows`, the call goes down to `frame:SetAttributeNoHandler()` in addon context, the
frame's SECURE attributes get tainted, and the `FramePositionDelegate:SetAttribute(...)` dispatch
then runs the whole secure chain tainted (stack: game menu → `ShowUIPanel` → `EnterEditMode` →
`RefreshPartyFrames` → `CompactUnitFrame_UpdateHealthColor`). Refuse it, even for a cosmetic gain.

What is **safe**, checked in the source (Era 2026-07-17, again in the 1.60.1 source):
- `ShowUIPanel` launders taint by design ("Dispatch to secure code", `SetForbidden()` delegate).
- `UIPanelWindows` is never iterated, only read by key: `UIPanelWindows[name] = nil` only taints
  that one frame's path.
- `tinsert(UISpecialFrames, ...)`: the table is iterated, but by `CloseSpecialWindows`, which
  Blizzard calls under `securecall`. It's the way meant for addons.

**The rule of thumb**: writing into a Blizzard table isn't what's dangerous; writing where the
consumer is **not** protected by `securecall` is. Check the consumer.

## Parenting your frame to a Blizzard panel makes it protected, for good

**Forever, 2026-09-19.** `SetParent(ProfessionsFrame)` is enough, and `IsProtected()` stays true
even after moving it back to `UIParent`. In combat everything is then refused, measured one call
at a time in `taint.log`: `SetWidth`, `SetPoint`, `ClearAllPoints`, `SetParent`, `SetToplevel`,
`SetFrameStrata`, `Show`, `Hide`, `EnableMouse`, `Raise`, `SetPropagateKeyboardInput`. **Only
`SetAlpha` goes through.**

- The right guard is the state, not the flavor: `frame:IsProtected() and InCombatLockdown()`.
- *Writing* to the host panel (`host:SetWidth`) taints it, even out of combat.
- The one setup with no taint at all: a column **anchored next to** the host (parent `UIParent`,
  nothing written to the host).
- Workarounds written for a FLOATING window (hiding it in combat, `SetToplevel`, forced strata)
  turn harmful once the frame is attached: review them, don't carry them over. Seen 2026-09-18:
  action bars and unit frames gone when entering combat with a profession window open.

## Secure frames in combat (general rules)

Measured on Era (July 2026). On Forever only `Hide`, `EnableMouse` and the other calls listed above
are confirmed (attached frame); the rest wasn't re-checked.
- a frame from a secure template is protected; `IsProtected()` returns `(inherited, explicit)`,
  and protection flows from parent to child;
- **hiding an ANCESTOR of a shown secure button** is refused in combat, and so is `EnableMouse` on
  that ancestor;
- **dragging that ancestor is refused too** (Forever 1.60.1, 2026-10-06, `taint.log`): a movable
  panel holding secure buttons, left on screen in combat, logged `StartMoving`, then
  `StopMovingOrSizing`, `ClearAllPoints` and `SetPoint` as blocked. With `StartMoving` hooked
  straight as the script (`SetScript("OnDragStart", f.StartMoving)`), BugGrabber names it
  `UNKNOWN()`, so look in `Logs/taint.log` for the real call. Guard `OnDragStart` / `OnDragStop`
  with `InCombatLockdown()`, and finish a drag caught by the pull on `PLAYER_REGEN_ENABLED`;
- pattern: remember the wanted state, call nothing in combat, replay it on
  `PLAYER_REGEN_ENABLED`; tuck it away (`SetAlpha(0)`) on `PLAYER_REGEN_DISABLED`, when changes
  still go through;
- Escape key: never put a protected frame in `UISpecialFrames`; put an **invisible, unprotected
  proxy** there instead.

## Draw order: there, complete, well placed... and invisible

`ProfessionsFrame` sits at frame level 1, but its `BookPage` at level 100. A column placed at
"parent + 5" is buried under an opaque background. Measure the highest level among the children
and sit above it. On the world map, Blizzard's pins start at level **2000** (see
`ui-rendering-and-assets.md`).

## The two proven causes of blocked action bars

Symptom (Forever, September 2026): `ADDON_ACTION_BLOCKED` in combat on `MainActionBar` /
`MultiBarBottomLeft/Right` (`SetFrameStrata`, `SetPointBase`, `SetShown`), blamed on the addon, not
one line of the addon in the stack. The secondary stacks (StanceBar, EditMode) cascade from the
first.
1. **`UIDropDownMenu_*`** writes shared globals (`UIDROPDOWNMENU_MENU_LEVEL`), proven at
   `taintLog` level 2. Fix: your own selector.
2. **`HelpPlate.Show()`** writes the module's `currentHelpInfo` upvalue, which stays in your name
   after `Hide`; `ProfessionsBookFrameMixin:OnHide` calls `HelpPlate.Hide()` then
   `MultiActionBar_HideAllGrids` (the blocked line). Proven with a test addon on 2026-09-19
   (control without the addon: 0 blocks; the test addon calling `HelpPlate`: the same blocks, now
   blamed on the test addon). Fix: draw your own help overlay, never call `HelpPlate.*`.

Also off limits: grabbing the keyboard (`EnableKeyboard` + `SetPropagateKeyboardInput`) on your
windows. It blocked the player's movement.

## Menus

- **Opening a menu of the Menu system from an addon crashes the client.** Forever, 2026-09-27,
  with a test addon: first click on a `WowStyle1DropdownTemplate` created by an addon
  (`SetupMenu` + `CreateRadio`), in a city, out of combat → "Fatal Error", assertion
  `((t)->tt_) == 5` in `ldebug.c`. The stack is 100% Blizzard (`OpenMenu` → `AcquireMenu`,
  `proxy.ownerRegion = ...` on a frame with `SetPrivateReference`). `MenuUtil.CreateContextMenu`
  takes the same path. Keep a home-made flyout; try again only after a patch.
- **Safe: `Menu.ModifyMenu(tag, fn)`**, which adds lines to a menu that Blizzard opens; the
  callbacks run under `securecallfunction`. Tags: `MENU_UNIT_PLAYER`, `_TARGET`, `_PARTY`,
  `_RAID_PLAYER`, `MENU_UNIT_FRIEND`, `_FRIEND_OFFLINE`; `Menu.PrintOpenMenuTags()` lists them.
  Blizzard's guide ships with the UI source:
  `Interface/AddOns/Blizzard_Menu/11_0_0_MenuImplementationGuide.lua`.
- The two menu systems (old `UIDropDownMenu`, new `Menu`) are **walled off** from each other
  ("shims have not been provided"): taint in one doesn't reach the other.
- The `UnitPopupButtons` table is gone (current Era and Forever): a guard that tests it silences
  the whole right-click menu.

## Nameplates: read through them, never cast through them

Measured on Forever, build 70205, 2026-10-04, with a probe addon (one paladin, Ironforge and a
dungeon, out of combat). Re-check with the same gestures after a patch.

- **Friendly player nameplates are FORBIDDEN inside an instance.** In a dungeon, all four group
  members' plates came as `FORBIDDEN_NAME_PLATE_UNIT_ADDED`, and `C_NamePlate.GetNamePlateForUnit`
  returned `nil` for them. Outdoors (Ironforge, about 20 players) they arrive as normal
  `NAME_PLATE_UNIT_ADDED` plates, none forbidden. The friendly plates setting is the CVar
  `nameplateShowFriendlyPlayers`.
- **The unit API still works on a nameplate token, even a forbidden one**, out of combat:
  `UnitName`, `C_Spell.IsSpellInRange(spell, "nameplateN")`, and both
  `C_UnitAuras.GetAuraDataBySpellName` and `GetUnitAuraBySpellID`. In the dungeon, the four players
  seen (most likely the group; membership and the restriction state weren't recorded) had their
  names come back plain through their forbidden plates' tokens. That narrows, without settling,
  the `Map` lockdown in `secret-values-and-lockdowns.md`. Their
  unit argument is typed `UnitTokenRestrictedForAddOns` in the generated docs, which define that
  type nowhere; it accepted `nameplateN`. So plates are a good way to SEE the players around you
  and read their buffs.
- **A spell cast on a nameplate token is ignored, without a sound.** A `SecureActionButton` with
  `type="spell"` and `unit="nameplate1"`, clicked dozens of times while `UnitExists` was true:
  no `UNIT_SPELLCAST_SENT`, no UI error, no `ADDON_ACTION_BLOCKED`. A typed `/cast [@nameplate3]
  <spell>` did nothing either (reported by the player; only the button test logged that the token
  existed at click time). The same button cast normally on `target` and on `player`.
- **What works: a macro button that targets by full name.** `type="macro"` with this `macrotext`
  cast on three strangers in a row, one click each:

  ```
  /cleartarget
  /targetexact First Surname
  /cast [@target,exists,help,nodead] <spell>
  ```

  The name is `GetUnitName(unit, true)`: first name and surname with a SPACE (see
  `chat-channels-and-communities.md`). `First-Surname` targets nobody, and before the guard was
  added the spell went out on the previous target. Keep `/cleartarget` and `[exists,help,nodead]`:
  if the name targets nobody, nothing is cast. Two costs come with it: the click takes over the
  player's target, and `/targetlasttarget` does NOT reliably give the previous one back (after a
  few clicks it pointed at a player buffed earlier).
- **For a member of your party, the group token works, and leaves your target alone**
  (2026-10-05, Forever 1.60.1, reported by the player). The same kind of macro button, with
  `/cast [@party1,help,nodead] <spell>`, buffed the party member and the caster kept their target.
  So use `partyN` / `raidN` for your own group (what raid frames do) and keep the by-name macro for
  strangers only. Not measured yet: a `raidN` token, and the same click in combat. A secure snippet
  can't check that the token still points at the player you displayed: the restricted environment
  has `UnitExists` but neither `UnitName` nor `UnitGUID` (`RestrictedEnvironment.lua`), so a roster
  change during combat can shift `raid3` to someone else.
- **Targeting a player by name in a conditional didn't work** (2026-10-05, reported, not settled): a
  typed `/cast [@First Surname] <spell>` on a player standing in front of the caster cast nothing.
  Whether that player was in the group wasn't noted, and `[@name]` is only meant to resolve group
  members, so this says nothing yet about the surname's space.
- **A key for such a button works** (2026-10-04, same build, reported by the player): a
  `Bindings.xml` entry with no body, `<Binding name="CLICK MyButton:LeftButton" header="MYADDON"
  category="BINDING_HEADER_MYADDON" runOnUp="true"/>`, shows up in the game's key bindings (label
  from the global `BINDING_NAME_CLICK MyButton:LeftButton`), and each press clicks the hidden
  secure button. The button was registered with `RegisterForClicks("AnyUp", "AnyDown")`, so it
  acts once whatever `ActionButtonUseKeyDown` says. Blizzard's own `Bindings.xml` files declare no
  `CLICK` binding, so this was the first check of it on Forever.
- **Your addon can open the Keybindings page on its own section** (2026-10-09, Forever 1.60.1
  build 70291, checked by the player): out of combat,
  `Settings.OpenToCategory(Settings.KEYBINDINGS_CATEGORY_ID, BINDING_HEADER_MYADDON)` opened
  Options > Keybindings already scrolled to the addon's section. The second argument is the
  section's display name: Blizzard names it from the global given in `category=` (`_G[cat]`) and
  `ScrollToElementByName` compares that name (`Blizzard_SettingsDefinitions_Frame/Keybindings.lua`,
  `Blizzard_SettingsList.lua`). `Settings.KEYBINDINGS_CATEGORY_ID` only exists once the settings
  registrants have run, after `VARIABLES_LOADED` and `PLAYER_ENTERING_WORLD` (`SettingsRegistrar`),
  so read it when the player clicks, and nil-guard it. To show the current key next to your own UI:
  `GetBindingKey("CLICK MyButton:LeftButton")`, then `GetBindingText(key, 1)` for the short form
  Blizzard's action buttons use. A key changed on that page reached the addon's display without a
  `/reload`, through `UPDATE_BINDINGS`. Whether the section opened expanded or collapsed wasn't
  noted. Sending players to Blizzard's page means Blizzard shows what a key was bound to before;
  a home-made key capture with `SetBinding` would silently take the key from another action.
- **Who cast a buff on someone else: `sourceUnit`, never `isFromPlayerOrPlayerPet`.** Measured
  2026-10-04 (same build), counting the buffs read through nameplate tokens during one minute in
  front of the Ironforge bank. With `isFromPlayerOrPlayerPet` as a fallback when `sourceUnit` was
  nil, 2197 reads out of 2197 came out as "mine". With `sourceUnit` alone (nil means "not me"):
  1967 mine, 151 by other players, 0 unreadable, out of combat. So `sourceUnit` is nil for a buff
  cast by a player you have no unit token for, and `isFromPlayerOrPlayerPet` is true for it: it
  means "cast by a player", not "cast by you". Do what Blizzard's `AuraUtil.lua` does:
  `(aura.sourceUnit ~= nil) and UnitIsUnit("player", aura.sourceUnit)`.

## Method when something gets blocked

Read `taint.log` (group the stacks by their bottom), read Blizzard's source on the lines just
BEFORE the blocked one, then **prove it** with a minimal test addon (one gesture per session,
your addon disabled) before touching your code. A day of blind fixes was lost once already.
