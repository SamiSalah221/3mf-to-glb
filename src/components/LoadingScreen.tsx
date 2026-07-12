export function LoadingScreen() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-bg gap-5">
      <div className="w-10 h-10 border-2 border-line2 border-t-accent rounded-full animate-spin" />
      <p className="text-tx3 text-xs">
        Parsing model and detecting color zones
      </p>
    </div>
  );
}
