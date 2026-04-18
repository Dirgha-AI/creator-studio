import { Pool } from 'pg';

let pool: Pool | null = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
}

export const query = (text: string, params: any[] = []) => {
  if (!pool) throw new Error('[DB] No database connection — set DATABASE_URL');
  return pool.query(text, params);
};

export const getPool = () => pool;
