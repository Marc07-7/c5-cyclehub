import 'dotenv/config';

import express from 'express';

import http from 'node:http';

import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';

import cors from 'cors';

import helmet from 'helmet';

import session from 'express-session';

import MySQLStoreFactory from 'express-mysql-session';

import { Server as SocketServer } from 'socket.io';

import { rateLimit } from 'express-rate-limit';

import { pool, pingDatabase } from './db.js';

import { createRequire } from 'node:module';



const require = createRequire(import.meta.url);

const webpush = require('web-push');

const required = [

  'DB_HOST',

  'DB_NAME',

  'DB_USER',

  'SESSION_SECRET',

  'FRONTEND_ORIGIN'

];



for (const key of required) {

  if (!process.env[key]) {

    throw new Error(`Missing required environment variable: ${key}`);

  }

}



if (process.env.SESSION_SECRET.length < 32) {

  throw new Error('SESSION_SECRET must be at least 32 characters.');

}



const app = express();

const server = http.createServer(app);



const allowedOrigins = (

  process.env.FRONTEND_ORIGINS ||

  process.env.FRONTEND_ORIGIN

)

  .split(',')

  .map(origin => origin.trim().replace(/\/$/, ''))

  .filter(Boolean);



const secureCookie = process.env.COOKIE_SECURE === 'true';

const sameSite = process.env.COOKIE_SAME_SITE || 'lax';



// WEB PUSH CONFIGURATION

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';

const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';

const vapidSubject =

  process.env.VAPID_SUBJECT || 'mailto:admin\@c5cyclehub.local';



const pushEnabled = Boolean(vapidPublicKey && vapidPrivateKey);



if (pushEnabled) {

  webpush.setVapidDetails(

    vapidSubject,

    vapidPublicKey,

    vapidPrivateKey

  );

} else {

  console.warn(

    'Web push is disabled: VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing.'

  );

}



// MYSQL SESSION STORE

const MySQLStore = MySQLStoreFactory(session);



const sessionStore = new MySQLStore({

  host: process.env.DB_HOST,

  port: Number(process.env.DB_PORT || 3306),

  user: process.env.DB_USER,

  password: process.env.DB_PASSWORD,

  database: process.env.DB_NAME,

  createDatabaseTable: true,

  schema: {

    tableName: 'user_sessions'

  }

});



const sessionMiddleware = session({

  name: 'c5cyclehub.sid',

  secret: process.env.SESSION_SECRET,

  store: sessionStore,

  resave: false,

  saveUninitialized: false,

  cookie: {

    httpOnly: true,

    secure: secureCookie,

    sameSite,

    maxAge: 1000 * 60 * 60 * 8,

    path: '/'

  }

});



app.disable('x-powered-by');



app.use(

  helmet({

    crossOriginResourcePolicy: {

      policy: 'cross-origin'

    }

  })

);



app.use(

  cors({

    origin: (requestOrigin, callback) => {

      if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {

        return callback(null, true);

      }



      return callback(new Error('Origin not allowed by CORS'));

    },

    credentials: true,

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    allowedHeaders: ['Content-Type', 'X-CSRF-Token']

  })

);



app.use(express.json({ limit: '1mb' }));

app.use(sessionMiddleware);



app.use((req, res, next) => {

  res.setHeader('Cache-Control', 'no-store');

  next();

});



// SOCKET.IO

const io = new SocketServer(server, {

  cors: {

    origin: allowedOrigins,

    credentials: true,

    methods: ['GET', 'POST']

  }

});



io.engine.use(sessionMiddleware);



io.use(async (socket, next) => {

  try {

    const user = socket.request.session?.user;



    if (!user) {

      return next(new Error('Authentication required'));

    }



    socket.data.user = user;

    next();

  } catch {

    next(new Error('Authentication failed'));

  }

});



io.on('connection', socket => {

  const uid = Number(socket.data.user.id);



  socket.join(`user:${uid}`);



  socket.on('chat:join', async ({ withUserId } = {}) => {

    try {

      const peer = Number(withUserId);



      if (!Number.isInteger(peer) || peer < 1) return;



      const [[other]] = await pool.query(

        'SELECT id, role FROM users WHERE id = ? AND is_active = 1',

        [peer]

      );



      if (!other) return;



      if (

        socket.data.user.role !== 'admin' &&

        other.role !== 'admin'

      ) {

        return;

      }



      socket.join(

        `chat:${[uid, peer].sort((a, b) => a - b).join(':')}`

      );

    } catch (error) {

      console.error('chat:join error:', error);

    }

  });



  socket.on(

    'chat:send',

    async ({ receiverId, message } = {}, ack = () => {}) => {

      const to = Number(receiverId);

      const text = String(message || '').trim();



      if (

        !Number.isInteger(to) ||

        to < 1 ||

        !text ||

        text.length > 2000 ||

        to === uid

      ) {

        return ack({

          success: false,

          message: 'Invalid message.'

        });

      }



      try {

        const [[recipient]] = await pool.query(

          'SELECT id, role FROM users WHERE id = ? AND is_active = 1',

          [to]

        );



        if (

          !recipient ||

          (

            socket.data.user.role !== 'admin' &&

            recipient.role !== 'admin'

          )

        ) {

          return ack({

            success: false,

            message: 'Chat recipient is not available.'

          });

        }



        const [result] = await pool.query(

          'INSERT INTO messages(sender_id, receiver_id, message) VALUES(?,?,?)',

          [uid, to, text]

        );



        const payload = {

          id: result.insertId,

          sender_id: uid,

          receiver_id: to,

          message: text,

          created_at: new Date().toISOString()

        };



        io.to(`user:${uid}`)

          .to(`user:${to}`)

          .emit('chat:message', payload);



        ack({

          success: true,

          data: payload

        });

      } catch (error) {

        console.error('chat:send error:', error);



        ack({

          success: false,

          message: 'Unable to send message.'

        });

      }

    }

  );

});



// API CONFIGURATION

const api = express.Router();



const unsafe = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);



api.use((req, res, next) => {

  if (!unsafe.has(req.method)) {

    return next();

  }



  const token = req.get('X-CSRF-Token');



  if (

    !req.session.csrfToken ||

    !token ||

    token.length !== req.session.csrfToken.length ||

    !crypto.timingSafeEqual(

      Buffer.from(token),

      Buffer.from(req.session.csrfToken)

    )

  ) {

    return res.status(403).json({

      success: false,

      message: 'Your security token expired. Refresh the page and try again.'

    });

  }



  next();

});



const authLimiter = rateLimit({

  windowMs: 15 * 60 * 1000,

  limit: 30,

  standardHeaders: true,

  legacyHeaders: false

});



const ok = (res, data = {}, status = 200) =>

  res.status(status).json({

    success: true,

    ...data

  });



const fail = (res, status, message) =>

  res.status(status).json({

    success: false,

    message

  });



const currentUser = req => req.session.user || null;



function requireUser(req, res, next) {

  if (!currentUser(req)) {

    return fail(res, 401, 'Please log in first.');

  }



  next();

}



function requireAdmin(req, res, next) {

  if (!currentUser(req)) {

    return fail(res, 401, 'Please log in first.');

  }



  if (currentUser(req).role !== 'admin') {

    return fail(res, 403, 'Administrator access required.');

  }



  next();

}



const slugify = value =>

  String(value || '')

    .trim()

    .toLowerCase()

    .replace(/[^a-z0-9]+/g, '-')

    .replace(/^-|-$/g, '')

    .slice(0, 200);



// WEB PUSH DELIVERY

async function sendPushToUser(userId, title, body) {

  if (!pushEnabled) return;



  try {

    const [subscriptions] = await pool.query(

      `SELECT id, endpoint, p256dh, auth

       FROM push_subscriptions

       WHERE user_id = ?`,

      [userId]

    );



    const payload = JSON.stringify({

      title: String(title || 'C5 CycleHub'),

      body: String(body || 'You have a new notification.'),

      url: '/'

    });



    await Promise.all(

      subscriptions.map(async subscription => {

        const pushSubscription = {

          endpoint: subscription.endpoint,

          keys: {

            p256dh: subscription.p256dh,

            auth: subscription.auth

          }

        };



        try {

          await webpush.sendNotification(

            pushSubscription,

            payload

          );

        } catch (error) {

          if (error.statusCode === 404 || error.statusCode === 410) {

            await pool.query(

              'DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?',

              [subscription.id, userId]

            );

          } else {

            console.error(

              'Web push delivery failed:',

              error.message

            );

          }

        }

      })

    );

  } catch (error) {

    console.error(

      'Unable to send web push notifications:',

      error.message

    );

  }

}



// IN-APP NOTIFICATION + WEB PUSH

async function notify(userId, title, body, conn = pool) {

  await conn.query(

    'INSERT INTO notifications(user_id,title,body) VALUES(?,?,?)',

    [userId, title, body]

  );



  // Push delivery is triggered by the caller only after its transaction commits.

}



// HEALTH

api.get('/health', async (req, res) => {

  try {

    await pool.query('SELECT 1');



    ok(res, {

      service: 'C5 CycleHub API',

      database: 'connected'

    });

  } catch {

    fail(res, 503, 'Database unavailable.');

  }

});



// CSRF

api.get('/auth/csrf', (req, res) => {

  if (!req.session.csrfToken) {

    req.session.csrfToken = crypto.randomBytes(32).toString('hex');

  }



  ok(res, {

    csrf_token: req.session.csrfToken

  });

});



// WEB PUSH: PUBLIC VAPID KEY

api.get('/push/vapid-public-key', (req, res) => {

  if (!pushEnabled) {

    return fail(

      res,

      503,

      'Web push is not configured on the server.'

    );

  }



  ok(res, {

    publicKey: vapidPublicKey

  });

});



// WEB PUSH: REGISTER SUBSCRIPTION

api.post('/push/subscribe', requireUser, async (req, res, next) => {

  if (!pushEnabled) {

    return fail(

      res,

      503,

      'Web push is not configured on the server.'

    );

  }



  try {

    const subscription =

  req.body?.subscription || req.body;



    const endpoint = String(

      subscription?.endpoint || ''

    ).trim();



    const p256dh = String(

      subscription?.keys?.p256dh || ''

    ).trim();



    const auth = String(

      subscription?.keys?.auth || ''

    ).trim();



    let parsedEndpoint;



    try {

      parsedEndpoint = new URL(endpoint);

    } catch {

      return fail(

        res,

        422,

        'Invalid push subscription endpoint.'

      );

    }



    if (

      parsedEndpoint.protocol !== 'https:' ||

      !p256dh ||

      !auth ||

      endpoint.length > 768 ||

      p256dh.length > 255 ||

      auth.length > 255

    ) {

      return fail(

        res,

        422,

        'Invalid push subscription data.'

      );

    }



    const userId = Number(req.session.user.id);



    // A browser endpoint belongs to one account at a time.

    await pool.query(

      'DELETE FROM push_subscriptions WHERE endpoint = ?',

      [endpoint]

    );



    await pool.query(

      `INSERT INTO push_subscriptions

        (user_id, endpoint, p256dh, auth)

       VALUES(?,?,?,?)`,

      [userId, endpoint, p256dh, auth]

    );



    ok(

      res,

      {

        message: 'Push notifications enabled.'

      },

      201

    );

  } catch (error) {

    next(error);

  }

});



// WEB PUSH: REMOVE SUBSCRIPTION

api.delete('/push/subscribe', requireUser, async (req, res, next) => {

  try {

    const endpoint = String(

      req.body.endpoint || ''

    ).trim();



    if (!endpoint || endpoint.length > 768) {

      return fail(

        res,

        422,

        'A valid push endpoint is required.'

      );

    }



    await pool.query(

      `DELETE FROM push_subscriptions

       WHERE user_id = ? AND endpoint = ?`,

      [req.session.user.id, endpoint]

    );



    ok(res, {

      message: 'Push notifications disabled.'

    });

  } catch (error) {

    next(error);

  }

});



// REGISTER

api.post('/auth/register', authLimiter, async (req, res, next) => {

  try {

    const name = String(req.body.name || '').trim();

    const email = String(req.body.email || '').trim().toLowerCase();

    const password = String(req.body.password || '');



    if (

      !name ||

      name.length > 120 ||

      !/^\S+@\S+\.\S+$/.test(email) ||

      password.length < 8

    ) {

      return fail(

        res,

        422,

        'Enter a name, valid email, and password of at least 8 characters.'

      );

    }



    const hash = await bcrypt.hash(password, 12);



    const [result] = await pool.query(

      `INSERT INTO users(name, email, password, role)

       VALUES(?,?,?,'customer')`,

      [name, email, hash]

    );



    req.session.regenerate(err => {

      if (err) return next(err);



      req.session.user = {

        id: result.insertId,

        name,

        email,

        role: 'customer'

      };



      req.session.csrfToken = crypto.randomBytes(32).toString('hex');



      req.session.save(error => {

        if (error) return next(error);



        ok(

          res,

          {

            user: req.session.user

          },

          201

        );

      });

    });

  } catch (error) {

    if (error.code === 'ER_DUP_ENTRY') {

      return fail(res, 409, 'Email is already registered.');

    }



    next(error);

  }

});



// LOGIN

api.post('/auth/login', authLimiter, async (req, res, next) => {

  try {

    const email = String(req.body.email || '').trim().toLowerCase();

    const password = String(req.body.password || '');



    const [[row]] = await pool.query(

      `SELECT id, name, email, password, role

       FROM users

       WHERE email = ? AND is_active = 1

       LIMIT 1`,

      [email]

    );



    const storedHash = row?.password

      ? String(row.password).replace(/^\$2y\$/, '$2b$')

      : '';



    if (!row || !(await bcrypt.compare(password, storedHash))) {

      return fail(res, 401, 'Invalid email or password.');

    }



    const user = {

      id: Number(row.id),

      name: row.name,

      email: row.email,

      role: row.role

    };



    req.session.regenerate(err => {

      if (err) return next(err);



      req.session.user = user;

      req.session.csrfToken = crypto.randomBytes(32).toString('hex');



      req.session.save(error => {

        if (error) return next(error);



        ok(res, { user });

      });

    });

  } catch (error) {

    next(error);

  }

});



// LOGOUT

api.post('/auth/logout', requireUser, (req, res, next) => {

  req.session.destroy(err => {

    if (err) return next(err);



    res.clearCookie('c5cyclehub.sid', {

      path: '/',

      httpOnly: true,

      secure: secureCookie,

      sameSite

    });



    ok(res, {

      message: 'Logged out.'

    });

  });

});



// CURRENT USER

api.get('/auth/me', (req, res) => {

  ok(res, {

    user: currentUser(req)

  });

});



// CATEGORIES

api.get('/categories', async (req, res, next) => {

  try {

    const [data] = await pool.query(

      `SELECT id, name, slug, description

       FROM categories

       WHERE is_archived = 0

       ORDER BY name`

    );



    ok(res, { data });

  } catch (error) {

    next(error);

  }

});



// ARCHIVED PRODUCTS

api.get('/products/archived', requireAdmin, async (req, res, next) => {

  try {

    const [data] = await pool.query(`

      SELECT

        p.id,

        p.name,

        p.slug,

        p.description,

        p.price,

        p.stock,

        p.image_url,

        p.archived_at,

        c.name category_name,

        c.id category_id

      FROM products p

      LEFT JOIN categories c ON c.id = p.category_id

      WHERE p.is_archived = 1

      ORDER BY p.archived_at DESC, p.created_at DESC

    `);



    ok(res, { data });

  } catch (error) {

    next(error);

  }

});



// RESTORE PRODUCT

api.post('/products/:id/restore', requireAdmin, async (req, res, next) => {

  try {

    const [result] = await pool.query(

      `UPDATE products

       SET is_archived = 0, archived_at = NULL

       WHERE id = ? AND is_archived = 1`,

      [req.params.id]

    );



    if (!result.affectedRows) {

      return fail(res, 404, 'Archived product not found.');

    }



    ok(res, {

      message: 'Product restored.'

    });

  } catch (error) {

    next(error);

  }

});



// GET PRODUCTS

api.get('/products', async (req, res, next) => {

  try {

    let sql = `

      SELECT

        p.id,

        p.name,

        p.slug,

        p.description,

        p.price,

        p.stock,

        p.image_url,

        c.name category_name,

        c.id category_id

      FROM products p

      LEFT JOIN categories c ON c.id = p.category_id

      WHERE p.is_archived = 0 AND p.is_active = 1

    `;



    const params = [];



    if (req.query.q) {

      sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';

      params.push(

        `%${req.query.q}%`,

        `%${req.query.q}%`

      );

    }



    if (req.query.category) {

      sql += ' AND p.category_id = ?';

      params.push(Number(req.query.category));

    }



    sql += ' ORDER BY p.created_at DESC';



    const [data] = await pool.query(sql, params);



    ok(res, { data });

  } catch (error) {

    next(error);

  }

});



// CREATE PRODUCT

api.post('/products', requireAdmin, async (req, res, next) => {

  try {

    const d = req.body;



    const name = String(d.name || '').trim();

    const price = Number(d.price);

    const stock = Number(d.stock ?? 0);



    if (

      !name ||

      !Number.isFinite(price) ||

      price < 0 ||

      !Number.isInteger(stock) ||

      stock < 0

    ) {

      return fail(

        res,

        422,

        'Product name, valid price, and non-negative stock are required.'

      );

    }



    const [result] = await pool.query(

      `INSERT INTO products

        (category_id, name, slug, description, price, stock, image_url)

       VALUES(?,?,?,?,?,?,?)`,

      [

        d.category_id || null,

        name,

        slugify(name),

        String(d.description || ''),

        price,

        stock,

        d.image_url || null

      ]

    );



    ok(

      res,

      {

        id: result.insertId

      },

      201

    );

  } catch (error) {

    next(error);

  }

});



// UPDATE PRODUCT

api.put('/products/:id', requireAdmin, async (req, res, next) => {

  try {

    const d = req.body;



    const name = String(d.name || '').trim();

    const price = Number(d.price);

    const stock = Number(d.stock);



    if (

      !name ||

      !Number.isFinite(price) ||

      price < 0 ||

      !Number.isInteger(stock) ||

      stock < 0

    ) {

      return fail(

        res,

        422,

        'Enter a valid product name, price, and stock quantity.'

      );

    }



    const [result] = await pool.query(

      `UPDATE products

       SET category_id = ?, name = ?, slug = ?, description = ?,

           price = ?, stock = ?, image_url = ?

       WHERE id = ? AND is_archived = 0`,

      [

        d.category_id || null,

        name,

        slugify(name),

        String(d.description || ''),

        price,

        stock,

        d.image_url || null,

        req.params.id

      ]

    );



    if (!result.affectedRows) {

      const [[exists]] = await pool.query(

        `SELECT id

         FROM products

         WHERE id = ? AND is_archived = 0`,

        [req.params.id]

      );



      if (!exists) {

        return fail(res, 404, 'Product not found.');

      }

    }



    ok(res);

  } catch (error) {

    next(error);

  }

});



// ARCHIVE PRODUCT

api.delete('/products/:id', requireAdmin, async (req, res, next) => {

  try {

    const [result] = await pool.query(

      `UPDATE products

       SET is_archived = 1, archived_at = NOW()

       WHERE id = ? AND is_archived = 0`,

      [req.params.id]

    );



    if (!result.affectedRows) {

      return fail(res, 404, 'Product not found.');

    }



    ok(res, {

      message: 'Product archived.'

    });

  } catch (error) {

    next(error);

  }

});



// NOTIFICATIONS

api.get('/notifications', requireUser, async (req, res, next) => {

  try {

    const [data] = await pool.query(

      `SELECT id, user_id, title, body, is_read, created_at

       FROM notifications

       WHERE user_id = ?

       ORDER BY created_at DESC, id DESC

       LIMIT 50`,

      [req.session.user.id]

    );



    const [[count]] = await pool.query(

      `SELECT COUNT(*) unread_count

       FROM notifications

       WHERE user_id = ? AND is_read = 0`,

      [req.session.user.id]

    );



    ok(res, {

      data,

      unread_count: Number(count.unread_count)

    });

  } catch (error) {

    next(error);

  }

});



// MARK ALL NOTIFICATIONS AS READ

api.put('/notifications/read-all', requireUser, async (req, res, next) => {

  try {

    await pool.query(

      `UPDATE notifications

       SET is_read = 1

       WHERE user_id = ? AND is_read = 0`,

      [req.session.user.id]

    );



    ok(res, {

      message: 'All notifications marked as read.'

    });

  } catch (error) {

    next(error);

  }

});



// MARK ONE NOTIFICATION AS READ

api.put('/notifications/:id', requireUser, async (req, res, next) => {

  try {

    const [result] = await pool.query(

      `UPDATE notifications

       SET is_read = 1

       WHERE id = ? AND user_id = ?`,

      [req.params.id, req.session.user.id]

    );



    if (!result.affectedRows) {

      const [[row]] = await pool.query(

        `SELECT id

         FROM notifications

         WHERE id = ? AND user_id = ?`,

        [req.params.id, req.session.user.id]

      );



      if (!row) {

        return fail(res, 404, 'Notification not found.');

      }

    }



    ok(res, {

      message: 'Notification marked as read.'

    });

  } catch (error) {

    next(error);

  }

});



// CREATE ORDER WITH DUPLICATE-CHECKOUT PROTECTION

api.post('/orders', requireUser, async (req, res, next) => {

  const userId = Number(req.session.user.id);

  const idempotencyKey = String(

    req.body.idempotency_key || ''

  ).trim();



  const items = req.body.items;



  if (!/^[a-zA-Z0-9\_-]{16,64}$/.test(idempotencyKey)) {

    return fail(

      res,

      422,

      'A valid checkout request key is required.'

    );

  }



  if (

    !Array.isArray(items) ||

    items.length < 1 ||

    items.length > 50 ||

    items.some(item =>

      !Number.isInteger(Number(item.product_id)) ||

      Number(item.product_id) < 1 ||

      !Number.isInteger(Number(item.quantity)) ||

      Number(item.quantity) < 1 ||

      Number(item.quantity) > 99

    )

  ) {

    return fail(

      res,

      422,

      'Your cart is empty or contains invalid quantities.'

    );

  }



  const quantities = new Map();



  for (const item of items) {

    const productId = Number(item.product_id);

    const quantity = Number(item.quantity);



    quantities.set(

      productId,

      (quantities.get(productId) || 0) + quantity

    );

  }



  for (const quantity of quantities.values()) {

    if (quantity > 99) {

      return fail(

        res,

        422,

        'A product quantity cannot exceed 99.'

      );

    }

  }



  const conn = await pool.getConnection();

  let transactionStarted = false;



  try {

    await conn.beginTransaction();

    transactionStarted = true;



    const [[existing]] = await conn.query(

      `SELECT id, total_amount

       FROM orders

       WHERE idempotency_key = ? AND user_id = ?

       LIMIT 1`,

      [idempotencyKey, userId]

    );



    if (existing) {

      await conn.rollback();

      transactionStarted = false;



      return ok(res, {

        order_id: Number(existing.id),

        total: Number(existing.total_amount),

        already_processed: true

      });

    }



    let total = 0;

    const checked = [];



    for (const [productId, quantity] of quantities) {

      const [[product]] = await conn.query(

        `SELECT id, name, price, stock

         FROM products

         WHERE id = ? AND is_active = 1 AND is_archived = 0

         FOR UPDATE`,

        [productId]

      );



      if (!product || Number(product.stock) < quantity) {
        await conn.rollback();
        transactionStarted = false;

        // Resolve the product name even when it is inactive/archived so the
        // customer sees exactly which cart item blocked checkout.
        let productName = product?.name || '';
        if (!productName) {
          const [[knownProduct]] = await pool.query(
            'SELECT name FROM products WHERE id = ? LIMIT 1',
            [productId]
          );
          productName = knownProduct?.name || `Product #${productId}`;
        }

        const availableStock = product ? Number(product.stock) : 0;
        const reason = !product
          ? `${productName} is no longer available.`
          : `${productName} has only ${availableStock} item(s) left, but your cart requests ${quantity}.`;

        return res.status(409).json({
          success: false,
          message: reason,
          data: {
            product_id: productId,
            product_name: productName,
            available_stock: availableStock,
            requested_quantity: quantity
          }
        });
      }



      total += Number(product.price) * quantity;



      checked.push({

        product,

        quantity

      });

    }



    const [orderResult] = await conn.query(

      `INSERT INTO orders

        (idempotency_key, user_id, total_amount, status, customer_note)

       VALUES(?,?,?,'pending',?)`,

      [

        idempotencyKey,

        userId,

        total,

        String(req.body.customer_note || '').trim()

      ]

    );



    for (const { product, quantity } of checked) {

      await conn.query(

        `INSERT INTO order_items

          (order_id, product_id, product_name, unit_price, quantity)

         VALUES(?,?,?,?,?)`,

        [

          orderResult.insertId,

          product.id,

          product.name,

          product.price,

          quantity

        ]

      );



      await conn.query(

        'UPDATE products SET stock = stock - ? WHERE id = ?',

        [quantity, product.id]

      );

    }



    const [admins] = await conn.query(

      `SELECT id

       FROM users

       WHERE role = 'admin' AND is_active = 1`

    );



    for (const admin of admins) {

      await notify(

        admin.id,

        'New Order Received',

        `${req.session.user.name} placed Order #${orderResult.insertId} worth ₱${total.toFixed(2)}.`,

        conn

      );

    }



    await conn.commit();

    transactionStarted = false;

    // Notify every active administrator's browser after the order is committed.
    for (const admin of admins) {
      void sendPushToUser(
        admin.id,
        'New Order Received',
        `${req.session.user.name} placed Order #${orderResult.insertId} worth ₱${total.toFixed(2)}.`
      );
    }



    return ok(

      res,

      {

        order_id: Number(orderResult.insertId),

        total,

        already_processed: false

      },

      201

    );

  } catch (error) {

    if (transactionStarted) {

      try {

        await conn.rollback();

      } catch (rollbackError) {

        console.error(

          'Checkout rollback failed:',

          rollbackError

        );

      }

    }



    if (error.code === 'ER_DUP_ENTRY') {

      try {

        const [[existingOrder]] = await pool.query(

          `SELECT id, total_amount

           FROM orders

           WHERE idempotency_key = ? AND user_id = ?

           LIMIT 1`,

          [idempotencyKey, userId]

        );



        if (existingOrder) {

          return ok(res, {

            order_id: Number(existingOrder.id),

            total: Number(existingOrder.total_amount),

            already_processed: true

          });

        }

      } catch (lookupError) {

        return next(lookupError);

      }

    }



    return next(error);

  } finally {

    conn.release();

  }

});



// GET ORDERS

api.get('/orders', requireUser, async (req, res, next) => {

  try {

    let sql = `

      SELECT o.*,

      (

        SELECT COUNT(*)

        FROM order_items oi

        WHERE oi.order_id = o.id

      ) item_count

    `;



    if (req.session.user.role === 'admin') {

      sql += `

        ,u.name customer_name, u.email customer_email

        FROM orders o

        JOIN users u ON u.id = o.user_id

        ORDER BY o.created_at DESC

      `;

    } else {

      sql += `

        FROM orders o

        WHERE o.user_id = ?

        ORDER BY o.created_at DESC

      `;

    }



    const [data] = await pool.query(

      sql,

      req.session.user.role === 'admin'

        ? []

        : [req.session.user.id]

    );



    ok(res, { data });

  } catch (error) {

    next(error);

  }

});



// GET ORDER DETAILS

api.get('/orders/:id', requireUser, async (req, res, next) => {

  try {

    const [[order]] = await pool.query(

      `SELECT o.*, u.name customer_name, u.email customer_email

       FROM orders o

       JOIN users u ON u.id = o.user_id

       WHERE o.id = ?`,

      [req.params.id]

    );



    if (!order) {

      return fail(res, 404, 'Order not found.');

    }



    if (

      req.session.user.role !== 'admin' &&

      Number(order.user_id) !== Number(req.session.user.id)

    ) {

      return fail(

        res,

        403,

        'You are not allowed to view this order.'

      );

    }



    const [items] = await pool.query(

      `SELECT

        id,

        product_id,

        product_name,

        unit_price,

        quantity,

        (unit_price * quantity) line_total

       FROM order_items

       WHERE order_id = ?

       ORDER BY id`,

      [req.params.id]

    );



    order.items = items;



    ok(res, { data: order });

  } catch (error) {

    next(error);

  }

});



// UPDATE ORDER STATUS

api.put('/orders/:id', requireAdmin, async (req, res, next) => {

  const conn = await pool.getConnection();



  try {

    const status = String(req.body.status || '');



    const allowed = [

      'pending',

      'confirmed',

      'processing',

      'completed',

      'cancelled'

    ];



    if (!allowed.includes(status)) {

      return fail(res, 422, 'Invalid order status.');

    }



    await conn.beginTransaction();



    const [[order]] = await conn.query(

      `SELECT id, user_id, status

       FROM orders

       WHERE id = ?

       FOR UPDATE`,

      [req.params.id]

    );



    if (!order) {

      await conn.rollback();

      return fail(res, 404, 'Order not found.');

    }



    if (order.status === status) {

      await conn.commit();



      return ok(res, {

        message: 'Order status is already up to date.'

      });

    }



    const transitions = {

      pending: ['confirmed', 'cancelled'],

      confirmed: ['processing', 'cancelled'],

      processing: ['completed', 'cancelled'],

      completed: [],

      cancelled: []

    };



    if (!transitions[order.status].includes(status)) {

      await conn.rollback();



      return fail(

        res,

        409,

        `Cannot change an order from ${order.status} to ${status}.`

      );

    }



    if (status === 'cancelled') {

      const [items] = await conn.query(

        `SELECT product_id, quantity

         FROM order_items

         WHERE order_id = ? AND product_id IS NOT NULL`,

        [req.params.id]

      );



      for (const item of items) {

        await conn.query(

          'UPDATE products SET stock = stock + ? WHERE id = ?',

          [item.quantity, item.product_id]

        );

      }

    }



    await conn.query(

      'UPDATE orders SET status = ? WHERE id = ?',

      [status, req.params.id]

    );



    const messages = {

      confirmed: 'Your order has been confirmed.',

      processing: 'Your order is now being processed.',

      completed: 'Your order has been completed.',

      cancelled: 'Your order has been cancelled.'

    };



    await notify(

      order.user_id,

      `Order #${req.params.id} Updated`,

      messages[status],

      conn

    );



    await conn.commit();

    // Notify the customer only after the status update is committed.
    void sendPushToUser(
      order.user_id,
      `Order #${req.params.id} Updated`,
      messages[status]
    );




    ok(res, {

      message: `Order status updated to ${status}.`

    });

  } catch (error) {

    await conn.rollback();

    next(error);

  } finally {

    conn.release();

  }

});



// ADMIN SUMMARY

api.get('/admin/summary', requireAdmin, async (req, res, next) => {

  try {

    const [[products]] = await pool.query(

      'SELECT COUNT(*) count FROM products WHERE is_archived = 0'

    );



    const [[orders]] = await pool.query(

      'SELECT COUNT(*) count FROM orders'

    );



    const [[customers]] = await pool.query(

      `SELECT COUNT(*) count

       FROM users

       WHERE role = 'customer'`

    );



    const [[sales]] = await pool.query(

      `SELECT COALESCE(SUM(total_amount), 0) sales

       FROM orders

       WHERE status IN ('confirmed', 'processing', 'completed')`

    );



    ok(res, {

      data: {

        products: Number(products.count),

        orders: Number(orders.count),

        customers: Number(customers.count),

        sales: Number(sales.sales)

      }

    });

  } catch (error) {

    next(error);

  }

});



// CHAT CONTACTS — customers can contact administrators; administrators can contact customers.
api.get('/chat/contacts', requireUser, async (req, res, next) => {
  try {
    const me = req.session.user;
    const targetRole = me.role === 'admin' ? 'customer' : 'admin';
    const [data] = await pool.query(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        (
          SELECT m.message
          FROM messages m
          WHERE (m.sender_id = u.id AND m.receiver_id = ?)
             OR (m.sender_id = ? AND m.receiver_id = u.id)
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT m.created_at
          FROM messages m
          WHERE (m.sender_id = u.id AND m.receiver_id = ?)
             OR (m.sender_id = ? AND m.receiver_id = u.id)
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message_at
       FROM users u
       WHERE u.role = ? AND u.is_active = 1
       ORDER BY last_message_at DESC, u.name ASC
       LIMIT 100`,
      [me.id, me.id, me.id, me.id, targetRole]
    );
    ok(res, { data });
  } catch (error) {
    next(error);
  }
});

// CHAT HISTORY

api.get('/chat/:userId', requireUser, async (req, res, next) => {

  try {

    const me = req.session.user;

    const peer = Number(req.params.userId);



    const [[other]] = await pool.query(

      `SELECT id, role

       FROM users

       WHERE id = ? AND is_active = 1`,

      [peer]

    );



    if (

      !other ||

      (me.role !== 'admin' && other.role !== 'admin')

    ) {

      return fail(

        res,

        403,

        'Chat is only available between customers and administrators.'

      );

    }



    const [data] = await pool.query(

      `SELECT

        id,

        sender_id,

        receiver_id,

        message,

        read_at,

        created_at

       FROM messages

       WHERE (sender_id = ? AND receiver_id = ?)

          OR (sender_id = ? AND receiver_id = ?)

       ORDER BY created_at ASC

       LIMIT 200`,

      [me.id, peer, peer, me.id]

    );



    await pool.query(

      `UPDATE messages

       SET read_at = NOW()

       WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL`,

      [peer, me.id]

    );



    ok(res, { data });

  } catch (error) {

    next(error);

  }

});



// NOT FOUND

api.use((req, res) => {

  fail(res, 404, 'API endpoint not found.');

});



app.use('/api', api);



// ERROR HANDLER

app.use((err, req, res, next) => {

  console.error(err);



  if (res.headersSent) {

    return next(err);

  }



  const status =

    err.message === 'Origin not allowed by CORS'

      ? 403

      : 500;



  res.status(status).json({

    success: false,

    message:

      status === 403

        ? 'Origin not allowed.'

        : 'An unexpected server error occurred.'

  });

});



// START SERVER

const port = Number(process.env.PORT || 3000);



await pingDatabase();



server.listen(port, () => {

  console.log(`C5 CycleHub API listening on port ${port}`);

});
