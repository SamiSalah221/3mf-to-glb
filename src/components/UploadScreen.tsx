import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '../store/useAppStore';
import { parse3MF } from '../lib/parse3MF';

export function UploadScreen() {
  const { setFile, setLoading, setError, setParsed } = useAppStore();

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;

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
    [setFile, setLoading, setError, setParsed]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml': ['.3mf'] },
    multiple: false,
  });

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
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
        <h1 className="text-2xl font-bold text-white mb-3">
          3MF Color Customizer
        </h1>
        <p className="text-slate-300 text-lg mb-2">
          {isDragActive
            ? 'Drop your file here...'
            : 'Drop your .3mf file here or click to browse'}
        </p>
        <p className="text-slate-500 text-sm">
          Multi-color 3MF files from Bambu Studio supported
        </p>
      </div>
    </div>
  );
}
