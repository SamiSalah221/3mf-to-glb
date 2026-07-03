# Snapmaker U1 Innovation Fund: Printproof

> See your print before you print it. An open browser-based color and
> orientation tool for the Snapmaker U1 multi-color ecosystem, including
> native support for U1 Full Spectrum mixed-filament blends. Recolor any
> zone live in 3D, adjust orientation with ±90° snap controls or free Euler
> inputs, then export a color-accurate GLB for the web, USDZ for iOS Quick
> Look, an in-page WebXR AR session for Android, or a re-tinted `.3mf` that
> drops straight back into OrcaSlicer / Snapmaker U1. 100% client-side,
> mobile-ready. MIT.

- **Submitted to:** Snapmaker U1 Innovation Fund Open Competition, Phase 1
- **Author:** Sami Salah (independent)
- **License:** MIT
- **Source:** <https://github.com/SamiSalah221/3mf-to-glb>
- **Live demo:** <https://samisalah221.github.io/3mf-to-glb/>
- **One-click U1 sample on the demo:** **"Try sample · sea slug (U1)"** on
  the upload screen. No upload, no signup.

## What it is

Modern multi-color slicers — Bambu Studio, OrcaSlicer, and the Snapmaker U1
among them — offer powerful color authoring tools (per-face painters,
gradient fills, image projection, and on the U1, Full Spectrum
mixed-filament blending). Once a multi-color print is sliced, though, the
color information is effectively trapped inside the slicer file. You can't
preview the recolored print on a product page, you can't ship it to a
Blender artist, you can't share it on a Reddit thread as a glTF, and you
can't see what it will actually look like — at true size, in your chosen
colors — before you commit filament to it.

This project liberates that data. It does three things:

1. **Reads** Snapmaker U1, OrcaSlicer, and Bambu 3MF archives, including the
   proprietary per-face `paint_color` subdivision tree, the Z-band
   MultiAsSingle / Full Spectrum layer-mode encoding, and U1 **Full Spectrum
   mixed-filament** virtual extruders. The paint_color decoder is
   reverse-engineered from the OrcaSlicer source and fully documented in
   [`docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).
2. **Recolors and reorients** every zone in an interactive browser viewport
   (Three.js + React Three Fiber), with strict WYSIWYG fidelity. Tone-mapping
   and IBL are pinned off so the picked hex is exactly the rendered hex. An
   Orientation panel provides ±90° snap rotations, free Euler inputs, and a
   one-click reset — all baked into vertex positions and normals so the
   exported GLB/USDZ carries exactly the pose shown on screen, with no silent
   reorientation by the exporter.
3. **Exports** in three open formats:
   - **GLB** (Khronos glTF, ISO/IEC 12113) for Blender, Unity, Three.js,
     `<model-viewer>`, and product pages.
   - **USDZ** for Apple Quick Look; an in-page **WebXR** session (via
     `<model-viewer ar-scale="fixed">`) for Android AR.
   - **3MF** with refreshed filament colors so the file drops straight back
     into OrcaSlicer / Snapmaker U1 and slices.

The same parser is also published as a headless TypeScript library and a Node
CLI, so it can run in build pipelines, batch jobs, server-side renderers, and
the round-trip CI tests in this repo.

**A note on scope:** The core `paint_color` decoder contains no
vendor-specific code branches — Bambu Studio, OrcaSlicer, and Snapmaker U1
all write the same encoding, and the parser handles all three identically.
**U1 Full Spectrum mixed-filament support is the genuinely U1-specific
feature**, and it's implemented: `mixed_filament_definitions` virtual
extruders are enumerated the way the slicer itself does (enabled +
non-deleted rows only, tombstones skipped), and blends are rendered through
a pigment-mixing model rather than linear-RGB averaging. Surface Color
Stitch (image-projection color) remains on the near-term roadmap and is not
yet implemented.

**The opportunity this opens for Snapmaker:** As far as I can find, no
consumer 3D-printer brand currently offers buyers a way to see a print at
true size, in chosen colors, in their own space before printing. This tool
makes that workflow available today in a browser — no install, no account. A
U1 owner, or a prospective buyer, could open any `.3mf`, pick their filament
colors, and see the finished part standing on their desk at 1:1 scale via AR
before the print starts. Snapmaker U1 would be the first printer brand to
put a color-accurate, true-scale AR preview in front of customers as a
community-endorsed workflow.

## Mapped to the three judging criteria

### 1. Innovation and technical depth

- **Reverse-engineered decoder** for the shared `paint_color` per-face
  subdivision tree used by Bambu Studio, OrcaSlicer, and Snapmaker U1
  (right-to-left nibble-packed recursive tree with state-overflow encoding
  for ≥4 extruders). No public spec exists; the implementation reconstructs
  the format from OrcaSlicer's open-source C++. Documented in
  [`3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md).
- **Snapmaker U1 Full Spectrum mixed-filament support.** `mixed_filament_definitions`
  defines virtual extruders that are pigment blends of two physical
  filaments; the slicer only assigns virtual ids to enabled, non-deleted
  rows, and its tombstone rows can precede real ones in the file. The parser
  replicates that exact enumeration order rather than iterating all rows
  naively — a naive pass shifts every painted state onto the wrong recipe.
  Blend ratios come from `mix_b_percent` or an explicit `r<k>/<wA>/<wB>`
  override, and colors are computed with a pigment-mixing polynomial (so
  navy + yellow renders as green, not a muddy linear-RGB average). See
  [`docs/SNAPMAKER_FULL_SPECTRUM.md`](./docs/SNAPMAKER_FULL_SPECTRUM.md).
- **Z-plane triangle clipping** turns G-code tool-change metadata
  (MultiAsSingle / Full Spectrum layer bands) into real geometry zones in the
  browser, with progressive boundary splitting.
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
- **WYSIWYG orientation export**: ±90° snap rotations and free Euler inputs
  in the Orientation panel are baked directly into vertex positions and normals
  before serialization. The GLB carries an identity node transform — the pose
  is geometry-level, not a scene-graph transform an AR runtime might ignore or
  override. A flat keychain lies flat in AR by default; the user presses +90°X
  to stand it up, re-exports, and the new pose is reproduced faithfully.
- **Multi-format export** (GLB + USDZ + 3MF) and a platform-aware AR launcher
  (Quick Look on iOS, an in-page WebXR session on Android via
  `<model-viewer>`, GLB download on desktop), all client-side. The UI is
  mobile-responsive and touch-friendly, so the whole workflow — load,
  recolor, reorient, preview in AR — works on a phone.
- **Real-world scale** end-to-end. The 3MF `<model unit>` is parsed (every
  legal value: micron through meter), baked into the exported vertex
  positions in meters, surfaced as `asset.extras` on the GLB, and
  cross-checked by a 100 mm-cube conformance test that asserts the exported
  GLB bounding box is 0.1 m on each axis. `<model-viewer ar-scale="fixed">`
  and Quick Look's `allowsContentScaling=0` are used so AR previews show
  true print size, not a pinch-zoomable cartoon.
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

- **U1 owners**, including U1 Full Spectrum users, who want to share
  recolored print previews on Reddit, Discord, Printables, and product pages
  without re-slicing, and who want to iterate palettes and mixed-filament
  blends for gifts and small batches in seconds.
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
2. Click **"Try sample · sea slug (U1)"** to load a Snapmaker U1 Full
   Spectrum fixture.
3. The model loads. Click a colored zone, pick a new hex, and the viewport
   recolors in real time.
4. Open the **orient** tab and press **+90° X** to rotate the model, or
   leave it at the default print-bed pose. The export will match exactly.
5. Hit **3MF** in the export footer to get a `.3mf` that slices in
   OrcaSlicer. Hit **AR** on any phone (Quick Look on iOS, an in-page WebXR
   session on Android) to drop the recolored, reoriented model into your
   room at true print size — or hit **Export GLB** on desktop.

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
- [x] U1 Full Spectrum mixed-filament support implemented and documented.
- [x] CI green on every PR.
- [x] CoC, CONTRIBUTING, SECURITY in place.
- [x] Decoder documented down to the bit level.
- [x] Headless library + Node CLI for downstream use.
- [x] 3MF re-tint round-trip end-to-end verified across four fixtures.
- [x] USDZ + WebXR AR launcher (iOS Quick Look + Android in-page WebXR).
- [x] WYSIWYG orientation export — exported pose matches model view exactly.
- [x] Mobile-responsive UI, works end-to-end on a phone.

---

<sub>This project is an independent community effort. It is not affiliated
with or endorsed by Snapmaker, Bambu Lab, or OrcaSlicer. Trademarks belong
to their respective owners; product names are referenced for
interoperability.</sub>
