// Service Worker for WhatsApp Clone PWA
const CACHE_NAME = 'whatsapp-clone-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching static assets');
        // Add all assets that exist
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            fetch(url).then(response => {
              if (response.ok) {
                return cache.put(url, response);
              }
            }).catch(() => {})
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[ServiceWorker] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip PeerJS and external requests
  if (url.origin !== self.location.origin ||
      url.hostname.includes('peerjs') ||
      url.hostname.includes('webrtc') ||
      url.hostname.includes('0.peerjs.com')) {
    return;
  }

  // Handle navigation requests (HTML pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the successful response
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Return cached index.html for offline
          return caches.match('/index.html');
        })
    );
    return;
  }

  // For other requests (CSS, JS, images, etc.)
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached response and update cache in background
          fetch(event.request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, response);
                });
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(event.request)
          .then((response) => {
            // Cache successful responses
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            // Return appropriate fallback for asset types
            if (url.pathname.match(/\.(js|css)$/)) {
              return new Response('', { status: 408 });
            }
          });
      })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push received');

  let data = {
    title: 'WhatsApp',
    body: 'You have a new message',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'whatsapp-notification',
    data: {
      url: '/'
    }
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        ...data,
        ...payload
      };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      vibrate: [200, 100, 200]
    })
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification click:', event.action);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow('/');
      })
  );
});

// Handle incoming messages while app is in background
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);

  if (event.data && event.data.type === 'NEW_MESSAGE') {
    const { senderId, text } = event.data;

    // Show local notification
    self.registration.showNotification('WhatsApp', {
      body: `${senderId}: ${text}`,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'whatsapp-message',
      data: {
        url: '/'
      }
    });
  }
});
