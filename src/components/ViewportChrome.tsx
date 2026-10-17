import { useAppStore } from '../store/useAppStore';

/**
 * Floating overlay on the 3D viewport. The proof sheet around the viewport
 * carries the version switch, size and color bar; this keeps only what
 * belongs to the camera.
 */
export function ViewportChrome() {
  const cameraProjection = useAppStore((s) => s.cameraProjection);
  const setCameraProjection = useAppStore((s) => s.setCameraProjection);
  const orbitHintSeen = useAppStore((s) => s.orbitHintSeen);
  const isOrtho = cameraProjection === 'orthographic';

  return (
    <>
      {!orbitHintSeen && (
        <div className="absolute top-3 left-3 pointer-events-none select-none font-mono text-[11px] text-tx2">
          Drag to orbit · click a zone to recolor
        </div>
      )}

      {/* Bottom-right; the top-right corner is the axis gizmo's. */}
      <div className="absolute bottom-3 right-3 select-none">
        <button
          type="button"
          onClick={() => setCameraProjection(isOrtho ? 'perspective' : 'orthographic')}
          title={isOrtho ? 'Switch to perspective' : 'Switch to orthographic'}
          className="pointer-events-auto flex items-center gap-1.5 h-8 px-2.5 bg-panel/90 border border-line hover:border-tx text-tx2 hover:text-tx font-mono text-[11px] transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" />
            <path d="M3 7l9 4.5L21 7" />
            <path d="M12 11.5V21.5" />
          </svg>
          {isOrtho ? 'ORTHOGRAPHIC' : 'PERSPECTIVE'}
        </button>
      </div>
    </>
  );
}
