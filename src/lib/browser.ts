// Browser-only surface, imported as `printproof/browser`.
//
// The main entry (`printproof`) is environment agnostic: it runs in Node and in
// the browser, and every export there returns bytes rather than touching the
// DOM. The helpers here need `document`, `Blob`, and `URL.createObjectURL`, so
// they are kept on a separate subpath: importing the core cannot accidentally
// pull DOM-dependent code into a server bundle.
//
// Note these all live in glbExporter.ts alongside the portable buildGLBBytes.
// They are re-exported rather than moved so the demo's existing import paths
// keep working; the module has no top-level DOM access, so importing it in Node
// is inert as long as these functions are not called.

export {
  /** Register the live viewer scene that exportGLB writes out. */
  setExportScene,
  /** The scene registered by setExportScene, or null. */
  getExportScene,
  /** Build GLB bytes from the registered scene and download them. */
  exportGLB,
  /** Hand arbitrary bytes to the browser as a file download. */
  triggerBrowserDownload,
} from './glbExporter.js';
