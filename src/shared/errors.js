/* errors.js — penanganan error yang konsisten.
 *
 * Masalah yang diselesaikan (temuan audit S-09): kode lama menampilkan
 * error.message mentah ke pengguna lewat toast, misalnya
 *
 *     showToast('⚠️ Gagal: ' + error.message)
 *
 * Pesan dari library bisa membocorkan detail internal, tidak dapat
 * diterjemahkan, dan tidak berguna bagi pengguna.
 *
 * Aturan yang dipakai sekarang: detail teknis masuk ke console untuk
 * pengembang, pengguna menerima kalimat yang sudah ditentukan.
 *
 * Berkas ini tidak mengenal DOM dan tidak punya dependency.
 */

/**
 * Mencatat error lengkap ke console, lalu mengembalikan pesan aman untuk
 * ditampilkan ke pengguna.
 *
 * Dipakai sebagai: showToast(reportError('export excel', err, '⚠️ Gagal membuat file.'))
 *
 * @param {string} context      di mana error terjadi, untuk pencarian di console
 * @param {unknown} error       error aslinya
 * @param {string} userMessage  yang dilihat pengguna
 * @returns {string} userMessage, tanpa perubahan
 */
export function reportError(context, error, userMessage) {
    console.error('[SHE Sasa] ' + context, error);
    return userMessage;
}
