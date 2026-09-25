/* session.js — state sesi login di BROWSER (bukan server/db/session-store.js,
 * yang menyimpan sesi di MySQL — ini cuma cache sisi klien untuk itu).
 *
 * Cookie sesi HttpOnly di server tetap satu-satunya sumber kebenaran soal
 * "siapa yang login". Modul ini menyimpan dua hal yang memang HARUS ada di
 * JS: identitas user (untuk tampilan — nama di header, kunci field petugas)
 * dan csrfToken (WAJIB disisipkan manual ke setiap request yang mengubah
 * state, lihat server/middleware/csrf.js — cookie tidak cukup karena itu
 * justru celah yang CSRF token ini tutup).
 *
 * Disimpan di memori modul, BUKAN localStorage/sessionStorage — hilang saat
 * halaman di-reload. restoreSession() di legacy-app.js memanggil GET
 * /api/auth/me saat startup untuk memulihkannya selama cookie sesi browser
 * masih berlaku (endpoint itu ikut mengembalikan csrfToken yang sama,
 * lihat server/routes/auth.routes.js).
 */

let currentUser = null;
let csrfToken = null;
let onSessionExpiredHandler = null;

export function setSession(user, token) {
    currentUser = user;
    csrfToken = token;
}

export function clearSession() {
    currentUser = null;
    csrfToken = null;
}

export function getCurrentUser() {
    return currentUser;
}

export function getCsrfToken() {
    return csrfToken;
}

/**
 * Didaftarkan sekali oleh legacy-app.js saat startup: apa yang harus
 * terjadi di UI kalau server menolak permintaan dengan 401 di tengah sesi
 * (mis. sesi kedaluwarsa, atau dihapus lewat browser lain). Modul ini
 * sendiri tidak menyentuh DOM — itu urusan pemanggilnya.
 */
export function onSessionExpired(handler) {
    onSessionExpiredHandler = handler;
}

/** Dipanggil oleh api-client.js begitu sebuah request mengembalikan 401. */
export function notifySessionExpired() {
    clearSession();
    if (onSessionExpiredHandler) onSessionExpiredHandler();
}
