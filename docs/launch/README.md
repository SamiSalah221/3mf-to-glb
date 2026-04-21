# Launch announcement drafts

Copy-paste-ready posts for the v1.0 launch. Adjust voice and details before
posting — these are first drafts, not final copy.

## Suggested order-of-operations (launch day)

1. Tag `v1.0.0` on GitHub with release notes (see bottom of this file).
2. **~8–10am PT (Tue/Wed)**: post `hn.md` to Hacker News as "Show HN". Stay
   available in the thread for the first 4 hours to answer questions.
3. **+30 min**: post `reddit-bambulab.md`.
4. **+45 min**: post `reddit-3dprinting.md`.
5. **+60 min**: post `reddit-webdev.md`.
6. **+90 min**: Twitter/X thread (`twitter-thread.md`) and LinkedIn post (`linkedin.md`).
7. **Evening (or next day)**: Bambu Lab forum (`bambu-forum.md`), plus
   MakerWorld / Printables article (`makerworld-printables.md`).

## Pre-launch checklist

- [ ] GitHub repo is public.
- [ ] Live demo loads at <https://samisalah221.github.io/3mf-to-glb/>.
- [ ] `samples/` files load successfully in the demo.
- [ ] `docs/hero.gif` recorded and committed.
- [ ] `docs/social-card.png` (1200×630) committed; verify OG preview on
      <https://www.opengraph.xyz/url/https%3A%2F%2Fsamisalah221.github.io%2F3mf-to-glb%2F>.
- [ ] Release `v1.0.0` tagged with notes.
- [ ] Author socials (Twitter/X, LinkedIn, GitHub) are ready to amplify.

## GitHub release notes (v1.0.0)

```markdown
# v1.0.0 — Initial public release

First public release of 3MF Color Customizer — an in-browser tool for parsing
BambuStudio multi-color 3MF files and exporting them as GLB.

## Highlights

- Decodes BambuStudio's undocumented `paint_color` per-face coloring format.
- Supports layer-based `MultiAsSingle` coloring via Z-plane triangle clipping.
- Interactive 3D re-coloring via a color picker (changes reflected live).
- PBR GLB export with per-zone materials, ready for Blender / Unity / web.
- 100% client-side: no servers, no uploads, no telemetry.

## Try it

👉 https://samisalah221.github.io/3mf-to-glb/

Sample files are in [`samples/`](./samples).

## Thanks

To the BambuLab community for documenting slicer behavior, and to
@donmccurdy for `@gltf-transform/core`.
```
