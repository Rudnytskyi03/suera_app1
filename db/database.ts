import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

let database: Database.Database | null = null;

function ensureDatabase() {
  if (!app.isReady()) {
    throw new Error('Database requested before app was ready');
  }
  if (!database) {
    const userDataPath = app.getPath('userData');
    fs.mkdirSync(userDataPath, { recursive: true });
    const dbPath = path.join(userDataPath, 'lingerie-manager.db');
    database = new Database(dbPath);
    database.pragma('foreign_keys = ON');
    initializeSchema(database);
  }
  return database;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  price_per_unit REAL NOT NULL DEFAULT 0,
  photo TEXT,
  bra_underwire_size TEXT,
  underwire_units_per_bra REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS material_underwire_sizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  UNIQUE(material_id, size)
);

CREATE TABLE IF NOT EXISTS material_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  comment TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instagram TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone TEXT,
  birth_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  materials_cost REAL NOT NULL DEFAULT 0,
  additional_cost REAL NOT NULL DEFAULT 0,
  cost_price REAL NOT NULL DEFAULT 0,
  sewing_cost REAL NOT NULL DEFAULT 0,
  packaging_cost REAL NOT NULL DEFAULT 0,
  shipping_cost REAL NOT NULL DEFAULT 0,
  advertising_cost REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'none',
  discount_value REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  customer_first_name TEXT NOT NULL,
  customer_last_name TEXT NOT NULL,
  customer_instagram TEXT,
  customer_phone TEXT,
  customer_birth_date TEXT,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  delivery_address TEXT,
  discount_percent REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finished_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component TEXT NOT NULL,
  size TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id, component, size)
);

CREATE TABLE IF NOT EXISTS finished_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  bra_size TEXT NOT NULL DEFAULT '',
  panties_size TEXT NOT NULL DEFAULT '',
  belt_size TEXT NOT NULL DEFAULT '',
  garter_size TEXT NOT NULL DEFAULT '',
  sets INTEGER NOT NULL DEFAULT 0,
  bra INTEGER NOT NULL DEFAULT 0,
  panties INTEGER NOT NULL DEFAULT 0,
  belt INTEGER NOT NULL DEFAULT 0,
  garter INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  produced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  skip_materials INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_finished_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  component TEXT NOT NULL,
  size TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0
);
`);

  ensureColumn(db, 'products', 'materials_cost', 'materials_cost REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'products', 'additional_cost', 'additional_cost REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'products', 'discount_type', "discount_type TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(db, 'products', 'discount_value', 'discount_value REAL NOT NULL DEFAULT 0');
  ensureProductPhotosColumnRenamed(db);
  ensureProductExpensesTable(db);
  ensureColumn(db, 'orders', 'customer_phone', 'customer_phone TEXT');
  ensureColumn(db, 'orders', 'customer_birth_date', 'customer_birth_date TEXT');
  ensureColumn(db, 'orders', 'client_id', 'client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL');
  ensureColumn(db, 'orders', 'discount_percent', 'discount_percent REAL NOT NULL DEFAULT 0');
  ensureOrderExpensesTable(db);
  ensureFinishedTables(db);
  ensureColumn(db, 'materials', 'bra_underwire_size', 'bra_underwire_size TEXT');
  ensureColumn(db, 'materials', 'underwire_units_per_bra', 'underwire_units_per_bra REAL NOT NULL DEFAULT 0');
  ensureMaterialUnderwireSizesTable(db);
  ensureColumn(db, 'finished_batches', 'skip_materials', 'skip_materials INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'finished_batches', 'bra_size', "bra_size TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'finished_batches', 'panties_size', "panties_size TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'finished_batches', 'belt_size', "belt_size TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'finished_batches', 'garter_size', "garter_size TEXT NOT NULL DEFAULT ''");
  db.prepare(
    "UPDATE finished_batches SET bra_size = size WHERE (bra_size IS NULL OR bra_size = '') AND size IS NOT NULL"
  ).run();
  db.prepare(
    "UPDATE finished_batches SET panties_size = size WHERE (panties_size IS NULL OR panties_size = '') AND size IS NOT NULL"
  ).run();
  db.prepare(
    "UPDATE finished_batches SET belt_size = size WHERE (belt_size IS NULL OR belt_size = '') AND size IS NOT NULL"
  ).run();
  db.prepare(
    "UPDATE finished_batches SET garter_size = size WHERE (garter_size IS NULL OR garter_size = '') AND size IS NOT NULL"
  ).run();
  backfillClientsFromOrders(db);

  const defaultUserStmt = db.prepare('SELECT * FROM users WHERE email = ?');
  const existingDefaultUser = defaultUserStmt.get('admin@lingeriedashboard.app') as
    | { id: number; password: string }
    | undefined;

  if (!existingDefaultUser) {
    const insertUser = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    insertUser.run('admin@lingeriedashboard.app', hashedPassword);
  } else {
    let needsUpdate = false;
    try {
      const matches = bcrypt.compareSync('admin123', existingDefaultUser.password);
      needsUpdate = !matches;
    } catch (error) {
      needsUpdate = true;
    }

    if (needsUpdate) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, existingDefaultUser.id);
    }
  }
}

export function getDatabase() {
  return ensureDatabase();
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function ensureProductPhotosColumnRenamed(db: Database.Database) {
  const columns = db.prepare('PRAGMA table_info(product_photos)').all() as Array<{ name: string }>;
  const hasUrl = columns.some((column) => column.name === 'url');
  const hasFilePath = columns.some((column) => column.name === 'file_path');
  if (hasUrl && !hasFilePath) {
    db.exec('ALTER TABLE product_photos RENAME COLUMN url TO file_path');
  }
}

function ensureProductExpensesTable(db: Database.Database) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_expenses'")
    .all() as Array<{ name: string }>;
  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE product_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0
      );
    `);
  }
}

function ensureMaterialUnderwireSizesTable(db: Database.Database) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='material_underwire_sizes'")
    .all() as Array<{ name: string }>;
  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE material_underwire_sizes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        size TEXT NOT NULL,
        UNIQUE(material_id, size)
      );
    `);
  }

  const hasSizeColumn = db
    .prepare("PRAGMA table_info(material_underwire_sizes)")
    .all() as Array<{ name: string }>;
  if (!hasSizeColumn.some((column) => column.name === 'size')) {
    db.exec('ALTER TABLE material_underwire_sizes ADD COLUMN size TEXT NOT NULL DEFAULT ""');
  }

  const materialsWithSingleSize = db
    .prepare('SELECT id, bra_underwire_size FROM materials WHERE bra_underwire_size IS NOT NULL')
    .all() as Array<{ id: number; bra_underwire_size: string }>;

  const insertSize = db.prepare(
    'INSERT OR IGNORE INTO material_underwire_sizes (material_id, size) VALUES (@materialId, @size)'
  );

  const migrate = db.transaction(() => {
    for (const material of materialsWithSingleSize) {
      const normalized = (material.bra_underwire_size || '')
        .split(',')
        .map((size) => size.trim().toUpperCase())
        .filter((size) => size.length > 0 && size !== 'UNSIZED');
      for (const size of normalized) {
        insertSize.run({ materialId: material.id, size });
      }
    }
  });

  migrate();
}

function ensureOrderExpensesTable(db: Database.Database) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='order_expenses'")
    .all() as Array<{ name: string }>;

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE order_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0
      );
    `);
  }
}

function ensureFinishedTables(db: Database.Database) {
  const hasInventoryTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='finished_inventory'")
    .all() as Array<{ name: string }>;

  if (hasInventoryTable.length === 0) {
    db.exec(`
      CREATE TABLE finished_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        component TEXT NOT NULL,
        size TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        UNIQUE(product_id, component, size)
      );
    `);
  }

  const hasBatchesTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='finished_batches'")
    .all() as Array<{ name: string }>;

  if (hasBatchesTable.length === 0) {
    db.exec(`
      CREATE TABLE finished_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        size TEXT NOT NULL,
        bra_size TEXT NOT NULL DEFAULT '',
        panties_size TEXT NOT NULL DEFAULT '',
        belt_size TEXT NOT NULL DEFAULT '',
        garter_size TEXT NOT NULL DEFAULT '',
        sets INTEGER NOT NULL DEFAULT 0,
        bra INTEGER NOT NULL DEFAULT 0,
        panties INTEGER NOT NULL DEFAULT 0,
        belt INTEGER NOT NULL DEFAULT 0,
        garter INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        produced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        skip_materials INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  const hasAllocationsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='order_finished_allocations'")
    .all() as Array<{ name: string }>;

  if (hasAllocationsTable.length === 0) {
    db.exec(`
      CREATE TABLE order_finished_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
        component TEXT NOT NULL,
        size TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0
      );
    `);
  }
}


function normalizePhone(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

function sanitizeInstagram(handle?: string | null) {
  if (!handle) return null;
  const trimmed = handle.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^@+/, '');
}

function backfillClientsFromOrders(db: Database.Database) {
  const orders = db
    .prepare(
      `SELECT id, customer_first_name, customer_last_name, customer_instagram, customer_phone, customer_birth_date, client_id
       FROM orders`
    )
    .all() as Array<{
      id: number;
      customer_first_name: string;
      customer_last_name: string;
      customer_instagram: string | null;
      customer_phone: string | null;
      customer_birth_date: string | null;
      client_id: number | null;
    }>;

  if (orders.length === 0) {
    return;
  }

  const findClient = db.prepare(
    `SELECT * FROM clients
     WHERE ((@instagram IS NOT NULL AND instagram IS NOT NULL AND LOWER(instagram) = LOWER(@instagram))
        OR (@phone IS NOT NULL AND phone IS NOT NULL AND phone = @phone))
     ORDER BY id
     LIMIT 1`
  );

  const insertClient = db.prepare(
    `INSERT INTO clients (instagram, first_name, last_name, phone, birth_date)
     VALUES (@instagram, @firstName, @lastName, @phone, @birthDate)`
  );

  const updateClient = db.prepare(
    `UPDATE clients
        SET instagram = COALESCE(@instagram, instagram),
            first_name = CASE WHEN LENGTH(@firstName) > 0 THEN @firstName ELSE first_name END,
            last_name = CASE WHEN LENGTH(@lastName) > 0 THEN @lastName ELSE last_name END,
            phone = COALESCE(@phone, phone),
            birth_date = COALESCE(@birthDate, birth_date)
      WHERE id = @id`
  );

  const updateOrder = db.prepare(
    'UPDATE orders SET client_id = @clientId, customer_phone = @phone WHERE id = @orderId'
  );

  const updateOrderPhoneOnly = db.prepare('UPDATE orders SET customer_phone = @phone WHERE id = @orderId');

  for (const order of orders) {
    const sanitizedInstagram = sanitizeInstagram(order.customer_instagram);
    const normalizedPhone = normalizePhone(order.customer_phone);

    if (order.customer_phone !== normalizedPhone) {
      updateOrderPhoneOnly.run({ orderId: order.id, phone: normalizedPhone ?? null });
    }

    if (order.client_id || (!sanitizedInstagram && !normalizedPhone)) {
      continue;
    }

    const existingClient = findClient.get({ instagram: sanitizedInstagram, phone: normalizedPhone }) as
      | ClientRecord
      | undefined;

    let clientId = existingClient?.id ?? null;

    if (existingClient) {
      updateClient.run({
        id: existingClient.id,
        instagram: sanitizedInstagram ?? existingClient.instagram,
        firstName: order.customer_first_name || existingClient.first_name,
        lastName: order.customer_last_name || existingClient.last_name,
        phone: normalizedPhone ?? existingClient.phone,
        birthDate: order.customer_birth_date ?? existingClient.birth_date
      });
    } else {
      const result = insertClient.run({
        instagram: sanitizedInstagram ?? null,
        firstName: order.customer_first_name || 'Клієнт',
        lastName: order.customer_last_name || null,
        phone: normalizedPhone,
        birthDate: order.customer_birth_date ?? null
      });
      clientId = Number(result.lastInsertRowid);
    }

    if (clientId) {
      updateOrder.run({ orderId: order.id, clientId, phone: normalizedPhone ?? null });
    }
  }
}


export type MaterialRecord = {
  id: number;
  name: string;
  category: string;
  unit: 'meters' | 'pieces';
  quantity: number;
  price_per_unit: number;
  photo?: string | null;
  bra_underwire_size?: string | null;
  underwire_units_per_bra?: number;
};

export type ProductRecord = {
  id: number;
  name: string;
  description: string | null;
  materials_cost: number;
  additional_cost: number;
  cost_price: number;
  sewing_cost: number;
  packaging_cost: number;
  shipping_cost: number;
  advertising_cost: number;
  sale_price: number;
  discount_type: 'none' | 'percent' | 'fixed';
  discount_value: number;
  profit: number;
};

export type OrderRecord = {
  id: number;
  order_number: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_instagram: string | null;
  customer_phone: string | null;
  customer_birth_date: string | null;
  client_id: number | null;
  delivery_address: string | null;
  discount_percent: number;
  total_amount: number;
  status: 'new' | 'shipped' | 'returned' | 'completed';
  created_at: string;
};

export type ClientRecord = {
  id: number;
  instagram: string | null;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  birth_date: string | null;
  created_at: string;
};

export type FinishedInventoryRecord = {
  id: number;
  product_id: number;
  component: string;
  size: string;
  quantity: number;
};

export type FinishedBatchRecord = {
  id: number;
  product_id: number;
  size: string;
  bra_size: string;
  panties_size: string;
  belt_size: string;
  garter_size: string;
  sets: number;
  bra: number;
  panties: number;
  belt: number;
  garter: number;
  note: string | null;
  produced_at: string;
  skip_materials: number;
};

export type OrderFinishedAllocationRecord = {
  id: number;
  order_item_id: number;
  component: string;
  size: string;
  quantity: number;
};

export type OrderExpenseRecord = {
  id: number;
  order_id: number;
  label: string;
  amount: number;
};
