# Reddit — r/3Dprinting

**Subreddit:** [r/3Dprinting](https://reddit.com/r/3Dprinting)
**Flair:** `Discussion` / `Software` (check current options)
**Title:**

> [Free tool] Convert multi-color 3MF files to GLB right in your browser — nothing uploaded anywhere

**Body:**

```
Made a small web tool to fill a gap I kept hitting: I wanted to preview and
share my multi-color prints online (AR, product pages, portfolio) without
having to rebuild them in Blender.

👉 https://samisalah221.github.io/3mf-to-glb/

Drop a `.3mf` in, get a `.glb` out, with all color zones preserved. You can
also recolor any zone in the 3D preview before exporting.

**Heads-up:** this is specifically tuned to 3MFs produced by **BambuStudio**
(the `paint_color` attribute it uses isn't part of the core 3MF spec). If your
slicer emits a plain-vanilla 3MF without that extension, the colors won't
survive — happy to extend support if someone opens an issue with a sample
file.

It's free, open source (MIT), and runs entirely in the browser. Source:
https://github.com/SamiSalah221/3mf-to-glb

Feedback and bug reports welcome — especially "here's a 3MF that breaks it"
type reports.
```
