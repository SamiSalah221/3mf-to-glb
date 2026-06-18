# Snapmaker U1 Innovation Fund: 3MF Color Customizer

> An open browser-based color customizer for the Snapmaker U1 multi-color
> ecosystem. Recolor any zone in a `.3mf`, preview live in 3D, then export
> GLB for the web, USDZ for iOS AR, or a fresh sliceable `.3mf` that drops
> straight back into OrcaSlicer / Snapmaker U1. 100% client-side. MIT.

- **Submitted to:** Snapmaker U1 Innovation Fund Open Competition, Phase 1
- **Author:** Sami Salah  (independent)
- **License:** MIT
- **Source:** <https://github.com/SamiSalah221/3mf-to-glb>
- **Live demo:** <https://samisalah221.github.io/3mf-to-glb/>
- **One-click U1 sample on the demo:** "Try with a Snapmaker U1 / OrcaSlicer
  sample" on the upload screen. No upload, no signup.

## What it is

The Snapmaker U1 puts some of the most interesting color authoring tools on
any consumer printer in front of makers right now (Full Spectrum gradients,
Surface Color Stitch image projection, plus the OrcaSlicer-derived MMU-style
painter). The problem is that once a multi-color print is sliced, the color
information is effectively trapped inside the slicer file. You can't preview
the recolored print on a product page, you can't ship it to a Blender artist,
you can't share it on a Reddit thread as a glTF, and you can't iterate the
palette without reopening the slicer.

This project liberates that data. It does three things:

1. **Reads** Snapmaker U1, OrcaSlicer, and Bambu 3MF archives, including the
   proprietary per-face `paint_color` subdivision tree and the Z-band
   MultiAsSingle / Full Spectrum layer-mode encoding. The decoder is
   reverse-engineered from the OrcaSlicer source and fully documented in
   [`docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).
2. **Recolors** every zone in an interactive browser viewport (Three.js
   + React Three Fiber), with WYSIWYG color fidelity (tone-mapping and IBL
   pinned off so the picked hex is the rendered hex).
3. **Exports** in three open formats:
   - **GLB** (Khronos glTF, ISO/IEC 12113) for Blender, Unity, Three.js,
     `<model-viewer>`, and product pages.
   - **USDZ** for Apple Quick Look and iOS AR.
   - **3MF** with refreshed filament colors so the file drops straight back
     into OrcaSlicer / Snapmaker U1 and slices.

The same parser is also published as a headless TypeScript library and a Node
CLI, so it can run in build pipelines, batch jobs, server-side renderers, and
the round-trip CI tests in this repo.

## Mapped to the three judging criteria

### 1. Innovation and technical depth

- **Reverse-engineered decoder** for the OrcaSlicer / Snapmaker U1
  `paint_color` per-face subdivision tree (right-to-left nibble-packed
  recursive tree with state-overflow encoding for ≥4 extruders). No public
  spec exists; the implementation reads OrcaSlicer C++ and reconstructs the
  format in TypeScript. Documented in
  [`3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).
- **Z-plane triangle clipping** turns G-code tool-change metadata
  (MultiAsSingle / Full Spectrum) into real geometry zones in the browser,
  with progressive boundary splitting.
- **Subdivision-tree plurality voting** including the inherit state (state 0)
  to avoid the over-paint seam bug that simpler decoders hit on boundary
  triangles. Reproducible regression in [`samples/kuwait.3mf`](./samples).
- **Anchor-part inheritance** handling (`extruder="0"` parts in Bambu's
  Image-to-Keychain template) so anchor blocks resolve to the correct
  filament instead of leaking gray fallback meshes. Regression in
  [`samples/turkey.3mf`](./samples).
- **3MF write-back** that re-zips the source archive with new filament
  colors while preserving geometry, `paint_color` trees, model_settings, and
  custom G-code. The result is a drop-in replacement that slices in
  OrcaSlicer / Snapmaker U1.
- **Multi-format export** (GLB + USDZ + 3MF) and a platform-aware AR launcher
  (Quick Look on iOS, Scene Viewer on Android, GLB download on desktop), all
  client-side.
- **Real-world scale** end-to-end. The 3MF `<model unit>` is parsed (every
  legal value: micron through meter), baked into the exported vertex
  positions in meters, surfaced as `asset.extras` on the GLB, and
  cross-checked by a 100 mm-cube conformance test that asserts the exported
  GLB bounding box is 0.1 m on each axis. Scene Viewer and Quick Look are
  launched with their fixed-scale flags so AR previews show true print
  size, not a pinch-zoomable cartoon.
- **Configurable export pivot**: base-center for AR floor placement
  (default), bbox-center, area-weighted centroid, original 3MF origin, or a
  user-entered mm offset. The choice is baked into vertex positions and
  also recorded on `asset.extras.pivot_mode` / `pivot_offset_m`. Three
  pivot-conformance cases are part of the round-trip smoke test.

### 2. Openness and quality

- **MIT licensed**, with [`CONTRIBUTING.md`](./CONTRIBUTING.md),
  [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md), and
  [`SECURITY.md`](./SECURITY.md) in place.
- **No backend, no telemetry, no uploads.** The whole pipeline runs in the
  browser or in a Node CLI on the user's own machine. The static site is
  ~1.3 MB of JS, ~22 KB of CSS, no third-party fonts, no analytics.
- **All open formats**: ISO/IEC 14739 3MF in, Khronos glTF / USDZ /
  re-encoded 3MF out. No proprietary file formats produced.
- **CI** runs on every PR: lint, web build, headless library build, CLI
  smoke against [`samples/kuwait.3mf`](./samples), and a four-sample
  round-trip that parses, recolors, re-emits 3MF, re-parses, and re-emits
  GLB. See [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).
- **Documented architecture** in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
  with the specific bugs each design decision exists to prevent (load-bearing
  comments, regression-named samples). The kind of doc a new contributor can
  read and immediately be productive against.
- **Headless library + CLI** so the parser is reusable beyond this UI. Other
  projects can depend on `3mf-to-glb` without bringing the React app.
- **Reproducible build:** `npm ci && npm run lint && npm run build &&
  npm run build:lib && npm run test:roundtrip` is the same set of commands
  CI runs and a contributor can run locally.

### 3. Practicality across the wider community

The community of people who would benefit from this is concrete, not
hypothetical:

- **U1 owners** who want to share recolored print previews on Reddit,
  Discord, Printables, and product pages without re-slicing, and who want to
  iterate palettes for gifts and small batches in seconds.
- **Etsy and small-batch 3D-print sellers** who need product images and
  AR previews for color variants without rendering a Blender frame per SKU.
- **Designers handing off to print farms** who want to share a single 3MF
  and a small palette JSON instead of one re-sliced file per color
  combination.
- **OrcaSlicer and Bambu users** who get the same tool for free because the
  on-disk encoding is the same. Snapmaker funding the project unlocks the
  feature for them too, which is the kind of cross-ecosystem win the Fund
  is designed to encourage.
- **Other developers** can `npx 3mf-to-glb input.3mf -o out.glb
  --recolor "1=#cc0000,2=#000000"` from any build pipeline or use the
  headless library directly. The 3MF re-tint round-trip is exposed as
  `exportRecolored3MF(buffer, mapping)` in the library.

## How to try it (under 60 seconds)

1. Open **<https://samisalah221.github.io/3mf-to-glb/>**.
2. Click **"Try with a Snapmaker U1 / OrcaSlicer sample"**.
3. The watchful-owl sample loads. Click a colored zone, pick a new hex, and
   the viewport recolors in real time.
4. Hit **Export as 3MF (re-tint)** to get a `.3mf` that slices in OrcaSlicer.
   Hit **Export as USDZ** for an iOS AR-ready file. Hit **View in AR** on a
   phone to drop the recolored model into your room.

## What funding unlocks (honest near-term plan)

Listed roughly in priority order, all documented in the repo roadmap:

- **Snapmaker U1 Surface Color Stitch** image-projection support. Scope and
  required parser changes in
  [`docs/SNAPMAKER_FULL_SPECTRUM.md`](./docs/SNAPMAKER_FULL_SPECTRUM.md).
- **Zone re-painting** (change which filament owns a face, not just the
  filament color). Requires extending the decoder to keep the full
  subdivision tree instead of voting it down to a single state.
- **Optional lib3mf WASM** validator backend so the parser is checkable
  against the official 3MF Consortium conformance suite. Scope in
  [`docs/LIB3MF_INTEGRATION.md`](./docs/LIB3MF_INTEGRATION.md).
- **Preset palettes** matching common Snapmaker U1 and open-ecosystem
  filament packs for one-click recoloring.
- **GLB / USDZ export presets** tuned for popular viewers (Blender,
  `<model-viewer>`, Three.js editor, model-viewer-element AR).

## Submission checklist

- [x] Public GitHub repo, MIT licensed.
- [x] Working live demo, no signup, no upload.
- [x] U1 sample loadable in one click on the demo.
- [x] CI green on every PR.
- [x] CoC, CONTRIBUTING, SECURITY in place.
- [x] Decoder documented down to the bit level.
- [x] Headless library + Node CLI for downstream use.
- [x] 3MF re-tint round-trip end-to-end verified across four fixtures.
- [x] USDZ export + AR launcher for mobile previews.

---

<sub>This project is an independent community effort. It is not affiliated
with or endorsed by Snapmaker, Bambu Lab, or OrcaSlicer. Trademarks belong
to their respective owners; product names are referenced for
interoperability.</sub>
