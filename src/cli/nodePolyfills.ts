// Three.js GLTFExporter assumes a browser-ish runtime: it touches
// `FileReader`, `Image`, and `HTMLCanvasElement` at parse time even when the
// scene contains no textures. The references are dead-code-reachable but the
// `new FileReader()` invocation actually runs once during the binary header
// build. We provide just enough of a shim that the binary export succeeds in
// Node. None of these objects emit real data — texture-bearing exports are not
// supported from the CLI yet (no use case so far).
//
// MUST be imported BEFORE any module that imports GLTFExporter.
//
// Published as `printproof/node-polyfills` for exactly that reason: a Node
// consumer calling convertToGLB / buildGLBBytes otherwise crashes with
// "FileReader is not defined" from inside three, which says nothing about what
// to do. Import it for its side effect before importing the library:
//
//   import 'printproof/node-polyfills';
//   import { convertToGLB } from 'printproof';
//
// Every shim is installed only when the global is missing, so this is inert in
// a browser and safe to import more than once.

const g = globalThis as unknown as Record<string, unknown>;

if (typeof g.FileReader === 'undefined') {
  type FileReaderEvent = { target: FileReaderShim };
  type FileReaderHandler = ((this: FileReaderShim, ev: FileReaderEvent) => void) | null;
  class FileReaderShim {
    result: unknown = null;
    onload: FileReaderHandler = null;
    onloadend: FileReaderHandler = null;
    onerror: ((err: unknown) => void) | null = null;
    readyState = 0;
    private fire() {
      this.readyState = 2;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then((buf) => {
        const b64 = Buffer.from(buf).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
        this.fire();
      });
    }
    readAsArrayBuffer(blob: Blob) {
      void blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.fire();
      });
    }
  }
  g.FileReader = FileReaderShim;
}

if (typeof g.self === 'undefined') g.self = globalThis;
