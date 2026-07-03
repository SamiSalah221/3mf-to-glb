import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '../store/useAppStore';
import { parse3MF } from '../lib/parse3MF';

const SAMPLES_BASE_URL =
  'https://raw.githubusercontent.com/SamiSalah221/3mf-to-glb/master/samples/';

const SAMPLES = [
  { label: 'Try sample · owl (Bambu)', filename: 'watchful-owl.3mf', downloadName: 'owl-sample.3mf' },
  {
    label: 'Try sample · sea slug (U1)',
    filename: '海蛞蝓【项目】U1  sea.3mf',
    downloadName: 'u1-sample.3mf',
  },
];

export function UploadScreen() {
  const { setFile, setLoading, setError, setParsed } = useAppStore();

  const loadBuffer = useCallback(
    async (file: File) => {
      setFile(file);
      setLoading(true);
      try {
        const buffer = await file.arrayBuffer();
        const result = await parse3MF(buffer);
        setParsed(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse 3MF file');
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
      try {
        setLoading(true);
        const res = await fetch(SAMPLES_BASE_URL + encodeURIComponent(sample.filename));
        if (!res.ok) throw new Error(`Sample download failed (${res.status})`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const file = new File([new Uint8Array(bytes)], sample.downloadName, { type: 'model/3mf' });
        await loadBuffer(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load sample file');
      }
    },
    [loadBuffer, setLoading, setError],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml': ['.3mf'] },
    multiple: false,
  });

  return (
    <div className="h-full flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-6">
        {/* Drop zone card */}
        <div
          {...getRootProps()}
          className={`w-[560px] max-w-[90vw] border border-dashed rounded-xl p-14 text-center cursor-pointer transition-all duration-200 ${
            isDragActive
              ? 'border-accent bg-accent/10 scale-[1.02]'
              : 'border-line3 bg-panel hover:border-line2 hover:bg-panel2'
          }`}
        >
          <input {...getInputProps()} />

          {/* Upload glyph */}
          <div className="text-4xl text-tx3 mb-6 select-none">↥</div>

          <h1 className="text-xl font-semibold text-tx mb-2">
            {isDragActive ? 'Drop to open…' : 'Drop a multi-color .3mf'}
          </h1>

          <p className="text-tx2 text-sm mb-3">
            See your print before you print it — colors preserved from slicer to screen to AR.
          </p>

          <p className="text-tx3 text-xs font-mono leading-relaxed">
            Bambu Studio · OrcaSlicer · Snapmaker U1 · parsed locally — nothing uploaded
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {SAMPLES.map((sample) => (
            <button
              key={sample.filename}
              type="button"
              onClick={() => onTrySample(sample)}
              className="px-4 py-2 bg-accent hover:opacity-90 text-bg text-sm font-mono font-medium rounded transition-opacity"
            >
              {sample.label}
            </button>
          ))}
          <label className="px-4 py-2 border border-line2 hover:border-line3 text-tx2 text-sm font-mono rounded cursor-pointer transition-colors">
            Browse file
            <input
              type="file"
              accept=".3mf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadBuffer(f);
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
