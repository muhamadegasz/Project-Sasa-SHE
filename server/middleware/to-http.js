/* to-http.js — menerjemahkan Result ({ok, data} / {ok:false, reason}) dari
 * src/services/*.js menjadi response HTTP. Satu-satunya tempat pemetaan itu
 * terjadi — services sendiri tidak tahu apa-apa soal HTTP (lihat
 * docs/ROADMAP-PHASE12.md).
 *
 * Phase 17.2: alasan FORBIDDEN (hasil domain/inspection-policy.js, dipakai
 * approval-service.js) menjadi 403 — ditolak karena wewenang, bukan karena
 * isian tidak valid. Alasan lain tetap 400.
 */

import { ACCESS_ERROR } from '../../src/services/result.js';

export function sendResult(res, result, successStatus = 200) {
    if (result.ok) {
        res.status(successStatus).json(result.data);
    } else if (result.reason === ACCESS_ERROR.NOT_FOUND) {
        // Phase 17.3B: badan respons IDENTIK dengan GET /api/inspections/:id
        // untuk id yang tidak ada / di luar cakupan — tanpa `data`, supaya
        // tidak ada perbedaan apa pun yang bisa dipakai untuk enumerasi.
        res.status(404).json({ error: ACCESS_ERROR.NOT_FOUND });
    } else {
        const status = result.reason === ACCESS_ERROR.FORBIDDEN ? 403 : 400;
        res.status(status).json({ error: result.reason, data: result.data || null });
    }
}
