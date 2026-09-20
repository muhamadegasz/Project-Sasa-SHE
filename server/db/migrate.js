/* migrate.js — runner migrasi SQL bernomor, minimal (tanpa framework).
 *
 * Menjalankan setiap *.sql di migrations/ yang belum tercatat di tabel
 * schema_migrations, berurutan menurut nama file. Aman dijalankan berulang
 * kali (skip yang sudah diterapkan).
 */

import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

async function main() {
    const dbName = process.env.DB_NAME || 'she_sasa';

    const admin = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true,
    });
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await admin.end();

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: dbName,
        multipleStatements: true,
    });

    await connection.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename   VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const [appliedRows] = await connection.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedRows.map((row) => row.filename));

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
        if (applied.has(file)) {
            console.log(`skip  ${file} (sudah diterapkan)`);
            continue;
        }
        const sql = await readFile(path.join(migrationsDir, file), 'utf8');
        console.log(`apply ${file}`);
        await connection.query(sql);
        await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
    }

    await connection.end();
    console.log('migrasi selesai.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
