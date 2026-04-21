# Reddit — r/webdev

**Subreddit:** [r/webdev](https://reddit.com/r/webdev)
**Flair:** `Showoff Saturday` if posting on Saturday, otherwise `Showcase`.
**Title:**

> I reverse-engineered a proprietary 3D-printer file format and wrote a browser-side parser for it — here's the result (React + Three.js + zero backend)

**Body:**

```
TL;DR: built an in-browser 3MF → GLB converter. The interesting part was that
the file format uses a proprietary, undocumented encoding for per-face colors,
and I had to reverse-engineer it from hex dumps. Everything runs client-side,
no backend.

Demo: https://samisalah221.github.io/3mf-to-glb/
Source: https://github.com/SamiSalah221/3mf-to-glb

**Stack**
- React 19 + Vite 7 + TypeScript
- Three.js + React Three Fiber + Drei for the viewport
- JSZip for OPC archive parsing (3MF is a zip)
- fast-xml-parser for the XML payloads
- @gltf-transform/core for glTF / GLB authoring
- Tailwind v4
- Zustand for state

**Things I learned**
- BambuStudio stores per-face filament indices in a nibble-packed recursive
  triangle-subdivision tree. The nibbles are read right-to-left. There's an
  overflow state for 16+ extruders. There is zero public documentation for
  this format; I had to find it via hex dumps of meshes with known colors.
- Some 3MFs don't store per-face colors at all — they store "at Z=14.2mm,
  switch to filament 3". To turn that into static colored geometry I
  implemented Z-plane triangle clipping with progressive boundary splitting.
- sRGB → linear matters a lot when the same color value needs to look
  identical in Three.js, in gltf-viewer, and in Blender.
- @gltf-transform/core is a lovely library for authoring glTF without hand-
  rolling the binary format.

All static — hosts on GitHub Pages with zero config. No analytics, no backend,
no uploads.

Happy to answer anything about the parsing / Three.js / GLB-auth side. MIT.
```
