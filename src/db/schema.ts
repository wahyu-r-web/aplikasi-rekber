import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  password: text('password'), // <--- INI YANG TADI TERLEWAT
  role: text('role').notNull().default('BUYER'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  sellerId: text('seller_id').notNull().references(() => users.id),
  buyerPhone: text('buyer_phone').notNull(),
  itemName: text('item_name').notNull(),
  amount: integer('amount').notNull(),
  status: text('status').notNull().default('DRAFT'),
  awb: text('awb'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const transactionEvents = sqliteTable('transaction_events', {
  id: text('id').primaryKey(),
  transactionId: text('transaction_id').notNull().references(() => transactions.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  actor: text('actor').notNull(),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
