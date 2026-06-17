# 3MF Color Customizer for Snapmaker U1

**An open color customizer for the Snapmaker U1 multi-color ecosystem. Open a
`.3mf`, recolor zones in the browser, export GLB, USDZ, or a sliceable 3MF
that drops straight back into OrcaSlicer. The same code path handles any
Bambu Studio or OrcaSlicer file because they share the same on-disk encoding.
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
> in OrcaSlicer / Snapmaker U1. Everything runs in the browser. Your files
> never leave your machine.

## Try it now

**→ <https://samisalah221.github.io/3mf-to-glb/>**

No sign-up, no upload. If you don't have a `.3mf` handy, hit
**"Try with a Snapmaker U1 / OrcaSlicer sample"** on the upload screen, or
grab one of the fixtures in [`samples/`](./samples) and drop it on the page.

## For the Snapmaker U1 Innovation Fund

A one-page project description written for the Fund judges (with the
submission checklist) is at [`SNAPMAKER_FUND.md`](./SNAPMAKER_FUND.md).

## Why this project exists

Color data in modern multi-color 3D printing is increasingly trapped inside
**vendor-specific slicer extensions** layered on top of the open
[ISO/IEC 14739 3MF](https://3mf.io/) container. The Snapmaker U1 ships with
some of the most interesting color authoring tools on any consumer printer
right now (Full Spectrum gradients, Surface Color Stitch image projection,
plus the OrcaSlicer-derived multi-material painter), but once a multi-color
print is sliced, the color information is effectively stuck inside the
slicer file. You can't preview the recolored print on a product page, you
can't share it in AR, you can't iterate the palette without reopening the
slicer, and you can't hand the model to a designer in Blender.

This project liberates that data. It parses the open 3MF archive, decodes
the proprietary per-face color extensions on top of it, lets you recolor
zones in a browser viewport, and emits open formats so the model can move
freely through the rest of the 3D ecosystem:

- **[Khronos glTF / GLB](https://www.khronos.org/gltf/)** for Blender, Three.js,
  Unity, `<model-viewer>`, and product pages.
- **USDZ** for Apple Quick Look and iOS AR.
- **3MF** with refreshed filament colors so the file drops straight back into
  Snapmaker Orca / OrcaSlicer and slices.

It's built in the same spirit as
[OrcaSlicer](https://github.com/SoftFever/OrcaSlicer),
[Klipper](https://www.klipper3d.org/),
[Moonraker](https://github.com/Arksine/moonraker), and
[Fluidd](https://docs.fluidd.xyz/): open code, open formats, no telemetry,
no vendor lock-in.

## Features

- **Decodes the proprietary per-face paint extension** used by the
  Snapmaker U1, OrcaSlicer, and Bambu family: a nibble-packed recursive
  triangle-subdivision tree, reverse-engineered and
  [fully documented](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).
- **Handles layer-mode coloring**, including U1 Full Spectrum gradients and
  Bambu's MultiAsSingle mode, via Z-plane triangle clipping. Tool-change
  G-code becomes real geometry zones with no slicer in the loop.
- **Interactive 3D editor.** Recolor any zone with a color picker; changes
  update live in the Three.js viewport.
- **PBR GLB export.** One glTF material per color zone, correct sRGB to
  linear conversion, ready for Blender, Unity, WebGL, and product pages.
- **3MF re-tint round-trip.** Re-emit the source 3MF with new filament
  colors, geometry and `paint_color` zones intact. The output drops back
  into OrcaSlicer / Snapmaker U1 and slices.
- **USDZ export and View-in-AR.** Preview the recolored model in iOS Quick
  Look (USDZ) or Android Scene Viewer (GLB) from the live demo, fully
  client-side. Useful for previewing a print before you spend filament.
- **Works across the U1 / OrcaSlicer / Bambu family.** Same `paint_color`
  encoding, same plate/object model, no per-vendor branching in the parser.
- **100% client-side.** Pure static site, no backend, no telemetry. Works
  offline after first load.

## How it works

```
┌────────────┐     ┌──────────────┐     ┌─────────────────────┐     ┌─────────┐
│ Upload 3MF │ ──▶ │  Parse OPC   │ ──▶ │ Decode colors +     │ ──▶ │ Render  │
│  (ZIP)     │     │  + XML files │     │ clip Z-plane zones  │     │ 3D view │
└────────────┘     └──────────────┘     └─────────────────────┘     └────┬────┘
                                                                         │
                                                                         ▼
                                                                  ┌─────────────┐
                                                                  │ Export GLB  │
                                                                  │ (download)  │
                                                                  └─────────────┘
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
```

Flags:

| Flag | Description |
|------|-------------|
| `-o, --output <file>` | Output GLB path. Defaults to the input name with `.glb`. |
| `--plate <id>` | 1-based plate id (matches Bambu / Orca / U1 `plater_id`). Defaults to the first plate. |
| `--recolor <map>` | Comma-separated `index=hex` pairs applied before export. Hex may include or omit the leading `#`. |
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
convenience that wraps the four calls above.

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
│   │   ├── parse3MF.ts          # 3MF ZIP/XML parsing + paint_color decoder
│   │   ├── colorConvert.ts      # sRGB ↔ linear color space conversion
│   │   ├── glbBuilder.ts        # Geometry → glTF document construction
│   │   └── glbExporter.ts       # GLB binary export
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

- Open browser-based color customizer with face-on viewport, per-zone color
  picker, and live recoloring. Tone-mapping and Environment IBL pinned off so
  the picked hex is the rendered hex.
- Reverse-engineered decoder for the Bambu / OrcaSlicer / Snapmaker U1
  `paint_color` per-face subdivision tree. Full spec at
  [`docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).
- Layer-mode coloring via Z-plane triangle clipping. Covers Snapmaker U1
  Full Spectrum gradients and Bambu's MultiAsSingle mode without a slicer.
- Headless TypeScript library (`3mf-to-glb`) usable from Node and the browser,
  plus a `3mf-to-glb` Node CLI for batch jobs and build pipelines.
- 3MF re-tint round-trip: re-export the source archive with new filament
  colors and have it slice cleanly in OrcaSlicer / Snapmaker U1.
- USDZ export and a platform-aware "View in AR" launcher (Quick Look on iOS,
  Scene Viewer on Android, GLB download on desktop).
- One-click "Try with U1 sample" entry point on the live demo and a curated
  set of multi-color 3MF fixtures in [`samples/`](./samples).
- CI (lint, web build, library build, CLI smoke, four-sample round-trip) on
  every PR.

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
