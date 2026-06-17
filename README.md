# 3MF Color Customizer

**Open-source, browser-based color editor for multi-color 3MF files.
Drop a `.3mf` from any modern slicer, recolor every zone, export a clean GLB.
No installs, no uploads, no servers.**

[![Live demo](https://img.shields.io/badge/demo-live-2ea44f?style=for-the-badge)](https://samisalah221.github.io/3mf-to-glb/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](./LICENSE)
[![Built with React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-0.183-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org)
[![3MF standard](https://img.shields.io/badge/3MF-ISO%2FIEC%2014739-0a7bbb?style=for-the-badge)](https://3mf.io/)

![hero demo](./docs/hero.gif)

> Drop a multi-color `.3mf` file, recolor any zone in real time, and download
> a production-ready `.glb`. Everything runs client-side — your files never
> leave your machine.

## Try it now

**→ <https://samisalah221.github.io/3mf-to-glb/>**

No sign-up, no upload. If you don't have a `.3mf` handy, grab one of the
example files in [`samples/`](./samples) and drop it on the page.

## Why this project exists

Color data in modern multi-color 3D printing is increasingly trapped inside
**vendor-specific slicer extensions** layered on top of the open
[ISO/IEC 14739 3MF](https://3mf.io/) container. A multi-color print is a
beautiful object — but the moment you want to take it out of the slicer
ecosystem (render it for a product page, drop it into a Blender scene, ship
it to an AR viewer, share it on the web), the color information is stuck.

This project liberates that data. It parses the open 3MF archive, decodes the
proprietary per-face color extensions that slicers layer on top, and emits
standard **[Khronos glTF / GLB](https://www.khronos.org/gltf/)** so the model
can be opened in Blender, Three.js, Unity, `<model-viewer>`, AR quick-look,
and any other tool in the open 3D ecosystem.

It's built in the same spirit as
[OrcaSlicer](https://github.com/SoftFever/OrcaSlicer),
[Klipper](https://www.klipper3d.org/),
[Moonraker](https://github.com/Arksine/moonraker), and
[Fluidd](https://docs.fluidd.xyz/) — open code, open formats, no telemetry,
no vendor lock-in.

## Features

- **Decodes proprietary per-face paint extensions** (Bambu / OrcaSlicer / U1
  family — a nibble-packed recursive triangle-subdivision tree,
  reverse-engineered and
  [fully documented](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md)).
- **Handles layer-based coloring** — `MultiAsSingle` mode is supported via
  Z-plane triangle clipping, so tool-change G-code becomes real geometry zones.
- **Interactive 3D editor** — re-paint any color zone with a color picker,
  changes update live in the Three.js viewport.
- **PBR GLB export** — one glTF material per color zone, correct sRGB → linear
  conversion, ready for Blender / Unity / WebGL / AR.
- **Works with the U1 / OrcaSlicer ecosystem** — same `paint_color` encoding,
  same plate/object model, no per-vendor branching in the parser.
- **100% client-side** — pure static site, no backend, no telemetry, works
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

Near-term work, in rough priority order:

- Native OrcaSlicer / Snapmaker U1 sample 3MF fixtures in
  [`samples/`](./samples), with a one-click "Try with U1 sample" entry point
  on the live demo.
- Drop-in [lib3mf WASM](https://github.com/3MFConsortium/lib3mf) backend so
  the parser passes the official 3MF Consortium conformance suite, replacing
  the current hand-rolled cascade as the default.
- Preset palettes matching common Snapmaker U1 and open-ecosystem filament
  packs.
- GLB export presets tuned for popular open viewers — Blender,
  [`<model-viewer>`](https://modelviewer.dev/), and the Three.js editor.
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

> This project is not affiliated with or endorsed by Bambu Lab, OrcaSlicer,
> or Snapmaker. Trademarks belong to their respective owners; product names
> are referenced here only for interoperability.
