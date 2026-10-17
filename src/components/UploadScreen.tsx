import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '../store/useAppStore';
import { useOpenFiles } from '../hooks/useOpenFiles';
import { Logo } from './Logo';
import { Caps, ProofSheet, TicketHeading } from './proof/primitives';
import { PRIMARY, SECONDARY } from './proof/constants';

const SAMPLES_BASE_URL =
  'https://raw.githubusercontent.com/SamiSalah221/3mf-to-glb/master/samples/';

interface SampleFile {
  filename: string;
  downloadName: string;
}

/** A sample design; `gcode` is its sliced print, opened with it so both versions load. */
interface Sample extends SampleFile {
  label: string;
  gcode?: SampleFile;
}

const SAMPLES: Sample[] = [
  { label: 'Owl · Bambu', filename: 'watchful-owl.3mf', downloadName: 'owl-sample.3mf' },
  {
    label: 'Sea slug · Snapmaker U1',
    filename: '海蛞蝓【项目】U1  sea.3mf',
    downloadName: 'u1-sample.3mf',
    gcode: { filename: '组合体_PLA_10h17m.gcode', downloadName: 'u1-sample.gcode' },
  },
];

async function fetchSample({ filename, downloadName }: SampleFile): Promise<File> {
  const res = await fetch(SAMPLES_BASE_URL + encodeURIComponent(filename));
  if (!res.ok) throw new Error(`Sample download failed (${res.status})`);
  return new File([await res.arrayBuffer()], downloadName);
}

const TICKET = [
  { n: 1, title: 'Open', body: 'A design, a sliced print, or both of the same part.' },
  { n: 2, title: 'Color', body: 'Every painted zone, decoded exactly; recolor any of them.' },
  { n: 3, title: 'Proof', body: 'The design next to the part as printed, at true size.' },
  { n: 4, title: 'Sign off', body: 'GLB, USDZ for AR, OBJ, or a re-tinted 3MF that still slices.' },
];

export function UploadScreen() {
  const { setLoading, setError } = useAppStore();
  const openFiles = useOpenFiles();
  const [loadingSample, setLoadingSample] = useState<string | null>(null);

  const onTrySample = useCallback(
    async (sample: Sample) => {
      setLoadingSample(sample.filename);
      try {
        setLoading(true);
        const files = await Promise.all([sample, sample.gcode].filter((f) => f !== undefined).map(fetchSample));
        await openFiles(files);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load sample file');
      } finally {
        setLoadingSample(null);
      }
    },
    [openFiles, setLoading, setError],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (files) => void openFiles(files),
    accept: {
      'application/vnd.ms-package.3dmanufacturing-3dmodel+xml': ['.3mf'],
      'text/x-gcode': ['.gcode'],
    },
    multiple: true,
    maxFiles: 2,
    noClick: true,
  });

  return (
    <div className="h-full overflow-y-auto cc-scroll bg-bg text-tx">
      <header className="flex items-center justify-between flex-wrap gap-4 px-6 lg:px-10 py-4 border-b border-line">
        <div className="flex items-center gap-3.5">
          <Logo className="w-7 h-7 text-tx" />
          <span className="font-bold text-[18px] tracking-[-0.01em]">Printproof</span>
          <Caps className="text-tx3">Job — new</Caps>
        </div>
        <span className="font-mono text-[12px] text-tx2">Runs on this device · nothing is uploaded</span>
      </header>

      <main className="flex flex-wrap gap-10 px-6 lg:px-10 py-8 lg:py-12 max-w-[1360px] mx-auto">
        <ProofSheet className="flex-[999_1_640px] min-w-0 p-8 lg:p-14 flex flex-col gap-7" markSize={22}>
          <Caps className="text-accent">Step 1 of 4 · Open</Caps>
          <h1 className="m-0 text-[44px] lg:text-[64px] leading-[1.02] font-bold tracking-[-0.03em] max-w-[720px]">
            Pull a proof before you pull the filament.
          </h1>
          <p className="m-0 text-[17px] lg:text-[18px] leading-relaxed text-tx2 max-w-[600px]">
            Drop the design .3mf, its sliced .gcode, or both. Colors come straight from the slicer; the
            G-code shows every layer line the printer will lay down.
          </p>

          <div
            {...getRootProps()}
            className={`relative flex flex-col items-center justify-center gap-3.5 min-h-[240px] border-[1.5px] border-dashed text-center p-6 transition-colors ${
              isDragActive ? 'border-accent bg-panel3' : 'border-line3 bg-panel2'
            }`}
          >
            <input {...getInputProps()} aria-label="Choose a .3mf, a .gcode, or both" />
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-tx">
              <path d="M20 26V8M13 15l7-7 7 7" />
              <path d="M6 26v6h28v-6" />
            </svg>
            <span className="text-[20px] font-semibold">{isDragActive ? 'Drop to open' : 'Drop files here'}</span>
            <span className="font-mono text-[13px] text-tx2">.3mf · .gcode · .gcode.3mf — one or both</span>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button type="button" onClick={open} className={PRIMARY}>
              Choose files
            </button>
            <span className="text-[14px] text-tx2">or try a sample:</span>
            {SAMPLES.map((sample) => (
              <button
                key={sample.filename}
                type="button"
                onClick={() => onTrySample(sample)}
                disabled={loadingSample !== null}
                className={SECONDARY}
              >
                {loadingSample === sample.filename && (
                  <span className="w-3.5 h-3.5 border-2 border-line3 border-t-accent rounded-full animate-spin" aria-hidden="true" />
                )}
                {sample.label}
                {sample.gcode && <span className="font-mono text-[12px] text-tx2">+ G-code</span>}
              </button>
            ))}
          </div>
        </ProofSheet>

        <aside className="flex-[1_1_340px] min-w-0 flex flex-col gap-5">
          <TicketHeading>Job ticket</TicketHeading>
          {TICKET.map((t) => (
            <div key={t.n} className="flex gap-4 items-start">
              <span
                className={`font-mono text-[13px] w-7 h-7 flex-shrink-0 flex items-center justify-center ${
                  t.n === 1 ? 'bg-tx text-bg' : 'border border-tx'
                }`}
              >
                {t.n}
              </span>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-[16px]">{t.title}</span>
                <span className="text-[14px] text-tx2 leading-relaxed">{t.body}</span>
              </div>
            </div>
          ))}
          <div className="mt-auto flex flex-col gap-2 pt-4">
            <Caps>Color bar</Caps>
            <div className="grid grid-cols-8 border border-tx h-7">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className={i < 7 ? 'border-r border-line' : ''} />
              ))}
            </div>
            <span className="text-[13px] text-tx2">Fills with the job's filaments once a file is open.</span>
          </div>
        </aside>
      </main>
    </div>
  );
}
