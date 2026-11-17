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
  Heart,
  Menu,
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
  const [wishlist, setWishlist] = useState([])
  const [wishlistLoading, setWishlistLoading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  useEffect(() => {
  if (user?.id) {
    loadWishlist()
  } else {
    setWishlist([])
  }
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


  // LOAD THE LOGGED-IN CUSTOMER'S WISHLIST
  async function loadWishlist() {
    if (!user?.id) {
      setWishlist([])
      return
    }

    setWishlistLoading(true)

    try {
      const result = await request('wishlist')
      setWishlist(result.data || [])
    } catch (error) {
      flash(error.message || 'Unable to load wishlist.')
    } finally {
      setWishlistLoading(false)
    }
  }

  // CHECK IF A PRODUCT IS SAVED
  function isWishlisted(productId) {
    return wishlist.some(
      item => Number(item.id) === Number(productId)
    )
  }

  // ADD OR REMOVE A PRODUCT FROM WISHLIST
  async function toggleWishlist(product) {
    if (!user?.id) {
      setView('account')
      flash('Please sign in to save products to your wishlist.')
      return
    }

    const alreadySaved = isWishlisted(product.id)

    try {
      if (alreadySaved) {
        await request(`wishlist/${product.id}`, {
          method: 'DELETE'
        })

        setWishlist(old =>
          old.filter(item => Number(item.id) !== Number(product.id))
        )

        flash('Removed from wishlist.')
      } else {
        await request('wishlist', {
          method: 'POST',
          body: JSON.stringify({
            product_id: product.id
          })
        })

        await loadWishlist()
        flash('Added to wishlist!')
      }
    } catch (error) {
      flash(error.message || 'Wishlist update failed.')
    }
  }

  // OPEN WISHLIST PAGE
  async function openWishlist() {
    if (!user?.id) {
      setView('account')
      flash('Please sign in to view your wishlist.')
      return
    }

    await loadWishlist()
    setView('wishlist')
  }

  // REMOVE A SAVED PRODUCT
  async function removeFromWishlist(productId) {
    try {
      await request(`wishlist/${productId}`, {
        method: 'DELETE'
      })

      setWishlist(old =>
        old.filter(item => Number(item.id) !== Number(productId))
      )

      flash('Product removed from wishlist.')
    } catch (error) {
      flash(error.message || 'Unable to remove product.')
    }
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

      
     {/* C5 CYCLEHUB STARTUP ANIMATION */}
    <div className="bike-splash" aria-hidden="true">
      <div className="bike-splash-brand">
        C5 CYCLEHUB
        <span>RIDE YOUR WAY</span>
      </div>

      {/* Loading trail */}
<div className="bike-splash-track">
  <div className="bike-splash-progress" />
</div>

      <div className="bike-splash-rider">
        <Bike size={76} strokeWidth={1.8} />
      </div>

      <div className="bike-splash-tagline">
        GEAR UP. GO FURTHER.
      </div>
    </div>
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


      

        <button
  type="button"
  className="mobile-menu-toggle"
  aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
  aria-expanded={mobileMenuOpen}
  onClick={() => setMobileMenuOpen(prev => !prev)}
>
  {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
</button>

<nav className={`main-navigation ${mobileMenuOpen ? 'open' : ''}`}>
  <button onClick={() => {
    setView('shop')
    setMobileMenuOpen(false)
  }}>
    Shop
  </button>

  {user && (
    <button
      className="wishlist-nav-link"
      onClick={() => {
        setMobileMenuOpen(false)
        openWishlist()
      }}
    >
      <Heart size={17} />
      Wishlist ({wishlist.length})
    </button>
  )}

  <button onClick={() => {
    setMobileMenuOpen(false)
    openOrders()
  }}>
    My Orders
  </button>

  {user?.role === 'admin' && (
    <button onClick={() => {
      setMobileMenuOpen(false)
      openAdmin()
    }}>
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

                    <button
  type="button"
  className={`wishlist-heart ${isWishlisted(p.id) ? 'active' : ''}`}
  onClick={() => toggleWishlist(p)}
  aria-label={
    isWishlisted(p.id)
      ? 'Remove from wishlist'
      : 'Add to wishlist'
  }
  title={
    isWishlisted(p.id)
      ? 'Remove from wishlist'
      : 'Add to wishlist'
  }
>
  <Heart
    size={20}
    fill={isWishlisted(p.id) ? 'currentColor' : 'none'}
  />
</button>

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



  {/* WISHLIST PAGE */}
  {view === 'wishlist' && (
    <main className="shop-main">
      <div className="section-head">
        <div>
          <span className="eyebrow">YOUR SAVED ITEMS</span>
          <h2>My Wishlist</h2>
          <p>Products you would love to have.</p>
        </div>

        <button
          className="secondary"
          type="button"
          onClick={() => setView('shop')}
        >
          Continue Shopping
        </button>
      </div>

      {wishlistLoading ? (
        <div className="empty">Loading your wishlist...</div>
      ) : wishlist.length === 0 ? (
        <div className="empty">
          <Heart size={38} />
          <h3>Your wishlist is empty</h3>
          <p>Save products you like and find them here later.</p>
          <button
            className="primary"
            type="button"
            onClick={() => setView('shop')}
          >
            Explore Products
          </button>
        </div>
      ) : (
        <div className="products">
          {wishlist.map(p => (
            <article className="product" key={p.id}>
              <div className="product-image">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} />
                ) : (
                  <Bike size={76} />
                )}

                <span>{p.category_name || 'C5 Gear'}</span>
              </div>

              <div className="product-info">
                <h3>{p.name}</h3>

                <p>
                  {p.description || 'Quality cycling product from C5 CycleHub.'}
                </p>

                <div className="product-bottom">
                  <strong>{money(p.price)}</strong>

                  <button
                    className="add"
                    type="button"
                    disabled={Number(p.stock) < 1}
                    onClick={() => addCart(p)}
                    title="Add to cart"
                  >
                    <Plus size={17} />
                  </button>
                </div>

                <small>
                  {Number(p.stock) > 0
                    ? `${p.stock} in stock`
                    : 'Out of stock'}
                </small>

                <button
                  type="button"
                  className="wishlist-remove"
                  onClick={() => removeFromWishlist(p.id)}
                >
                  <Trash2 size={15} />
                  Remove from Wishlist
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
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

          .wishlist-heart {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 5;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: #ffffff;
  color: #64748b;
  box-shadow: 0 3px 12px rgba(0, 0, 0, .12);
  cursor: pointer;
  transition: .2s ease;
}

.wishlist-heart:hover {
  color: #ef4444;
  transform: scale(1.08);
}

.wishlist-heart.active {
  color: #ef4444;
  background: #fff1f2;
}

.wishlist-remove {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  padding: 8px 12px;
  border: 1px solid #fecaca;
  border-radius: 9px;
  background: #fff;
  color: #dc2626;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.wishlist-remove:hover {
  background: #fff1f2;
}       
  .product-image {
  position: relative;
}
        }


/* =========================================
   WISHLIST BUTTON POSITIONING
========================================= */

.product-image {
  position: relative !important;
  overflow: hidden;
}

.product-image .wishlist-heart {
  position: absolute !important;
  top: 14px !important;
  right: 14px !important;
  left: auto !important;
  bottom: auto !important;
  z-index: 10 !important;

  width: 42px !important;
  height: 42px !important;
  padding: 0 !important;

  display: flex !important;
  align-items: center !important;
  justify-content: center !important;

  border: 1px solid #e5e7eb !important;
  border-radius: 50% !important;
  background: #ffffff !important;
  color: #64748b !important;

  box-shadow: 0 3px 12px rgba(0, 0, 0, .12) !important;
  cursor: pointer;
}

.product-image .wishlist-heart:hover {
  color: #ef4444 !important;
  transform: scale(1.08);
}

.product-image .wishlist-heart.active {
  color: #ef4444 !important;
  background: #fff1f2 !important;
}

/* =========================================
   HEADER NAVIGATION FIX
========================================= */

.topbar {
  display: flex !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 24px !important;
}

.topbar .brand {
  flex-shrink: 0 !important;
}

.topbar nav {
  display: flex !important;
  flex: 1 1 auto !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 18px !important;

  min-width: 0 !important;
  white-space: nowrap !important;
}

.topbar nav button {
  flex-shrink: 0 !important;
  white-space: nowrap !important;
}

.topbar .head-actions {
  display: flex !important;
  flex: 0 0 auto !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 10px !important;
}

/* =========================================
   RESPONSIVE HEADER
========================================= */

@media (max-width: 1050px) {
  .topbar {
    gap: 12px !important;
  }

  .topbar nav {
    gap: 9px !important;
  }

  .topbar .head-actions {
    gap: 6px !important;
  }
}

@media (max-width: 760px) {
  .topbar {
    flex-wrap: wrap !important;
    justify-content: space-between !important;
  }

  .topbar nav {
    order: 3;
    flex: 1 0 100% !important;
    justify-content: flex-start !important;
    overflow-x: auto;
    padding-bottom: 5px;
  }

  .topbar .head-actions {
    max-width: 100%;
    overflow-x: auto;
  }
}


/* =====================================
   RESPONSIVE HAMBURGER NAVIGATION
===================================== */

.mobile-menu-toggle {
  display: none;
}

@media (max-width: 760px) {
  .topbar {
    position: relative;
    flex-wrap: wrap !important;
  }

  .mobile-menu-toggle {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border: 1px solid rgba(255,255,255,.15);
    border-radius: 10px;
    background: #252a2b;
    color: white;
    cursor: pointer;
  }

  .topbar nav.main-navigation {
    display: none !important;
    order: 4;
    flex: 1 0 100%;
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 12px;
    margin-top: 8px;
    background: #252a2b;
    border-radius: 12px;
  }

  .topbar nav.main-navigation.open {
    display: flex !important;
  }


/* Smooth mobile menu animation */
@media (max-width: 760px) {
  .topbar nav.main-navigation {
    display: flex !important;
    flex: 1 0 100%;
    flex-direction: column;
    align-items: stretch;

    max-height: 0;
    opacity: 0;
    visibility: hidden;
    overflow: hidden;

    padding: 0 12px;
    margin-top: 0;
    border: 1px solid transparent;
    border-radius: 14px;

    transform: translateY(-10px);

    transition:
      max-height .35s ease,
      opacity .25s ease,
      transform .3s ease,
      padding .3s ease,
      margin .3s ease,
      visibility .3s;
  }

  .topbar nav.main-navigation.open {
    max-height: 320px;
    opacity: 1;
    visibility: visible;

    padding: 12px;
    margin-top: 8px;

    border-color: rgba(255,255,255,.10);

    transform: translateY(0);
  }

  .topbar nav.main-navigation button {
    transition:
      background .2s ease,
      color .2s ease,
      transform .2s ease;
  }

  .topbar nav.main-navigation button:active {
    transform: scale(.97);
  }
}

.mobile-menu-toggle {
  transition:
    background .25s ease,
    transform .25s ease,
    border-color .25s ease;
}

.mobile-menu-toggle:hover {
  background: #343c3c;
  border-color: #c3f45b;
}

.mobile-menu-toggle:active {
  transform: scale(.90);
}

@keyframes wishlistPop {
  0% { transform: scale(1); }
  40% { transform: scale(1.3); }
  70% { transform: scale(.9); }
  100% { transform: scale(1); }
}

.product-image .wishlist-heart.active svg {
  animation: wishlistPop .35s ease;
}

.product {
  transition:
    transform .3s ease,
    box-shadow .3s ease,
    border-color .3s ease;
}

@media (hover: hover) and (pointer: fine) {
  .product:hover {
    transform: translateY(-5px);
    box-shadow: 0 14px 35px rgba(0,0,0,.09);
  }
}


@keyframes pageFadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero,
.shop-main {
  animation: pageFadeIn .5s ease both;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}

  .topbar nav.main-navigation button {
    display: flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 10px 12px;
    color: white;
    text-align: left;
  }
}

/* =====================================
   PHONE LAYOUT
===================================== */

@media (max-width: 760px) {
  .topbar {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 10px !important;
    padding: 12px 16px !important;
  }

  .topbar .brand {
    flex: 1 1 auto;
    min-width: 0;
  }

  .mobile-menu-toggle {
    display: inline-flex !important;
    order: 2;
  }

  .main-navigation {
    display: none !important;
    order: 4;
    flex: 1 0 100%;
    width: 100%;
    flex-direction: column;
    align-items: stretch !important;
    gap: 5px !important;
    padding: 12px;
    margin-top: 5px;
    border: 1px solid rgba(255,255,255,.10);
    border-radius: 14px;
    background: #222829;
  }

  .main-navigation.open {
    display: flex !important;
  }

  .main-navigation > button {
    width: 100%;
    min-height: 44px;
    justify-content: flex-start !important;
    padding: 10px 12px !important;
    border-radius: 9px;
    text-align: left;
  }

  .main-navigation > button:hover {
    background: rgba(255,255,255,.08);
  }

  .main-navigation .wishlist-nav-link {
    justify-content: flex-start !important;
  }

  .topbar .head-actions {
    order: 3;
    flex: 1 0 100% !important;
    width: 100%;
    max-width: 100%;
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: center;
    justify-content: flex-start;
    gap: 8px !important;
    overflow-x: auto;
    padding: 3px 0;
    scrollbar-width: none;
  }

  .topbar .head-actions::-webkit-scrollbar {
    display: none;
  }

  .topbar .head-actions > * {
    flex-shrink: 0;
  }
}

/* Small phones */
@media (max-width: 420px) {
  .topbar {
    padding: 10px 12px !important;
  }

  .topbar .brand {
    font-size: 14px;
  }

  .mobile-menu-toggle {
    width: 40px;
    height: 40px;
  }
}

/* Align Wishlist icon and text in navigation */
.topbar .main-navigation .wishlist-nav-link {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  vertical-align: middle !important;
}

.topbar .main-navigation .wishlist-nav-link svg {
  display: block !important;
  width: 18px !important;
  height: 18px !important;
  flex: 0 0 18px !important;
  margin: 0 !important;
  padding: 0 !important;
  vertical-align: middle !important;
}


/* ==========================================
   UNIVERSAL HAMBURGER NAVIGATION
   DESKTOP + MOBILE
========================================== */

.topbar {
  position: relative;
}

/* Hamburger button */
.mobile-menu-toggle {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  width: 44px;
  height: 44px;

  border: 1px solid rgba(255,255,255,.12);
  border-radius: 12px;

  background: #252a2b;
  color: #ffffff;
  cursor: pointer;

  transition:
    background .2s ease,
    border-color .2s ease,
    transform .2s ease;
}

.mobile-menu-toggle:hover {
  background: #343c3c;
  border-color: #c3f45b;
}

.mobile-menu-toggle:active {
  transform: scale(.93);
}

/* Navigation dropdown */
.topbar nav.main-navigation {
  position: absolute;
  top: calc(100% + 12px);
  left: 24px;

  z-index: 110;

  display: flex !important;
  flex-direction: column;
  align-items: stretch;
  gap: 5px;

  width: 250px;
  max-height: 0;

  padding: 0 10px;
  margin: 0;

  overflow: hidden;
  visibility: hidden;
  opacity: 0;

  border: 1px solid transparent;
  border-radius: 15px;

  background: #202727;
  box-shadow: 0 15px 40px rgba(0,0,0,.25);

  transform: translateY(-10px);

  transition:
    max-height .35s ease,
    opacity .25s ease,
    transform .25s ease,
    padding .25s ease,
    visibility .25s ease;
}

/* Open state */
.topbar nav.main-navigation.open {
  max-height: 350px;
  padding: 12px 10px;

  visibility: visible;
  opacity: 1;

  border-color: rgba(255,255,255,.10);

  transform: translateY(0);
}

/* Menu items */
.topbar nav.main-navigation button {
  display: flex !important;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;

  width: 100%;
  min-height: 44px;

  padding: 10px 12px;

  border: 0;
  border-radius: 9px;

  background: transparent;
  color: #ffffff;

  text-align: left;
  white-space: nowrap;
  cursor: pointer;

  transition:
    background .2s ease,
    color .2s ease;
}

.topbar nav.main-navigation button:hover {
  background: rgba(195,244,91,.12);
  color: #c3f45b;
}

/* Wishlist icon alignment */
.topbar nav.main-navigation .wishlist-nav-link {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.topbar nav.main-navigation .wishlist-nav-link svg {
  display: block;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  margin: 0;
}

/* Mobile positioning */
@media (max-width: 760px) {
  .topbar nav.main-navigation {
    left: 12px;
    right: 12px;
    width: auto;
    top: calc(100% + 8px);
  }
}

/* Desktop positioning */
@media (min-width: 761px) {
  .topbar nav.main-navigation {
    left: 185px;
    width: 260px;
  }
}


/* Fix Wishlist alignment inside hamburger dropdown */
.topbar nav.main-navigation .wishlist-nav-link {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;

  width: 100% !important;
  min-height: 44px !important;

  padding: 10px 12px !important;
  margin: 0 !important;

  gap: 10px !important;
  text-align: left !important;
  line-height: 1.2 !important;
}

.topbar nav.main-navigation .wishlist-nav-link svg {
  display: block !important;
  flex: 0 0 18px !important;

  width: 18px !important;
  height: 18px !important;

  margin: 0 !important;
  padding: 0 !important;
}

.topbar nav.main-navigation .wishlist-nav-link span {
  display: inline-block;
  text-align: left;
}


/* =========================================
   C5 HERO BICYCLE — RIDING ENTRANCE
========================================= */

/* Keep the bicycle illustration visible */
.hero-art {
  overflow: hidden;
  animation: hero-float 7s ease-in-out infinite;
}

/* Bicycle rides into position when the page loads */
.hero-art > svg {
  position: relative;
  z-index: 2;
  animation:
    bike-ride-in 1.25s cubic-bezier(.16, 1, .3, 1) both,
    bike-cruise 2.8s ease-in-out 1.25s infinite;
  filter: drop-shadow(0 12px 18px rgba(198, 243, 107, .22));
}

/* Moving speed lines behind the bicycle */
.hero-art::before {
  content: "";
  position: absolute;
  left: 8%;
  top: 43%;
  width: 38%;
  height: 3px;
  border-radius: 10px;
  background: linear-gradient(
    90deg,
    transparent,
    #c6f36b,
    transparent
  );
  opacity: 0;
  animation: bike-speed-lines 1.1s ease-out .2s both;
}

.hero-art::after {
  content: "";
  position: absolute;
  left: 14%;
  top: 53%;
  width: 25%;
  height: 2px;
  border-radius: 10px;
  background: linear-gradient(
    90deg,
    transparent,
    #c6f36b99,
    transparent
  );
  opacity: 0;
  animation: bike-speed-lines 1s ease-out .4s both;
}

/* Riding entrance */
@keyframes bike-ride-in {
  0% {
    opacity: 0;
    transform: translateX(-85px) rotate(-8deg) scale(.82);
  }

  65% {
    opacity: 1;
    transform: translateX(12px) rotate(3deg) scale(1.04);
  }

  100% {
    opacity: 1;
    transform: translateX(0) rotate(0) scale(1);
  }
}

/* Gentle cycling movement after entrance */
@keyframes bike-cruise {
  0%, 100% {
    transform: translateY(0) rotate(0);
  }

  50% {
    transform: translateY(-6px) rotate(-1deg);
  }
}

/* Speed-line entrance */
@keyframes bike-speed-lines {
  0% {
    opacity: 0;
    transform: translateX(-35px);
  }

  35% {
    opacity: .8;
  }

  100% {
    opacity: 0;
    transform: translateX(55px);
  }
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  .hero-art,
  .hero-art > svg,
  .hero-art::before,
  .hero-art::after {
    animation: none !important;
  }
}


/* =========================================
   MOBILE HERO BICYCLE ANIMATION
========================================= */

@media (max-width: 650px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
    gap: 25px;
  }

  .hero-art {
    display: grid !important;
    width: min(100%, 320px);
    max-width: 100%;
    height: 210px;
    align-self: center;
    margin: 8px auto 12px;
    transform: none;
  }

  .hero-art > svg {
    width: 155px;
    height: 155px;
  }

  .art-label {
    bottom: 17px;
    font-size: 9px;
    letter-spacing: 2px;
  }
}

@media (max-width: 380px) {
  .hero-art {
    width: 250px;
    height: 180px;
  }

  .hero-art > svg {
    width: 130px;
    height: 130px;
  }
}

/* =========================================
   COMPACT MOBILE HERO — TWO COLUMN LAYOUT
========================================= */

@media (max-width: 650px) {
  .hero {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 105px !important;
    align-items: center !important;
    gap: 8px !important;
    padding: 30px 14px !important;
    min-height: 0 !important;
  }

  /* Hero text and button */
  .hero > div:first-child {
    min-width: 0;
    width: 100%;
  }

  .hero h1 {
    font-size: clamp(29px, 8vw, 38px) !important;
    line-height: .98 !important;
    letter-spacing: -1.5px !important;
  }

  .hero p {
    font-size: 11px !important;
    line-height: 1.5 !important;
  }

  .hero button {
    min-height: 38px !important;
    padding: 9px 11px !important;
    font-size: 10px !important;
    white-space: nowrap;
  }

  /* Smaller bicycle illustration on the right */
  .hero-art {
    display: grid !important;
    width: 105px !important;
    height: 125px !important;
    min-width: 0 !important;
    margin: 0 !important;
    align-self: center !important;
    justify-self: center !important;
    overflow: visible !important;
  }

  .hero-art > svg {
    width: 88px !important;
    height: 88px !important;
  }

  .hero-art .art-label {
    font-size: 6px !important;
    letter-spacing: 1px !important;
    bottom: 5px !important;
    text-align: center;
  }
}

/* Extra-small phones */
@media (max-width: 360px) {
  .hero {
    grid-template-columns: minmax(0, 1fr) 85px !important;
    gap: 5px !important;
    padding: 25px 11px !important;
  }

  .hero-art {
    width: 85px !important;
    height: 110px !important;
  }

  .hero-art > svg {
    width: 72px !important;
    height: 72px !important;
  }

  .hero h1 {
    font-size: 28px !important;
  }
}



/* =========================================
   C5 CYCLEHUB - BICYCLE LOADING ANIMATION
========================================= */

.bike-splash {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #172020;
  color: #c6f36b;
  pointer-events: none;

  animation: splash-exit .65s ease-in 2.85s forwards;
}

/* BRAND */
.bike-splash-brand {
  position: absolute;
  top: 42%;
  left: 50%;
  width: 100%;
  transform: translate(-50%, -50%);
  text-align: center;
  font-size: clamp(24px, 4vw, 42px);
  font-weight: 900;
  letter-spacing: 3px;
  opacity: 0;

  animation: splash-brand-in .6s ease .25s forwards;
}

.bike-splash-brand span {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  letter-spacing: 5px;
  color: #aab6b0;
}

/* LOADING TRACK */
.bike-splash-track {
  position: absolute;
  top: calc(57% + 38px);
  left: 0;
  width: 100%;
  height: 4px;
  background: rgba(198, 243, 107, .12);
  overflow: hidden;
}

/* GLOWING TRAIL */

.bike-splash-progress {
  width: 0;
  height: 100%;
  background: #c6f36b;
  box-shadow:
    0 0 8px #c6f36b,
    0 0 20px rgba(198, 243, 107, .8);

  animation: bike-loading-progress 2.2s
    cubic-bezier(.45,.05,.55,.95) .2s forwards;
}

/* MOVING BICYCLE */
.bike-splash-rider {
  position: absolute;
  left: 0;
  top: 57%;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 0 15px rgba(198,243,107,.6));

  animation: bicycle-cross-screen 2.2s
    cubic-bezier(.45,.05,.55,.95) .2s both;
}

.bike-splash-rider svg {
  color: #c6f36b;
}

/* TAGLINE */
.bike-splash-tagline {
  position: absolute;
  top: 69%;
  width: 100%;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 4px;
  opacity: 0;

  animation: splash-tagline-in .5s ease 1.6s forwards;
}

/* BIKE MOVEMENT */
@keyframes bicycle-cross-screen {
  0% {
    transform: translateX(-120px) translateY(0);
  }

  25% {
    transform: translateX(25vw) translateY(-8px);
  }

  50% {
    transform: translateX(50vw) translateY(0);
  }

  75% {
    transform: translateX(75vw) translateY(-7px);
  }

  100% {
    transform: translateX(calc(100vw + 120px));
  }
}

/* LOADING BAR PROGRESS */

@keyframes bike-loading-progress {
  0% {
    width: 0;
  }

  25% {
    width: calc(25vw - 110px);
  }

  50% {
    width: calc(50vw + 10px);
  }

  75% {
    width: calc(75vw + 3px);
  }

  100% {
    width: 100vw;
  }
}


/* BRAND ENTRANCE */
@keyframes splash-brand-in {
  from {
    opacity: 0;
    transform: translate(-50%, -40%);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
}

/* TAGLINE ENTRANCE */
@keyframes splash-tagline-in {
  to {
    opacity: 1;
  }
}

/* WEBSITE REVEAL */
@keyframes splash-exit {
  to {
    opacity: 0;
    visibility: hidden;
  }
}

/* MOBILE */
@media (max-width: 650px) {
  .bike-splash-rider svg {
    width: 58px;
    height: 58px;
  }

  .bike-splash-track {
    top: calc(57% + 29px);
    height: 3px;
  }

  .bike-splash-brand {
    font-size: 25px;
    letter-spacing: 2px;
  }

  .bike-splash-tagline {
    font-size: 8px;
    letter-spacing: 2px;
  }
}

/* ACCESSIBILITY */
@media (prefers-reduced-motion: reduce) {
  .bike-splash,
  .bike-splash-rider,
  .bike-splash-brand,
  .bike-splash-tagline,
  .bike-splash-progress {
    animation: none !important;
  }

  .bike-splash {
    display: none !important;
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