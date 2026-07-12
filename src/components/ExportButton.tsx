import { RotationControls } from './RotationControls';
import { ExportActions } from './ExportActions';

/** Standalone export panel used on mobile (includes RotationControls). */
export function ExportButton() {
  return (
    <div className="space-y-4">
      <RotationControls />
      <ExportActions layout="stack" />
    </div>
  );
}
