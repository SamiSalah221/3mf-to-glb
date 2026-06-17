# Sample 3MF fixtures

These archives are real multi-color 3MF files exported by the BambuStudio /
OrcaSlicer / Snapmaker U1 slicer family. Every fixture in this folder exercises
the same `paint_color` per-face extruder encoding that the Snapmaker U1 ships
with its own multi-color toolpath, so a regression caught against any of these
also covers the U1 path. The full encoding spec lives in
[`docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](../docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).

| File | Plates | Filaments | What it tests |
|------|-------:|----------:|---------------|
| `kuwait.3mf` | 2 | 4 | Per-face `paint_color` subdivision trees. Reproduces the "white-seam" boundary-triangle voting bug fixed in the parser. The default "Try with U1 sample" entry point in the live demo. |
| `turkey.3mf` | 2 | 2 | Anchor-part inheritance (`extruder="0"` parts in the Image-to-Keychain template). Reproduces the gray-block bug fixed in the parser. |
| `hijri-calendar.3mf` | 4 | 4 | Multi-plate archive with shared filaments across plates. |
| `watchful-owl.3mf` | 1 | 4 | Large multi-material model. Stress-tests the chunking and GLB exporter. |

## Use from the live demo

Open the [live demo](https://samisalah221.github.io/3mf-to-glb/) and click
**"Try with U1 sample"**. The sample loads in-browser without any upload.

## Use from the CLI

```bash
npx 3mf-to-glb samples/kuwait.3mf -o kuwait.glb
npx 3mf-to-glb samples/kuwait.3mf --recolor "1=#cc0000,2=#000000" -o kuwait-recolored.glb
```

## Use from the round-trip smoke test

```bash
npm run build:lib
npm run test:roundtrip
```

The smoke test parses every fixture, re-tints all filaments to magenta,
re-exports the 3MF, re-parses to confirm the colors survived, then re-exports
to GLB. All fixtures should pass on every commit.

## Provenance

Each fixture was authored by the project author (Sami Salah) and is shared
under the same MIT license as the parent repository.
