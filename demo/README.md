# demo — hero animation source

This folder holds the [Remotion](https://www.remotion.dev) project that renders
the hero animation shown at the top of the main [README](../README.md).

## Render the GIF

```bash
cd demo
npm install
npm run render
```

Output: `../docs/hero.gif` (1280×720, 8s, ~30 fps, ~2.6 MB).

## Preview interactively

```bash
npm run studio
```

Opens Remotion Studio on `http://localhost:3000` where you can scrub frames,
tweak props, and re-render just the frames you changed.

## Structure

```
demo/
├── src/
│   ├── index.ts        # Remotion entry
│   ├── Root.tsx        # Composition registration
│   └── Hero.tsx        # The animation
├── remotion.config.ts
├── tsconfig.json
└── package.json
```

This project is intentionally standalone from the main app (separate
`package.json`, separate `node_modules`) so it doesn't bloat the bundle that
ships to users.
