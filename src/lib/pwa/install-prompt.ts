// ============================================================
// Captures the browser's `beforeinstallprompt` event at module load
// so the deferred prompt survives components unmounting (the event
// only fires once per session and can't be re-triggered manually).
//
// Imported from client components only; the window listeners are
// registered behind a guard so SSR imports are safe.
// ============================================================

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(event: BeforeInstallPromptEvent | null) => void>();

function emit() {
  for (const listener of listeners) listener(deferred);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Chrome only fires the event if the page doesn't call
    // preventDefault — hold it and let the UI decide when to prompt.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function subscribeInstallPrompt(
  listener: (event: BeforeInstallPromptEvent | null) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when running as an installed PWA / home-screen app. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari exposes navigator.standalone instead of matchMedia.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

/** iOS Safari has no beforeinstallprompt — callers show manual steps. */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
}
