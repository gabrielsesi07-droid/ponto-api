self.addEventListener('push', event => {
  let data = {};
  try { data = event.data.json(); } catch { /* generic notification */ }
  const url = /^\/\?view=orders&order=[a-f0-9-]{36}$/.test(data.url || '') ? data.url : '/?view=orders';
  event.waitUntil(self.registration.showNotification(data.title || 'HoraCerta', {
    body: data.body || 'Há uma nova OS para conferir.', icon: '/icon', badge: '/favicon.svg',
    tag: data.tag || 'horacerta-os', data: {url}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/?view=orders', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.openWindow(url.href));
});
