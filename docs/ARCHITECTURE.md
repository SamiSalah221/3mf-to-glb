# Architecture

Internal design notes for the 3MF Color Customizer. Read this before changing the parser or the viewer — most of the rules here exist because reverting them re-introduces a visible bug.

For the on-disk 3MF format itself, see [`3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md). This document covers how *our* code consumes that format.

## Pipeline

The app is a **pure client-side pipeline** that converts Bambu Studio `.3mf` archives into recolorable GLB exports. No backend.

```
.3mf (ZIP) → parse3MF() ──────────┐
.gcode / .gcode.3mf → parseGcode() ┴→ ParseResult { plates[], filaments[] }
                              │
                              ▼ (per plate)
            buildSceneFromPlate() → THREE.Group (one Mesh per chunk)
                              │
                              ├──▶ <primitive> rendered in R3F
                              └──▶ GLTFExporter → download .glb
```

## Core data model (`src/types/index.ts`)

- **`FilamentSlot`** is the unit of user control. Filaments are **global across all plates** (filament 1 is the same color on every plate). The parser reads these from `Metadata/project_settings.config` (Bambu's `filament_colour` array).
- **`MeshChunk`** is a pre-split blob of geometry tagged with a single `filamentIndex`. One chunk = one material = one color zone. The parser is responsible for splitting input triangles into chunks by their resolved extruder.
- **`Plate`** mirrors Bambu's plater concept. Each plate has its own `meshChunks` and a thumbnail extracted from the archive.

## The 3MF parser (`src/lib/parse3MF.ts`)

Color resolution in a Bambu 3MF is layered. The parser cascades in this priority order:

1. **Bambu `paint_color` attribute** (per-triangle): a proprietary **nibble-packed recursive triangle-subdivision tree**, read right-to-left, with state-overflow encoding for extruders ≥4. See `decodePaintColor` / `decodePaintTree`. No public spec exists — the implementation was reverse-engineered. See [`3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md) §6.
   - **Subdivision-tree vote must include inherit (state 0).** When a parent triangle is subdivided and its children have mixed states (e.g. `[0, 0, 0, 4]` = 75% inherit + 25% white), the correct rollup is "inherit" (the plurality). An earlier version filtered `s > 0` to "prefer painted over inherited", but that over-paints boundary triangles and creates visible seams that bleed paint colors into neighboring regions. See [`samples/kuwait.3mf`](../samples/kuwait.3mf) — the white-seam incident.
2. **Standard 3MF `pid`/`p1`/`p2`/`p3`** referencing `<basematerials>` / `<colorgroup>` resources.
3. **Default extruder** from `Metadata/model_settings.config` (`<object>` / `<part>` metadata).
   - **`extruder="0"` means "unassigned, inherit from object default" — not "filament 0".** Bambu's "Image to Keychain" template emits anchor parts (`<part>` named `Generic-Cube`) with `extruder="0"`. The parser must coerce 0/missing to the object-level default, not pass 0 through. The pre-fix code used `partExtruders.get(id) ?? objExtruder` (nullish coalescing), which let 0 leak into the chunk tree as `filamentIndex=0` — those meshes rendered gray (`glbBuilder` fallback `#808080`) and were skipped by `ColorableModel`'s reactive recolor loop (`if (filamentIndex)` is falsy on 0). Use `rawPartExt && rawPartExt > 0 ? rawPartExt : objExtruder`. See [`samples/turkey.3mf`](../samples/turkey.3mf) — the gray-anchor-block incident.

Additional correlations the parser must perform:

- **Multi-file 3MF (Production Extension):** root `3D/3dmodel.model` references component `.model` files via `p:path`. Build-item transforms and component transforms must be composed (`combineTransforms`) before vertex emission.
- **Negative/modifier parts** (`subtype="negative_part"` | `"modifier_part"`) are boolean operands, NOT visible geometry — skip them.
- **MultiAsSingle layer mode:** when `Metadata/custom_gcode_per_layer.xml` specifies tool-change layers, the parser performs **Z-plane triangle clipping** (`applyLayerColorChanges`) to split chunks by Z-zone so each layer band gets its own filament. This turns G-code metadata into geometry-level zones without a slicer.
- **Plate assembly:** `Metadata/model_settings.config` `<plate>` elements map `object_id`s to plates; root `<item>`s alone are not sufficient.

## Rendering & live recoloring (`src/viewer/ColorableModel.tsx`)

Critical pattern — do not break this:

- The `THREE.Group` is built **once per plate change** via `useMemo([currentPlate])`.
- Color changes **do not rebuild geometry**. A `useEffect([filaments])` traverses the group and calls `material.color.setRGB(...)` in place. Rebuilding would destroy selection state and waste GPU uploads.
- Click selection stores `userData.filamentIndex` on each mesh; emissive is toggled for highlight/hover.
- The same group is registered with `glbExporter.ts` via `setExportScene(groupRef.current)` on mount, so Export uses exactly the rendered scene.

## Color space — do not skip this conversion

glTF expects linear-sRGB `baseColorFactor`. All hex colors entering Three.js materials or the exported GLB **must go through `hexToLinearRGBA`** (`src/lib/colorConvert.ts`). Feeding raw sRGB into a `MeshStandardMaterial.color` produces visibly wrong (too bright/saturated) output. Round-trips use `linearToHex` with clamping.

## Tone mapping & environment — must stay OFF

This is a **color customizer**, so the preview must match the picked hex exactly (WYSIWYG with Bambu Studio and the exported GLB). React Three Fiber's `<Canvas>` defaults to `ACESFilmicToneMapping`, and an `<Environment preset="studio" />` is a tempting addition. Both actively distort brand colors:

- ACES is a cinematic S-curve. Applied to linear `#CD1126` (≈`0.610, 0.006, 0.019`) it ships out around `#D61738` — visibly salmon-pink. Pure `#000000` also lifts off zero once any indirect light touches it.
- `<Environment />` IBL adds Fresnel-weighted specular (F0 ≈ 4% on dielectrics) even at `metalness: 0`, which tints flat blacks gray on rough PBR.

`ViewerCanvas.tsx` therefore pins `toneMapping: THREE.NoToneMapping`, runs no Environment preset, and uses ambient-dominant direct lighting (`ambient 0.75` + two low-intensity directionals) so the lit-to-unlit range stays within albedo bounds without clamping. Do not reintroduce ACES, Reinhard, or `<Environment />` here — the export path is correct, the visible bug from those changes would only be in-app.

## Face-on camera via thin-axis detection — the Bambu preview parity rule

3MF files are laid out for 3D printing: the print grows along one axis (typically Z), so the interesting "face" of the part is perpendicular to the thinnest dimension of the bounding box. At an oblique camera angle, two things go wrong for a color customizer:

1. Z-extruded side walls of paint-color regions become visible as thin colored strips, which users read as rendering artifacts.
2. Tall-narrow paint-color regions foreshorten into what looks like "vertical bars" cutting through the model.

Fix: `glbBuilder.buildSceneFromPlate` computes `thinAxis = argmin(size.x, size.y, size.z)` after centering/scaling and stashes it on `group.userData.thinAxis`. `ColorableModel` pushes that into the Zustand store (`setThinAxis`) on each scene build, and `ViewerCanvas` has a `<CameraRig>` helper that — whenever `thinAxis` or `currentPlateId` changes — re-homes the camera along that axis at distance 7 (with `up` chosen so the view is right-side up) and resets `OrbitControls.target` to origin. This also fixes the "orbit rotation leaks between plate switches" bug — every plate switch returns the user to the canonical face-on view.

Do not reintroduce a hard-coded camera position like `[0, 2, 5]` — that 22° tilt was the whole reason a plain white saber on a flag appeared to "extend through and past" the geometry.

## Real-world scale: meters for export, display scale for viewport

`buildSceneFromPlate` no longer normalises the model to a "max-dim = 3" box.
It bakes the source-unit-to-meters factor (from the parsed `<model unit>`)
directly into the emitted vertex positions, then recentres the bounding box
at the origin. The returned `THREE.Group` is identity-transform and
physically correct: a 100 mm cube produces a 0.1 m bounding box in the
buffer attributes, which is what Apple Quick Look, Android Scene Viewer,
and `<model-viewer>` all assume for glTF coordinates.

That leaves the in-app viewport with a problem: at the default camera
distance (7) a 0.1-unit cube is a speck. `ColorableModel` solves it with a
display-only wrapper `<group scale={displayScale}>` that scales the
rendered model up to fit the camera frame, while `setExportScene` registers
the *inner* meters-baked group with `glbExporter`. The wrapper transform is
never observed by `GLTFExporter`.

Dimensions are stashed on `group.userData` as `dimensions.{mm,m}` plus
`bboxMin/MaxM`. `glbExporter.buildGLBBytes` reads them via the
`BuiltSceneUserData` shape and emits `asset.extras` on the GLB so AR
runtimes self-describe their true size. The Zustand store mirrors
`dimensions` for the on-screen `W × H × D` readout.

AR launchers force fixed scale: Scene Viewer with `&resizable=false` on
the intent URL, Quick Look with `#allowsContentScaling=0` on the USDZ
hash. The `100 mm cube` step in `scripts/test-roundtrip.mjs` is the
regression guard.

## Export pivot

The "pivot" is the point in the model that lands at the glTF/USDZ origin.
AR viewers place the origin onto the detected surface and rotate around
it, so the pivot directly controls how the model sits and spins in AR.

`buildSceneFromPlate` accepts a `pivotMode` option with five values:

- `base-center` (default): centers the two non-up axes and puts the up-axis
  MIN at 0. The model rests on the AR floor.
- `bbox-center`: geometric centre at the origin.
- `centroid`: area-weighted centroid at the origin. Single pass over
  triangle data, accumulating `centroid_i * area_i` and `area_i`.
- `original`: no translation. The exported coordinates match the source
  3MF after the unit-to-meters scale, so the bounding box can be anywhere.
- `custom`: bbox-centred bake plus a user X/Y/Z offset in mm.

The chosen offset is BAKED into vertex positions, never represented as a
node transform, so the GLB is self-describing. `asset.extras.pivot_mode`,
`pivot_offset_m`, and `up_axis` make the choice recoverable.

`EXPORT_UP_AXIS` is currently `'z'` because 3MF is Z-up and we do not yet
apply a Y-up rotation. The `base-center` preset reads this constant rather
than hardcoding the up axis, so swapping to Y-up export is a one-line
change here.

The viewer keeps `OrbitControls.target` on the post-bake bbox centre
regardless of the pivot mode, so rotation always feels centred. A small
`<axesHelper>` sits at the export pivot (local origin) so the user can
see where the GLB origin will be before exporting.

The 3MF write-back path (`exportRecolored3MF`) deliberately ignores the
export pivot. Shifting the model on the print bed would move it in the
slicer, which is rarely the user's intent. If a future "reposition for
slicing" toggle is added, it should plumb the meters offset through
`Metadata/model_settings.config` build-item transforms, not the vertex
data.

## `FrontSide` rendering is load-bearing

`glbBuilder.ts` sets `side: THREE.FrontSide` on `MeshStandardMaterial`. Don't flip this to `DoubleSide` unless you've confirmed the target 3MF has non-manifold meshes. 3MF files are slicer output → watertight with consistent CCW winding, so back-face culling is safe and **necessary** here: with `DoubleSide`, painted-region back faces bleed through the model at oblique camera angles and create phantom color zones.

## As-printed models from G-code (`src/lib/parseGcode.ts`, `src/lib/gcode/`)

A sliced `.gcode` / `.gcode.3mf` goes through `parseGcode` instead of `parse3MF` and comes out as the same `ParseResult` (plates of per-filament `MeshChunk`s in millimetres), with `sourceKind: 'gcode'`. Everything downstream (scene build, recolor, GLB / USDZ / OBJ, AR) is shared.

- **`readGcode.ts`** turns the toolpath into extrusion segments. Rules that are easy to get wrong:
  - **`G90` does not reset the E mode.** Slicers emit `M83` then `G90`; Klipper and the slicers keep E relative. Treating `G90` as "E absolute" makes every move after it read as a retraction.
  - **Bambu's `T255`, `T1000`, `T1100` are service codes**, not tools. Only `T0`..`T99` change the filament; otherwise a fake filament 1001 appears.
  - Arcs (`G2`/`G3`, both I/J and R forms) are split into chords; Bambu and Orca arc-fit heavily.
- **`beads.ts`** sweeps a stadium cross-section (flat top and bottom, round sides) along each joined run of moves. Its width comes from the plastic pushed, `area = E·π(d/2)² / length = (w − h)·h + π(h/2)²`, clamped near the slicer's `;WIDTH:` / `; LINE_WIDTH:` value; the toolpath Z is the top of the bead. Sharp corners (> 80°) start a new bead with end caps instead of a spiky mitre.
  - By default only what shows on the finished part is kept: outer walls, skins, bridges, overhangs, gap fill. Inner walls are kept only within a few layers of a top, bottom, bridge or overhang (where they show at rims and steps). Infill, supports, skirt, brim, prime tower and ironing are dropped. This cuts a typical part to about a third.
  - Output is **indexed** geometry (`MeshChunk.indices`): each ring vertex is written once and shared by the six triangles around it, so a print costs about a third of the bytes of a triangle soup. Buffers are sized by an exact count pass and filled once. Chunks are flagged `smoothShaded`; `weldSmoothMeshes` is a no-op for them now (it still welds any non-indexed smooth chunk).
  - Segments are a struct of typed arrays (`Segments`), not one object per move, and the reader scans lines by character code without slicing strings. A 148 MB, 5.6M-move file reads in about 3 s and sweeps in about 4 s.
  - **Face budget (`BeadOptions.faceBudget`)**: when the full-detail sweep would exceed it, fidelity steps down the `FIDELITY_LADDER` (simplify 0.01 to 0.2 mm, 6- to 4-sided beads, wider corner split, outer walls only) until the exact face count fits. Options given explicitly are pinned. `BeadStats.tier` reports where it landed. The viewer uses `BEAD_FACE_BUDGET_VIEWER` (6M), export `BEAD_FACE_BUDGET_EXPORT` (30M), the CLI none.
- **`src/workers/parseGcode.worker.ts`**: the web app parses G-code off the main thread and transfers the mesh buffers back, swept with the viewer budget. The `Segments` ride along on `ParseResult.gcodeSource`, and `printInfo.reducedDetail` says when the view was reduced. The library and CLI call `parseGcode` directly, with no budget.
- **Export at full detail (`src/hooks/exportScene.ts`)**: when the plate on screen was reduced, GLB / OBJ / AR do not clone the live scene. `sweepGcode.worker.ts` re-sweeps the stored segments with the export budget, `buildSceneFromPlate` builds a throwaway group with the current colours, pivot and rotation, the exporter runs on it, and the group is disposed. The Sign off ticket says which detail the file carries. Small prints (not reduced) keep the clone-the-live-scene path.
- **Picking**: bead meshes get a bounds-only `raycast` (`raycastBoundsOnly` in `glbBuilder.ts`), since a per-triangle raycast over millions of triangles on every pointer move stalled the page. Hover resolves to the first box the ray enters; a click runs one exact triangle pass over the bead meshes (`ColorableModel.handleClick`) so the selected tool is the one under the cursor.
- **Detection (`isGcodeFile`)**: a zip counts as G-code only when it holds plate G-code **and no mesh** in `3D/*.model`, because a saved Bambu project can carry plate G-code next to its design meshes.
- **3MF write-back** is disabled for G-code sources; there is no source 3MF to re-tint.

## Two versions of one part: Model / As printed

The store keeps `versions: { model, printed }` and `viewMode`; `parseResult` is always the version on screen, so every existing consumer works unchanged. `addVersion` loads the other version (G-code next to a 3MF or the reverse) and `setViewMode` switches.

- **Filaments are shared.** `addVersion` keeps the current slots (their edits and mixes) and only adds indices the new version uses, so a recolor shows on both. G-code tool `T0` is filament 1, as in the slicer.
- **No registration step.** Both versions are centred and floored by the same pivot rules, so a G-code sliced from the same project lines up by its bounding box. If the slicer scaled the part, `VersionToggle` reports it ("Printed at 116% of the model"); the as-printed version is the true size.
- **The camera keeps its angle on a switch.** `setViewMode` / `addVersion` bump `viewToggleSeq`; `CameraRig` sees the bump when the rebuilt scene publishes its dimensions and only follows the new bbox centre instead of re-homing. Any other change (plate, projection) still re-homes.

## The interface: a proof sheet (`src/components/proof/`)

The UI reads as a print shop's proof sheet, in dark: the 3D view sits on a sheet with crop marks (`ProofSheet`), the filaments run under it as a press color bar (`ColorBar`, clickable: same as clicking a zone on the model), and the right column is a job ticket that walks the job through four steps, `Open ✓ · Color · Proof · Sign off` (`StepNav`, `Tickets.tsx`). The steps are views over the same state, not a wizard: any step can be opened at any time, and the model, colors and camera stay put across them.

- **Open** (`UploadScreen`): takes a design `.3mf`, its sliced G-code, or both in one drop (`useOpenFiles` parses both before the editor opens, then shows the design).
- **Color**: zone list with face counts, the picker (incl. Snapmaker mix slots) and presets.
- **Proof**: the Design / As printed switch on the sheet, the slicer's facts read from the G-code (`ParseResult.printInfo`: slicer, nozzle, layers, time), and the "size changed" note when the slicer scaled the part (`useVersionInfo`). With one version loaded it offers to add the other (`useAddVersion`).
- **Sign off**: which version to export, GLB / AR / OBJ / 3MF, pivot and orientation.

Theme tokens live in `src/styles/globals.css` (`@theme`): neutral greys (the WYSIWYG rule below still holds: no tinted surround), IBM Plex Sans / Mono, and all `rounded-*` radii set to 0 (a proof sheet has no rounded cards; `rounded-full` dots and spinners are unaffected). Primary actions are ink on paper (`bg-tx text-bg`); the orange accent is rationed to step labels, links and warnings.

## State (`src/store/useAppStore.ts`)

Single Zustand store. Flow: `setFile` → `setLoading` → `setParsed(result)` (sets `isParsed=true`, auto-selects first plate) → user edits `filaments` via `setFilamentColor`. `App.tsx` switches between `UploadScreen` / `LoadingScreen` / `EditorScreen` based on these flags. With a design and its G-code loaded, see *Two versions of one part* above.

## Stack conventions

- React 19 + Three.js 0.183 + @react-three/fiber 9. `@types/three` is pinned — upgrading Three requires matching the types version.
- Styling is **Tailwind v4 via `@tailwindcss/vite`** (not PostCSS). No `tailwind.config` file; utilities are configured in CSS.
- The exporter `clone(true)`s the scene and disposes the clone after parsing — do not add logic that keeps references to the cloned tree.
