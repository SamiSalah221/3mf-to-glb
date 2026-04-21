# LinkedIn — launch post

**Tone:** professional, first-person, story-driven. Attach the `hero.gif`
(or a still frame if GIF uploads are glitchy) and a screenshot of the editor.

---

**Post body:**

```
Launching an open-source project today.

3MF Color Customizer is a browser-based tool that parses multi-color 3MF files
from BambuStudio, lets you recolor any zone in a live 3D editor, and exports a
production-ready GLB — all without uploading anything to a server.

→ Live demo: https://samisalah221.github.io/3mf-to-glb/
→ Source (MIT): https://github.com/SamiSalah221/3mf-to-glb

The interesting engineering problem: BambuStudio stores per-face colors in a
proprietary binary format that isn't publicly documented. I reverse-engineered
the encoding — a nibble-packed recursive triangle-subdivision tree — from hex
dumps of meshes with known colors, and implemented a decoder in TypeScript.

The stack is a deliberately tiny, all-client-side setup:
• React 19 + Vite 7
• Three.js / React Three Fiber for the 3D viewport
• JSZip + fast-xml-parser for archive + XML parsing
• @gltf-transform/core for GLB authoring
• Hosted free on GitHub Pages

No backend, no analytics, no telemetry. The file never leaves the user's
browser — which I think is the right default for creator tools.

If you work with 3D printing, AR previews, or glTF pipelines, I'd love to hear
what you'd want next. And if you hit a bug, please send me the offending file
— parser improvements are only as good as the fixtures they're tested against.

#opensource #3Dprinting #webdev #threejs #typescript
```
