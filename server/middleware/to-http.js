/* to-http.js — menerjemahkan Result ({ok, data} / {ok:false, reason}) dari
 * src/services/*.js menjadi response HTTP. Satu-satunya tempat pemetaan itu
 * terjadi — services sendiri tidak tahu apa-apa soal HTTP (lihat
 * docs/ROADMAP-PHASE12.md).
 */

export function sendResult(res, result, successStatus = 200) {
    if (result.ok) {
        res.status(successStatus).json(result.data);
    } else {
        res.status(400).json({ error: result.reason, data: result.data || null });
    }
}
