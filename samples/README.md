# Sample 3MF fixtures

These archives are real multi-color 3MF files exported by the BambuStudio /
OrcaSlicer / Snapmaker U1 slicer family. Every fixture in this folder exercises
the same `paint_color` per-face extruder encoding that the Snapmaker U1 ships
with its own multi-color toolpath, so a regression caught against any of these
also covers the U1 path. The full encoding spec lives in
[`docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](../docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).

| File | Plates | Filaments | What it tests |
|------|-------:|----------:|---------------|
| `watchful-owl.3mf` | 1 | 4 | Large multi-material model. Stress-tests the chunking and GLB exporter. The default "Try with U1 sample" entry point in the live demo. |
| `kuwait.3mf` | 2 | 4 | Per-face `paint_color` subdivision trees. Reproduces the "white-seam" boundary-triangle voting bug fixed in the parser. |
| `turkey.3mf` | 2 | 2 | Anchor-part inheritance (`extruder="0"` parts in the Image-to-Keychain template). Reproduces the gray-block bug fixed in the parser. |
| `hijri-calendar.3mf` | 4 | 4 | Multi-plate archive with shared filaments across plates. |
| `vase-prusaslicer.gcode` | 1 | 1 | Sliced G-code (PrusaSlicer 2.7, arc fitting on) for the as-printed path: a 24 mm twisted vase. Not a 3MF; the round-trip test checks its size and welded GLB. |
| `组合体_PLA_10h17m.gcode` | 1 | 4 | The sea slug (`海蛞蝓【项目】U1  sea.3mf`) sliced in Snapmaker Orca 2.3.4 for the U1: 482 layers at 0.12 mm, 48 MB. The live demo's sea slug sample opens it with the design, so both versions load. Not in the round-trip test (too large for CI). |

## Use from the live demo

Open the [live demo](https://samisalah221.github.io/3mf-to-glb/) and click a
sample on the open screen. It loads in the browser without any upload. The sea
slug sample also loads its sliced G-code, so you can switch between the design
and the part as printed.

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
