// AR-handoff helpers for the recolored model.
//
// iOS Safari: an <a rel="ar" href="model.usdz"><img></a> click is the
//   officially supported way to drop into AR Quick Look. The <img> child is
//   required by WebKit — without it, Safari falls back to a plain download.
// Android Chrome: we use <model-viewer> with ar-modes="webxr" to launch an
//   in-page WebXR session. Scene Viewer (the old path) requires a publicly
//   fetchable URL and cannot load blob: URLs produced by a pure-client-side
//   app; model-viewer renders from in-memory bytes, which fixes the crash.
// Desktop / unknown: there is no first-party AR runtime, so we just download
//   the GLB and let the user open it in a viewer of their choice.

import type { ModelViewerElement } from '@google/model-viewer';
import { triggerBrowserDownload } from './glbExporter.js';

export type ArPlatform = 'ios' | 'android' | 'desktop';

export function detectArPlatform(): ArPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  // iPadOS reports "Macintosh" plus touch support; check for both.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document);
  if (isIOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function launchQuickLook(usdzBytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(usdzBytes)], { type: 'model/vnd.usdz+zip' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.rel = 'ar';
  a.href = url + '#allowsContentScaling=0';
  a.download = filename;
  // Quick Look requires an <img> inside the anchor or it downloads instead.
  const img = document.createElement('img');
  img.alt = 'View in AR';
  img.width = 1;
  img.height = 1;
  img.style.position = 'fixed';
  img.style.opacity = '0';
  a.appendChild(img);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}

export async function launchWebXR(glbBytes: Uint8Array, filename: string): Promise<void> {
  // Register the <model-viewer> custom element (side-effect import).
  await import('@google/model-viewer');

  const blob = new Blob([new Uint8Array(glbBytes)], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);

  const modelViewer = document.createElement('model-viewer') as unknown as ModelViewerElement;
  modelViewer.setAttribute('src', url);
  modelViewer.setAttribute('ar', '');
  modelViewer.setAttribute('ar-modes', 'webxr');
  modelViewer.setAttribute('ar-scale', 'fixed');
  // Visually hidden — we only need it for the WebXR session, not to display.
  modelViewer.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(modelViewer);

  const cleanup = () => {
    if (modelViewer.parentNode) modelViewer.parentNode.removeChild(modelViewer);
    URL.revokeObjectURL(url);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      modelViewer.addEventListener('load', () => resolve(), { once: true });
      modelViewer.addEventListener('error', (e) => reject(e), { once: true });
      setTimeout(() => reject(new Error('model-viewer load timeout')), 15000);
    });

    if (!modelViewer.canActivateAR) {
      cleanup();
      triggerBrowserDownload(glbBytes, filename, 'model/gltf-binary');
      window.alert(
        'WebXR AR is not available on this device. The GLB has been downloaded — ' +
          'open it in a viewer like model-viewer or Blender.',
      );
      return;
    }

    await modelViewer.activateAR();
    // Keep the element alive while the AR session is running.
    setTimeout(cleanup, 10000);
  } catch (err) {
    cleanup();
    throw err;
  }
}
