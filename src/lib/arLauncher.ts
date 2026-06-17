// AR-handoff helpers for the recolored model.
//
// iOS Safari: an <a rel="ar" href="model.usdz"><img></a> click is the
//   officially supported way to drop into AR Quick Look. The <img> child is
//   required by WebKit — without it, Safari falls back to a plain download.
// Android Chrome: the Scene Viewer intent URL deep-links into the system AR
//   viewer with a GLB.
// Desktop / unknown: there is no first-party AR runtime, so we just download
//   the GLB and let the user open it in a viewer of their choice.

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

export function launchSceneViewer(glbBytes: Uint8Array, filename: string, title: string): void {
  // Scene Viewer wants a publicly fetchable URL; a blob URL works within the
  // same browser session because the OS intent piggybacks on Chrome.
  const blob = new Blob([new Uint8Array(glbBytes)], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);

  const intent =
    `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(url)}` +
    `&mode=ar_preferred&title=${encodeURIComponent(title)}` +
    `#Intent;scheme=https;package=com.google.ar.core;` +
    `S.browser_fallback_url=${encodeURIComponent(url)};end;`;

  const a = document.createElement('a');
  a.href = intent;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}
