# Bambu Lab Community — forum.bambulab.com

**Category:** Show & Tell (or "Software" if that exists)
**Title:**

> Free web tool: convert multi-color 3MF projects to GLB (for AR, web, Blender) — open source

**Body:**

```
Hi all,

I made a small web tool that I think some of you might find useful:

👉 https://samisalah221.github.io/3mf-to-glb/

You drop a `.3mf` project file from BambuStudio onto the page and it gives you
back a `.glb` with all your color zones preserved. You can also recolor any
zone in the 3D preview before exporting.

It works with both:
- Paint-bucket coloring (the `paint_color` attribute)
- Layer-based coloring ("MultiAsSingle" mode)

Use cases:
- Sharing a proper 3D preview of a multi-color print on your website / listing
- AR previews on iOS Quick Look and Android Scene Viewer (both speak glTF)
- Importing into Blender, Unity, or a web viewer with materials already set up
- Quickly exploring "what would this print look like in different colors?"

It runs entirely in your browser — your file is never uploaded anywhere. And
it's free and open source (MIT):
https://github.com/SamiSalah221/3mf-to-glb

Bug reports welcome, especially "here's a .3mf that doesn't work right" with
the file attached. That's the fastest way for me to fix things.

(Not affiliated with Bambu Lab in any way; just a fan and a user.)
```
