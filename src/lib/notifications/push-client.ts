// ============================================================
// Browser-side Web Push helpers.
//
// Talks to the Push API + our /api/push/subscribe endpoint. All calls
// are safe to no-op when unsupported (older browsers, insecure
// origins other than localhost) so callers can render a settings
// toggle unconditionally.
// ============================================================

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext
  );
}

export function permissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/** base64url VAPID public key → Uint8Array for applicationServerKey. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/**
 * Ask for permission, subscribe the SW's registration to push, and
 * register the endpoint with the server. Returns the active
 * subscription, or null when denied / unsupported / already gone.
 */
export async function enablePush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const registration = await navigator.serviceWorker.ready;
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.warn('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — skipping subscribe');
    return null;
  }

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
    }));

  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...subscription.toJSON(),
      userAgent: navigator.userAgent,
    }),
  });

  return subscription;
}

/** Unsubscribe from push and tell the server to drop the endpoint. */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

/** Current subscription without prompting — for the settings toggle. */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

/** Fire a local OS notification through the SW (used by "Send test"). */
export async function showTestNotification(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('Test notification', {
    body: 'Tijwa CRM browser notifications are working.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'tijwa-test',
    data: { url: '/notifications' },
  });
}
