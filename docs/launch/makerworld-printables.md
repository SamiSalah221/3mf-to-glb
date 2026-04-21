# MakerWorld & Printables — blog / article post

Both platforms let makers publish articles / blog posts. Use the same body;
adjust category selectors on each platform.

- **MakerWorld:** create under your profile → Articles → New article.
- **Printables:** My Profile → Blog → New blog post.

**Title:**

> A free web tool to turn your multi-color 3MF files into GLB — for AR, web previews, and renders

**Cover image:** `docs/hero.gif` or a high-res screenshot of the editor.

**Body:**

```
If you've ever wanted to share a proper 3D preview of your multi-color print
— on your portfolio, in an AR viewer on your phone, or as a rotating preview
on a product page — you've probably hit the same wall I did: 3MF files don't
render anywhere except in slicers, and converting them usually loses the
colors.

I built a small web tool to fix that, and released it today:

**3MF Color Customizer:** https://samisalah221.github.io/3mf-to-glb/

**What it does**

Drop a `.3mf` project file from BambuStudio onto the page. The tool:

1. Parses the file (it's a ZIP under the hood) right in your browser.
2. Decodes the per-face color information that BambuStudio stores in a
   proprietary binary format.
3. Handles layer-based coloring ("MultiAsSingle" mode) by splitting the
   geometry at the Z-heights where the slicer would have changed filament.
4. Renders an interactive 3D preview where you can re-paint any color zone.
5. Exports a `.glb` file with correct sRGB materials, ready to drop into:
   - Blender, Unity, or any 3D app
   - iOS Quick Look (AR on iPhone/iPad)
   - Android Scene Viewer
   - Three.js / <model-viewer> on the web
   - Portfolio sites, product pages, etc.

**Why it might matter to you**

- Your multi-color designs can finally be shown off interactively, in full
  color, on the web.
- AR-preview your prints before you print them.
- No re-modelling in Blender just to get a render.
- No upload — the file never leaves your computer.

**Free, open source, no account**

It's MIT-licensed and 100% client-side. No sign-up, no uploads, no telemetry.
Source code: https://github.com/SamiSalah221/3mf-to-glb

If you run into a `.3mf` that doesn't work right, please open a GitHub issue
with the file attached — real-world test cases are the fastest way to make the
tool better.

Hope it's useful!
```
