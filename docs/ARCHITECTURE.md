# Architecture

Internal design notes for the 3MF Color Customizer. Read this before changing the parser or the viewer — most of the rules here exist because reverting them re-introduces a visible bug.

For the on-disk 3MF format itself, see [`3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md). This document covers how *our* code consumes that format.

## Pipeline

The app is a **pure client-side pipeline** that converts Bambu Studio `.3mf` archives into recolorable GLB exports. No backend.

```
.3mf (ZIP) → parse3MF() → ParseResult { plates[], filaments[] }
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

## State (`src/store/useAppStore.ts`)

Single Zustand store. Flow: `setFile` → `setLoading` → `setParsed(result)` (sets `isParsed=true`, auto-selects first plate) → user edits `filaments` via `setFilamentColor`. `App.tsx` switches between `UploadScreen` / `LoadingScreen` / `EditorScreen` based on these flags.

## Stack conventions

- React 19 + Three.js 0.183 + @react-three/fiber 9. `@types/three` is pinned — upgrading Three requires matching the types version.
- Styling is **Tailwind v4 via `@tailwindcss/vite`** (not PostCSS). No `tailwind.config` file; utilities are configured in CSS.
- The exporter `clone(true)`s the scene and disposes the clone after parsing — do not add logic that keeps references to the cloned tree.
