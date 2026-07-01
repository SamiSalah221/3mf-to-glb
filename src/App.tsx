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
      <div className="h-full flex flex-col items-center justify-center bg-bg gap-4">
        <div className="text-red-400 text-sm font-mono font-medium tracking-wider uppercase">Parse error</div>
        <p className="text-tx2 text-sm font-mono max-w-md text-center leading-relaxed">{error}</p>
        <button
          onClick={reset}
          className="mt-2 px-4 py-2 bg-accent hover:opacity-90 text-bg rounded text-sm font-mono font-medium transition-opacity"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (isParsed) return <EditorScreen />;
  if (isLoading) return <LoadingScreen />;
  return <UploadScreen />;
}
