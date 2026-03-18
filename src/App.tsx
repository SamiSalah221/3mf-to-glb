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
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 gap-4">
        <div className="text-red-400 text-lg font-medium">Error</div>
        <p className="text-slate-300 text-sm max-w-md text-center">{error}</p>
        <button
          onClick={reset}
          className="mt-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
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
