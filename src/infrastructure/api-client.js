/* api-client.js — satu-satunya tempat yang tahu cara bicara ke backend lewat
 * fetch(). Sejak Phase 14, src/repositories/*.js memakai ini alih-alih array
 * in-memory — lihat docs/ROADMAP-PHASE12.md Phase 14 dan docs/DECISIONS.md.
 *
 * credentials:'include' WAJIB: frontend (http://project-sasa-she.test) dan
 * backend (port 3001) beda origin, cookie sesi HttpOnly tidak pernah ikut
 * terkirim tanpa ini. Header X-CSRF-Token disisipkan otomatis untuk method
 * yang mengubah state, diambil dari session.js (satu-satunya tempat yang
 * menyimpan token itu di sisi klien).
 */

import { getCsrfToken, notifySessionExpired } from './session.js';

// Backend Phase 12+ berjalan sebagai proses Node terpisah (npm run server),
// bukan lewat vhost Apache/Laragon yang menyajikan frontend statis — lihat
// docs/ROADMAP-PHASE12.md. Ganti di sini saja bila port/host backend berubah.
const BASE_URL = 'http://project-sasa-she.test:3001/api';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// Phase 14.1-J: tanpa ini, backend yang macet/tidak merespons membuat fetch()
// menggantung TANPA BATAS WAKTU — UI diam tanpa toast/loading-selesai apa
// pun (temuan audit Phase 14). 10 detik dipilih karena aplikasi ini berjalan
// di jaringan lokal (LAN/Laragon), bukan internet publik — cukup longgar
// untuk query MySQL terlambat, cukup ketat supaya pengguna tidak menunggu
// tanpa kepastian. AbortSignal.timeout() melempar error bernama
// "TimeoutError" yang mengalir lewat jalur catch yang sama seperti kegagalan
// jaringan lain (lihat action-dispatcher.js, reportError()) — tidak perlu
// penanganan baru di pemanggil.
const REQUEST_TIMEOUT_MS = 10_000;

/** Error dari respons API yang statusnya bukan 2xx. `status` dan `body` (JSON hasil parse, atau null) tersedia untuk pemanggil yang ingin menangani kode tertentu. */
export class ApiError extends Error {
    constructor(status, body) {
        super(`API ${status}: ${(body && body.error) || 'ERROR'}`);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}

async function request(path, { method = 'GET', body } = {}) {
    const isFormData = body instanceof FormData;
    const headers = {};
    if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
    if (MUTATING_METHODS.has(method)) {
        const token = getCsrfToken();
        if (token) headers['X-CSRF-Token'] = token;
    }

    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        credentials: 'include',
        // FormData dikirim apa adanya: fetch() sendiri yang menyusun header
        // Content-Type (termasuk boundary multipart) — menyetelnya manual di
        // sini akan menghasilkan boundary yang salah dan request gagal diparse
        // server (Phase 15, upload foto sungguhan).
        body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
        if (res.status === 401) notifySessionExpired();
        throw new ApiError(res.status, data);
    }
    return data;
}

export const apiGet = (path) => request(path);
export const apiPost = (path, body) => request(path, { method: 'POST', body });
export const apiPut = (path, body) => request(path, { method: 'PUT', body });
export const apiDelete = (path) => request(path, { method: 'DELETE' });

// URL langsung (bukan lewat request()/fetch() di atas) — dipakai sebagai
// src <img> di lightbox.js. Cookie sesi tetap ikut terkirim otomatis oleh
// browser (sameSite:'lax' + situs yang sama, cuma beda port — lihat
// docs/DECISIONS.md Phase 15), jadi tidak perlu fetch+blob manual di sini.
export const photoUrl = (photoId) => `${BASE_URL}/inspections/photos/${encodeURIComponent(photoId)}/file`;
