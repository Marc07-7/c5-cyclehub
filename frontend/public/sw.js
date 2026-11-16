const CACHE_VERSION = 'c5-cyclehub-v6';
const APP_CACHE = `${CACHE_VERSION}-app`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const DB_NAME = 'c5-cyclehub-offline';
const DB_VERSION = 2;
const ORDER_QUEUE_STORE = 'orderQueue';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key =>
              key.startsWith('c5-cyclehub-') &&
              key !== APP_CACHE &&
              key !== STATIC_CACHE
            )
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains('catalog')) {
        db.createObjectStore('catalog');
      }

      if (!db.objectStoreNames.contains(ORDER_QUEUE_STORE)) {
        db.createObjectStore(ORDER_QUEUE_STORE, {
          keyPath: 'idempotencyKey'
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getQueuedOrders() {
  const db = await openQueueDB();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(ORDER_QUEUE_STORE, 'readonly');
      const request = transaction.objectStore(ORDER_QUEUE_STORE).getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function deleteQueuedOrder(idempotencyKey) {
  const db = await openQueueDB();

  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(ORDER_QUEUE_STORE, 'readwrite');
      transaction.objectStore(ORDER_QUEUE_STORE).delete(idempotencyKey);

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function updateQueuedOrder(record) {
  const db = await openQueueDB();

  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(ORDER_QUEUE_STORE, 'readwrite');
      transaction.objectStore(ORDER_QUEUE_STORE).put(record);

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  for (const client of clients) {
    client.postMessage(message);
  }
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store'
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an invalid response.');
  }

  return {
    response,
    data
  };
}

async function syncOneOrder(record) {
  const apiBase = new URL(
    record.apiBase || '/api',
    self.location.origin
  ).href.replace(/\/+$/, '');

  const sessionResult = await fetchJSON(`${apiBase}/auth/me`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    }
  });

  if (
    !sessionResult.response.ok ||
    !sessionResult.data.success ||
    Number(sessionResult.data.user?.id) !== Number(record.userId)
  ) {
    await updateQueuedOrder({
      ...record,
      lastError: 'Sign in with the same customer account to sync this order.',
      lastAttemptAt: new Date().toISOString()
    });

    return {
      skipped: true
    };
  }

  const csrfResult = await fetchJSON(`${apiBase}/auth/csrf`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    }
  });

  if (
    !csrfResult.response.ok ||
    !csrfResult.data.success ||
    !csrfResult.data.csrf_token
  ) {
    throw new Error('Unable to obtain a security token for order synchronization.');
  }

  const orderResult = await fetchJSON(`${apiBase}/orders`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfResult.data.csrf_token
    },
    body: JSON.stringify({
      idempotency_key: record.idempotencyKey,
      items: record.items
    })
  });

  if (!orderResult.response.ok || !orderResult.data.success) {
    const error = new Error(
      orderResult.data.message || 'The order could not be synchronized.'
    );

    error.status = orderResult.response.status;

    if (error.status >= 400 && error.status < 500) {
      await updateQueuedOrder({
        ...record,
        lastError: error.message,
        lastAttemptAt: new Date().toISOString()
      });

      return {
        rejected: true,
        message: error.message
      };
    }

    throw error;
  }

  await deleteQueuedOrder(record.idempotencyKey);

  await notifyClients({
    type: 'C5_ORDER_SYNCED',
    order_id: Number(orderResult.data.order_id),
    idempotency_key: record.idempotencyKey
  });

  return {
    synced: true,
    orderId: Number(orderResult.data.order_id)
  };
}

async function syncOrderQueue() {
  const records = await getQueuedOrders();

  for (const record of records) {
    try {
      const result = await syncOneOrder(record);

      if (result.skipped || result.rejected) {
        continue;
      }
    } catch (error) {
      await updateQueuedOrder({
        ...record,
        lastError: error.message || 'Network error during synchronization.',
        lastAttemptAt: new Date().toISOString()
      });

      throw error;
    }
  }
}

self.addEventListener('sync', event => {
  if (event.tag === 'c5-cyclehub-order-sync') {
    event.waitUntil(syncOrderQueue());
  }
});

self.addEventListener('message', event => {
  if (event.data?.type === 'C5_SYNC_ORDERS') {
    event.waitUntil(syncOrderQueue());
  }
});

// PUSH NOTIFICATIONS
self.addEventListener('push', event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      body: event.data ? event.data.text() : ''
    };
  }

  const title = data.title || 'C5 CycleHub';

  const options = {
    body: data.body || 'You have a new notification.',

    data: {
      url: data.url || './'
    },

    // Unique tag so repeated order updates show as separate alerts.
    tag: `c5-cyclehub-${Date.now()}-${Math.random().toString(36).slice(2)}`,

    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});
// HANDLE NOTIFICATION CLICKS
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const requestedUrl = event.notification.data?.url || './';
  const targetUrl = new URL(requestedUrl, self.location.origin);

  if (targetUrl.origin !== self.location.origin) {
    targetUrl.href = self.location.origin + '/';
  }

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(async clientList => {
      for (const client of clientList) {
        if (
          client.url.startsWith(self.location.origin) &&
          'focus' in client
        ) {
          if ('navigate' in client && client.url !== targetUrl.href) {
            await client.navigate(targetUrl.href);
          }

          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl.href);
    })
  );
});

// CACHE AND OFFLINE REQUEST HANDLING
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.includes('/api/') ||
    url.pathname.includes('/backend/') ||
    url.pathname.includes('/auth/')
  ) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(APP_CACHE).then(cache =>
              cache.put('./index.html', copy)
            );
          }

          return response;
        })
        .catch(async () => {
          return await caches.match('./index.html') ||
            new Response('C5 CycleHub is offline. Please reconnect.', {
              status: 503,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8'
              }
            });
        })
    );

    return;
  }

  event.respondWith(
    caches.match(request).then(async cached => {
      if (cached) return cached;

      try {
        const response = await fetch(request);

        if (response.ok && response.type === 'basic') {
          const copy = response.clone();

          caches.open(STATIC_CACHE).then(cache =>
            cache.put(request, copy)
          );
        }

        return response;
      } catch {
        return new Response('', {
          status: 504,
          statusText: 'Offline'
        });
      }
    })
  );
});