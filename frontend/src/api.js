const API = (
  import.meta.env.VITE_API_URL || '/api'
).replace(/\/+$/, '');

let csrfToken = null;
let csrfRequest = null;

const DB_NAME = 'c5-cyclehub-offline';
const DB_VERSION = 2;
const CATALOG_STORE = 'catalog';
const ORDER_QUEUE_STORE = 'orderQueue';

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported.'));
      return;
    }

    const dbRequest = indexedDB.open(DB_NAME, DB_VERSION);

    dbRequest.onupgradeneeded = () => {
      const db = dbRequest.result;

      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE);
      }

      if (!db.objectStoreNames.contains(ORDER_QUEUE_STORE)) {
        db.createObjectStore(ORDER_QUEUE_STORE, {
          keyPath: 'idempotencyKey'
        });
      }
    };

    dbRequest.onsuccess = () => resolve(dbRequest.result);
    dbRequest.onerror = () => reject(dbRequest.error);
    dbRequest.onblocked = () => {
      console.warn('Offline database upgrade is waiting for another tab to close.');
    };
  });
}

function runStoreRequest(storeName, mode, operation) {
  return openOfflineDB().then(db => new Promise((resolve, reject) => {
    let result;
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    try {
      result = operation(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    transaction.oncomplete = () => {
      db.close();
      resolve(result?.result);
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error('Offline storage transaction aborted.'));
    };
  }));
}

async function saveCatalog(key, data) {
  try {
    await runStoreRequest(
      CATALOG_STORE,
      'readwrite',
      store => store.put(data, key)
    );
  } catch (error) {
    console.warn('Offline catalog could not be saved:', error);
  }
}

async function getCatalog(key) {
  try {
    return await runStoreRequest(
      CATALOG_STORE,
      'readonly',
      store => store.get(key)
    ) || null;
  } catch (error) {
    console.warn('Offline catalog could not be loaded:', error);
    return null;
  }
}

export async function queueOfflineOrder({
  userId,
  items,
  idempotencyKey
}) {
  const normalizedUserId = Number(userId);

  if (!Number.isInteger(normalizedUserId) || normalizedUserId < 1) {
    throw new Error('A valid signed-in customer is required to save an offline order.');
  }

  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > 50 ||
    items.some(item =>
      !Number.isInteger(Number(item.product_id)) ||
      Number(item.product_id) < 1 ||
      !Number.isInteger(Number(item.quantity)) ||
      Number(item.quantity) < 1 ||
      Number(item.quantity) > 99
    )
  ) {
    throw new Error('The cart contains invalid products or quantities.');
  }

  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(String(idempotencyKey || ''))) {
    throw new Error('A valid checkout request key is required.');
  }

  const record = {
    idempotencyKey,
    userId: normalizedUserId,
    items: items.map(item => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity)
    })),
    apiBase: API,
    createdAt: new Date().toISOString(),
    status: 'pending'
  };

  await runStoreRequest(
    ORDER_QUEUE_STORE,
    'readwrite',
    store => store.put(record)
  );

  return record;
}

export async function getQueuedOrders(userId) {
  const records = await runStoreRequest(
    ORDER_QUEUE_STORE,
    'readonly',
    store => store.getAll()
  );

  return (records || [])
    .filter(record =>
      userId == null || Number(record.userId) === Number(userId)
    )
    .sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
}

async function removeQueuedOrder(idempotencyKey) {
  return runStoreRequest(
    ORDER_QUEUE_STORE,
    'readwrite',
    store => store.delete(idempotencyKey)
  );
}

async function updateQueuedOrder(record) {
  return runStoreRequest(
    ORDER_QUEUE_STORE,
    'readwrite',
    store => store.put(record)
  );
}

async function sendQueuedOrder(record) {
  const csrf = await getCsrfToken(true);

  const sessionResponse = await fetch(`${API}/auth/me`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    },
    cache: 'no-store'
  });

  if (!sessionResponse.ok) {
    throw new Error('Sign in with the same customer account to sync this order.');
  }

  const sessionData = await sessionResponse.json();

  if (
    !sessionData.success ||
    Number(sessionData.user?.id) !== Number(record.userId)
  ) {
    throw new Error('This pending order belongs to a different signed-in account.');
  }

  const response = await fetch(`${API}/orders`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf
    },
    body: JSON.stringify({
      idempotency_key: record.idempotencyKey,
      items: record.items
    })
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an invalid response while syncing.');
  }

  if (!response.ok || !data.success) {
    if (response.status === 403) {
      csrfToken = null;
    }

    const error = new Error(
      data.message || 'The offline order could not be synced.'
    );

    error.status = response.status;
    throw error;
  }

  return data;
}

export async function syncQueuedOrders(userId) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      synced: [],
      pending: true
    };
  }

  const queued = await getQueuedOrders(userId);
  const synced = [];
  const failed = [];

  for (const record of queued) {
    try {
      const result = await sendQueuedOrder(record);

      await removeQueuedOrder(record.idempotencyKey);

      synced.push({
        idempotencyKey: record.idempotencyKey,
        orderId: Number(result.order_id),
        alreadyProcessed: Boolean(result.already_processed)
      });

    } catch (error) {
      await updateQueuedOrder({
        ...record,
        lastError: error.message,
        lastAttemptAt: new Date().toISOString()
      });

      failed.push({
        idempotencyKey: record.idempotencyKey,
        message: error.message,
        status: error.status || null
      });

      if (!navigator.onLine) {
        break;
      }
    }
  }

  return {
    synced,
    failed,
    pending: (await getQueuedOrders(userId)).length > 0
  };
}

export async function registerOrderBackgroundSync() {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    if ('sync' in registration) {
      await registration.sync.register('c5-cyclehub-order-sync');
      return true;
    }
  } catch (error) {
    console.warn('Background Sync registration unavailable:', error);
  }

  return false;
}

function isPublicCatalogRequest(path, method) {
  if (method !== 'GET') return false;

  const cleanPath = String(path)
    .split('?')[0]
    .replace(/^\/+|\/+$/g, '');

  return cleanPath === 'products' ||
         cleanPath === 'categories';
}

async function getCsrfToken(forceRefresh = false) {
  if (forceRefresh) {
    csrfToken = null;
  }

  if (csrfToken) {
    return csrfToken;
  }

  if (!csrfRequest) {
    csrfRequest = (async () => {
      let response;

      try {
        response = await fetch(`${API}/auth/csrf`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        });
      } catch {
        throw new Error(
          'Unable to connect to the server. Please check your connection.'
        );
      }

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error('The server returned an invalid security response.');
      }

      if (!response.ok || !data.success || !data.csrf_token) {
        throw new Error(
          data.message || 'Unable to initialize secure session.'
        );
      }

      csrfToken = data.csrf_token;
      return csrfToken;
    })().finally(() => {
      csrfRequest = null;
    });
  }

  return csrfRequest;
}

export async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const publicCatalog = isPublicCatalogRequest(path, method);

  const cacheKey = `${API}/${String(path).replace(/^\/+/, '')}`;

  const headers = {
    Accept: 'application/json',
    ...(options.body ? {
      'Content-Type': 'application/json'
    } : {}),
    ...(options.headers || {})
  };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-CSRF-Token'] = await getCsrfToken();
  }

  let response;

  try {
    response = await fetch(cacheKey, {
      ...options,
      method,
      credentials: 'include',
      headers,
      cache: 'no-store'
    });
  } catch {
    if (publicCatalog) {
      const savedData = await getCatalog(cacheKey);

      if (savedData) {
        return savedData;
      }
    }

    throw new Error(
      'Unable to connect to the server. Please check your connection.'
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an invalid response.');
  }

  if (!response.ok || !data.success) {
    if (
      response.status === 403 &&
      String(data.message || '').toLowerCase().includes('security token')
    ) {
      csrfToken = null;
    }

    const error = new Error(data.message || 'Request failed.');
    error.status = response.status;
    error.data = data.data || null;
    throw error;
  }

  if (publicCatalog) {
    await saveCatalog(cacheKey, data);
  }

  if (path === 'auth/login' || path === 'auth/register') {
    csrfToken = null;
  }

  if (path === 'auth/logout') {
    csrfToken = null;
  }

  return data;
}

export function clearCsrfToken() {
  csrfToken = null;
}