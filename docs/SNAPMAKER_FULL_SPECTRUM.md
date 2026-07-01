# Snapmaker U1 Full Spectrum and Surface Color Stitch

## Scope

The Snapmaker U1 ships with two color authoring tools beyond the standard
MMU-style painter:

- **Full Spectrum.** A gradient generator that maps a 1D color ramp across the
  Z height of a print, producing the "rainbow" effect popular on calibration
  cubes and Benchies.
- **Surface Color Stitch.** A surface-projection tool that maps a 2D color
  image onto a chosen face of the part for keychains, photo lithophanes, and
  inlay-style art.

This document records what the parser supports today and what would need to
ship for the U1's specific color tools to round-trip end-to-end.

## What works today

The U1 slicer is a fork of the BambuStudio / OrcaSlicer lineage and emits the
same 3MF container conventions (`project_settings.config`, `model_settings.config`,
component sub-models under `3D/Objects/`). The proprietary `paint_color`
attribute on per-triangle elements is shared across the family. Same
right-to-left nibble-packed subdivision tree, same `EnforcerBlockerType`
state encoding. See
[`3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).

This means:

| Snapmaker tool output | Underlying 3MF mechanism | Handled today? |
|-----------------------|--------------------------|----------------|
| Standard MMU painting | `paint_color` per-face nibble tree | Yes |
| Full Spectrum (Z-band gradient) | `custom_gcode_per_layer.xml` tool-change layers (MultiAsSingle mode) | Yes, via Z-plane triangle clipping in `parse3MF.ts` |
| Surface Color Stitch (2D image projection) | Likely texture-2d-coord + `<m:texture2dgroup>` + image asset | **No**. Texture binding is on the deferred list |
| Per-part extruder override | `<part>` metadata in `model_settings.config` | Yes |

The first three rows cover the bulk of U1 color print use cases. Surface
Color Stitch is the open one.

## Mixed filaments (virtual extruders)

Full Spectrum projects also define **mixed filaments**: virtual extruders whose
color is a pigment blend of two of the physical filaments. `paint_color` trees
and per-part `extruder` metadata reference them by extruder index ≥ `baseCount+1`.
They live in `project_settings.config` under `mixed_filament_definitions`, a
`;`-separated list of `,`-separated rows.

**Row format** (modern dialect, 15+ fields):

```
compA, compB, enabled, custom, mix_b_percent, pointillism, g<ids>, w<wts>,
m<distMode>, z<N>, xa<off>, xb<off>, d<deleted>, o<origin>, u<stableId>
[, cm<N>] [, r<k>/<wA>/<wB>]
```

Legacy dialect is just `compA, compB, enabled, mix_b_percent` (4 fields).

Key semantics (`src/lib/parse3MF.ts` → `parseMixedFilamentDefs`), verified
against [ratdoux/OrcaSlicer-FullSpectrum](https://github.com/ratdoux/OrcaSlicer-FullSpectrum)
(`MixedFilament.{hpp,cpp}`):

- **Virtual extruder ids count enabled + non-deleted rows ONLY.** The slicer's
  `mixed_index_from_filament_id` does `if (!enabled || deleted) continue`, so
  disabled rows (`enabled=0`) and tombstones (`d1` token) consume no index. The
  k-th *surviving* row (0-based ordinal) becomes extruder `baseCount + ordinal + 1`.
  Rows with invalid components (`a===b`, or outside `1..baseCount`) are likewise
  rejected. Enumerating over all rows is a bug: the sea sample has 6 disabled
  tombstones *first*, so a naive count shifts every painted state (11–15,
  ~84k faces) onto the wrong recipe.
- **`mix_b_percent` is the share of component B**, not A. `ratioA = (100 − mix_b)/100`.
  It sits at field[4] (modern) or field[3] (legacy).
- **`r<k>/<wA>/<wB>`** (e.g. `r1/0.8000/0.2000`) overrides the percentage with
  explicit weights: `ratioA = wA/(wA+wB)`. **`cm<N>`** is ignorable.
- **`u<N>`** is a persistent label, NOT the slot index (it can skip values).

**Blending uses a pigment model, not linear-RGB averaging.** The slicer blends
with `FilamentMixer`, a degree-4 polynomial (330 features, 7 inputs) approximating
Mixbox (MIT © 2026 Justin Hayes, `filament_mixer_model.h`), ported verbatim to
`src/lib/filamentMixer.ts`. Navy + yellow → green `#2F8D38`, the way real pigment
mixing looks — a linear-RGB lerp gives a wrong khaki. `mixFilamentHex` short-circuits
identical inputs to an exact copy so self-mixes round-trip precisely.

Both `samples/*U1*.3mf` fixtures exercise this path; assertions live in
`scripts/test-roundtrip.mjs` (sea = 15 slots with custom ratios and `r`-tokens;
parrot = 9 slots, slot 7 navy+yellow green-family).

## What Surface Color Stitch would need

If the U1's image-stitch tool emits texture-based color (the most likely
encoding, since per-face painting cannot represent a full-bleed image without
explosive subdivision), the parser would need:

1. **Read `<m:texture2d>`** declarations in the resource section and load the
   referenced image asset from the ZIP archive.
2. **Read `<m:texture2dgroup>`** UV coordinate lists keyed by triangle.
3. **Map** the per-triangle `pid` reference to the texture group and emit a
   `THREE.MeshStandardMaterial` with a `map` (texture) instead of a flat
   `color`. The current chunk-per-extruder model would need to expand to
   "chunk-per-material" where some chunks carry textures.
4. **Round-trip back to 3MF**: re-pack the modified image bytes alongside the
   archive. This is straightforward once the read path exists.

Estimated effort: a focused week of work to read, render, recolor (texture
tint), and re-pack. The current parser's chunk model is the right shape: it
already separates geometry into chunks by material, so the change is local
to `parse3MF.ts`, `glbBuilder.ts`, and `build3MF.ts`.

## Why this is not in the initial release

The honest answer is that no Surface Color Stitch sample 3MFs are available
to the project author yet, so any implementation would be speculative. The
right next step is to acquire a small set of real U1 Surface Color Stitch
outputs, dump the archive layout, and confirm the texture encoding before
writing code. Phase 6 is therefore documented as a tracked roadmap item
rather than a partially-implemented decoder.

Full Spectrum gradients, which produce the MultiAsSingle layer encoding, are
already handled. A Full Spectrum 3MF should drop into the existing demo and
render correctly today.

## Contributing samples

If you have a Snapmaker U1 3MF produced by Full Spectrum or Surface Color
Stitch and are willing to share it under an MIT-compatible license, please
open a PR adding the file to `samples/` and updating
[`samples/README.md`](../samples/README.md). The round-trip smoke test will
exercise the file on every commit.
