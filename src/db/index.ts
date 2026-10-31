import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from '@boruto_vk7/better-sqlite3-termux';
import * as schema from './schema';

const sqlite = new Database('rekber.db');
export const db = drizzle(sqlite, { schema });
