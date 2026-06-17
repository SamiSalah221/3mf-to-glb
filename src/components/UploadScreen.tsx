import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '../store/useAppStore';
import { parse3MF } from '../lib/parse3MF';
// Vite asset import: kept out of the JS bundle, emitted as a hashed file
// next to index.html. Lets the demo offer a sample without any upload.
import u1SampleUrl from '../../samples/watchful-owl.3mf?url';

const U1_SAMPLE_NAME = 'watchful-owl-u1-sample.3mf';

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

  const onTrySample = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(u1SampleUrl);
      if (!res.ok) throw new Error(`Sample download failed (${res.status})`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const file = new File([new Uint8Array(bytes)], U1_SAMPLE_NAME, { type: 'model/3mf' });
      await loadBuffer(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load U1 sample');
    }
  }, [loadBuffer, setLoading, setError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml': ['.3mf'] },
    multiple: false,
  });

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="flex flex-col items-center gap-4">
        <div
          {...getRootProps()}
          className={`w-[560px] max-w-[90vw] border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-200 ${
            isDragActive
              ? 'border-emerald-400 bg-emerald-400/10 scale-105'
              : 'border-slate-500 hover:border-slate-400 hover:bg-slate-700/30'
          }`}
        >
          <input {...getInputProps()} />
          <div className="text-5xl mb-6">📦</div>
          <h1 className="text-2xl font-bold text-white mb-3">3MF Color Customizer</h1>
          <p className="text-slate-300 text-lg mb-2">
            {isDragActive
              ? 'Drop your file here...'
              : 'Drop your .3mf file here or click to browse'}
          </p>
          <p className="text-slate-500 text-sm">
            Snapmaker U1, OrcaSlicer, and Bambu Studio multi-color 3MFs supported
          </p>
        </div>

        <button
          type="button"
          onClick={onTrySample}
          className="text-sm text-emerald-300 hover:text-emerald-200 underline underline-offset-4 transition-colors"
        >
          Try with a Snapmaker U1 / OrcaSlicer sample (no upload)
        </button>
      </div>
    </div>
  );
}
