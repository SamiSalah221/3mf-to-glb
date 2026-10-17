# Contributing

Thanks for your interest in improving Printproof. This project is
open to issues, pull requests, and discussion.

The repository ships two things: the web demo you see at the project page, and
the headless `printproof` npm package (the parser, converters, and CLI). They
share one `package.json`, so a dependency added for the demo must go in
`devDependencies` or it lands in every consumer's install. See
[Publishing](#publishing-maintainer) below.

## Development setup

```bash
git clone https://github.com/SamiSalah221/3mf-to-glb.git
cd 3mf-to-glb
npm install
npm run dev
```

Then open the URL Vite prints (typically `http://localhost:5173`) and drop a
`.3mf` file onto the page. Two sample files live under [`samples/`](./samples)
for quick testing.

## Project layout

```
src/
├── lib/         # Core parsing & GLB export (no React) -> npm "printproof"
│   ├── parse3MF.ts         # 3MF ZIP/XML + paint_color decoder
│   ├── parseXml.ts         # DOMParser seam + lenient vendor-XML retry
│   ├── colorConvert.ts     # sRGB ↔ linear color space
│   ├── glbBuilder.ts       # Geometry → glTF document
│   ├── glbExporter.ts      # GLB binary serialization
│   ├── browser.ts          # DOM-only helpers -> "printproof/browser"
│   └── arLauncher.ts       # Demo-only AR handoff (not in the package)
├── cli/         # Node CLI -> "printproof/cli"
├── components/  # React UI (upload, editor, export)
├── viewer/      # Three.js / React Three Fiber scene
├── store/       # Zustand state
└── types/       # Shared TypeScript types
samples/         # Example .3mf files
docs/            # Technical write-ups
```

Only `src/lib/`, `src/cli/` and `src/types/` are compiled into the package
(`tsconfig.lib.json`). Everything else is the demo.

The heart of the project is [`src/lib/parse3MF.ts`](./src/lib/parse3MF.ts),
which decodes BambuStudio's undocumented `paint_color` attribute (a nibble-packed
recursive triangle-subdivision tree). See
[`docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md`](./docs/3MF-COLOR-RESOLUTION-TECHNICAL-SPEC.md)
for the full technical write-up before touching the decoder.

## Running checks

```bash
npm run lint            # ESLint
npm run build           # TypeScript + Vite production build (the demo)
npm run preview         # Preview the production build locally
npm run build:lib       # Compile the headless library and CLI to dist-lib/
npm run test:roundtrip  # Parse/recolor/re-export every sample (needs build:lib)
npm run check:package   # Assert the published package shape
```

Please make sure `npm run lint` and `npm run build` both pass before opening a
PR. If you touched anything under `src/lib/` or `src/cli/`, run `npm run
build:lib && npm run test:roundtrip` as well: the round trip runs against the
compiled output in `dist-lib/`, so it will happily test stale code if you skip
the build.

## Reporting bugs

Please open a [GitHub issue](https://github.com/SamiSalah221/3mf-to-glb/issues)
using the bug report template. If the bug is triggered by a specific 3MF file,
attaching the file (or a minimal repro file) makes the fix dramatically faster.
A small note on how the file was produced (BambuStudio version, whether it uses
`paint_color` vs layer-based `MultiAsSingle` coloring) helps too.

## Pull requests

1. Fork and create a feature branch.
2. Keep changes focused — one concern per PR.
3. If you add a new sample file that triggers a parsing edge case, drop it in
   `samples/` with a short note in the PR description.
4. Use the PR template and fill in the test plan.
5. Sign off the commits in your PR (see below).

## Sign your work (DCO)

Contributions are accepted under the
[Developer Certificate of Origin](./DCO) 1.1. It is a short statement that you
wrote the patch, or otherwise have the right to submit it under this project's
MIT license. There is no separate CLA and you keep the copyright in your work.

This applies to contributions arriving by pull request. The maintainer's own
commits are covered by authorship and are signed off at his discretion, so do
not add a `Signed-off-by` line on someone else's behalf: it is a certification
only the author can make.

Certify your own commits by adding a `Signed-off-by` line, which git writes for
you with `-s`:

```bash
git commit -s -m "fix: handle empty colorgroup"
```

The line must carry your real name and an email address you can be reached at:

```
Signed-off-by: Jane Developer <jane@example.com>
```

If you forget, `git commit --amend -s` fixes the last commit and
`git rebase --signoff main` fixes a whole branch.

## Publishing (maintainer)

The npm package is `printproof`, built from `src/lib/`, `src/cli/` and
`src/types/` only. Before publishing:

```bash
npm run build:lib
npm run test:roundtrip
npm run check:package
npm pack                 # inspect the tarball, then publish
npm publish --access public
```

`npm run check:package` is the guard that keeps demo dependencies (React,
Tailwind, the R3F stack) out of the published dependency tree and verifies
every `exports` target is actually packed. It runs in CI too.

## Ideas for first contributions

- Automated tests for `parse3MF.ts` against the `samples/` fixtures.
- Better error messages when a 3MF uses an unsupported extension.
- Drag-and-drop support for multiple files at once.
- Export to `.gltf` (JSON) in addition to `.glb`.
- Accessibility pass on the editor UI.

## Code of conduct

Participation is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md). By
contributing you agree to abide by its terms.
