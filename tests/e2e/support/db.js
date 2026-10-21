/* support/db.js — fixture langsung ke database UJI, khusus data yang sejak
 * migrasi 008 tidak lagi bisa dibuat lewat API.
 *
 * Tanggal realisasi jadwal kini hanya diisi sistem saat laporan inspeksi yang
 * tertaut diajukan — selalu HARI INI. Test tampilan kalender butuh jadwal
 * Terlaksana di tanggal lampau/mendatang tertentu, jadi tanggalnya diisi di
 * sini. Bukan jalur aplikasi; alur sungguhannya diuji di schedule-link.spec.js
 * dan server/test/api.test.js.
 *
 * Pengaman sama dengan seed.js: menolak database yang namanya tidak berakhiran
 * _test (playwright.config.js memuat .env.test -> she_sasa_test).
 */

// Kredensial dari .env seperti server/db/pool.js; DB_NAME sudah diisi .env.test
// oleh playwright.config.js dan tidak ditimpa dotenv.
import 'dotenv/config';
import mysql from 'mysql2/promise';

async function withTestDatabase(work) {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME,
    });
    try {
        const [[{ db }]] = await connection.query('SELECT DATABASE() AS db');
        if (!String(db).endsWith('_test')) throw new Error(`fixture database ditolak: "${db}" bukan database uji (_test)`);
        return await work(connection);
    } finally {
        await connection.end();
    }
}

/** Menandai jadwal ("SCH-nnn") Terlaksana pada `isoDate` ("YYYY-MM-DD"), tanpa laporan tertaut. */
export async function markScheduleRealized(scheduleId, isoDate) {
    const numericId = Number(String(scheduleId).replace(/\D/g, ''));
    await withTestDatabase((connection) => connection.query(
        "UPDATE schedules SET status = 'selesai', tanggal_realisasi = ? WHERE id = ?", [isoDate, numericId],
    ));
}
