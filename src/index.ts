import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { db } from './db';
import { transactions, transactionEvents } from './db/schema';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

const app = new Hono();

// PERBAIKAN: Arahkan ke folder './public'
app.use('/*', serveStatic({ root: './public' }));

// 0. Endpoint GET: Cek Status Transaksi (Untuk Frontend)
app.get('/api/transactions/:code', async (c) => {
  const code = c.req.param('code');
  const trx = await db.select().from(transactions).where(eq(transactions.code, code)).get();
  if (!trx) return c.json({ success: false, message: 'Tidak ditemukan' }, 404);
  return c.json({ success: true, data: trx });
});

// 1. Buat Transaksi
app.post('/api/transactions', async (c) => {
  try {
    const body = await c.req.json();
    const schema = z.object({ sellerId: z.string(), buyerPhone: z.string(), itemName: z.string(), amount: z.number() });
    const data = schema.parse(body);
    const trxId = crypto.randomUUID();
    const trxCode = 'RKB-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    await db.insert(transactions).values({
      id: trxId, code: trxCode, sellerId: data.sellerId, buyerPhone: data.buyerPhone,
      itemName: data.itemName, amount: data.amount, status: 'AWAITING_PAYMENT', createdAt: new Date(),
    });
    await db.insert(transactionEvents).values({
      id: crypto.randomUUID(), transactionId: trxId, toStatus: 'AWAITING_PAYMENT', actor: data.sellerId,
      note: 'Transaksi dibuat', createdAt: new Date(),
    });
    return c.json({ success: true, message: 'Transaksi berhasil dibuat', data: { kodeTransaksi: trxCode } }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: 'Data tidak valid', detail: error.message }, 400);
  }
});

// 2. Pembeli Bayar
app.post('/api/transactions/:code/pay', async (c) => {
  const code = c.req.param('code');
  const trx = await db.select().from(transactions).where(eq(transactions.code, code)).get();
  if (!trx) return c.json({ success: false, message: 'Tidak ditemukan' }, 404);
  if (trx.status !== 'AWAITING_PAYMENT') return c.json({ success: false, message: 'Status tidak valid' }, 400);

  await db.update(transactions).set({ status: 'PAID_HELD' }).where(eq(transactions.id, trx.id));
  await db.insert(transactionEvents).values({
    id: crypto.randomUUID(), transactionId: trx.id, fromStatus: 'AWAITING_PAYMENT', 
    toStatus: 'PAID_HELD', actor: 'SYSTEM', note: 'Dana ditahan', createdAt: new Date(),
  });
  return c.json({ success: true, message: 'Pembayaran berhasil! Dana ditahan.' });
});

// 3. Penjual Input Resi
app.post('/api/transactions/:code/ship', async (c) => {
  const code = c.req.param('code');
  const body = await c.req.json();
  const trx = await db.select().from(transactions).where(eq(transactions.code, code)).get();
  if (!trx) return c.json({ success: false, message: 'Tidak ditemukan' }, 404);
  if (trx.status !== 'PAID_HELD') return c.json({ success: false, message: 'Dana belum masuk' }, 400);

  await db.update(transactions).set({ status: 'SHIPPED', awb: body.awb }).where(eq(transactions.id, trx.id));
  await db.insert(transactionEvents).values({
    id: crypto.randomUUID(), transactionId: trx.id, fromStatus: 'PAID_HELD', 
    toStatus: 'SHIPPED', actor: trx.sellerId, note: `Dikirim, Resi: ${body.awb}`, createdAt: new Date(),
  });
  return c.json({ success: true, message: 'Barang dikirim dengan resi: ' + body.awb });
});

// 4. Pembeli Konfirmasi Terima
app.post('/api/transactions/:code/confirm', async (c) => {
  const code = c.req.param('code');
  const trx = await db.select().from(transactions).where(eq(transactions.code, code)).get();
  if (!trx) return c.json({ success: false, message: 'Tidak ditemukan' }, 404);
  if (trx.status !== 'SHIPPED') return c.json({ success: false, message: 'Barang belum dikirim' }, 400);

  await db.update(transactions).set({ status: 'RELEASED' }).where(eq(transactions.id, trx.id));
  await db.insert(transactionEvents).values({
    id: crypto.randomUUID(), transactionId: trx.id, fromStatus: 'SHIPPED', 
    toStatus: 'RELEASED', actor: trx.buyerPhone, note: 'Dana dilepas ke penjual', createdAt: new Date(),
  });
  return c.json({ success: true, message: 'Transaksi Selesai! Dana diteruskan ke penjual.' });
});

const port = 3000;
console.log(`Server berjalan di http://localhost:${port}`);
serve({ fetch: app.fetch, port });
