# Night Rite artwork

The approved painted assets are shared by the Night Rite and the standalone puzzle room. Runtime images live in `public/rite/`; `lib/rite/art-assets.ts` is the generated index. Labels, actions, puzzle state and rules stay in the application. The import adds 191 optimized WebP files, approximately 14.5 MiB in total; each screen loads only the images it displays.

## Registration and responsive layout

- **Escape:** the active game remains 6×6. The painted 384px board has a 24px rim and 336px play area. The inner board occupies 6.25%–93.75% of its frame on both axes, so the existing percentage-based pieces and pointer measurements line up with the painted grid. Matching 7×7 and 8×8 images are included for future engine support.
- **Laboratory:** `LaboratoryShelves` uses container queries to switch the room and its shelf anchors together. Visible vial bottoms, original 60×106 masks and four 17px liquid units are preserved. Each rendered vial gets a React-generated clip ID; multiple vigils can safely reuse vial identifiers. Extra vials form another room rather than dropping game data or inventing a third painted shelf. Very narrow screens can scroll the shelves while keeping 44px targets.
- **Sphinx:** locations keep their west-to-east order. The street and trays scroll together in the Night Rite. The standalone room retains its native selection controls and clue marking, with a painted street, tray frames and token previews. The tray corners use border-image slicing rather than scaling the ornament with the whole panel.
- **Divination:** three Omens sets sit in the tablet's three pale bands. Altar controls use the chamber as scenery behind opaque readable cards. The symbols and all 28 setting illustrations remain separate assets.

## Grimoire sizing

`Grimoire` is shared by both modes. It selects its layout from the available reader width, not the viewport. Below 520px it stacks each three-symbol group above its setting. At 520px it uses horizontal rows; at 1000px it changes to the open spread. The current 720px Night Rite shell therefore uses a single page even on desktop.

Symbols stay 48×48px, setting artwork stays 180×80px, and labels stay 14px with an 18px line height. Narrow rows use 232px for Candles, Offerings and Dial, or 196px for Chalice and Incense. Horizontal rows use 152px, leaving clearance beneath three-line labels. Page height follows the actual entry count; the active category scrolls vertically. Category controls and Previous/Next remain outside the parchment with 44px minimum targets.

Single pages use 56px top/bottom and 36px side content insets. Containers below 252px reduce the side insets to 24px while preserving the reading sizes. The open spread uses 72px above the header and 160px beneath the last row to clear the deep worn edge. Its continuous painted spine uses whole-width top/middle/bottom slices. No game text is baked into either page.

## Regenerating exports

Run `scripts/import-rite-art.mjs` with the approved `fearville-puzzle-assets` and `fearville-background-assets` source pack directories:

```powershell
$env:FEARVILLE_SHARP_MODULE = '<path to a separately installed Sharp module>'
node scripts/import-rite-art.mjs --sprites '<sprite pack>' --surfaces '<surface pack>'
```

Sharp is an authoring tool, not an app dependency. The importer preserves transparency, creates explicit density variants, and regenerates the index and provenance manifest. Do not hand-edit generated exports or add source atlases and review screenshots to the repository. Run `npm run check` before committing an import or a consuming component change.
