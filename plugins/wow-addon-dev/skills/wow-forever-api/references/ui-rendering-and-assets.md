# UI, rendering and assets

## "Tofu" glyphs: use textures

The UI font (`GameFontNormal*`) lacks the Unicode symbols: `✓ ✗ □ ▾ ○ ◆` show as an empty box
(confirmed in game 2026-06-29, Era). Accents, `×` and `…` work; the chat font has more. For a check
mark, an arrow or a bullet: a **native texture** (`|T<path>:h:w|t` or `SetTexture`). Textures that
work: `Interface\Scenarios\ScenarioIcon-Check` / `-Fail` / `-Interact`;
`Interface\Buttons\UI-CheckBox-Up` / `-Check`; `Interface\COMMON\Indicator-Yellow` / `Red` /
`Green` / `Gray`; `Interface\Buttons\Arrow-Down-Up`; `Interface\Common\UI-Searchbox-Icon`. An icon
can exist and still be unreadable (a 64 px drawing shrunk to 16 px): a **word** reads at any size
and can't be missing.

**Whether a texture exists**: check a dump of the client's textures (PNG tree of the
`Interface\...` paths). Never the code export, which holds no assets (`Interface\WorldMap\Gear_64`
was once declared missing; it existed).

## Shipping an image: 32-bit TGA, powers of 2

WoW doesn't read PNG or JPG for an addon: **uncompressed 32-bit TGA**, dimensions in powers of 2
(or BLP). The path is written with the extension (`...\Textures\x.tga`); the `.toc` doesn't list
textures. With Pillow: `im.save(dst, format="TGA", compression=None)` in RGBA.
`SetPortraitToTexture` needs 64×64. A new texture needs a client restart (true on Era; not
re-measured on Forever).

## Addon icon and compartment (Forever, 2026-09-27)

The client files Forever as `camelot`, which also counts as `mainline`: two Retail features work.
**`## IconTexture`** (addon list, 20×20, TGA) and the **addon compartment**
(`## AddonCompartmentFunc*`, GLOBAL functions). On Forever the compartment isn't on the minimap: it's
the small numbered button in the top right bar, next to the clock. Blizzard only lists addons
enabled for **all** characters (`GetAddOnEnableState == 2`), and reads the `.toc` metadata at client
launch. The bar next to it (`MinimapCluster.IndicatorFrame`, mail = `layoutIndex` 1) belongs to an
Edit Mode frame: don't insert into its layout without testing for taint.

**Never rename an addon's FOLDER**: the SavedVariables file depends on it, and every player would
start from an empty database. Change `## Title` and the labels instead.

## World map

`WorldMapFrame:GetCanvasScale()` **lies**: it returns `currentScale`, else `targetScale`, else a
hard-coded `1`, and the container resets both to nil on every map change. Compensating with 1
instead of ~0.3 gives a 5 px pin, at the right position (seen 2026-09-20). The truth:
**`canvas:GetScale()`**. Blizzard's pins sit at absolute levels from **2000** up
(`MAP_CANVAS_PIN_FRAME_LEVEL_DEFAULT`). Anchoring to copy from `MapCanvasMixin:ApplyPinPosition`:
`pin:SetPoint("CENTER", canvas, "TOPLEFT", (canvas:GetWidth() * x) / scale,
-(canvas:GetHeight() * y) / scale)`.

A frame that's there, empty, or invisible all look the same on screen: you need something that
prints the numbers (real scale against announced, size in pixels, level).

## Minimap

Tracking blips (ore, herbs) are drawn by the **engine**: the API only writes
(`Minimap:SetBlipTexture`, `UpdateBlips`), it reads **nothing**. Ways around it: a node database
(GatherMate2: `GetNodesForZone`, `DecodeLoc`, `GetNameForNode`), or record gathers yourself
(`UNIT_SPELLCAST_SUCCEEDED`, leaving out the tracking spells 2580/2383).

## Layout

- Blizzard's kit (`Blizzard_SharedXML\LayoutFrame.lua`): `VerticalLayoutFrame` /
  `HorizontalLayoutFrame` (`layoutIndex`, `spacing`, padding, hidden children out of the flow,
  `MarkDirty()`), `ResizeLayoutFrame`, `GridLayoutFrame`. It works **bottom up**: the content sets
  the size, there's no "take the rest". For a dynamic stack inside a panel of fixed size, put a
  `VerticalLayoutFrame` in a slot.
- **Virtualized list**: the pool of physical rows has to be at least the number of rows the area
  shows (`ceil(height / ROW_H)`), or the last rows never show, even scrolled to the bottom (seen
  2026-07-01).
- `UIPanelButtonTemplate` gets reskinned by skin addons (ElvUI...): use your own buttons when the
  look matters. A main window needs an OPAQUE background, or the chat and the world bleed through.
