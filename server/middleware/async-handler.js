/* async-handler.js — Express 4 tidak menangkap promise yang reject dari
 * route handler async secara otomatis (baru Express 5 begitu). Tanpa ini,
 * error dari query MySQL yang gagal akan diam-diam menggantung request,
 * bukan masuk ke error-handling middleware di server/app.js.
 */

export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
