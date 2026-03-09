// Service Worker for WhatsApp Clone PWA
const CACHE_NAME = 'whatsapp-clone-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
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

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip PeerJS and external requests
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin ||
      url.hostname.includes('peerjs') ||
      url.hostname.includes('webrtc')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200) {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Return offline page for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/');
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
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'whatsapp-notification',
    renotify: true,
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
      renotify: data.renotify,
      data: data.data,
      vibrate: [200, 100, 200],
      actions: [
        {
          action: 'reply',
          title: 'Reply',
          icon: '/icon-192.png'
        },
        {
          action: 'open',
          title: 'Open',
          icon: '/icon-192.png'
        }
      ]
    })
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification click:', event.action);
  event.notification.close();

  if (event.action === 'reply') {
    // Handle reply action
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            if (client.url === '/' && 'focus' in client) {
              return client.focus();
            }
          }
          return clients.openWindow('/');
        })
    );
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            if (client.url === '/' && 'focus' in client) {
              return client.focus();
            }
          }
          return clients.openWindow('/');
        })
    );
  }
});

// Background sync for messages
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);

  if (event.tag === 'send-message') {
    event.waitUntil(
      // Sync pending messages
      syncPendingMessages()
    );
  }
});

async function syncPendingMessages() {
  // Get pending messages from IndexedDB and send them
  console.log('[ServiceWorker] Syncing pending messages');
}

// Handle incoming messages while app is in background
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);

  if (event.data && event.data.type === 'NEW_MESSAGE') {
    const { senderId, text } = event.data;

    // Show local notification
    self.registration.showNotification('WhatsApp', {
      body: `${senderId}: ${text}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'whatsapp-message',
      renotify: true,
      data: {
        url: `/?chat=${senderId}`
      }
    });
  }
});
