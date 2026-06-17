# lib3mf integration findings

The 3MF Consortium ships [lib3mf](https://github.com/3MFConsortium/lib3mf) as
the reference implementation of the open ISO/IEC 14739 3MF container, plus the
standard 3MF Materials, Production, Beam Lattice, Slice, and Volumetric
extensions. Drop-in `lib3mf` for our hand-rolled parser would give us two
concrete wins:

1. **Conformance.** The Consortium maintains a test fixture set covering every
   extension and a long list of edge cases (CRLF inside attributes, base64
   thumbnails, nested components, etc.). Passing those fixtures is a credible
   "we read every legal 3MF" guarantee that a hand-rolled cascade cannot make.
2. **Forward compatibility.** New extensions (e.g. the Snapmaker Full Spectrum
   color flow, Beam Lattice, Volumetric extensions) land in lib3mf
   periodically. We would inherit them for free instead of patching the
   parser per-vendor.

## Current state of a WASM build

- **lib3mf is C++**. There is no first-party WASM build in the upstream
  repository as of 2026-06. The project builds via CMake to `.dll` / `.so` /
  `.dylib` with C bindings and language wrappers (Python, .NET, Pascal, Go).
- **Community Emscripten ports exist** but none ship as a stable npm package
  with TypeScript bindings that we can `import`. Building lib3mf to WASM
  ourselves means:
  - Patching the CMake to target `emcc`.
  - Building the dependency chain (NMR_StringUtils, FastFloat, libzip, libz).
    libzip and zlib both have known Emscripten ports.
  - Writing a TypeScript binding layer over the C API (handles, error codes,
    enum mappings).
  - Sizing: a release WASM build of lib3mf with extensions is around 3 to 5
    MB after Brotli. For a static demo this is loadable but non-trivial, and
    code splitting and lazy loading would be required.

## Plan

Phase 5 takes a conservative path:

- **Keep the hand-rolled parser as the default.** It is faster, smaller, and
  already handles the Bambu / Orca / U1 paint_color extension that lib3mf
  cannot (because it is proprietary and not in the standard).
- **Wire CI** so build, lint, library build, CLI smoke, and the four-sample
  round-trip run on every PR. This is the conformance signal we currently
  have. See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
- **Document** what an `--lib3mf` validator backend would look like (this
  file), and keep the door open for it. The hand-rolled parser already
  yields a `ParseResult` shape that lib3mf could populate side-by-side, so a
  future validator could diff per-triangle color resolution between the two
  backends and emit a conformance report.

If anyone is interested in picking up the WASM port, the open issue is
[#TBD: optional lib3mf WASM backend](https://github.com/SamiSalah221/3mf-to-glb/issues).
The required deliverables are listed there.

## Reproducible build steps for the hand-rolled parser

The same steps run in CI; nothing is hidden.

```bash
git clone https://github.com/SamiSalah221/3mf-to-glb.git
cd 3mf-to-glb
npm ci
npm run lint
npm run build              # web app
npm run build:lib          # headless library + CLI
npm run test:roundtrip     # four-sample round-trip across parse, recolor,
                           #   3MF write-back, and GLB export
```

Node 20 LTS is the supported runtime for the library build. Newer Node
releases (22, 24) work too. The CI matrix could be extended.
