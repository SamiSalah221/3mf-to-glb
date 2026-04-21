# Reddit — r/BambuLab

**Subreddit:** [r/BambuLab](https://reddit.com/r/BambuLab)
**Flair:** `Showcase` or `Software`
**Title:**

> I built a free web tool that turns your multi-color 3MF projects into GLB files (for rendering, AR, web previews) — 100% in-browser, no uploads

**Body:**

```
Hi all —

I print a lot of multi-color models and wanted a way to share a proper 3D
preview online (not just a flat screenshot), without re-modelling everything in
Blender. So I made this:

👉 https://samisalah221.github.io/3mf-to-glb/

You drop a `.3mf` file from BambuStudio on the page and it gives you back a
`.glb` with all the color zones intact. You can also recolor zones in the
editor before exporting. Works with the paint-bucket tool AND with
layer-based coloring ("MultiAsSingle" mode).

It runs 100% in your browser — your file never leaves your machine. No
accounts, no uploads, nothing to install. It's also open source (MIT):
https://github.com/SamiSalah221/3mf-to-glb

A few use cases people have asked about:
- Showing a multi-color print on your portfolio / product page / listing
- AR previews (the `.glb` works directly on iOS Quick Look / Android Scene Viewer)
- Importing into Blender/Unity with materials already set up
- Quick "what would this look like in different colors?" without re-slicing

If you try it and something breaks, please open a GitHub issue with the `.3mf`
attached — fixing parser bugs requires real-world files. Happy to take
feature requests too.

(Not affiliated with Bambu Lab. Just a fan of the printer.)
```
