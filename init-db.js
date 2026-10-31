const Database = require('@boruto_vk7/better-sqlite3-termux');
const db = new Database('rekber.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'BUYER',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    seller_id TEXT NOT NULL,
    buyer_phone TEXT NOT NULL,
    item_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    awb TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transaction_events (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL
  );
`);

console.log("Berhasil! Semua tabel database sudah dibuat.");
