# 3MF Color Customizer

**Paint and convert BambuStudio multi-color 3MF files to GLB — in your browser.
No installs, no uploads, no servers.**

[![Live demo](https://img.shields.io/badge/demo-live-2ea44f?style=for-the-badge)](https://samisalah221.github.io/3mf-to-glb/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](./LICENSE)
[![Built with React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-0.183-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org)

![hero demo](./docs/hero.gif)

> Drop a multi-color `.3mf` file from BambuStudio, recolor any zone in real
> time, and download a production-ready `.glb`. Everything runs client-side —
> your files never leave your machine.

## Try it now

**→ <https://samisalah221.github.io/3mf-to-glb/>**

No sign-up, no upload. If you don't have a `.3mf` handy, grab one of the
example files in [`samples/`](./samples) and drop it on the page.

## Features

- **Decodes BambuStudio `paint_color`** — a proprietary, undocumented
  nibble-packed recursive triangle-subdivision tree (see [Under the hood](#under-the-hood)).
- **Handles layer-based coloring** — `MultiAsSingle` mode is supported via
  Z-plane triangle clipping, so tool-change G-code becomes real geometry zones.
- **Interactive 3D editor** — re-paint any color zone with a color picker,
  changes update live in the Three.js viewport.
- **PBR GLB export** — one glTF material per color zone, correct sRGB → linear
  conversion, ready for Blender / Unity / WebGL / AR.
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
npm run build      # Production build into dist/
npm run preview    # Preview the production build
npm run lint       # ESLint
```

## Under the hood

### Reverse-engineering BambuStudio's `paint_color` encoding

BambuStudio stores per-face filament assignments in a proprietary binary
format: a **nibble-packed recursive triangle-subdivision tree, read
right-to-left, with extended state overflow handling for 16+ extruders**. No
public documentation exists for this format — it was reverse-engineered from
hex dumps of known-colored meshes and re-implemented in TypeScript.

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
- The BambuLab community for documenting slicer behavior in the wild.

> This project is not affiliated with or endorsed by Bambu Lab. "BambuStudio"
> is a trademark of Bambu Lab; it is referenced here only for interoperability.
