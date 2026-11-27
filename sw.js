// Service worker: tampilan bisa dibuka cepat + menerima notifikasi browser
const CACHE = 'presensi-v2';
const ASET = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/api.js', 'js/ui.js', 'js/config.js',
  'js/pages/guru.js', 'js/pages/kelola.js', 'js/pages/laporan.js', 'js/pages/umum.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASET)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// file aplikasi: ambil versi terbaru dari jaringan, pakai cache bila offline
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const salin = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, salin)); return r;
  }).catch(() => caches.match(e.request)));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { judul: 'Presensi Guru', isi: e.data?.text() }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.judul || 'Presensi Guru', {
      body: d.isi || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { tautan: d.tautan || '#/notifikasi' }, tag: d.tag,
    }),
    self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ jenis: 'push' }))),
  ]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const tujuan = new URL('./' + (e.notification.data?.tautan || ''), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const ada = cs.find((c) => c.url.startsWith(self.registration.scope));
    if (ada) { ada.navigate(tujuan); return ada.focus(); }
    return self.clients.openWindow(tujuan);
  }));
});
