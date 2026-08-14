// GROWI Web Push用 Service Worker
// このファイルは apps/app/public/sw.js に配置する

self.addEventListener('install', (event) => {
  // 新しいService Workerをすぐに有効化する
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 有効化後、すぐに全てのクライアントを制御下に置く
  event.waitUntil(self.clients.claim());
});

// プッシュ通知を受信したときの処理
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    // JSONでなければテキストとして扱う
    payload = { title: '物理部Wiki', body: event.data.text() };
  }

  const title = payload.title || '物理部Wiki';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    data: {
      url: payload.url || '/', // 通知タップ時に開くURL
    },
    tag: payload.tag, // 同じtagの通知は上書きされる(任意)
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知をタップしたときの処理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 既に同じURLを開いているタブがあればそれにフォーカス
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // 無ければ新しいタブで開く
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
