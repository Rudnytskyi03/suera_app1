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
  photo TEXT
);

CREATE TABLE IF NOT EXISTS material_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  comment TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  delivery_address TEXT,
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
`);

  ensureColumn(db, 'products', 'materials_cost', 'materials_cost REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'products', 'additional_cost', 'additional_cost REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'products', 'discount_type', "discount_type TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(db, 'products', 'discount_value', 'discount_value REAL NOT NULL DEFAULT 0');
  ensureProductPhotosColumnRenamed(db);
  ensureProductExpensesTable(db);

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


export type MaterialRecord = {
  id: number;
  name: string;
  category: string;
  unit: 'meters' | 'pieces';
  quantity: number;
  price_per_unit: number;
  photo?: string | null;
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
  delivery_address: string | null;
  total_amount: number;
  status: 'new' | 'shipped' | 'returned' | 'completed';
  created_at: string;
};
