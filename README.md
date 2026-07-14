# Printproof

**See your print before you print it.**

The color-preserving `.3mf` → GLB converter — recolor, preview true-size in
AR, and export, all in your browser.

**When you convert a multi-color `.3mf` to mesh, most converters export a bare
geometry and discard the slicer's paint data. As far as I can find, this is
the first tool that carries those per-face color zones all the way to GLB —
then lets you recolor them in the browser, reorient and scale the model for
AR, and export GLB / USDZ / OBJ / a re-tinted `.3mf`. Works with any Bambu Studio,
OrcaSlicer, or Snapmaker U1 file; they share the same on-disk encoding.
100% client-side, MIT-licensed, no telemetry.**

[![Live demo](https://img.shields.io/badge/demo-live-2ea44f?style=for-the-badge)](https://samisalah221.github.io/3mf-to-glb/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](./LICENSE)
[![Snapmaker U1](https://img.shields.io/badge/Snapmaker-U1-ff7a00?style=for-the-badge)](https://snapmaker.com/)
[![Built with React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-0.183-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org)
[![3MF standard](https://img.shields.io/badge/3MF-ISO%2FIEC%2014739-0a7bbb?style=for-the-badge)](https://3mf.io/)

![hero demo](./docs/hero.gif)

> Open a multi-color `.3mf`, recolor any zone in real time, and download a
> GLB for the web, a USDZ for iOS Quick Look, or a fresh `.3mf` that slices
> in OrcaSlicer / Bambu / Snapmaker U1. Or hit **View in AR** on a phone to
> see the recolored model at true print size in your own room — before you
> spend filament. Everything runs in the browser. Your files never leave
> your machine.

## Try it now

**→ <https://samisalah221.github.io/3mf-to-glb/>**

No sign-up, no upload. If you don't have a `.3mf` handy, hit
**"Try sample · owl (Bambu)"** or **"Try sample · sea slug (U1)"** on the
upload screen, or grab one of the fixtures in [`samples/`](./samples) and
drop it on the page.

> **Snapmaker U1 Innovation Fund submission:** project description and
> checklist → [`SNAPMAKER_FUND.md`](./SNAPMAKER_FUND.md).

## Why this project exists

Slicers like Bambu Studio, OrcaSlicer, and Snapmaker U1 offer increasingly
powerful color authoring tools — per-face painters, gradient fills, image
projection. But once a multi-color print is sliced, that color data is
effectively stuck inside the slicer file. You can't preview the recolored
print on a product page, you can't share it in AR, you can't iterate the
palette without reopening the slicer, and you can't hand the model to a
designer in Blender. There was no way to actually **see** a print — in your
colors, at true size, in your own space — before committing filament to it.

This project exists to close that gap. It parses the open 3MF archive,
decodes the proprietary per-face color extensions layered on top of it, lets
you recolor zones live in a browser viewport and preview the result in AR,
and emits open formats so the model can move freely through the rest of the
3D ecosystem:

- **[Khronos glTF / GLB](https://www.khronos.org/gltf/)** for Blender, Three.js,
  Unity, `<model-viewer>`, and product pages.
- **USDZ** for Apple Quick Look and iOS AR.
- **3MF** with refreshed filament colors so the file drops straight back into
  OrcaSlicer / Snapmaker U1 and slices.

It's built in the same spirit as
[OrcaSlicer](https://github.com/SoftFever/OrcaSlicer),
[Klipper](https://www.klipper3d.org/),
[Moonraker](https://github.com/Arksine/moonraker), and
[Fluidd](https://docs.fluidd.xyz/): open code, open formats, no telemetry,
no vendor lock-in.

## Why nothing else does this

Every other 3MF-to-mesh converter I've found throws the paint data away —
because the per-face color encoding Bambu Studio and its forks use is
**undocumented**, and Snapmaker U1's Full Spectrum mixed-filament blends are a
second undocumented layer on top of that. There's no public spec for either.
To make color survive the trip to GLB, both formats had to be
reverse-engineered first.

The per-face format is a nibble-packed recursive triangle-subdivision tree,
read right-to-left, with state-overflow encoding once you're past 4
extruders. That decoder, and the exact triangle subdivision that reproduces
the slicer's paint zone for zone instead of guessing a dominant color, is
[fully documented, down to the bit level](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).
Full Spectrum mixed filaments are virtual extruders whose color is a pigment
blend of two physical ones, defined in a packed row grammar with enumeration
rules that silently reassign painted faces if you get them wrong — see
[`docs/SNAPMAKER_FULL_SPECTRUM.md`](./docs/SNAPMAKER_FULL_SPECTRUM.md) and the
write-up below. That's the actual moat here: once color survives the
conversion, everything else — live recoloring, true-size AR, re-tinted 3MF
export — is just what you can finally *do* with a print you can now see
before you make it.

## Features

- **Decodes the proprietary per-face paint extension** used by Bambu Studio,
  OrcaSlicer, and Snapmaker U1: a nibble-packed recursive
  triangle-subdivision tree, reverse-engineered and
  [fully documented](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).
- **Rebuilds painted geometry exactly, rather than approximating it.** Each
  painted triangle is subdivided the way the slicer subdivides it, so a
  brush stroke covering four percent of one triangle survives as four
  percent of one triangle. The decode is slicer-identical by default, and
  color-boundary T-junctions are stitched closed so the mesh stays
  watertight; a face budget only coarsens meshes so densely painted they
  would otherwise explode. Tools that roll a triangle up to a single
  "dominant" color silently erase small paint on coarse meshes and can only
  place a color boundary along an edge that already exists in the mesh.
- **Handles layer-mode coloring**, including U1 Full Spectrum gradients and
  Bambu's MultiAsSingle mode, via Z-plane triangle clipping. Tool-change
  G-code becomes real geometry zones with no slicer in the loop.
- **Snapmaker U1 Full Spectrum mixed filaments.** Parses `mixed_filament_definitions`
  virtual extruders (pigment blends of two physical filaments), enumerates
  only enabled/non-deleted rows the way the slicer itself does, and blends
  colors through a pigment-mixing model rather than naive linear-RGB
  averaging — so a navy + yellow blend renders the actual green the slicer
  would produce, not a muddy average. See
  [`docs/SNAPMAKER_FULL_SPECTRUM.md`](./docs/SNAPMAKER_FULL_SPECTRUM.md).
- **Interactive 3D editor.** Recolor any zone with a color picker; changes
  update live in the Three.js viewport.
- **PBR GLB export.** One glTF material per color zone, correct sRGB to
  linear conversion, ready for Blender, Unity, WebGL, and product pages.
- **Per-vertex-color OBJ export.** The same scene as a single self-contained
  Wavefront OBJ: colors ride on the vertices (`v x y z r g b`, sRGB), the
  extension MeshMixer's coloring mode and Bambu Studio's OBJ import read, so
  there is no separate MTL to keep alongside it. Vertices are in millimeters
  and the color you picked is the color that loads.
- **3MF re-tint round-trip.** Re-emit the source 3MF with new filament
  colors, geometry and `paint_color` zones intact. The output drops back
  into OrcaSlicer / Snapmaker U1 and slices.
- **USDZ export and View-in-AR.** Preview the recolored model in iOS Quick
  Look (USDZ) or an in-page WebXR session on Android (GLB via
  `<model-viewer>`) from the live demo, fully client-side. See your print
  at true size in your own room before you spend filament.
- **Real-world scale.** The `<model unit>` from the source 3MF is parsed
  (micron, millimeter, centimeter, inch, foot, meter), baked into the
  exported vertex positions in meters, and surfaced as `asset.extras` on
  the GLB plus a W × H × D readout in the viewport. AR launchers lock the
  model to its true size, so a 100 mm cube shows up as a 10 cm cube.
- **Configurable export pivot.** Choose where the model origin should sit
  in the exported GLB/USDZ (base-center for AR floor placement, bbox-center,
  area-weighted centroid, original 3MF origin, or a custom mm offset). The
  translation is baked into vertex positions so the file is self-contained;
  `asset.extras.pivot_mode`, `pivot_offset_m`, and `up_axis` make the choice
  recoverable downstream. The 3MF write-back path is deliberately exempt:
  shifting the model on the print bed is not what you want when re-slicing.
- **Export-time reorientation.** Rotate the model before export with
  world-axis ±90° snaps or numeric XYZ degrees, then "lay flat on floor" to
  re-rest it on the AR ground plane. The rotation is baked into the GLB/USDZ
  vertex positions and normals, and the pivot is recomputed from the rotated
  bounding box, so a Z-up print ships as a correctly-standing, floor-anchored
  AR model. The orientation is recorded as `asset.extras.applied_rotation_euler_deg`
  and `applied_rotation_quat`; the 3MF write-back is left unrotated so it
  re-slices in its original print-bed layout.
- **Works across the Bambu / OrcaSlicer / Snapmaker U1 family.** Same `paint_color`
  encoding, same plate/object model, no per-vendor branching in the parser.
- **100% client-side.** Pure static site, no backend, no telemetry. Works
  offline after first load.

## How it works

```
┌────────────┐     ┌──────────────┐     ┌─────────────────────┐     ┌─────────┐
│ Upload 3MF │ ──▶ │  Parse OPC   │ ──▶ │ Subdivide painted   │ ──▶ │ Render  │
│  (ZIP)     │     │  + XML files │     │ tris, clip Z zones  │     │ 3D view │
└────────────┘     └──────────────┘     └─────────────────────┘     └────┬────┘
                                                                         │
                                                                         ▼
                                                            ┌─────────────────────┐
                                                            │ Export GLB / USDZ / │
                                                            │ OBJ / 3MF           │
                                                            └─────────────────────┘
```

## Quick start (local dev)

```bash
git clone https://github.com/SamiSalah221/3mf-to-glb.git
cd 3mf-to-glb
npm install
npm run dev
```

Then open the Vite URL (usually `http://localhost:5173`) and drop a `.3mf` file
on the page.

```bash
npm run build           # Production build of the web app into dist/
npm run preview         # Preview the production build
npm run lint            # ESLint
npm run build:lib       # Build the headless library + CLI into dist-lib/
npm run test:roundtrip  # End-to-end smoke test across samples/
```

## Use it from Node (CLI)

The same parser that drives the web app is also published as a Node CLI for
batch jobs, build pipelines, and headless renderers. No backend required.

```bash
# Convert a 3MF to GLB, recolor filaments 1 and 2 in the process:
npx 3mf-to-glb model.3mf -o recolored.glb --recolor "1=#cc0000,2=#000000"

# Pick a specific plate from a multi-plate file:
npx 3mf-to-glb model.3mf --plate 2 -o plate2.glb

# Reorient a Z-up print to glTF Y-up while exporting:
npx 3mf-to-glb model.3mf --rotation "90,0,0" -o yup.glb

# Write a per-vertex-color Wavefront OBJ instead (one self-contained file):
npx 3mf-to-glb model.3mf -o model.obj
```

Flags:

| Flag | Description |
|------|-------------|
| `-o, --output <file>` | Output path. Defaults to the input name with `.glb`. An `.obj` extension writes a single per-vertex-color OBJ (no MTL). |
| `--plate <id>` | 1-based plate id (matches Bambu / Orca / U1 `plater_id`). Defaults to the first plate. |
| `--recolor <map>` | Comma-separated `index=hex` pairs applied before export. Hex may include or omit the leading `#`. |
| `--pivot <mode>` | Export pivot: `base-center` (default), `bbox-center`, `centroid`, `original`, `custom`. |
| `--rotation <x,y,z>` | XYZ Euler rotation in degrees, baked into geometry before the pivot. Try `"90,0,0"` to reorient a Z-up source to glTF Y-up. |
| `-h, --help` | Show full help. |

## Use it from your own code (library)

The package exports a small, framework-agnostic API. Three.js is the only
runtime dependency for GLB emission; the parser itself is pure TypeScript.

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { DOMParser } from '@xmldom/xmldom';
import {
  setDefaultDomParser,
  parse3MF,
  applyRecolor,
  buildSceneFromPlate,
  buildGLBBytes,
} from '3mf-to-glb';

// In Node, inject the XML parser once at startup. In the browser, omit
// this — the global DOMParser is used automatically.
setDefaultDomParser(new DOMParser());

const buf = await readFile('model.3mf');
const parsed = await parse3MF(buf);
const recolored = applyRecolor(parsed, { 1: '#FF0000', 2: '#00FF00' });
const scene = buildSceneFromPlate(recolored.plates[0].meshChunks, recolored.filaments);
const bytes = await buildGLBBytes(scene);
await writeFile('out.glb', bytes);
```

For the one-shot common case there is also a `convertToGLB(buffer, options)`
convenience that wraps the four calls above, and `convertToOBJ(buffer, options)`
which returns `{ obj }`: a single per-vertex-color OBJ body as a string.

Swap the last two lines for `buildOBJ(scene)` to get `{ obj, stats }` directly,
or `buildOBJBytes(scene)` for the encoded `Uint8Array`. The OBJ is
self-contained: colors ride on the `v` lines (`x y z r g b`, sRGB), so there is
nothing else to write next to it.

## Under the hood

### Reverse-engineering the slicer `paint_color` encoding

BambuStudio / OrcaSlicer (and other forks using the same encoding) store
per-face filament assignments in a proprietary binary format: a
**nibble-packed recursive triangle-subdivision tree, read right-to-left, with
extended state overflow handling for 16+ extruders**. No public documentation
exists for this format — it was reverse-engineered from hex dumps of
known-colored meshes and re-implemented in TypeScript.

The full technical spec lives in
[`docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).

### Subdividing painted triangles instead of voting on them

Decoding the tree is only half the problem. The obvious shortcut is to walk a
triangle's tree, take whichever color covers most of it, and paint the whole
triangle that color. That shortcut is wrong in two ways, and both are visible:

- On a coarse mesh the paint disappears. A cube face is two triangles; text
  written across it covers a few percent of each. "Mostly unpainted" wins
  every vote, and the cube renders blank.
- A color boundary can only ever land on an edge the mesh already has, so
  painted regions bleed into their neighbours along the original
  triangulation. This produced a white-seam artifact that took a while to
  attribute to the decoder rather than the renderer.

So the parser reproduces the slicer's own subdivision: rotate the triangle so
the encoded "special side" leads, insert exact edge midpoints, and emit the
children in the same winding and the same order the slicer wrote them (they
are serialized last-child-first, a detail a vote can ignore and geometry
cannot). Midpoints are deduplicated across the mesh, so triangles that share
an edge share the vertex on it and the surface stays watertight. A leaf of the
tree becomes a triangle, and its color zone is exact.

By default the tree is decoded **exactly**: every leaf becomes its own
triangle, so the color zones are geometrically identical to what the slicer
painted, down to a one-millimeter dot on a large panel. A safety cutoff only
engages as a fallback, and only for a mesh whose exact decode would blow a
per-mesh face budget (1.5 million pre-repair faces). When it does engage, the
parser seeds a floor of about 0.4% of the bounding-box diagonal (capped at a
0.4 mm absolute minimum, roughly one nozzle width), collapses any sub-triangle
below it to whichever color covers the most area, and doubles that floor until
a face-count estimate (a count-only mirror of the real decode) fits the budget.

The distinction matters in both directions. A densely painted 896k-triangle
owl decodes to 18.7 million triangles and about a gigabyte of vertex data, far
over budget, so it takes the fallback and coarsens to roughly one million faces
with no loss anything could resolve. But a lightly painted panel whose 1 mm to
3 mm slicer dots decode to only 1.08 million faces now stays under budget and
renders exactly, where an earlier always-on 0.4 mm floor used to quantize those
dots into visible triangle confetti.

### Stitching color-boundary cracks

Subdividing one triangle but not its neighbour leaves a T-junction: the
subdivided side gains a vertex at an edge midpoint that the adjacent face never
got, because that face was unpainted, coarser, or collapsed by the budget
fallback. A T-junction is a real hole. It shows up as a hairline crack along
color boundaries in both the GLB and the OBJ, and it breaks watertightness for
anyone who reimports the mesh. After subdivision the parser walks the emitted
faces and stitches those seams closed, so each recolored zone meets its
neighbour cleanly and the exported mesh stays watertight.

### Instanced parts and their extruders

A Bambu `model_settings.config` lists an object's `<part>` elements in the
same order as that object's `<component>` elements, and identifies each part
by the id of the mesh it points at. When a project reuses one mesh several
times, which is exactly what "stamp this shape three times in three colors"
produces, that id repeats. Keying part metadata on the id therefore keeps
only the last instance and paints every copy the same color. The parts are
matched positionally instead, with an id lookup kept as a fallback for files
where the two lists disagree.

### Decoding U1 Full Spectrum mixed filaments

Snapmaker U1 Full Spectrum projects add a second layer on top of the shared
paint-tree encoding: **mixed filaments**, virtual extruders whose color is a
pigment blend of two physical filaments. These are defined in
`project_settings.config` under `mixed_filament_definitions` — a `;`/`,`-packed
row grammar (15+ fields in the modern dialect, 4 in the legacy one) with no
public documentation. It was decoded from the open
[ratdoux/OrcaSlicer-FullSpectrum](https://github.com/ratdoux/OrcaSlicer-FullSpectrum)
fork's C++ (`MixedFilament.{hpp,cpp}`) and validated against real U1 sample
files.

Getting it right required matching a few non-obvious rules the slicer itself
enforces:

- **Virtual extruder ids count only enabled, non-deleted rows.** The slicer's
  `mixed_index_from_filament_id` skips disabled rows and `d1`-tombstoned rows
  entirely — they consume no index. One of this project's U1 sample files
  leads with 6 disabled tombstone rows; enumerating over every row instead of
  just the surviving ones silently reassigns roughly 84,000 painted faces to
  the wrong blend recipe.
- **`mix_b_percent` is component *B*'s share, not A's** (`ratioA = (100 −
  mix_b) / 100`), and an `r<k>/<wA>/<wB>` token overrides that percentage with
  explicit weights. `u<N>` is a persistent label, not a slot index — it can
  skip values.
- **Blending uses a pigment-mixing model, not a linear-RGB average.** The
  slicer runs blends through `FilamentMixer`, a degree-4 polynomial
  approximating Mixbox, ported to
  [`src/lib/filamentMixer.ts`](./src/lib/filamentMixer.ts). Navy + yellow
  renders as the green the slicer actually shows; a naive linear-RGB lerp
  gives a muddy khaki instead.

Both U1 sample fixtures in [`samples/`](./samples) exercise this path, and
`scripts/test-roundtrip.mjs` asserts specific resolved blend ratios in CI on
every PR. Full write-up (row grammar, field-by-field semantics, and the
scope of what's still unimplemented) in
[`docs/SNAPMAKER_FULL_SPECTRUM.md`](./docs/SNAPMAKER_FULL_SPECTRUM.md).

### Z-plane triangle clipping

Some 3MFs color geometry via *layer height* rather than per-face — the
so-called `MultiAsSingle` mode, where the slicer injects G-code tool-changes
at specific Z heights. To convert that into static geometry, the tool
implements progressive Z-plane triangle clipping with boundary splitting,
turning each layer-range into an independent colored zone.

### 3MF → glTF material pipeline

- ZIP/OPC archive parsing via [JSZip](https://github.com/Stuk/jszip).
- XML correlation across `3dmodel.model`, `model_settings.config`,
  `project_settings.config`, and `custom_gcode_per_layer.xml` with
  [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser).
- Affine transform composition across component → object → plate coordinate
  spaces.
- sRGB → linear color-space conversion for PBR-correct rendering.
- Per-zone PBR material generation via
  [@gltf-transform/core](https://github.com/donmccurdy/glTF-Transform).

## Tech stack

| Layer | Tool |
|-------|------|
| Language | TypeScript |
| Frontend | React 19, Vite 7 |
| 3D rendering | Three.js, React Three Fiber, Drei |
| State | Zustand |
| File I/O | JSZip, fast-xml-parser, @gltf-transform/core |
| Styling | Tailwind CSS v4 |

## Project structure

```
3mf-to-glb/
├── src/
│   ├── lib/              # Core parsing and conversion logic
│   │   ├── parse3MF.ts          # 3MF ZIP/XML parsing + paint_color subdivision
│   │   ├── colorConvert.ts      # sRGB ↔ linear color space conversion
│   │   ├── glbBuilder.ts        # Geometry → glTF document construction
│   │   ├── glbExporter.ts       # GLB binary export
│   │   └── objExporter.ts       # Per-vertex-color Wavefront OBJ export
│   ├── components/       # React UI
│   ├── viewer/           # Three.js / R3F scene
│   ├── store/            # Zustand state
│   ├── types/            # Shared TypeScript types
│   └── styles/           # CSS
├── samples/              # Example .3mf files
└── docs/                 # Technical write-ups
```

## Roadmap

Already shipped:

- Open browser-based preview and recolor tool with a face-on viewport,
  per-zone color picker, and live recoloring. Tone-mapping and Environment
  IBL pinned off so the picked hex is the rendered hex.
- Reverse-engineered decoder for the Bambu / OrcaSlicer / Snapmaker U1
  `paint_color` per-face subdivision tree. Full spec at
  [`docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).
- Layer-mode coloring via Z-plane triangle clipping. Covers Snapmaker U1
  Full Spectrum gradients and Bambu's MultiAsSingle mode without a slicer.
- Snapmaker U1 Full Spectrum mixed-filament support: virtual extruder
  enumeration matching the slicer's own enabled/non-deleted row rules, and
  pigment-model color blending instead of linear-RGB averaging. See
  [`docs/SNAPMAKER_FULL_SPECTRUM.md`](./docs/SNAPMAKER_FULL_SPECTRUM.md).
- Headless TypeScript library (`3mf-to-glb`) usable from Node and the browser,
  plus a `3mf-to-glb` Node CLI for batch jobs and build pipelines.
- 3MF re-tint round-trip: re-export the source archive with new filament
  colors and have it slice cleanly in OrcaSlicer / Snapmaker U1.
- USDZ export and a platform-aware "View in AR" launcher: Quick Look on iOS
  (USDZ, `allowsContentScaling=0`), an in-page WebXR session on Android via
  `<model-viewer ar-scale="fixed">`, and a GLB download on desktop. True-size
  AR: the source 3MF unit is baked into the exported vertex positions in
  meters, so AR previews show true print size, not a pinch-zoomable
  cartoon.
- Configurable export pivot and export-time reorientation: choose where the
  model origin sits (base-center, bbox-center, centroid, original, or a custom
  mm offset) and rotate with world-axis ±90° snaps or numeric XYZ degrees. Both
  bake into the GLB/USDZ vertex positions, are recorded in `asset.extras`, and
  are exposed on the CLI as `--pivot` and `--rotation`.
- One-click sample loading on the live demo — a Bambu Studio fixture and a
  Snapmaker U1 fixture — plus a curated set of multi-color 3MF fixtures in
  [`samples/`](./samples).
- CI (lint, web build, library build, CLI smoke, four-sample round-trip) on
  every PR.
- Exact geometric subdivision of painted triangles, replacing the per-triangle
  dominant-color rollup that erased small paint on coarse meshes and bled
  color across boundaries. The decode is slicer-identical by default, with a
  per-mesh face budget that coarsens only the densest meshes as a fallback, and
  color-boundary T-junctions are repaired so the exported GLB and OBJ stay
  watertight.
- Positional matching of `<part>` metadata to `<component>` instances, so a
  mesh reused several times in one object keeps a different filament per copy.
- Per-vertex-color OBJ export, a single self-contained file in the browser and
  from the CLI (`-o model.obj`), with sRGB colors on the `v` lines and vertices
  in millimeters. Coincident corners are welded into one shared pool so the
  mesh reads as watertight.

Near-term work, in rough priority order:

- Snapmaker U1 Surface Color Stitch image-projection support (texture-2d
  read + recolor + re-pack). Scope and plan in
  [`docs/SNAPMAKER_FULL_SPECTRUM.md`](./docs/SNAPMAKER_FULL_SPECTRUM.md).
- Zone re-painting (not just re-tinting): change which extruder owns which
  face. Requires extending the decoder to keep full subdivision trees.
- Optional [lib3mf WASM](https://github.com/3MFConsortium/lib3mf) validator
  backend so the parser is checkable against the official 3MF Consortium
  conformance suite. Scope and plan in
  [`docs/LIB3MF_INTEGRATION.md`](./docs/LIB3MF_INTEGRATION.md).
- Preset palettes matching common Snapmaker U1 and open-ecosystem filament
  packs.
- GLB export presets tuned for popular open viewers (Blender,
  [`<model-viewer>`](https://modelviewer.dev/), the Three.js editor).
- Optional [`gltf-transform`](https://gltf-transform.dev/) mesh-optimization
  pass (Draco / Meshopt) for lightweight AR and web delivery.

These are honest near-term intentions, not commitments contingent on funding.

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for dev
setup, code layout, and good first-issue ideas. All participation is governed
by the [Code of Conduct](./CODE_OF_CONDUCT.md).

If you find a parsing bug, the **most helpful bug report** includes the
offending `.3mf` file (or a minimal repro) and a note on how it was produced.

## Security

Report vulnerabilities privately via
[GitHub security advisories](https://github.com/SamiSalah221/3mf-to-glb/security/advisories/new).
See [SECURITY.md](./SECURITY.md) for scope.

## License

[MIT](./LICENSE) © 2026 Sami Salah

## Author

Built by **[Sami Salah](https://github.com/SamiSalah221)**.

## Acknowledgments

- [Three.js](https://threejs.org) + [React Three Fiber](https://r3f.docs.pmnd.rs) for the rendering stack.
- [@gltf-transform/core](https://github.com/donmccurdy/glTF-Transform) — excellent glTF authoring library by Don McCurdy.
- [JSZip](https://github.com/Stuk/jszip) and [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) for browser-side file parsing.
- The [3MF Consortium](https://3mf.io/) for the open ISO/IEC 14739 container spec and the [lib3mf](https://github.com/3MFConsortium/lib3mf) reference implementation.
- The [Khronos Group](https://www.khronos.org/gltf/) for the open glTF / GLB runtime asset format.
- [OrcaSlicer](https://github.com/SoftFever/OrcaSlicer) — the open BambuStudio fork that drives much of the U1 / multi-color ecosystem.
- [Klipper](https://www.klipper3d.org/), [Moonraker](https://github.com/Arksine/moonraker), and [Fluidd](https://docs.fluidd.xyz/) — open firmware and tooling this project is built alongside.
- [Snapmaker](https://snapmaker.com/) for open-sourcing the U1 firmware and launching the U1 Innovation Fund to support open community work.
- The BambuLab community for documenting slicer behavior in the wild.

<sub>This project is an independent community effort. It is not affiliated with
or endorsed by Snapmaker, Bambu Lab, or OrcaSlicer. Trademarks belong to
their respective owners; product names are referenced for interoperability.</sub>
