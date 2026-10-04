# Professions, recipes and items

Everything on this page holds for **Forever** (September 2026), unless marked "Era".

## The model: `C_TradeSkillUI`, recipes keyed by `recipeSpellID`

No `GetTradeSkillInfo`, no `GetCraftInfo`: the Craft/TradeSkill split is gone. The chain:
enumerator → `GetRecipeInfo(id)` (41 fields) → `GetRecipeSchematic(id, false)` for reagents and
product → `CraftRecipe(...)`. The `hyperlink` from `GetRecipeInfo` carries the product's itemID.
`C_TradeSkillUI.CraftEnchant` exists.

**Two enumerators, both alive, both missing from the generated docs:**
- **`GetAllRecipeIDs`** to CAPTURE: ignores the player's search and categories;
- **`GetFilteredRecipeIDs`** to MIRROR the native list: honors search and filters. A slot filter
  set by `C_TradeSkillUI.SetInventorySlotFilter` is honored (Wrist: 14 → 3).

Capturing through the filtered one makes your data depend on what the player typed.
`GetAllRecipeIDs` was once removed from code "because it doesn't exist" (missing from the docs and
from FrameXML), then put back the same day when a probe found it alive.

**Both also return UNLEARNED recipes**: `Professions.SetDefaultFilters` sets
`SetShowUnlearned(true)` on **every** opening of the window. `info.learned` is mandatory, and
without `GetRecipeInfo` the only honest answer is an EMPTY set. Every reader of the list has to say
which of the two it wants.

## Facts read off real recipes (2026-09-18)

- **`supportsQualities = false`** and `supportsCraftingStats = false` everywhere: no Dragonflight
  quality tiers.
- **Vanilla recipes keep their spell ID** (Charred Wolf Meat 2538, Roasted Boar Meat 2540, Herb
  Baked Egg 8604); new content takes high IDs (Basic Campfire 1229737). A `recipeID` is a spell ID:
  `C_Spell.GetSpellName(id)` gives name and icon without a catalog.
- **`relativeDifficulty`**: 0 Optimal, 1 Medium, 2 Easy, 3 Trivial (orange, yellow, green, grey).
  The color comes from the client.
- Categories are the client's and meaningful (Cooking: "Camping", "Everyday Meals"...).
- `GetTradeSkillDisplayName` **requires** a `skillLineID`.
- Smelting is folded into the Mining tab; gathering professions have a real craft window.
- **`C_CraftingOrders.ShouldShowCraftingOrderTab()` → `false`**, even with a profession learned:
  Blizzard's crafting order system is off (the namespace exists, nothing exposes it).
- The catalog isn't Era plus a layer: some recipes **moved to another profession** (First Aid
  making potions) and some recipes are gone.

## The native window: `ProfessionsFrame`

Module `Blizzard_Professions`, **loaded on demand**: wait for its `ADDON_LOADED`. Forever has its
own `Blizzard_Professions\Camelot\` variant: read that one, not the Mainline one. Facts from the
1.60.1 source that make attaching to it clean:
- `ProfessionsFrame` is never `SetForbidden`;
- `CraftingPage` is anchored **TOPLEFT only**: widening the frame opens an empty strip on the right
  without moving any of Blizzard's children;
- the vertical tabs are anchored outside (`$parent TOPRIGHT`) and follow the edge;
- do **not** add a tab to `rightProfessionTabs`: `RefreshRightTabs` hides anything beyond the known
  professions;
- `RegisterUIPanel` gets `width = 750` for a 673-wide frame: that's the reserved room, not the
  size. Once something is parented to it, your frame becomes protected (see
  `taint-and-protected-frames.md`).

## Opening ONE specific profession

With the window CLOSED: can't be guaranteed. When it shows, each side tab whose profession isn't
the current one casts its spell again (`ProfessionsLargeRightTabMixin`, "ProfessionsFrame.Show" →
`CastProfessionSpell`): a cascade, and the window lands on the last one handled (seen: Cooking →
Herbalism → First Aid → Fishing → Enchanting). True for `OpenTradeSkill`, a secure button, and
Blizzard's own `OpenProfessionUIToSkillLine`. With the window ALREADY open, a `/cast` of the
profession switches directly, no cascade (confirmed in game 2026-09-21). Casting from code is
forbidden (`CastSpellByName` is protected): the way is a secure button with `type="spell"`.

## Profession links

Measured on 2026-09-27 with two accounts:
- Format: `|Htrade:Player-<GUID>:<profession RANK spell>:<skill line>|h[Enchanting]|h` (7412 =
  Enchanting at 102/150). No encoded recipe list: the server sends the recipes on click. Rank
  spell = `C_SpellBook.GetSpellBookItemInfo(spellOffset+1, Player)`.
- The receiver's addon reads the EXACT list (`GetAllRecipeIDs` + `learned` on the linked view).
- **You can't see just anyone's profession**: a link FORGED for a profession never shared (right
  GUID, right spell) puts the client in linked mode, but the profession name stays empty and the
  list stays the old one. The server doesn't deliver a profession that wasn't shared.
- Danger for an addon: on the linked view, `TRADE_SKILL_SHOW` / `TRADE_SKILL_LIST_UPDATE` fire just
  as for your own profession. An unguarded scanner credits you with the other player's recipes.
  Guard with `C_TradeSkillUI.IsTradeSkillLinked()`.
- `GetTradeSkillListLink()` without arguments = your own open profession; nil once the window
  closed (opening Communities closes it). The receiver, linked view open, can link it on: the same
  function returns a link. The "link" button's menu only offers channels; to whisper it:
  `ChatFrameUtil.OpenChat("/r " .. link, DEFAULT_CHAT_FRAME)`.
- Guild: `C_GuildInfo.QueryGuildMemberRecipes(guid, skillLine)`,
  `QueryGuildMembersForRecipe(skillLine, recipe)` + `GUILD_RECIPE_KNOWN_BY_MEMBERS` (not tried).

## Other addons

- **Auctionator breaks the profession window**: its code indexes `ProfessionsFrame.OrdersPage`,
  which Forever doesn't have. Errors "attempt to call a nil value" in
  `Blizzard_ProfessionsCrafting.lua:466 SelectRecipe` (100% Blizzard stack) and "0 recipes"
  elsewhere. Seen four times (September 19, 21, 27 and 28); gone without it. Measure WITHOUT it.
- Auctionator is still the price oracle around: `Auctionator.API.v1`, `GetVendorPriceByItemID` =
  the price to BUY from a vendor with unlimited stock. Its price database is a compressed binary
  string in SavedVariables (see `client-and-tooling.md`).
- No MissingTradeSkillsList on Forever.
