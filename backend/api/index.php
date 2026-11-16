<?php
declare(strict_types=1);

$config = require __DIR__ . '/../config/config.php';

// Security headers and exact-origin CORS (credentials must never use '*').
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$allowedOrigin = rtrim((string)($config['app']['allowed_origin'] ?? ''), '/');
$requestOrigin = rtrim((string)($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
if ($requestOrigin !== '' && $allowedOrigin !== '' && hash_equals($allowedOrigin, $requestOrigin)) {
    header('Access-Control-Allow-Origin: ' . $allowedOrigin);
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Max-Age: 600');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Harden PHP sessions. Secure cookies are enabled automatically on HTTPS.
$isHttps = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
session_name($config['app']['session_name']);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax'
]);
session_start();

// Require a session-bound token for every state-changing API request.
$method = $_SERVER['REQUEST_METHOD'];
if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
    $providedToken = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $sessionToken = (string)($_SESSION['csrf_token'] ?? '');
    if ($providedToken === '' || $sessionToken === '' || !hash_equals($sessionToken, $providedToken)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Your security token expired. Refresh the page and try again.']);
        exit;
    }
}

require __DIR__ . '/../config/database.php';

/* =========================
   GENERAL FUNCTIONS
========================= */

function out($data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function user(): ?array {
    return $_SESSION['user'] ?? null;
}

function requireUser(): array {
    $u = user();

    if (!$u) {
        out(['success' => false, 'message' => 'Please log in first.'], 401);
    }

    return $u;
}

function requireAdmin(): array {
    $u = requireUser();

    if ($u['role'] !== 'admin') {
        out(['success' => false, 'message' => 'Administrator access required.'], 403);
    }

    return $u;
}

function slugPath(): string {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '';
    $path = preg_replace('#^.*/api/index\.php#', '', $path);

    return trim($path, '/');
}

/* =========================
   NOTIFICATION FUNCTION
========================= */

function createNotification(
    PDO $pdo,
    int $userId,
    string $title,
    string $message
): void {
    $q = $pdo->prepare("
        INSERT INTO notifications (user_id, title, body)
        VALUES (?, ?, ?)
    ");

    $q->execute([$userId, $title, $message]);
}

/* =========================
   REQUEST INFORMATION
========================= */

$path = explode('/', slugPath());
$resource = $path[0] ?? '';

try {

    /* =========================
       CSRF TOKEN
    ========================= */

    if ($resource === 'auth' && ($path[1] ?? '') === 'csrf' && $method === 'GET') {
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        out(['success' => true, 'csrf_token' => $_SESSION['csrf_token']]);
    }

    /* =========================
       AUTHENTICATION
    ========================= */

    if ($resource === 'auth' && ($path[1] ?? '') === 'register' && $method === 'POST') {

        $d = body();

        $name = trim($d['name'] ?? '');
        $email = strtolower(trim($d['email'] ?? ''));
        $pass = $d['password'] ?? '';

        if (
            $name === '' ||
            !filter_var($email, FILTER_VALIDATE_EMAIL) ||
            strlen($pass) < 8
        ) {
            out([
                'success' => false,
                'message' => 'Enter a name, valid email, and password of at least 8 characters.'
            ], 422);
        }

        $q = $pdo->prepare("
            INSERT INTO users(name, email, password, role)
            VALUES (?, ?, ?, 'customer')
        ");

        try {
            $q->execute([
                $name,
                $email,
                password_hash($pass, PASSWORD_DEFAULT)
            ]);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? null) === 1062) {
                out(['success' => false, 'message' => 'Email is already registered.'], 409);
            }
            throw $e;
        }

        session_regenerate_id(true);
        $_SESSION['user'] = [
            'id' => (int)$pdo->lastInsertId(),
            'name' => $name,
            'email' => $email,
            'role' => 'customer'
        ];

        out(['success' => true, 'user' => user()], 201);
    }

    if ($resource === 'auth' && ($path[1] ?? '') === 'login' && $method === 'POST') {

        $d = body();

        $q = $pdo->prepare("
            SELECT id, name, email, password, role
            FROM users
            WHERE email = ? AND is_active = 1
            LIMIT 1
        ");

        $q->execute([strtolower(trim($d['email'] ?? ''))]);
        $row = $q->fetch();

        if (!$row || !password_verify($d['password'] ?? '', $row['password'])) {
            out(['success' => false, 'message' => 'Invalid email or password.'], 401);
        }

        unset($row['password']);

        session_regenerate_id(true);
        $row['id'] = (int)$row['id'];
        $_SESSION['user'] = $row;

        out(['success' => true, 'user' => $row]);
    }

    if ($resource === 'auth' && ($path[1] ?? '') === 'logout' && $method === 'POST') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => $params['samesite'] ?? 'Lax'
            ]);
        }
        session_destroy();

        out(['success' => true]);
    }

    if ($resource === 'auth' && ($path[1] ?? '') === 'me' && $method === 'GET') {
        out(['success' => true, 'user' => user()]);
    }

    /* =========================
       NOTIFICATIONS
    ========================= */

    // Get notifications belonging to the logged-in user.
    if ($resource === 'notifications' && $method === 'GET') {

        $u = requireUser();

        $q = $pdo->prepare("
            SELECT id, user_id, title, body, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 50
        ");

        $q->execute([$u['id']]);
        $notifications = $q->fetchAll();

        $count = $pdo->prepare("
            SELECT COUNT(*)
            FROM notifications
            WHERE user_id = ? AND is_read = 0
        ");

        $count->execute([$u['id']]);

        out([
            'success' => true,
            'data' => $notifications,
            'unread_count' => (int)$count->fetchColumn()
        ]);
    }

    // Mark all notifications as read.
    if (
        $resource === 'notifications' &&
        ($path[1] ?? '') === 'read-all' &&
        $method === 'PUT'
    ) {

        $u = requireUser();

        $q = $pdo->prepare("
            UPDATE notifications
            SET is_read = 1
            WHERE user_id = ? AND is_read = 0
        ");

        $q->execute([$u['id']]);

        out([
            'success' => true,
            'message' => 'All notifications marked as read.'
        ]);
    }

    // Mark an individual notification as read.
    if (
        $resource === 'notifications' &&
        isset($path[1]) &&
        ctype_digit($path[1]) &&
        $method === 'PUT'
    ) {

        $u = requireUser();
        $id = (int)$path[1];

        $q = $pdo->prepare("
            UPDATE notifications
            SET is_read = 1
            WHERE id = ? AND user_id = ?
        ");

        $q->execute([$id, $u['id']]);

        if ($q->rowCount() === 0) {
            $check = $pdo->prepare("
                SELECT id FROM notifications
                WHERE id = ? AND user_id = ?
            ");

            $check->execute([$id, $u['id']]);

            if (!$check->fetch()) {
                out([
                    'success' => false,
                    'message' => 'Notification not found.'
                ], 404);
            }
        }

        out([
            'success' => true,
            'message' => 'Notification marked as read.'
        ]);
    }

    /* =========================
       CATEGORIES
    ========================= */

    if ($resource === 'categories' && $method === 'GET') {

        $q = $pdo->query("
            SELECT id, name, slug, description
            FROM categories
            WHERE is_archived = 0
            ORDER BY name
        ");

        out(['success' => true, 'data' => $q->fetchAll()]);
    }

    /* =========================
       ARCHIVED PRODUCTS
    ========================= */

    if (
        $resource === 'products' &&
        ($path[1] ?? '') === 'archived' &&
        $method === 'GET'
    ) {

        requireAdmin();

        $q = $pdo->query("
            SELECT
                p.id, p.name, p.slug, p.description,
                p.price, p.stock, p.image_url,
                p.archived_at,
                c.name category_name,
                c.id category_id
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.is_archived = 1
            ORDER BY p.archived_at DESC, p.created_at DESC
        ");

        out(['success' => true, 'data' => $q->fetchAll()]);
    }

    /* =========================
       RESTORE PRODUCT
    ========================= */

    if (
        $resource === 'products' &&
        isset($path[1]) &&
        ctype_digit($path[1]) &&
        ($path[2] ?? '') === 'restore' &&
        $method === 'POST'
    ) {

        requireAdmin();

        $id = (int)$path[1];

        $q = $pdo->prepare("
            UPDATE products
            SET is_archived = 0, archived_at = NULL
            WHERE id = ? AND is_archived = 1
        ");

        $q->execute([$id]);

        if ($q->rowCount() === 0) {
            out(['success' => false, 'message' => 'Archived product not found.'], 404);
        }

        out(['success' => true, 'message' => 'Product restored.']);
    }

    /* =========================
       PRODUCTS
    ========================= */

    if ($resource === 'products' && $method === 'GET') {

        $sql = "
            SELECT
                p.id, p.name, p.slug, p.description,
                p.price, p.stock, p.image_url,
                c.name category_name, c.id category_id
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.is_archived = 0 AND p.is_active = 1
        ";

        $params = [];

        if (!empty($_GET['q'])) {
            $sql .= " AND (p.name LIKE ? OR p.description LIKE ?)";
            $term = '%' . $_GET['q'] . '%';
            $params = [$term, $term];
        }

        if (!empty($_GET['category'])) {
            $sql .= " AND p.category_id = ?";
            $params[] = (int)$_GET['category'];
        }

        $sql .= " ORDER BY p.created_at DESC";

        $q = $pdo->prepare($sql);
        $q->execute($params);

        out(['success' => true, 'data' => $q->fetchAll()]);
    }

    if ($resource === 'products' && $method === 'POST') {

        requireAdmin();
        $d = body();

        if (
            trim($d['name'] ?? '') === '' ||
            !is_numeric($d['price'] ?? null) ||
            (float)$d['price'] < 0
        ) {
            out([
                'success' => false,
                'message' => 'Product name and valid price are required.'
            ], 422);
        }

        $q = $pdo->prepare("
            INSERT INTO products
            (category_id, name, slug, description, price, stock, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");

        $q->execute([
            !empty($d['category_id']) ? $d['category_id'] : null,
            $d['name'],
            strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', $d['name']), '-')),
            $d['description'] ?? '',
            (float)$d['price'],
            max(0, (int)($d['stock'] ?? 0)),
            $d['image_url'] ?? null
        ]);

        out([
            'success' => true,
            'id' => (int)$pdo->lastInsertId()
        ], 201);
    }

    if (
        $resource === 'products' &&
        isset($path[1]) &&
        ctype_digit($path[1])
    ) {

        requireAdmin();
        $id = (int)$path[1];

        if ($method === 'PUT') {

            $d = body();

            $q = $pdo->prepare("
                UPDATE products
                SET category_id = ?, name = ?, description = ?,
                    price = ?, stock = ?, image_url = ?
                WHERE id = ? AND is_archived = 0
            ");

            $q->execute([
                !empty($d['category_id']) ? $d['category_id'] : null,
                $d['name'],
                $d['description'] ?? '',
                (float)$d['price'],
                max(0, (int)$d['stock']),
                $d['image_url'] ?? null,
                $id
            ]);

            out(['success' => true]);
        }

        if ($method === 'DELETE') {

            $q = $pdo->prepare("
                UPDATE products
                SET is_archived = 1, archived_at = NOW()
                WHERE id = ?
            ");

            $q->execute([$id]);

            out(['success' => true, 'message' => 'Product archived.']);
        }
    }

    /* =========================
       PLACE ORDER
    ========================= */

    if ($resource === 'orders' && $method === 'POST') {

        $u = requireUser();
        $d = body();
        $items = $d['items'] ?? [];

        if (!is_array($items) || count($items) === 0 || count($items) > 50) {
            out(['success' => false, 'message' => 'Your cart is empty or contains too many items.'], 422);
        }

        foreach ($items as $item) {
            if (!is_array($item) || !isset($item['product_id'], $item['quantity'])
                || !filter_var($item['product_id'], FILTER_VALIDATE_INT)
                || !filter_var($item['quantity'], FILTER_VALIDATE_INT)
                || (int)$item['product_id'] < 1 || (int)$item['quantity'] < 1
                || (int)$item['quantity'] > 99) {
                out(['success' => false, 'message' => 'One or more cart items have invalid quantities.'], 422);
            }
        }

        $pdo->beginTransaction();

        $total = 0;
        $validated = [];

        foreach ($items as $item) {

            $q = $pdo->prepare("
                SELECT id, name, price, stock
                FROM products
                WHERE id = ? AND is_active = 1 AND is_archived = 0
                FOR UPDATE
            ");

            $q->execute([(int)$item['product_id']]);

            $p = $q->fetch();
            $qty = (int)$item['quantity'];

            if (!$p || $p['stock'] < $qty) {
                $pdo->rollBack();

                out([
                    'success' => false,
                    'message' => 'A product is unavailable or has insufficient stock.'
                ], 409);
            }

            $total += (float)$p['price'] * $qty;
            $validated[] = [$p, $qty];
        }

        $q = $pdo->prepare("
            INSERT INTO orders(user_id, total_amount, status, customer_note)
            VALUES (?, ?, 'pending', ?)
        ");

        $q->execute([
            $u['id'],
            $total,
            trim($d['customer_note'] ?? '')
        ]);

        $orderId = (int)$pdo->lastInsertId();

        foreach ($validated as [$p, $qty]) {

            $pdo->prepare("
                INSERT INTO order_items
                (order_id, product_id, product_name, unit_price, quantity)
                VALUES (?, ?, ?, ?, ?)
            ")->execute([
                $orderId,
                $p['id'],
                $p['name'],
                $p['price'],
                $qty
            ]);

            $pdo->prepare("
                UPDATE products
                SET stock = stock - ?
                WHERE id = ?
            ")->execute([$qty, $p['id']]);
        }

        // Notify every administrator about the new order.
        $admins = $pdo->query("
            SELECT id FROM users
            WHERE role = 'admin' AND is_active = 1
        ")->fetchAll(PDO::FETCH_COLUMN);

        foreach ($admins as $adminId) {
            createNotification(
                $pdo,
                (int)$adminId,
                'New Order Received',
                $u['name'] . ' placed Order #' . $orderId .
                ' worth ₱' . number_format($total, 2) . '.'
            );
        }

        $pdo->commit();

        out([
            'success' => true,
            'order_id' => $orderId,
            'total' => $total
        ], 201);
    }

    /* =========================
       LIST ORDERS
    ========================= */

    if (
        $resource === 'orders' &&
        $method === 'GET' &&
        !isset($path[1])
    ) {

        $u = requireUser();

        if ($u['role'] === 'admin') {

            $q = $pdo->query("
                SELECT
                    o.*,
                    u.name customer_name,
                    u.email customer_email,
                    (SELECT COUNT(*) FROM order_items oi
                     WHERE oi.order_id = o.id) item_count
                FROM orders o
                JOIN users u ON u.id = o.user_id
                ORDER BY o.created_at DESC
            ");

        } else {

            $q = $pdo->prepare("
                SELECT o.*,
                    (SELECT COUNT(*) FROM order_items oi
                     WHERE oi.order_id = o.id) item_count
                FROM orders o
                WHERE o.user_id = ?
                ORDER BY o.created_at DESC
            ");

            $q->execute([$u['id']]);
        }

        out(['success' => true, 'data' => $q->fetchAll()]);
    }

    /* =========================
       SINGLE ORDER DETAILS
    ========================= */

    if (
        $resource === 'orders' &&
        isset($path[1]) &&
        ctype_digit($path[1]) &&
        $method === 'GET'
    ) {

        $u = requireUser();
        $id = (int)$path[1];

        $q = $pdo->prepare("
            SELECT o.*, u.name customer_name, u.email customer_email
            FROM orders o
            JOIN users u ON u.id = o.user_id
            WHERE o.id = ?
            LIMIT 1
        ");

        $q->execute([$id]);
        $order = $q->fetch();

        if (!$order) {
            out(['success' => false, 'message' => 'Order not found.'], 404);
        }

        if (
            $u['role'] !== 'admin' &&
            (int)$order['user_id'] !== (int)$u['id']
        ) {
            out([
                'success' => false,
                'message' => 'You are not allowed to view this order.'
            ], 403);
        }

        $items = $pdo->prepare("
            SELECT id, product_id, product_name, unit_price, quantity,
                (unit_price * quantity) line_total
            FROM order_items
            WHERE order_id = ?
            ORDER BY id
        ");

        $items->execute([$id]);
        $order['items'] = $items->fetchAll();

        out(['success' => true, 'data' => $order]);
    }

    /* =========================
       UPDATE ORDER STATUS
    ========================= */

    if (
        $resource === 'orders' &&
        isset($path[1]) &&
        ctype_digit($path[1]) &&
        $method === 'PUT'
    ) {

        requireAdmin();

        $id = (int)$path[1];
        $d = body();
        $status = $d['status'] ?? '';

        $valid = [
            'pending',
            'confirmed',
            'processing',
            'completed',
            'cancelled'
        ];

        if (!in_array($status, $valid, true)) {
            out(['success' => false, 'message' => 'Invalid order status.'], 422);
        }

        $pdo->beginTransaction();

        $q = $pdo->prepare("
            SELECT id, user_id, status
            FROM orders
            WHERE id = ?
            FOR UPDATE
        ");

        $q->execute([$id]);
        $order = $q->fetch();

        if (!$order) {
            $pdo->rollBack();
            out(['success' => false, 'message' => 'Order not found.'], 404);
        }

        $current = $order['status'];

        if ($current === $status) {
            $pdo->commit();

            out([
                'success' => true,
                'message' => 'Order status is already up to date.'
            ]);
        }

        $transitions = [
            'pending' => ['confirmed', 'cancelled'],
            'confirmed' => ['processing', 'cancelled'],
            'processing' => ['completed', 'cancelled'],
            'completed' => [],
            'cancelled' => []
        ];

        if (!in_array($status, $transitions[$current] ?? [], true)) {
            $pdo->rollBack();

            out([
                'success' => false,
                'message' => "Cannot change an order from {$current} to {$status}."
            ], 409);
        }

        // Restore product stock when an order is cancelled.
        if ($status === 'cancelled') {

            $items = $pdo->prepare("
                SELECT product_id, quantity
                FROM order_items
                WHERE order_id = ? AND product_id IS NOT NULL
            ");

            $items->execute([$id]);

            $restore = $pdo->prepare("
                UPDATE products
                SET stock = stock + ?
                WHERE id = ?
            ");

            foreach ($items->fetchAll() as $item) {
                $restore->execute([
                    (int)$item['quantity'],
                    (int)$item['product_id']
                ]);
            }
        }

        $update = $pdo->prepare("
            UPDATE orders
            SET status = ?
            WHERE id = ?
        ");

        $update->execute([$status, $id]);

        // Notify the customer about the order status change.
        $statusMessages = [
            'confirmed' => 'Your order has been confirmed.',
            'processing' => 'Your order is now being processed.',
            'completed' => 'Your order has been completed.',
            'cancelled' => 'Your order has been cancelled.'
        ];

        createNotification(
            $pdo,
            (int)$order['user_id'],
            'Order #' . $id . ' Updated',
            $statusMessages[$status]
        );

        $pdo->commit();

        out([
            'success' => true,
            'message' => 'Order status updated to ' . $status . '.'
        ]);
    }

    /* =========================
       ADMIN DASHBOARD SUMMARY
    ========================= */

    if (
        $resource === 'admin' &&
        ($path[1] ?? '') === 'summary' &&
        $method === 'GET'
    ) {

        requireAdmin();

        $products = (int)$pdo->query("
            SELECT COUNT(*) FROM products
            WHERE is_archived = 0
        ")->fetchColumn();

        $orders = (int)$pdo->query("
            SELECT COUNT(*) FROM orders
        ")->fetchColumn();

        $customers = (int)$pdo->query("
            SELECT COUNT(*) FROM users
            WHERE role = 'customer'
        ")->fetchColumn();

        $sales = (float)$pdo->query("
            SELECT COALESCE(SUM(total_amount), 0)
            FROM orders
            WHERE status IN ('confirmed', 'processing', 'completed')
        ")->fetchColumn();

        out([
            'success' => true,
            'data' => compact('products', 'orders', 'customers', 'sales')
        ]);
    }

    /* =========================
       UNKNOWN ENDPOINT
    ========================= */

    out([
        'success' => false,
        'message' => 'Endpoint not found.'
    ], 404);

} catch (Throwable $e) {

    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log($e->__toString());

    out([
        'success' => false,
        'message' => 'An unexpected server error occurred. Check the PHP error log.'
    ], 500);
}
