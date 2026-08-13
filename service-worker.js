const CACHE_NAME = 'japstudy-v1';
const STATIC_ASSETS = [
    './sito_home.html',
    './style.css',
    './script.js',
    './data.js',
    './verbEngine.js',
    './uiUtils.js',
    './firebaseInit.js',
    './customDecks.js'
];

// Installazione: metti in cache i file statici
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[SW] Cache addAll parzialmente fallita:', err);
            });
        })
    );
    self.skipWaiting();
});

// Attivazione: rimuovi cache vecchie
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch: network-first per Firebase/Google, cache-first per assets locali
self.addEventListener('fetch', event => {
    const url = event.request.url;
    if (!url.startsWith('http')) return;
    // Sempre rete per Firebase, Google Fonts, googleapis
    if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')) return;

    event.respondWith(
        caches.match(event.request).then(cached => {
            const networkFetch = fetch(event.request).then(response => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => cached); // offline fallback
            return cached || networkFetch;
        })
    );
});

// Notifica push ricevuta dal server (per uso futuro con VAPID)
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'JapStudy Pro';
    const body  = data.body  || 'Hai studiato giapponese oggi? 🎌';
    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon: './icon-192.png',
            badge: './icon-192.png',
            tag: 'japstudy-reminder',
            renotify: false,
            data: { url: './' }
        })
    );
});

// Click su notifica → apri app
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            const existing = list.find(c => c.url.includes('sito_home') && 'focus' in c);
            if (existing) return existing.focus();
            return clients.openWindow('./sito_home.html');
        })
    );
});

// Messaggio dalla pagina: mostra notifica schedulata client-side
self.addEventListener('message', event => {
    if (event.data?.type === 'SHOW_NOTIF') {
        self.registration.showNotification(event.data.title || 'JapStudy Pro', {
            body: event.data.body || 'Hai studiato giapponese oggi? 🎌',
            icon: './icon-192.png',
            tag: 'japstudy-reminder',
            renotify: false
        });
    }
});
