# Contributing

Thanks for your interest in improving 3MF Color Customizer. This project is
open to issues, pull requests, and discussion.

## Development setup

```bash
git clone https://github.com/SamiSalah221/3mf-to-glb.git
cd 3mf-to-glb
npm install
npm run dev
```

Then open the URL Vite prints (typically `http://localhost:5173`) and drop a
`.3mf` file onto the page. Two sample files live under [`samples/`](./samples)
for quick testing.

## Project layout

```
src/
├── lib/         # Core parsing & GLB export (no React)
│   ├── parse3MF.ts         # 3MF ZIP/XML + paint_color decoder
│   ├── colorConvert.ts     # sRGB ↔ linear color space
│   ├── glbBuilder.ts       # Geometry → glTF document
│   └── glbExporter.ts      # GLB binary serialization
├── components/  # React UI (upload, editor, export)
├── viewer/      # Three.js / React Three Fiber scene
├── store/       # Zustand state
└── types/       # Shared TypeScript types
samples/         # Example .3mf files
docs/            # Technical write-ups
```

The heart of the project is [`src/lib/parse3MF.ts`](./src/lib/parse3MF.ts),
which decodes BambuStudio's undocumented `paint_color` attribute (a nibble-packed
recursive triangle-subdivision tree). See
[`docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md)
for the full technical write-up before touching the decoder.

## Running checks

```bash
npm run lint        # ESLint
npm run build       # TypeScript + Vite production build
npm run preview     # Preview the production build locally
```

Please make sure `npm run lint` and `npm run build` both pass before opening a PR.

## Reporting bugs

Please open a [GitHub issue](https://github.com/SamiSalah221/3mf-to-glb/issues)
using the bug report template. If the bug is triggered by a specific 3MF file,
attaching the file (or a minimal repro file) makes the fix dramatically faster.
A small note on how the file was produced (BambuStudio version, whether it uses
`paint_color` vs layer-based `MultiAsSingle` coloring) helps too.

## Pull requests

1. Fork and create a feature branch.
2. Keep changes focused — one concern per PR.
3. If you add a new sample file that triggers a parsing edge case, drop it in
   `samples/` with a short note in the PR description.
4. Use the PR template and fill in the test plan.

## Ideas for first contributions

- Automated tests for `parse3MF.ts` against the `samples/` fixtures.
- Better error messages when a 3MF uses an unsupported extension.
- Drag-and-drop support for multiple files at once.
- Export to `.gltf` (JSON) in addition to `.glb`.
- Accessibility pass on the editor UI.

## Code of conduct

Participation is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md). By
contributing you agree to abide by its terms.
