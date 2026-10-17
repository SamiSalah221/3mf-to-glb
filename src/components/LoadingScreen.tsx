import { Logo } from './Logo';

export function LoadingScreen() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-bg text-tx gap-5">
      <Logo className="w-10 h-10 text-tx animate-spin [animation-duration:2.4s]" />
      <p className="font-mono text-[12px] tracking-[0.08em] text-tx2 uppercase">Pulling the proof…</p>
      <p className="text-tx3 text-[13px]">Reading the file and its color zones on this device</p>
    </div>
  );
}
