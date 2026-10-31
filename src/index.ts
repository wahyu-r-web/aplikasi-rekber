import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { db } from './db';
import { users, transactions, transactionEvents } from './db/schema';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto'; // Menggunakan modul hash standar

const app = new Hono();
app.use('/*', serveStatic({ root: './public' }));

// Fungsi enkripsi password yang stabil untuk Termux
const hashPassword = (password: string) => {
  return createHash('sha256').update(password).digest('hex');
};

// 1. Register
app.post('/api/auth/register', async (c) => {
  try {
    const body = await c.req.json();
    const schema = z.object({ name: z.string(), phone: z.string(), password: z.string().min(6) });
    const data = schema.parse(body);

    const existingUser = await db.select().from(users).where(eq(users.phone, data.phone)).get();
    if (existingUser) return c.json({ success: false, message: 'Nomor HP sudah terdaftar' }, 400);

    const hashedPassword = hashPassword(data.password);
    const userId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId, name: data.name, phone: data.phone, password: hashedPassword, role: 'USER', createdAt: new Date(),
    });

    return c.json({ success: true, message: 'Registrasi berhasil', data: { id: userId, name: data.name, phone: data.phone } }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: 'Data tidak valid', detail: error.message }, 400);
  }
});

// 2. Login
app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json();
    const schema = z.object({ phone: z.string(), password: z.string() });
    const data = schema.parse(body);

    const user = await db.select().from(users).where(eq(users.phone, data.phone)).get();
    if (!user || !user.password) return c.json({ success: false, message: 'Nomor HP atau Password salah' }, 401);

    const hashedInput = hashPassword(data.password);
    
    if (hashedInput === user.password) {
      return c.json({ success: true, message: 'Login berhasil', data: { id: user.id, name: user.name, phone: user.phone } });
    } else {
      return c.json({ success: false, message: 'Nomor HP atau Password salah' }, 401);
    }
  } catch (error: any) {
    return c.json({ success: false, message: 'Terjadi kesalahan sistem', detail: error.message }, 500);
  }
});

// ================= TRANSAKSI =================
app.get('/api/transactions/:code', async (c) => {
  const code = c.req.param('code');
  const trx = await db.select().from(transactions).where(eq(transactions.code, code)).get();
  if (!trx) return c.json({ success: false, message: 'Tidak ditemukan' }, 404);
  return c.json({ success: true, data: trx });
});

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
    return c.json({ success: true, message: 'Transaksi dibuat', data: { kodeTransaksi: trxCode } }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: 'Error', detail: error.message }, 400);
  }
});

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

app.post('/api/transactions/:code/confirm', async (c) => {
  const code = c.req.param('code');
  const trx = await db.select().from(transactions).where(eq(transactions.code, code)).get();
  if (!trx) return c.json({ success: false, message: 'Tidak ditemukan' }, 404);
  if (trx.status !== 'SHIPPED') return c.json({ success: false, message: 'Barang belum dikirim' }, 400);

  await db.update(transactions).set({ status: 'RELEASED' }).where(eq(transactions.id, trx.id));
  await db.insert(transactionEvents).values({
    id: crypto.randomUUID(), transactionId: trx.id, fromStatus: 'SHIPPED', 
    toStatus: 'RELEASED', actor: trx.buyerPhone, note: 'Dana dilepas', createdAt: new Date(),
  });
  return c.json({ success: true, message: 'Transaksi Selesai! Dana diteruskan ke penjual.' });
});

const port = 3000;
console.log(`Server berjalan di http://localhost:${port}`);
serve({ fetch: app.fetch, port });
