# Twitter/X — launch thread

6-tweet thread. Attach the `docs/hero.gif` to Tweet 1. Tag @threejs and
@BambuLab (or @BambuLabGlobal) where appropriate.

---

**Tweet 1 — hook**

> I shipped an open-source tool today:
>
> 3MF Color Customizer — drop a multi-color 3MF file in your browser, re-paint
> any zone, export a GLB.
>
> Zero backend. Your file never leaves your machine.
>
> https://samisalah221.github.io/3mf-to-glb/
>
> Thread on how it works 👇
>
> [attach hero.gif]

---

**Tweet 2 — the puzzle**

> BambuStudio stores per-face colors in a binary `paint_color` attribute.
> It's nibble-packed, recursive, read right-to-left, with an overflow state
> for 16+ extruders.
>
> No public docs exist for it.
>
> So I reverse-engineered it from hex dumps. 🔎

---

**Tweet 3 — the other trick**

> Some 3MFs don't use paint_color at all — they use layer heights
> ("MultiAsSingle" mode), where the slicer just injects tool-changes at
> specific Z values.
>
> To turn that into static geometry I implemented Z-plane triangle clipping
> with progressive boundary splitting. ✂️

---

**Tweet 4 — stack**

> 100% client-side:
> - React 19 + Vite 7
> - Three.js + React Three Fiber
> - JSZip + fast-xml-parser (OPC + XML)
> - @gltf-transform/core (GLB export, credit @donmccurdy)
>
> Hosts on GitHub Pages. No server, no telemetry, works offline after first load.

---

**Tweet 5 — call to action**

> If you print multi-color models on a Bambu printer, try it — I'd love real-
> world files to test against.
>
> If you find one that breaks, send me the file and I'll fix it.
>
> Source (MIT):
> https://github.com/SamiSalah221/3mf-to-glb

---

**Tweet 6 — technical deep-dive (optional)**

> Full write-up of the paint_color format + Z-plane clipping algorithm is
> in the repo:
>
> https://github.com/SamiSalah221/3mf-to-glb/blob/main/docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md
>
> PRs welcome. 🙌
