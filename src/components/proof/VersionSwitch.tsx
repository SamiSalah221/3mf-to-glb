import { useAppStore } from '../../store/useAppStore';
import { useVersionInfo } from '../../hooks/useVersionInfo';
import { useAddVersion } from '../../hooks/useOpenFiles';
import { FilePickButton } from './primitives';

/**
 * The sheet's Design / As printed switch. With only one version loaded it
 * offers to add the other instead.
 */
export function VersionSwitch({ compact = false }: { compact?: boolean }) {
  const { both, viewMode } = useVersionInfo();
  const setViewMode = useAppStore((s) => s.setViewMode);
  const { missing, add, busy } = useAddVersion();
  const h = compact ? 'h-10' : 'h-9';

  if (both) {
    return (
      <div role="group" aria-label="Proof" className="flex border border-tx">
        {(['model', 'printed'] as const).map((m, i) => (
          <button
            key={m}
            type="button"
            aria-pressed={viewMode === m}
            onClick={() => setViewMode(m)}
            className={`${h} px-3 text-[12px] font-medium transition-colors ${i ? 'border-l border-tx' : ''} ${
              viewMode === m ? 'bg-tx text-bg' : 'text-tx hover:bg-panel3'
            }`}
          >
            {m === 'model' ? 'Design' : 'As printed'}
          </button>
        ))}
      </div>
    );
  }

  if (!missing) return null;
  return (
    <FilePickButton
      accept={missing === 'printed' ? '.gcode,.3mf' : '.3mf'}
      onPick={(files) => void add(files[0])}
      disabled={busy !== null}
      className={`${h} px-3 flex items-center gap-2 border border-dashed border-line3 text-tx hover:border-tx text-[12px] font-medium transition-colors disabled:opacity-60`}
    >
      {busy ? (
        <span className="w-3 h-3 border-2 border-line3 border-t-accent rounded-full animate-spin" aria-hidden="true" />
      ) : (
        <span aria-hidden="true" className="text-accent">+</span>
      )}
      {busy ?? (missing === 'printed' ? 'Add sliced G-code' : 'Add design 3MF')}
    </FilePickButton>
  );
}
