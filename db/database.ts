import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
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

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  cost_price REAL NOT NULL DEFAULT 0,
  sewing_cost REAL NOT NULL DEFAULT 0,
  packaging_cost REAL NOT NULL DEFAULT 0,
  shipping_cost REAL NOT NULL DEFAULT 0,
  advertising_cost REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
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
  url TEXT NOT NULL
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

  const defaultUserStmt = db.prepare('SELECT COUNT(*) as count FROM users');
  const userCount = defaultUserStmt.get() as { count: number };

  if (userCount.count === 0) {
    const insertUser = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
    // password: admin123
    insertUser.run('admin@lingeriedashboard.app', '$2a$10$4qozzZ1UlCT3VkOITkkpOuM9D8GEnBuFyDC11Fx6E9CA/lcW2YCiK');
  }
}

export function getDatabase() {
  return ensureDatabase();
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
  cost_price: number;
  sewing_cost: number;
  packaging_cost: number;
  shipping_cost: number;
  advertising_cost: number;
  sale_price: number;
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
