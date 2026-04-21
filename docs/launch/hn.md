# Hacker News — Show HN

**Title (80 char max):**

> Show HN: 3MF Color Customizer – BambuStudio's paint format decoded, in-browser

**URL field:** `https://samisalah221.github.io/3mf-to-glb/`

**Text field (first comment):**

```
Hi HN — I built this because I wanted to render my multi-color 3D prints on the
web, and discovered that nobody outside Bambu Lab seems to document how their
`paint_color` attribute is encoded.

It turns out to be a nibble-packed recursive triangle-subdivision tree, read
right-to-left, with an extended state for 16+ extruders. I reverse-engineered it
from hex dumps of known-colored meshes and wrote a TypeScript decoder.

Things that were fun to solve:

- The paint_color binary format (see the write-up in docs/)
- Layer-based coloring (MultiAsSingle) — the slicer injects tool-changes at
  specific Z heights, so to get static geometry out I had to implement
  progressive Z-plane triangle clipping with boundary splitting.
- sRGB → linear conversion so the exported GLB matches what you see in the
  editor.

The whole thing runs client-side: JSZip for the OPC archive, fast-xml-parser
for the XML, @gltf-transform/core for the GLB export, Three.js + React Three
Fiber for the viewport. No backend, no uploads, works offline after first load.

Drop a 3MF file on the page to try it. There are two sample files in the repo
if you don't have one handy. I'd love to hear about files that break it —
open an issue with the repro file and I'll dig in.

Source: https://github.com/SamiSalah221/3mf-to-glb
Technical write-up: https://github.com/SamiSalah221/3mf-to-glb/blob/main/docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md
```

**Posting tips:**

- Post Tue–Thu, 8–10am PT (peaks of HN traffic for US audience).
- Do not edit the title after posting — HN de-prioritizes edited Show HN posts.
- Reply to every comment in the first 2 hours; engagement drives ranking.
- If it flops on first attempt, you can re-submit once after a few days.
