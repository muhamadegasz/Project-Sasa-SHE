/* pool.js — koneksi MySQL bersama untuk seluruh backend.
 *
 * Satu pool per proses, dipakai oleh server/repositories/*.js dan
 * server/db/migrate.js + seed.js. Kredensial dari .env (lihat .env.example).
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'she_sasa',
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
});
