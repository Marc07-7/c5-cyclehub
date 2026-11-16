import React, { useEffect, useMemo, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import ChatWidget from './components/ChatWidget'
import PWAInstallButton from './components/PWAInstallButton'
import {
  request,
  queueOfflineOrder,
  getQueuedOrders,
  syncQueuedOrders,
  registerOrderBackgroundSync
} from './api'
import {
  Bike,
  ShoppingBag,
  Search,
  User,
  LogOut,
  Plus,
  Minus,
  Trash2,
  Archive,
  Bell,
  CheckCheck,
  X
} from 'lucide-react'

const money = n =>
  '₱' + Number(n || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2
  })
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

export default function App() {
  const [products, setProducts] = useState([])
  const [archivedProducts, setArchivedProducts] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [categories, setCategories] = useState([])
  const [user, setUser] = useState(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)

  const [cart, setCart] = useState([])
  const [cartOwner, setCartOwner] = useState(null)
  const [pendingOrders, setPendingOrders] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')

  const [view, setView] = useState('shop')
  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [summary, setSummary] = useState({})

  // Notifications
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)

  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [auth, setAuth] = useState('login')

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: ''
  })

  const [productForm, setProductForm] = useState({
    name: '',
    category_id: '',
    description: '',
    price: '',
    stock: 0,
    image_url: ''
  })

  const [editing, setEditing] = useState(null)

  // Notification message
  const flash = message => {
    setNotice(message)
    setTimeout(() => setNotice(''), 3500)
  }

  // LOAD PRODUCTS, CATEGORIES AND AUTHENTICATION INDEPENDENTLY
  async function load() {
    // Load products
    try {
      const p = await request('products')
      setProducts(p.data || [])
    } catch (e) {
      console.error('Products loading error:', e)
    }

    // Load categories independently
    try {
      const c = await request('categories')
      setCategories(c.data || [])
      console.log('Categories loaded:', c.data)
    } catch (e) {
      console.error('Categories loading error:', e)
      flash('Unable to load product categories: ' + e.message)
    }

    // Authentication is optional during initial loading.
    // The cached profile is only used to identify locally queued orders.
    // The backend still verifies the real session before accepting an order.
    try {
      const me = await request('auth/me')
      setUser(me.user || null)
    } catch (e) {
      try {
        const cachedUser = JSON.parse(
          localStorage.getItem('c5-cyclehub-user') || 'null'
        )

        setUser(
          cachedUser && Number.isInteger(Number(cachedUser.id))
            ? cachedUser
            : null
        )
      } catch {
        setUser(null)
      }
    }
  }

  // Initial application loading
  useEffect(() => {
    load()
  }, [])

  // Load a separate saved cart for each account.
  useEffect(() => {
    const ownerKey = user?.id
      ? `user:${user.id}`
      : 'guest'

    const storageKey = `c5-cyclehub-cart:${ownerKey}`

    try {
      const savedCart = localStorage.getItem(storageKey)
      const parsedCart = savedCart
        ? JSON.parse(savedCart)
        : []

      setCart(
        Array.isArray(parsedCart)
          ? parsedCart.filter(item =>
              item &&
              Number.isInteger(Number(item.id)) &&
              Number(item.quantity) > 0
            )
          : []
      )
    } catch (error) {
      console.error('Saved cart loading error:', error)
      setCart([])
    }

    setCartOwner(ownerKey)
  }, [user?.id])

  // Automatically save cart changes.
  useEffect(() => {
    const ownerKey = user?.id
      ? `user:${user.id}`
      : 'guest'

    if (cartOwner !== ownerKey) return

    try {
      localStorage.setItem(
        `c5-cyclehub-cart:${ownerKey}`,
        JSON.stringify(cart)
      )
    } catch (error) {
      console.error('Saved cart storage error:', error)
    }
  }, [cart, user?.id, cartOwner])

  // Keep a minimal customer profile so queued orders remain visible offline.
  useEffect(() => {
    if (!user?.id) return

    try {
      localStorage.setItem(
        'c5-cyclehub-user',
        JSON.stringify({
          id: Number(user.id),
          name: user.name,
          email: user.email,
          role: user.role
        })
      )
    } catch (error) {
      console.warn('Offline profile could not be saved:', error)
    }
  }, [user?.id, user?.name, user?.email, user?.role])

  // Load offline orders belonging to the currently selected customer.
  async function refreshPendingOrders() {
    if (!user?.id) {
      setPendingOrders([])
      return
    }

    try {
      const queued = await getQueuedOrders(user.id)
      setPendingOrders(queued)
    } catch (error) {
      console.error('Pending offline orders could not be loaded:', error)
    }
  }

  useEffect(() => {
    refreshPendingOrders()
  }, [user?.id])

  // Retry queued orders when internet connection returns.
  useEffect(() => {
    if (!user?.id) return

    let syncing = false

    const handleOnline = async () => {
      if (syncing) return
      syncing = true

      try {
        const result = await syncQueuedOrders(user.id)
        await refreshPendingOrders()

        if (result.synced?.length) {
          flash(
            result.synced.length === 1
              ? `Offline order #${result.synced[0].orderId} synced successfully.`
              : `${result.synced.length} offline orders synced successfully.`
          )

          await load()

          if (view === 'orders') {
            await openOrders()
          }
        }
      } catch (error) {
        console.warn('Offline order sync will retry:', error)
      } finally {
        syncing = false
      }
    }

    const handleServiceWorkerMessage = async event => {
      if (event.data?.type !== 'C5_ORDER_SYNCED') return

      await refreshPendingOrders()

      flash(`Offline order #${event.data.order_id} synced successfully.`)

      await load()

      if (view === 'orders') {
        await openOrders()
      }
    }

    window.addEventListener('online', handleOnline)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener(
        'message',
        handleServiceWorkerMessage
      )
    }

    if (navigator.onLine) {
      handleOnline()
    }

    return () => {
      window.removeEventListener('online', handleOnline)

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener(
          'message',
          handleServiceWorkerMessage
        )
      }
    }
  }, [user?.id, view])

  async function enablePushNotifications() {
    if (!user || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      flash('Push notifications are not supported by this browser.');
      return;
    }
    setPushBusy(true);
    try {
      const keyResult = await request('push/vapid-public-key');
      const vapidPublicKey = keyResult.publicKey;
      if (!vapidPublicKey) throw new Error('Push notification key is not configured.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Allow notifications in your browser settings first.');
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });
      }
      await request('push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: subscription.toJSON() }) });
      setPushEnabled(true);
      flash('Push notifications enabled for this account on this browser.');
    } catch (error) {
      console.error('Push subscription failed:', error);
      flash(error.message || 'Unable to enable push notifications.');
    } finally {
      setPushBusy(false);
    }
  }

  // Check whether this account has a registered push subscription on this browser.
  
  // Automatically register an existing browser subscription
  // for whichever account is currently logged in.
  useEffect(() => {
    let cancelled = false;

    async function syncPushSubscriptionForAccount() {
      if (!user) {
        setPushEnabled(false);
        return;
      }

      if (
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        setPushEnabled(false);
        return;
      }

      if (Notification.permission !== 'granted') {
        setPushEnabled(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription =
          await registration.pushManager.getSubscription();

        if (!subscription) {
          if (!cancelled) setPushEnabled(false);
          return;
        }

        await request('push/subscribe', {
          method: 'POST',
          body: JSON.stringify({
            subscription: subscription.toJSON()
          })
        });

        if (!cancelled) {
          setPushEnabled(true);
          console.log(
            `Push notifications registered for account ${user.id}.`
          );
        }
      } catch (error) {
        console.error(
          'Push subscription synchronization failed:',
          error
        );

        if (!cancelled) setPushEnabled(false);
      }
    }

    syncPushSubscriptionForAccount();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);


  // Fetch notifications for the currently authenticated user.
  async function loadNotifications(showLoader = false) {
    if (!user) {
      setNotifications([])
      setUnreadCount(0)
      return
    }

    if (showLoader) setNotificationsLoading(true)

    try {
      const result = await request('notifications')
      setNotifications(result.data || [])
      setUnreadCount(Number(result.unread_count || 0))
    } catch (e) {
      console.error('Notifications loading error:', e)
    } finally {
      if (showLoader) setNotificationsLoading(false)
    }
  }

  // Refresh notifications after login and periodically while logged in.
  useEffect(() => {
    if (!user) {
      setNotifications([])
      setUnreadCount(0)
      setShowNotifications(false)
      return
    }

    loadNotifications(true)

    const intervalId = window.setInterval(() => {
      loadNotifications()
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [user?.id])

  async function markNotificationRead(id) {
    try {
      await request(`notifications/${id}`, { method: 'PUT' })
      await loadNotifications()
    } catch (e) {
      flash(e.message)
    }
  }

  async function markAllNotificationsRead() {
    if (!unreadCount) return

    try {
      await request('notifications/read-all', { method: 'PUT' })

      setNotifications(old =>
        old.map(item => ({ ...item, is_read: 1 }))
      )

      setUnreadCount(0)
      flash('All notifications marked as read.')
    } catch (e) {
      flash(e.message)
    }
  }

  async function openNotification(notification) {
    if (Number(notification.is_read) === 0) {
      await markNotificationRead(notification.id)
    }

    setShowNotifications(false)

    if (
      notification.title?.toLowerCase().includes('order') &&
      user
    ) {
      openOrders()
    }
  }

  // Product filtering
  const filtered = useMemo(() => {
    return products.filter(p =>
      (!category || String(p.category_id) === category) &&
      (!query ||
        (`${p.name} ${p.description || ''}`)
          .toLowerCase()
          .includes(query.toLowerCase()))
    )
  }, [products, category, query])

  // LOGIN AND REGISTRATION
  async function authenticate(e) {
    e.preventDefault()
    setBusy(true)

    try {
      const d = await request(`auth/${auth}`, {
        method: 'POST',
        body: JSON.stringify(form)
      })

      setUser(d.user)

      await load()

      flash('Welcome, ' + d.user.name)
      setView('shop')
    } catch (e) {
      flash(e.message)
    } finally {
      setBusy(false)
    }
  }

  // LOGOUT
  async function logout() {
    try {
      await request('auth/logout', {
        method: 'POST'
      })

      setUser(null)
      localStorage.removeItem('c5-cyclehub-user')
      setPendingOrders([])
      setView('shop')

      flash('You have logged out.')
    } catch (e) {
      flash(e.message)
    }
  }

  // SHOPPING CART
  function addCart(p) {
    setCart(old => {
      const found = old.find(x => x.id === p.id)

      return found
        ? old.map(x =>
            x.id === p.id
              ? {
                  ...x,
                  quantity: Math.min(x.quantity + 1, p.stock)
                }
              : x
          )
        : [{ ...p, quantity: 1 }, ...old]
    })

    flash('Added to cart')
  }

  const total = cart.reduce(
    (s, p) => s + Number(p.price) * p.quantity,
    0
  )

  // CHECKOUT WITH ONLINE AND OFFLINE ORDER QUEUE
  async function checkout() {
    if (!user?.id) {
      setView('account')
      flash('Please sign in online before placing or saving an order.')
      return
    }

    if (!cart.length || checkoutBusy) return

    setCheckoutBusy(true)

    const items = cart.map(p => ({
      product_id: Number(p.id),
      quantity: Number(p.quantity)
    }))

    const fingerprint = JSON.stringify(items)
    const storageKey = `c5-cyclehub-checkout:${user.id}`

    try {
      let savedCheckout = null

      try {
        savedCheckout = JSON.parse(
          localStorage.getItem(storageKey) || 'null'
        )
      } catch {
        savedCheckout = null
      }

      let idempotencyKey

      if (
        savedCheckout &&
        savedCheckout.fingerprint === fingerprint &&
        typeof savedCheckout.key === 'string' &&
        /^[a-zA-Z0-9_-]{16,64}$/.test(savedCheckout.key)
      ) {
        idempotencyKey = savedCheckout.key
      } else {
        idempotencyKey =
          typeof crypto !== 'undefined' &&
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random()
                .toString(36)
                .slice(2)}-${Math.random().toString(36).slice(2)}`

        localStorage.setItem(
          storageKey,
          JSON.stringify({
            fingerprint,
            key: idempotencyKey
          })
        )
      }

      // Save the order intent locally if the device is offline.
      if (!navigator.onLine) {
        await queueOfflineOrder({
          userId: Number(user.id),
          items,
          idempotencyKey
        })

        setCart([])
        localStorage.removeItem(storageKey)

        await refreshPendingOrders()
        await registerOrderBackgroundSync()

        flash('Order saved as Pending Sync. It is not confirmed yet.')
        return
      }

      try {
        const d = await request('orders', {
          method: 'POST',
          body: JSON.stringify({
            idempotency_key: idempotencyKey,
            items
          })
        })

        const latestSaved = JSON.parse(
          localStorage.getItem(storageKey) || 'null'
        )

        if (latestSaved?.key === idempotencyKey) {
          localStorage.removeItem(storageKey)
        }

        setCart(current => {
          const currentItems = current.map(p => ({
            product_id: Number(p.id),
            quantity: Number(p.quantity)
          }))

          return JSON.stringify(currentItems) === fingerprint
            ? []
            : current
        })

        flash(
          d.already_processed
            ? `Order #${d.order_id} was already processed.`
            : `Order #${d.order_id} placed successfully.`
        )

        await load()
      } catch (error) {
        const message = String(error.message || '')

        const connectionFailure =
          !navigator.onLine ||
          /unable to connect|networkerror|failed to fetch|load failed|connection refused/i.test(message)

        if (!connectionFailure) {
          throw error
        }

        // Keep the same key in case the server processed the request
        // but the response was lost during the connection failure.
        await queueOfflineOrder({
          userId: Number(user.id),
          items,
          idempotencyKey
        })

        setCart([])
        localStorage.removeItem(storageKey)

        await refreshPendingOrders()
        await registerOrderBackgroundSync()

        flash('Connection lost. Order saved as Pending Sync, not confirmed.')
      }
    } catch (error) {
      flash(error.message || 'Checkout failed. Please try again.')
    } finally {
      setCheckoutBusy(false)
    }
  }

  // CUSTOMER / ADMIN ORDER MANAGEMENT
  async function openOrders() {
    setOrdersLoading(true)
    setSelectedOrder(null)

    try {
      const d = await request('orders')
      setOrders(d.data || [])
      setView('orders')
    } catch (e) {
      flash(e.message)
    } finally {
      setOrdersLoading(false)
    }
  }

  async function viewOrder(id) {
    try {
      const d = await request(`orders/${id}`)
      setSelectedOrder(d.data || null)
    } catch (e) {
      flash(e.message)
    }
  }

  async function updateOrderStatus(id, status) {
    if (!confirm(`Change order #${id} status to ${status}?${status === 'cancelled' ? ' Reserved stock will be returned to inventory.' : ''}`)) return

    try {
      await request(`orders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      })

      const [list, detail] = await Promise.all([
        request('orders'),
        request(`orders/${id}`)
      ])

      setOrders(list.data || [])
      setSelectedOrder(detail.data || null)

      flash(`Order #${id} updated.`)

      if (status === 'cancelled') await load()
    } catch (e) {
      flash(e.message)
    }
  }

  // ADMIN DASHBOARD
  async function openAdmin() {
    if (user?.role !== 'admin') {
      flash('Administrator access required.')
      return
    }

    try {
      const d = await request('admin/summary')

      setSummary(d.data || {})
      setView('admin')
    } catch (e) {
      flash(e.message)
    }
  }

  // SAVE OR UPDATE PRODUCT
  async function saveProduct(e) {
    e.preventDefault()

    try {
      await request(
        editing ? `products/${editing}` : 'products',
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify(productForm)
        }
      )

      setEditing(null)

      setProductForm({
        name: '',
        category_id: '',
        description: '',
        price: '',
        stock: 0,
        image_url: ''
      })

      await load()

      flash('Product saved.')
    } catch (e) {
      flash(e.message)
    }
  }

  // LOAD ARCHIVED PRODUCTS (ADMIN ONLY)
  async function loadArchivedProducts() {
    try {
      const d = await request('products/archived')
      setArchivedProducts(d.data || [])
    } catch (e) {
      flash(e.message)
    }
  }

  // ARCHIVE PRODUCT (SOFT DELETE)
  async function archive(id) {
    if (!confirm('Archive this product? It will be hidden from the shop but can be restored later.')) return

    try {
      await request(`products/${id}`, {
        method: 'DELETE'
      })

      await load()

      if (showArchived) await loadArchivedProducts()

      flash('Product archived.')
    } catch (e) {
      flash(e.message)
    }
  }

  // RESTORE ARCHIVED PRODUCT
  async function restoreProduct(id) {
    if (!confirm('Restore this product to the active inventory?')) return

    try {
      await request(`products/${id}/restore`, {
        method: 'POST'
      })

      await load()
      await loadArchivedProducts()

      flash('Product restored to active inventory.')
    } catch (e) {
      flash(e.message)
    }
  }

  return (
    <div className="app">

      {/* HEADER */}
      <header className="topbar">

        <a
          className="brand"
          onClick={() => setView('shop')}
        >
          <span className="brand-icon">
            <Bike />
          </span>

          <span>
            C5 <b>CYCLEHUB</b>
            <small>RIDE YOUR WAY</small>
          </span>
        </a>

        <nav>
          <button onClick={() => setView('shop')}>
            Shop
          </button>

          <button onClick={openOrders}>
            My Orders
          </button>

          {user?.role === 'admin' && (
            <button onClick={openAdmin}>
              Admin
            </button>
          )}
        </nav>

        <div className="head-actions">

          <PWAInstallButton />

          {user && (
            <button
              type="button"
              className="icon-btn push-enable-btn"
              onClick={enablePushNotifications}
              disabled={pushBusy || pushEnabled}
              title={pushEnabled ? 'Push notifications enabled' : 'Enable browser push notifications'}
            >
              <Bell size={18} />
              <span>{pushBusy ? 'Enabling…' : pushEnabled ? 'Alerts on' : 'Enable alerts'}</span>
            </button>
          )}

          {user && (
            <button
              type="button"
              className="chat-launch-btn"
              onClick={() => setChatOpen(value => !value)}
              aria-label="Open live chat"
              title="Live chat"
            >
              <MessageCircle size={19} />
              <span>Chat</span>
            </button>
          )}

          <button
            className="icon-btn"
            onClick={() => setView('cart')}
            aria-label="Shopping cart"
            title="Shopping cart"
          >
            <ShoppingBag />

            <span>
              {cart.reduce((s, p) => s + p.quantity, 0)}
            </span>
          </button>

          {user && (
            <div className="notification-wrap">
              <button
                className="notification-trigger"
                type="button"
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                aria-expanded={showNotifications}
                title="Notifications"
                onClick={() => {
                  setShowNotifications(value => !value)
                  if (!showNotifications) loadNotifications(true)
                }}
              >
                <Bell size={21} />
                {unreadCount > 0 && (
                  <span className="notification-count">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  <button
                    className="notification-backdrop"
                    aria-label="Close notifications"
                    onClick={() => setShowNotifications(false)}
                  />

                  <section className="notification-panel" aria-label="Notifications">
                    <div className="notification-header">
                      <div>
                        <b>Notifications</b>
                        <small>
                          {unreadCount
                            ? `${unreadCount} unread`
                            : 'You are all caught up'}
                        </small>
                      </div>

                      <div className="notification-header-actions">
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            className="notification-read-all"
                            onClick={markAllNotificationsRead}
                          >
                            <CheckCheck size={15} />
                            Mark all read
                          </button>
                        )}

                        <button
                          type="button"
                          className="notification-close"
                          aria-label="Close notifications"
                          onClick={() => setShowNotifications(false)}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="notification-list">
                      {notificationsLoading && notifications.length === 0 ? (
                        <p className="notification-empty">Loading notifications...</p>
                      ) : notifications.length === 0 ? (
                        <p className="notification-empty">No notifications yet.</p>
                      ) : (
                        notifications.map(notification => (
                          <button
                            type="button"
                            key={notification.id}
                            className={`notification-item ${
                              Number(notification.is_read) === 0 ? 'unread' : ''
                            }`}
                            onClick={() => openNotification(notification)}
                          >
                            <span className="notification-dot" />

                            <span className="notification-content">
                              <b>{notification.title}</b>
                              <span>{notification.body}</span>
                              <small>
                                {notification.created_at
                                  ? new Date(
                                      notification.created_at.replace(' ', 'T')
                                    ).toLocaleString()
                                  : ''}
                              </small>
                            </span>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="notification-footer">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotifications(false)
                          openOrders()
                        }}
                      >
                        View my orders
                      </button>
                    </div>
                  </section>
                </>
              )}
            </div>
          )}

          {user ? (
            <>
              <div className="account-identity" title={`Logged in as ${user.name || user.email || 'Account'}`}>
                <span className="account-avatar">
                  <User size={16} />
                </span>
                <span className="account-identity-text">
                  <small>Signed in as</small>
                  <b>{user.name || user.email || `User #${user.id}`}</b>
                </span>
              </div>

              <button
                className="user-btn"
                onClick={logout}
              >
                <LogOut size={16} />
                Logout
              </button>
            </>
          ) : (
            <button
              className="user-btn"
              onClick={() => setView('account')}
            >
              <User size={16} />
              Account
            </button>
          )}

        </div>
      </header>

      {chatOpen && user && (
        <ChatWidget user={user} onClose={() => setChatOpen(false)} />
      )}

      {/* NOTIFICATION */}
      {notice && (
        <div className="toast">
          {notice}
        </div>
      )}

      {/* SHOP PAGE */}
      {view === 'shop' && (
        <>
          <section className="hero">

            <div>
              <span className="eyebrow">
                C5 BIKESHOPE • CALAPAN CITY
              </span>

              <h1>
                FIND YOUR
                <br />
                <em>NEXT RIDE.</em>
              </h1>

              <p>
                Discover bicycles, quality components,
                and cycling essentials built for every journey.
              </p>

              <button
                className="primary"
                onClick={() =>
                  document
                    .getElementById('catalog')
                    .scrollIntoView({ behavior: 'smooth' })
                }
              >
                Explore collection
                <ShoppingBag size={17} />
              </button>
            </div>

            <div className="hero-art">
              <Bike size={230} strokeWidth={1} />
              <span className="art-label">
                GEAR UP. GO FURTHER.
              </span>
            </div>

          </section>

          <main id="catalog" className="content">

            <div className="section-head">

              <div>
                <span className="eyebrow">
                  THE COLLECTION
                </span>

                <h2>Shop products</h2>
              </div>

              <div className="search">
                <Search size={18} />

                <input
                  placeholder="Search bicycles, parts..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </div>

            </div>

            {/* DYNAMIC CATEGORY FILTERS */}
            <div className="filters">

              <button
                className={!category ? 'active' : ''}
                onClick={() => setCategory('')}
              >
                All products
              </button>

              {categories.map(c => (
                <button
                  className={
                    category === String(c.id) ? 'active' : ''
                  }
                  key={c.id}
                  onClick={() => setCategory(String(c.id))}
                >
                  {c.name}
                </button>
              ))}

            </div>

            {/* PRODUCT LIST */}
            <div className="products">

              {filtered.map(p => (
                <article className="product" key={p.id}>

                  <div className="product-image">

                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} />
                    ) : (
                      <Bike size={76} />
                    )}

                    <span>
                      {p.category_name || 'C5 Gear'}
                    </span>

                  </div>

                  <div className="product-info">

                    <h3>{p.name}</h3>

                    <p>
                      {p.description ||
                        'Quality cycling product from C5 Bikeshope.'}
                    </p>

                    <div className="product-bottom">

                      <strong>
                        {money(p.price)}
                      </strong>

                      <button
                        className="add"
                        disabled={Number(p.stock) < 1}
                        onClick={() => addCart(p)}
                      >
                        <Plus size={17} />
                      </button>

                    </div>

                    <small>
                      {p.stock > 0
                        ? `${p.stock} in stock`
                        : 'Out of stock'}
                    </small>

                  </div>

                </article>
              ))}

            </div>

            {!filtered.length && (
              <div className="empty">
                No products found. Add products from the administrator dashboard.
              </div>
            )}

          </main>
        </>
      )}

      {/* ACCOUNT PAGE */}
      {view === 'account' && (
        <main className="narrow panel">

          <span className="eyebrow">
            YOUR C5 ACCOUNT
          </span>

          <h2>
            {auth === 'login'
              ? 'Welcome back'
              : 'Create account'}
          </h2>

          <form
            onSubmit={authenticate}
            className="stack"
          >

            {auth === 'register' && (
              <label>
                Full name

                <input
                  required
                  value={form.name}
                  onChange={e =>
                    setForm({
                      ...form,
                      name: e.target.value
                    })
                  }
                />
              </label>
            )}

            <label>
              Email address

              <input
                type="email"
                required
                value={form.email}
                onChange={e =>
                  setForm({
                    ...form,
                    email: e.target.value
                  })
                }
              />
            </label>

            <label>
              Password

              <input
                type="password"
                minLength="8"
                required
                value={form.password}
                onChange={e =>
                  setForm({
                    ...form,
                    password: e.target.value
                  })
                }
              />
            </label>

            <button
              className="primary"
              disabled={busy}
            >
              {busy
                ? 'Please wait...'
                : auth === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>

          </form>

          <p className="switch">
            {auth === 'login'
              ? "Don't have an account?"
              : 'Already registered?'}

            {' '}

            <a
              onClick={() =>
                setAuth(
                  auth === 'login'
                    ? 'register'
                    : 'login'
                )
              }
            >
              {auth === 'login'
                ? 'Register'
                : 'Sign in'}
            </a>
          </p>

        </main>
      )}

      {/* CART PAGE */}
      {view === 'cart' && (
        <main className="content">

          <span className="eyebrow">
            YOUR SELECTION
          </span>

          <h2>Shopping cart</h2>

          {pendingOrders.length > 0 && (
            <section className="pending-orders">
              <div className="pending-orders-heading">
                <b>Offline orders awaiting synchronization</b>
                <span className="pending-sync-badge">PENDING SYNC</span>
              </div>

              {pendingOrders.map(order => (
                <div className="pending-order-row" key={order.idempotencyKey}>
                  <div>
                    <b>Offline order request</b>
                    <small>
                      {new Date(order.createdAt).toLocaleString()} · {order.items.length} product type(s)
                    </small>

                    {order.lastError && (
                      <small className="pending-order-error">
                        {order.lastError}
                      </small>
                    )}
                  </div>

                  <span className="pending-sync-badge">Not confirmed</span>
                </div>
              ))}

              <p>
                These orders are saved on this device and are not confirmed.
                They will be submitted when your connection returns and your
                customer session is valid.
              </p>
            </section>
          )}

          {cart.map(p => (
            <div className="cart-row" key={p.id}>

              <div>
                <b>{p.name}</b>
                <small>{money(p.price)} each</small>
              </div>

              <div className="qty">

                <button
                  onClick={() =>
                    setCart(cart.map(x =>
                      x.id === p.id
                        ? {
                            ...x,
                            quantity: Math.max(
                              1,
                              x.quantity - 1
                            )
                          }
                        : x
                    ))
                  }
                >
                  <Minus size={14} />
                </button>

                {p.quantity}

                <button
                  onClick={() =>
                    setCart(cart.map(x =>
                      x.id === p.id
                        ? {
                            ...x,
                            quantity: Math.min(
                              Number(x.stock),
                              x.quantity + 1
                            )
                          }
                        : x
                    ))
                  }
                >
                  <Plus size={14} />
                </button>

                <button
                  onClick={() =>
                    setCart(cart.filter(x => x.id !== p.id))
                  }
                >
                  <Trash2 size={15} />
                </button>

              </div>

              <b>{money(p.price * p.quantity)}</b>

            </div>
          ))}

          {!cart.length && (
            <p>Your cart is empty.</p>
          )}

          <div className="cart-total">
            Total
            <strong>{money(total)}</strong>
          </div>

          <button
            className="primary"
            disabled={!cart.length || checkoutBusy}
            onClick={checkout}
          >
            {checkoutBusy ? 'Processing order...' : 'Place order'}
          </button>

        </main>
      )}

      {/* CUSTOMER / ADMIN ORDER MANAGEMENT */}
      {view === 'orders' && (
        <main className="content">
          <span className="eyebrow">{user?.role === 'admin' ? 'ORDER MANAGEMENT' : 'ORDER HISTORY'}</span>

          <div className="section-head orders-heading">
            <div>
              <h2>{user?.role === 'admin' ? 'All customer orders' : 'My orders'}</h2>
              <p className="muted">Track order progress and review purchased items.</p>
            </div>

            <button className="secondary" onClick={openOrders}>
              Refresh orders
            </button>
          </div>

          {pendingOrders.length > 0 && (
            <section className="pending-orders orders-pending">
              <div className="pending-orders-heading">
                <b>Offline orders</b>
                <span className="pending-sync-badge">PENDING SYNC</span>
              </div>

              {pendingOrders.map(order => (
                <div className="pending-order-row" key={order.idempotencyKey}>
                  <div>
                    <b>Order request saved on this device</b>
                    <small>{new Date(order.createdAt).toLocaleString()}</small>

                    {order.lastError && (
                      <small className="pending-order-error">
                        {order.lastError}
                      </small>
                    )}
                  </div>

                  <span className="pending-sync-badge">Not confirmed</span>
                </div>
              ))}

              <p>
                These are not server orders yet. They will appear in your
                order history only after successful synchronization.
              </p>
            </section>
          )}

          {ordersLoading && <p>Loading orders...</p>}

          {!ordersLoading && orders.length === 0 && (
            <div className="panel empty">No orders found yet.</div>
          )}

          <div className="orders-layout">
            <section className="orders-list">
              {orders.map(o => (
                <article className={`order-card ${selectedOrder?.id === o.id ? 'selected' : ''}`} key={o.id}>
                  <div className="order-card-top">
                    <div>
                      <b>Order #{o.id}</b>

                      {user?.role === 'admin' && (
                        <small className="order-customer">
                          {o.customer_name} · {o.customer_email}
                        </small>
                      )}

                      <small>{new Date(o.created_at).toLocaleString()}</small>
                    </div>

                    <span className={`order-status status-${o.status}`}>
                      {o.status}
                    </span>
                  </div>

                  <div className="order-card-bottom">
                    <span>{o.item_count || 0} item(s)</span>
                    <strong>{money(o.total_amount)}</strong>

                    <button
                      className="secondary"
                      onClick={() => viewOrder(o.id)}
                    >
                      View details
                    </button>
                  </div>
                </article>
              ))}
            </section>

            {selectedOrder && (
              <aside className="panel order-detail">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">ORDER DETAILS</span>
                    <h3>Order #{selectedOrder.id}</h3>
                  </div>

                  <button
                    className="secondary"
                    onClick={() => setSelectedOrder(null)}
                  >
                    Close
                  </button>
                </div>

                {user?.role === 'admin' && (
                  <p className="muted">
                    <b>Customer:</b> {selectedOrder.customer_name} ({selectedOrder.customer_email})
                  </p>
                )}

                <p className="muted">
                  <b>Placed:</b> {new Date(selectedOrder.created_at).toLocaleString()}
                </p>

                <div className="detail-items">
                  {(selectedOrder.items || []).map(item => (
                    <div className="detail-item" key={item.id}>
                      <div>
                        <b>{item.product_name}</b>
                        <small>{money(item.unit_price)} × {item.quantity}</small>
                      </div>

                      <strong>{money(item.line_total)}</strong>
                    </div>
                  ))}
                </div>

                {selectedOrder.customer_note && (
                  <p className="order-note">
                    <b>Customer note:</b> {selectedOrder.customer_note}
                  </p>
                )}

                <div className="detail-total">
                  <span>Total</span>
                  <strong>{money(selectedOrder.total_amount)}</strong>
                </div>

                <div className="detail-status">
                  <span>Current status</span>
                  <span className={`order-status status-${selectedOrder.status}`}>
                    {selectedOrder.status}
                  </span>
                </div>

                {user?.role === 'admin' && !['completed', 'cancelled'].includes(selectedOrder.status) && (
                  <label className="status-control">
                    Update order status

                    <select
                      value={selectedOrder.status}
                      onChange={e => updateOrderStatus(selectedOrder.id, e.target.value)}
                    >
                      {selectedOrder.status === 'pending' && (
                        <option value="confirmed">Confirm order</option>
                      )}

                      {selectedOrder.status === 'confirmed' && (
                        <option value="processing">Mark as processing</option>
                      )}

                      {selectedOrder.status === 'processing' && (
                        <option value="completed">Mark as completed</option>
                      )}

                      <option value={selectedOrder.status}>
                        {selectedOrder.status}
                      </option>

                      <option value="cancelled">Cancel order</option>
                    </select>

                    <small>Completed and cancelled orders cannot be reopened.</small>
                  </label>
                )}
              </aside>
            )}
          </div>
        </main>
      )}

      {/* ADMIN DASHBOARD */}
      {view === 'admin' && (
        <main className="content">

          <span className="eyebrow">
            CONTROL CENTER
          </span>

          <h2>Administrator dashboard</h2>

          <button
            className="secondary admin-orders-shortcut"
            type="button"
            onClick={openOrders}
          >
            View all orders
          </button>

          <div className="stats">

            {Object.entries(summary).map(([k, v]) => (
              <div className="stat" key={k}>
                <small>{k}</small>

                <b>
                  {k === 'sales' ? money(v) : v}
                </b>
              </div>
            ))}

          </div>

          <div className="admin-grid">

            {/* PRODUCT FORM */}
            <section className="panel">

              <h3>
                {editing ? 'Edit product' : 'Add product'}
              </h3>

              <form
                className="stack"
                onSubmit={saveProduct}
              >

                <label>
                  Product name

                  <input
                    required
                    value={productForm.name}
                    onChange={e =>
                      setProductForm({
                        ...productForm,
                        name: e.target.value
                      })
                    }
                  />
                </label>

                {/* FIXED DYNAMIC CATEGORY DROPDOWN */}
                <label>
                  Category

                  <select
                    required
                    value={productForm.category_id}
                    onChange={e =>
                      setProductForm({
                        ...productForm,
                        category_id: e.target.value
                      })
                    }
                  >

                    <option value="">
                      Select a category
                    </option>

                    {categories.map(c => (
                      <option
                        key={c.id}
                        value={c.id}
                      >
                        {c.name}
                      </option>
                    ))}

                  </select>
                </label>

                <label>
                  Description

                  <textarea
                    value={productForm.description}
                    onChange={e =>
                      setProductForm({
                        ...productForm,
                        description: e.target.value
                      })
                    }
                  />
                </label>

                <label>
                  Price (PHP)

                  <input
                    type="number"
                    min="0"
                    step=".01"
                    required
                    value={productForm.price}
                    onChange={e =>
                      setProductForm({
                        ...productForm,
                        price: e.target.value
                      })
                    }
                  />
                </label>

                <label>
                  Stock

                  <input
                    type="number"
                    min="0"
                    value={productForm.stock}
                    onChange={e =>
                      setProductForm({
                        ...productForm,
                        stock: e.target.value
                      })
                    }
                  />
                </label>

                <label>
                  Image URL

                  <input
                    value={productForm.image_url}
                    onChange={e =>
                      setProductForm({
                        ...productForm,
                        image_url: e.target.value
                      })
                    }
                  />
                </label>

                <button className="primary">
                  {editing
                    ? 'Update product'
                    : 'Save product'}
                </button>

              </form>

            </section>

            {/* PRODUCT INVENTORY */}
            <section>

              <div className="section-head">
                <h3>{showArchived ? 'Archived products' : 'Product inventory'}</h3>

                <button
                  className="secondary"
                  type="button"
                  onClick={async () => {
                    const next = !showArchived
                    setShowArchived(next)

                    if (next) await loadArchivedProducts()
                  }}
                >
                  {showArchived ? 'View active inventory' : 'View archived products'}
                </button>
              </div>

              {!showArchived && products.map(p => (
                <div
                  className="inventory-row"
                  key={p.id}
                >

                  <div>
                    <b>{p.name}</b>

                    <small>
                      {money(p.price)} · Stock {p.stock}
                    </small>
                  </div>

                  <button
                    onClick={() => {
                      setEditing(p.id)

                      setProductForm({
                        name: p.name,
                        category_id: p.category_id || '',
                        description: p.description || '',
                        price: p.price,
                        stock: p.stock,
                        image_url: p.image_url || ''
                      })
                    }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => archive(p.id)}
                  >
                    <Archive size={15} />
                  </button>

                </div>
              ))}

              {showArchived && archivedProducts.map(p => (
                <div className="inventory-row" key={p.id}>
                  <div>
                    <b>{p.name}</b>

                    <small>
                      {money(p.price)} · Stock {p.stock} · Archived {p.archived_at ? new Date(p.archived_at).toLocaleDateString() : ''}
                    </small>
                  </div>

                  <button
                    type="button"
                    onClick={() => restoreProduct(p.id)}
                  >
                    Restore
                  </button>
                </div>
              ))}

              {!showArchived && products.length === 0 && (
                <p>No active products in inventory.</p>
              )}

              {showArchived && archivedProducts.length === 0 && (
                <p>No archived products found.</p>
              )}

            </section>

          </div>

        </main>
      )}

      <style>{`
        .pending-orders {
          margin: 18px 0 24px;
          padding: 18px;
          border: 1px solid #dce6c9;
          border-radius: 14px;
          background: #f7faef;
          color: #243047;
        }

        .pending-orders-heading,
        .pending-order-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .pending-orders-heading {
          margin-bottom: 12px;
        }

        .pending-order-row {
          padding: 12px 0;
          border-top: 1px solid #e5ebda;
        }

        .pending-order-row > div {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .pending-order-row small,
        .pending-orders p {
          color: #68768a;
          font-size: 12px;
        }

        .pending-order-error {
          color: #a33b32 !important;
          font-weight: 700;
          overflow-wrap: anywhere;
        }

        .pending-orders p {
          margin: 10px 0 0;
          line-height: 1.5;
        }

        .pending-sync-badge {
          display: inline-flex;
          align-items: center;
          padding: 5px 9px;
          border-radius: 999px;
          background: #fff0c2;
          color: #795400;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .04em;
          white-space: nowrap;
        }

        .notification-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .notification-trigger {
          position: relative;
          width: 42px;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: inherit;
          cursor: pointer;
          transition: background .2s ease, transform .2s ease;
        }

        .notification-trigger:hover {
          background: rgba(255,255,255,.10);
          transform: translateY(-1px);
        }

        .notification-count {
          position: absolute;
          top: 0;
          right: -2px;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #101a2b;
          border-radius: 999px;
          background: #c3f45b;
          color: #101a2b;
          font-size: 10px;
          font-weight: 800;
          line-height: 1;
        }

        .notification-backdrop {
          position: fixed;
          inset: 0;
          z-index: 40;
          border: 0;
          background: transparent;
          cursor: default;
        }

        .notification-panel {
          position: absolute;
          z-index: 41;
          top: calc(100% + 14px);
          right: 0;
          width: min(390px, calc(100vw - 28px));
          overflow: hidden;
          border: 1px solid #e3e8ef;
          border-radius: 16px;
          background: #fff;
          color: #142033;
          box-shadow: 0 18px 55px rgba(15, 23, 42, .20);
          animation: notificationDrop .18s ease-out;
        }

        @keyframes notificationDrop {
          from { opacity: 0; transform: translateY(-7px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .notification-header {
          min-height: 68px;
          padding: 15px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid #edf0f4;
        }

        .notification-header > div:first-child {
          display: grid;
          gap: 3px;
          text-align: left;
        }

        .notification-header b {
          font-size: 15px;
        }

        .notification-header small,
        .notification-item small {
          color: #8290a3;
          font-size: 11px;
        }

        .notification-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .notification-read-all,
        .notification-close,
        .notification-footer button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border: 0;
          background: transparent;
          color: #50627a;
          cursor: pointer;
        }

        .notification-read-all {
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .notification-read-all:hover,
        .notification-footer button:hover {
          color: #527b13;
        }

        .notification-close {
          width: 28px;
          height: 28px;
          border-radius: 8px;
        }

        .notification-close:hover {
          background: #f1f4f7;
        }

        .notification-list {
          max-height: 380px;
          overflow-y: auto;
        }

        .notification-item {
          width: 100%;
          padding: 14px 16px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          border: 0;
          border-bottom: 1px solid #f0f2f5;
          background: #fff;
          color: #26364b;
          text-align: left;
          cursor: pointer;
          transition: background .15s ease;
        }

        .notification-item:hover {
          background: #f7f9fb;
        }

        .notification-item.unread {
          background: #f5f9ed;
        }

        .notification-dot {
          flex: 0 0 8px;
          width: 8px;
          height: 8px;
          margin-top: 6px;
          border-radius: 50%;
          background: transparent;
        }

        .notification-item.unread .notification-dot {
          background: #a8df42;
        }

        .notification-content {
          min-width: 0;
          display: grid;
          gap: 5px;
        }

        .notification-content b {
          font-size: 13px;
        }

        .notification-content > span {
          color: #64748b;
          font-size: 12px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .notification-empty {
          margin: 0;
          padding: 28px 16px;
          color: #8290a3;
          font-size: 13px;
          text-align: center;
        }

        .notification-footer {
          padding: 12px 16px;
          display: flex;
          justify-content: center;
          border-top: 1px solid #edf0f4;
        }

        .notification-footer button {
          font-size: 12px;
          font-weight: 700;
        }

        @media (max-width: 600px) {
          .notification-panel {
            position: fixed;
            top: 76px;
            right: 12px;
            width: calc(100vw - 24px);
          }

          .notification-trigger {
            width: 38px;
            height: 38px;
          }

          .pending-order-row {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>

      {/* FOOTER */}
      <footer>

        <div className="brand">
          <Bike />
          <b>C5 CYCLEHUB</b>
        </div>

        <p>
          Ride your way. C5 Bikeshope · Calapan City, Oriental Mindoro.
        </p>

        <small>
          © {new Date().getFullYear()} C5 CycleHub. All rights reserved.
        </small>

      </footer>

    </div>
  )
}