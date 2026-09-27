/* to-http.js — menerjemahkan Result ({ok, data} / {ok:false, reason}) dari
 * src/services/*.js menjadi response HTTP. Satu-satunya tempat pemetaan itu
 * terjadi — services sendiri tidak tahu apa-apa soal HTTP (lihat
 * docs/ROADMAP-PHASE12.md).
 *
 * Phase 17.2: alasan FORBIDDEN (hasil domain/inspection-policy.js, dipakai
 * approval-service.js) menjadi 403 — ditolak karena wewenang, bukan karena
 * isian tidak valid. Alasan lain tetap 400.
 */

const FORBIDDEN_REASON = 'FORBIDDEN';

export function sendResult(res, result, successStatus = 200) {
    if (result.ok) {
        res.status(successStatus).json(result.data);
    } else {
        const status = result.reason === FORBIDDEN_REASON ? 403 : 400;
        res.status(status).json({ error: result.reason, data: result.data || null });
    }
}
