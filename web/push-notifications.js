(() => {
  const state = { registration: null, publicKey: null };
  const api = p => `${location.origin}${p}`;

  function b64ToBytes(base64) {
    const pad = '='.repeat((4 - base64.length % 4) % 4);
    const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function getRegistration() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push notifications are not supported by this browser');
    state.registration = await navigator.serviceWorker.ready;
    return state.registration;
  }

  async function enablePush() {
    const reg = await getRegistration();
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted');
    const keyRes = await fetch(api('/api/push/public-key'), { credentials: 'same-origin' });
    if (!keyRes.ok) throw new Error('Push server is not configured');
    state.publicKey = (await keyRes.json()).publicKey;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(state.publicKey) });
    const res = await fetch(api('/api/push/subscribe'), {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ subscription: sub.toJSON() })
    });
    if (!res.ok) throw new Error('Could not save push subscription');
    localStorage.setItem('free-heart-push-enabled', '1');
    return true;
  }

  async function disablePush() {
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch(api('/api/push/unsubscribe'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    localStorage.removeItem('free-heart-push-enabled');
  }

  window.FreeHeartPush = { enablePush, disablePush };
})();
