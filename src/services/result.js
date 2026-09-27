/* result.js — bentuk nilai kembalian yang seragam untuk seluruh service.
 *
 * Service tidak menampilkan pesan dan tidak menyentuh DOM. Ia mengembalikan
 * APA yang terjadi, lalu pemanggil yang memutuskan bagaimana menampilkannya.
 *
 * Alasan memakai kode, bukan kalimat: pesan untuk pengguna adalah urusan
 * presentation. Service yang mengembalikan '⚠️ Tahap sebelumnya belum
 * disetujui!' akan menyeret bahasa, emoji, dan gaya penulisan ke dalam
 * lapisan yang seharusnya tidak peduli soal itu.
 *
 * Pemakaian:
 *     const result = approvalService.approve(id, stageId);
 *     if (!result.ok) { showToast(PESAN[result.reason]); return; }
 *     showToast(`✅ ${result.data.stage.title} menyetujui ...`);
 */

/**
 * Alasan kegagalan akses yang dipakai bersama beberapa service (Phase 17.3B).
 * server/middleware/to-http.js memetakannya: NOT_FOUND -> 404 (identik
 * dengan GET untuk id yang tidak ada / di luar cakupan visibilitas),
 * FORBIDDEN -> 403 (terlihat, tapi tidak berwenang untuk aksi itu).
 */
export const ACCESS_ERROR = {
    NOT_FOUND: 'NOT_FOUND',
    FORBIDDEN: 'FORBIDDEN',
};

/** Operasi berhasil. */
export function ok(data) {
    return { ok: true, data };
}

/** Operasi gagal, dengan kode alasan yang dapat dipetakan pemanggil. */
export function fail(reason, data) {
    return { ok: false, reason, data };
}
