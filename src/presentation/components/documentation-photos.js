/* documentation-photos.js — foto dokumentasi sebuah inspeksi (tanpa DOM).
 *
 * Satu sumber untuk modal Detail dan laporan PDF: foto dekat lalu foto jauh
 * ({ id, originalName } dari API) beserta label slotnya. Gambarnya sendiri
 * selalu diambil lewat endpoint terotorisasi GET /api/inspections/photos/:id/file
 * (sesi + cakupan visibilitas inspeksi), tidak pernah lewat /uploads.
 */

export function documentationPhotos(item) {
    return [
        ...((item && item.fotoDekat) || []).map((photo) => ({ ...photo, slot: 'Foto dekat' })),
        ...((item && item.fotoJauh) || []).map((photo) => ({ ...photo, slot: 'Foto jauh' })),
    ];
}
