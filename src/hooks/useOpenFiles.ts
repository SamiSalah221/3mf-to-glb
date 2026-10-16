import { useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { parse3MF } from '../lib/parse3MF';
import { isGcodeFile } from '../lib/parseGcode';
import { parseGcodeInWorker } from '../workers/parseGcodeInWorker';
import type { ParseResult } from '../types';

/** Read one file as a design (.3mf) or a print (.gcode / .gcode.3mf). */
export async function parseAnyFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  return (await isGcodeFile(buffer)) ? parseGcodeInWorker(buffer) : parse3MF(buffer);
}

/**
 * Open a job: one file, or a design and its sliced G-code dropped together.
 * Both are parsed before the editor opens, so it starts with both versions
 * (on the design) instead of flashing one and then swapping.
 */
export function useOpenFiles() {
  const { setFile, setLoading, setError, setParsed, addVersion, setViewMode } = useAppStore();

  return useCallback(
    async (files: File[]) => {
      const picked = files.slice(0, 2);
      if (!picked.length) return;
      setFile(picked[0]);
      setLoading(true);
      try {
        const results = await Promise.all(picked.map(parseAnyFile));
        const model = results.find((r) => r.sourceKind !== 'gcode');
        const printed = results.find((r) => r.sourceKind === 'gcode');
        if (results.length === 2 && (!model || !printed)) {
          throw new Error('Drop one design .3mf and its sliced G-code, or a single file.');
        }
        const first = model ?? printed!;
        if (model) setFile(picked[results.indexOf(model)]);
        setParsed(first);
        if (model && printed) {
          addVersion(printed);
          setViewMode('model');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read that file');
      }
    },
    [setFile, setLoading, setError, setParsed, addVersion, setViewMode],
  );
}

/** Add the missing version (the G-code next to a design, or the reverse) from inside the editor. */
export function useAddVersion() {
  const versions = useAppStore((s) => s.versions);
  const addVersion = useAppStore((s) => s.addVersion);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const missing: 'model' | 'printed' | null = !versions.model ? 'model' : !versions.printed ? 'printed' : null;

  const add = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const buffer = await file.arrayBuffer();
        const gcode = await isGcodeFile(buffer);
        if ((missing === 'printed') !== gcode) {
          throw new Error(missing === 'printed' ? 'Pick a sliced .gcode or .gcode.3mf.' : 'Pick the design .3mf.');
        }
        setBusy(gcode ? 'Building the press proof…' : 'Reading the design…');
        addVersion(gcode ? await parseGcodeInWorker(buffer) : await parse3MF(buffer));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read that file');
      } finally {
        setBusy(null);
      }
    },
    [missing, addVersion],
  );

  return { missing, add, busy, error };
}
