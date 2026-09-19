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

/** Operasi berhasil. */
export function ok(data) {
    return { ok: true, data };
}

/** Operasi gagal, dengan kode alasan yang dapat dipetakan pemanggil. */
export function fail(reason, data) {
    return { ok: false, reason, data };
}
