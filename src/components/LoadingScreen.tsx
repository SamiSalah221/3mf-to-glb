export function LoadingScreen() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 gap-6">
      <div className="w-12 h-12 border-4 border-slate-600 border-t-emerald-400 rounded-full animate-spin" />
      <p className="text-slate-300 text-lg">
        Parsing model and detecting color zones...
      </p>
    </div>
  );
}
