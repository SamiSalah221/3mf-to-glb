import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '../store/useAppStore';
import { parse3MF } from '../lib/parse3MF';
import { isGcodeFile } from '../lib/parseGcode';
import { parseGcodeInWorker } from '../workers/parseGcodeInWorker';

const SAMPLES_BASE_URL =
  'https://raw.githubusercontent.com/SamiSalah221/3mf-to-glb/master/samples/';

const SAMPLES = [
  { label: 'Owl sample (Bambu)', filename: 'watchful-owl.3mf', downloadName: 'owl-sample.3mf' },
  {
    label: 'Sea slug sample (Snapmaker U1)',
    filename: '海蛞蝓【项目】U1  sea.3mf',
    downloadName: 'u1-sample.3mf',
  },
];

export function UploadScreen() {
  const { setFile, setLoading, setError, setParsed } = useAppStore();
  const [loadingSample, setLoadingSample] = useState<string | null>(null);

  const loadBuffer = useCallback(
    async (file: File) => {
      setFile(file);
      setLoading(true);
      try {
        const buffer = await file.arrayBuffer();
        // Sliced G-code (.gcode, or a .gcode.3mf plate export) gives the
        // as-printed model, built from the toolpath.
        const result = (await isGcodeFile(buffer))
          ? await parseGcodeInWorker(buffer)
          : await parse3MF(buffer);
        setParsed(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file');
      }
    },
    [setFile, setLoading, setError, setParsed],
  );

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const file = accepted[0];
      if (file) await loadBuffer(file);
    },
    [loadBuffer],
  );

  const onTrySample = useCallback(
    async (sample: (typeof SAMPLES)[number]) => {
      setLoadingSample(sample.filename);
      try {
        setLoading(true);
        const res = await fetch(SAMPLES_BASE_URL + encodeURIComponent(sample.filename));
        if (!res.ok) throw new Error(`Sample download failed (${res.status})`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const file = new File([new Uint8Array(bytes)], sample.downloadName, { type: 'model/3mf' });
        await loadBuffer(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load sample file');
      } finally {
        setLoadingSample(null);
      }
    },
    [loadBuffer, setLoading, setError],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-package.3dmanufacturing-3dmodel+xml': ['.3mf'],
      'text/x-gcode': ['.gcode'],
    },
    multiple: false,
  });

  return (
    <div className="h-full flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-6">
        {/* Drop zone card */}
        <div
          {...getRootProps()}
          className={`w-[560px] max-w-[90vw] border rounded-lg p-14 text-center cursor-pointer transition-all duration-200 ${
            isDragActive
              ? 'border-accent bg-panel shadow-[inset_0_0_40px_rgba(109,90,230,0.18)]'
              : 'border-line bg-panel hover:border-line2 hover:bg-panel2'
          }`}
        >
          <input {...getInputProps()} />

          {/* Build-plate cube icon */}
          <div className="flex justify-center text-tx3 mb-6 select-none">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" />
              <path d="M3 7l9 4.5L21 7" />
              <path d="M12 11.5V21.5" />
            </svg>
          </div>

          <h1 className="text-xl font-semibold text-tx mb-2">
            {isDragActive ? 'Drop to open' : 'Drop a multi-color .3mf or sliced G-code'}
          </h1>

          <p className="text-tx2 text-sm mb-3">
            See your colors before you print. Printproof keeps them accurate from slicer to screen to AR.
          </p>

          <p className="text-tx3 text-xs leading-relaxed">
            Works with Bambu Studio, OrcaSlicer, and Snapmaker U1. A sliced .gcode or .gcode.3mf shows the part as
            it will print, every layer line included. Files are parsed on your device and never uploaded.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <label className="h-11 px-5 flex items-center bg-accent hover:bg-accent-hover active:bg-accent-active text-accent-fg text-sm font-semibold rounded-md cursor-pointer transition-colors active:scale-[0.98]">
            Browse file
            <input
              type="file"
              accept=".3mf,.gcode"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadBuffer(f);
              }}
            />
          </label>
          {SAMPLES.map((sample) => {
            const isLoadingThis = loadingSample === sample.filename;
            return (
              <button
                key={sample.filename}
                type="button"
                onClick={() => onTrySample(sample)}
                disabled={loadingSample !== null}
                className="h-11 px-5 flex items-center gap-2 bg-panel2 hover:bg-panel3 border border-line hover:border-line2 disabled:opacity-40 text-tx text-sm rounded-md transition-colors active:scale-[0.98]"
              >
                {isLoadingThis && (
                  <span className="w-3.5 h-3.5 border-2 border-line3 border-t-accent rounded-full animate-spin flex-shrink-0" aria-hidden="true" />
                )}
                {sample.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
