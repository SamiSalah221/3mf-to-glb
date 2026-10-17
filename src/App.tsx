import { useAppStore } from './store/useAppStore';
import { UploadScreen } from './components/UploadScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { EditorScreen } from './components/EditorScreen';

export default function App() {
  const isLoading = useAppStore((s) => s.isLoading);
  const isParsed = useAppStore((s) => s.isParsed);
  const error = useAppStore((s) => s.error);
  const reset = useAppStore((s) => s.reset);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg text-tx gap-4 px-6">
        <span className="font-mono text-[12px] tracking-[0.08em] px-2 py-1 bg-accent text-accent-fg">COULD NOT OPEN</span>
        <p className="text-tx2 text-[15px] max-w-md text-center leading-relaxed">{error}</p>
        <button
          onClick={reset}
          className="mt-2 h-12 px-5 bg-tx text-bg font-semibold text-[15px] hover:bg-white transition-colors"
        >
          Start a new job
        </button>
      </div>
    );
  }

  if (isParsed) return <EditorScreen />;
  if (isLoading) return <LoadingScreen />;
  return <UploadScreen />;
}
