-- 002_sessions.sql — Phase 13. Tabel sesi login (express-session, store custom
-- di server/db/session-store.js — lihat docs/DECISIONS.md kenapa bukan paket
-- express-mysql-session). Baris kedaluwarsa dihapus malas (lazy) saat get()
-- menemukannya, bukan lewat job sapuan terjadwal.

CREATE TABLE sessions (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  expires    INT UNSIGNED NOT NULL,
  data       MEDIUMTEXT NULL,
  INDEX idx_sessions_expires (expires)
);
