/* detail-pdf.spec.js — foto dokumentasi sungguhan di Detail & PDF, Detail
 * hanya-baca (tanpa "Kelola Pengesahan"/aksi), aksi Pengesahan di tabel hanya
 * untuk peninjau yang berwenang.
 *
 * Foto selalu lewat endpoint terotorisasi GET /api/inspections/photos/:id/file
 * (sesi + cakupan visibilitas inspeksi). Isi PDF sendiri berupa gambar per
 * halaman (html2pdf), jadi isi laporan dibuktikan dari #pdfContent yang
 * dipotret — sama dengan pdf.spec.js.
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { API } from './support/env.js';
import { test, expect } from './support/test.js';
import { loginViaUi } from './support/ui.js';
import { apiLogin, createInspectionFixture } from './support/api.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PHOTO_JPEG = readFileSync(path.join(FIXTURES, 'e2e-foto-bukti.jpg'));   // 320 x 240
const PHOTO_PNG = readFileSync(path.join(FIXTURES, 'signature.png'));          // 160 x 48
const SIGNATURE_PNG = PHOTO_PNG;
const PHOTO_URL = /\/api\/inspections\/photos\/\d+\/file$/;

/** Inspeksi (plant 1) dengan foto sungguhan lewat multipart, lalu diajukan. */
async function createWithPhotos(session, { dekat = [], jauh = [], plantId = 1 } = {}) {
    const form = new FormData();
    form.append('plantId', String(plantId));
    form.append('keteranganLokasi', `e2e foto ${Date.now()}`);
    form.append('tanggal', new Date().toISOString().slice(0, 10));
    form.append('dueDate', '2031-06-30');
    form.append('temuan', JSON.stringify([{ deskripsi: 'Kabel terbuka', kategori: 'Kelistrikan' }, { deskripsi: 'APAR kosong', kategori: 'Kebakaran' }]));
    for (const [field, files] of [['fotoDekat', dekat], ['fotoJauh', jauh]]) {
        for (const [name, bytes, type] of files) form.append(field, new Blob([bytes], { type }), name);
    }
    const created = await session.context.post('/api/inspections', { headers: { 'X-CSRF-Token': session.csrfToken }, multipart: form });
    expect(created.status(), await created.text()).toBe(201);
    const { inspection } = await created.json();
    const submitted = await session.context.post(`/api/inspections/${inspection.id}/submit`, { headers: { 'X-CSRF-Token': session.csrfToken } });
    expect(submitted.status(), await submitted.text()).toBe(200);
    return (await submitted.json()).inspection;
}

async function approve(session, inspectionId, stageId, watermark = null) {
    const multipart = { stageId, signatureMethod: 'upload', signature: { name: 'ttd.png', mimeType: 'image/png', buffer: SIGNATURE_PNG } };
    if (watermark) Object.assign(multipart, { watermarkEnabled: 'true', watermarkX: String(watermark.x), watermarkY: String(watermark.y) });
    const res = await session.context.post(`/api/inspections/${inspectionId}/approve`, { headers: { 'X-CSRF-Token': session.csrfToken }, multipart });
    expect(res.status(), await res.text()).toBe(200);
}

async function completeAll(inspectionId) {
    await approve(await apiLogin('dewi'), inspectionId, 'koordinator_k3l', { x: 0.5, y: 0.5 });
    await approve(await apiLogin('andi'), inspectionId, 'manajer');
    await approve(await apiLogin('hadi'), inspectionId, 'ketua_p2k3');
}

/** Baris Inspeksi Terbaru untuk satu id (pencarian di server) — menunggu baris id itu, bukan sisa pencarian sebelumnya. */
async function recentRow(page, id) {
    await page.locator('#searchInspeksiInput').fill(id);
    const row = page.locator('#inspeksiTableBody tr').first();
    await expect(row.locator('td').first()).toHaveText(id);
    await expect(page.getByTestId('recent-pagination-summary')).toHaveText('Menampilkan 1–1 dari 1 inspeksi');
    return row;
}

async function printPdf(page, row) {
    const photoRequests = [];
    const onRequest = (req) => { if (PHOTO_URL.test(req.url())) photoRequests.push(req.url()); };
    page.on('request', onRequest);
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        row.locator('[data-action="cetakPDF"]').click(),
    ]);
    page.off('request', onRequest);
    const bytes = readFileSync(await download.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.includes(Buffer.from('/Subtype /Image')), 'PDF memuat gambar halaman').toBe(true);
    return { bytes, pages: (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length, photoRequests };
}

/** Isi #pdfContent yang dipotret html2pdf: foto (ukuran asli) & tanda tangan. */
async function readReport(page) {
    return page.evaluate(async () => {
        const root = document.getElementById('pdfContent');
        const photos = [];
        for (const img of root.querySelectorAll('.pdf-photo-img')) {
            await img.decode();
            photos.push({ src: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight, caption: img.closest('figure').querySelector('figcaption').textContent.trim() });
        }
        const signatures = [];
        for (const img of root.querySelectorAll('img.pdf-signature')) {
            await img.decode();
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const context = canvas.getContext('2d');
            context.drawImage(img, 0, 0);
            const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
            let red = 0;
            for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && data[i] > 150 && data[i] - data[i + 1] > 40 && data[i] - data[i + 2] > 40) red++;
            signatures.push({ src: img.getAttribute('src'), red });
        }
        return {
            photos, signatures,
            missing: root.querySelectorAll('.pdf-photo-missing').length,
            text: root.textContent.replace(/\s+/g, ' '),
            cameraPlaceholder: root.textContent.includes('📷') || root.querySelectorAll('.pdf-thumb').length > 0,
        };
    });
}

test('Detail: foto dokumentasi sungguhan (endpoint terotorisasi) + lightbox; hanya-baca — tanpa "Kelola Pengesahan"/Setujui/Tolak/ekspor; foto mengikuti visibilitas', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createWithPhotos(arif, { dekat: [['dekat-e2e.jpg', PHOTO_JPEG, 'image/jpeg']], jauh: [['jauh-e2e.png', PHOTO_PNG, 'image/png']] });

    await loginViaUi(page, 'arif');
    const row = await recentRow(page, inspection.id);
    await expect(row.getByTestId('temuan-count'), 'jumlah temuan eksplisit').toHaveText('2 temuan');
    await row.getByTestId('row-detail-btn').click();
    const detail = page.locator('#detailModal');
    await expect(detail).toHaveClass(/show/);

    const photos = detail.getByTestId('detail-photo');
    await expect(photos).toHaveCount(2);
    await expect(photos.locator('.file-name')).toHaveText(['dekat-e2e.jpg', 'jauh-e2e.png']);
    await expect(photos.locator('.gallery-slot')).toHaveText(['Foto dekat', 'Foto jauh']);
    const loaded = await photos.locator('img').evaluateAll((images) => Promise.all(images.map(async (img) => {
        await img.decode();
        return { src: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight };
    })));
    expect(loaded.map(({ width, height }) => [width, height]), 'gambar asli termuat utuh').toEqual([[320, 240], [160, 48]]);
    for (const { src } of loaded) expect(src).toMatch(PHOTO_URL);
    await expect(detail.locator('.gallery-item.unavailable')).toHaveCount(0);
    await expect(detail).not.toContainText('📷');

    // Hanya-baca: tidak ada tombol aksi di Detail.
    await expect(detail.getByRole('button', { name: /Kelola Pengesahan/ })).toHaveCount(0);
    await expect(detail.locator('[data-action="openApprovalModal"], [data-action="approveStage"], [data-action="rejectStage"], [data-action="exportTemuanPerItem"]')).toHaveCount(0);
    await expect(detail).toContainText('Menunggu persetujuan Koordinator K3L Bagian');

    await photos.first().click();
    await expect(page.locator('#lightboxOverlay')).toHaveClass(/show/);
    await expect(page.locator('#lightboxImage')).toHaveAttribute('src', PHOTO_URL);
    await expect.poll(() => page.locator('#lightboxImage').evaluate((img) => img.complete && img.naturalWidth)).toBe(320);
    await expect(page.locator('#lightboxFileName')).toHaveText('dekat-e2e.jpg');
    await page.keyboard.press('Escape');

    // Visibilitas: Koordinator plant lain tidak bisa mengambil foto ini walau tahu URL-nya.
    const rina = await apiLogin('rina');
    const blocked = await rina.context.get(new URL(loaded[0].src).pathname);
    expect(blocked.status()).toBe(404);
    const unauthenticated = await page.context().request.fetch(loaded[0].src, { headers: { cookie: '' } });
    expect([401, 403, 404]).toContain(unauthenticated.status());
    for (const session of [arif, rina]) await session.context.dispose();
});

test('Detail: foto seed tanpa berkas di server diberi keterangan (bukan gambar rusak), tidak bisa diperbesar', async ({ page }) => {
    const admin = await apiLogin('admin');
    const all = await (await admin.context.get(`${API}/inspections`)).json();
    const seeded = all.find((item) => item.fotoDekat.some((photo) => /\.jpg$/.test(photo.originalName)) && Number(item.id.slice(4)) <= 6);
    expect(seeded, 'seed memuat inspeksi berfoto tanpa berkas').toBeTruthy();
    await admin.context.dispose();

    await loginViaUi(page, 'admin');
    const row = await recentRow(page, seeded.id);
    await row.getByTestId('row-detail-btn').click();
    const items = page.locator('#detailModal').getByTestId('detail-photo');
    await expect(items).toHaveCount(seeded.fotoDekat.length + seeded.fotoJauh.length);
    await expect(items.first()).toHaveClass(/unavailable/);
    await expect(items.first()).toBeDisabled();
    await expect(items.first().locator('.gallery-missing')).toBeVisible();
    await expect(items.first().locator('.gallery-missing')).toHaveText('Gambar tidak dapat ditampilkan');
});

test('Aksi Pengesahan di tabel hanya untuk peninjau berwenang atas tahap berjalan; Safety Officer & Admin tidak; Detail tetap tanpa tombol aksi untuk semua role', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);
    await arif.context.dispose();

    for (const [username, expected] of [['arif', 0], ['dewi', 1], ['andi', 0], ['hadi', 0], ['admin', 0]]) {
        await loginViaUi(page, username);
        if (username === 'andi' || username === 'hadi') {
            // Manajer/Ketua belum melihat inspeksi di tahap Koordinator — tidak ada baris sama sekali.
            await page.locator('#searchInspeksiInput').fill(inspection.id);
            await expect(page.locator('#inspeksiTableBody')).toContainText('Tidak ada data ditemukan');
        } else {
            const row = await recentRow(page, inspection.id);
            await expect(row.getByTestId('recent-approval-btn'), username).toHaveCount(expected);
            await row.getByTestId('row-detail-btn').click();
            await expect(page.locator('#detailModal')).toHaveClass(/show/);
            await expect(page.locator('#detailModal [data-action]:not([data-action="openLightbox"])'), `${username}: Detail tanpa aksi`).toHaveCount(0);
            await page.locator('#closeDetailModal').click();
        }
        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: 'Logout' }).click();
        await expect(page.getByTestId('user-name')).not.toBeVisible();
    }
});

test('PDF: beberapa foto dokumentasi asli tertanam (ukuran asli, bisa berlanjut ke halaman berikut); tanda tangan + watermark & footer tetap', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createWithPhotos(arif, {
        dekat: [['dekat-1.jpg', PHOTO_JPEG, 'image/jpeg'], ['dekat-2.jpg', PHOTO_JPEG, 'image/jpeg']],
        jauh: [['jauh-1.jpg', PHOTO_JPEG, 'image/jpeg'], ['jauh-2.png', PHOTO_PNG, 'image/png']],
    });
    await completeAll(inspection.id);

    await loginViaUi(page, 'arif');
    const row = await recentRow(page, inspection.id);
    const { pages, photoRequests } = await printPdf(page, row);
    expect(photoRequests, 'setiap foto diambil lewat endpoint terotorisasi').toHaveLength(4);
    expect(pages, 'foto berlanjut ke halaman berikutnya').toBeGreaterThanOrEqual(2);

    const report = await readReport(page);
    expect(report.cameraPlaceholder, 'tanpa placeholder kamera').toBe(false);
    expect(report.missing).toBe(0);
    expect(report.photos.map(({ caption }) => caption)).toEqual(['Foto dekat · dekat-1.jpg', 'Foto dekat · dekat-2.jpg', 'Foto jauh · jauh-1.jpg', 'Foto jauh · jauh-2.png']);
    expect(report.photos.map(({ width, height }) => [width, height]), 'gambar asli, rasio aspek terjaga').toEqual([[320, 240], [320, 240], [320, 240], [160, 48]]);
    for (const { src } of report.photos) expect(src).toMatch(/^blob:/);
    expect(report.text).toMatch(/Dokumentasi Foto/);
    expect(report.text).toContain('4 foto');

    expect(report.signatures, 'tanda tangan ketiga tahap').toHaveLength(3);
    for (const { src } of report.signatures) expect(src).toMatch(/^blob:/);
    expect(report.signatures[0].red, 'watermark Koordinator tetap tergambar').toBeGreaterThan(50);
    expect(report.text).toContain('Dokumen ini dihasilkan oleh Sistem Informasi K3 SHE Sasa');
    expect(report.text).toContain('bukan tanda tangan elektronik tersertifikasi');
    await expect(page.locator('#toastMessage')).toContainText('berhasil dicetak');
    await arif.context.dispose();
});

test('PDF: tanpa foto -> "Tidak ada dokumentasi foto." dan PDF tetap valid; foto seed tanpa berkas -> keterangan, PDF tetap dibuat', async ({ page }) => {
    const arif = await apiLogin('arif');
    const noPhoto = await createInspectionFixture(arif);
    await completeAll(noPhoto.id);
    await arif.context.dispose();

    await loginViaUi(page, 'arif');
    const { photoRequests } = await printPdf(page, await recentRow(page, noPhoto.id));
    expect(photoRequests).toHaveLength(0);
    const empty = await readReport(page);
    expect(empty.text).toContain('Tidak ada dokumentasi foto.');
    expect(empty.photos).toHaveLength(0);
    expect(empty.signatures).toHaveLength(3);

    // INS-001 (seed, milik arif, selesai): baris fotonya ada, berkasnya tidak ada di server.
    const seeded = await (await page.request.get(`${API}/inspections/INS-001`)).json();
    const photoCount = seeded.fotoDekat.length + seeded.fotoJauh.length;
    expect(photoCount).toBeGreaterThan(0);
    await printPdf(page, await recentRow(page, 'INS-001'));
    const legacy = await readReport(page);
    expect(legacy.missing, 'setiap foto tanpa berkas diberi keterangan').toBe(photoCount);
    expect(legacy.cameraPlaceholder).toBe(false);
    expect(legacy.text).toContain('Berkas foto tidak tersedia');
});
