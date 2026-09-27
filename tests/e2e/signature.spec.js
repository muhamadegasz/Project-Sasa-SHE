/* signature.spec.js — Phase 17.4B: UI tanda tangan persetujuan.
 *
 * Setiap tahap disetujui lewat UI sungguhan (unggah / gambar di kanvas), lalu
 * hasilnya dibuktikan lewat API (sisi server), bukan hanya tampilan. Fixture
 * dibuat di plant 1 (Koordinator seed "dewi").
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { API } from './support/env.js';
import { test, expect, newIsolatedPage } from './support/test.js';
import { loginViaUi, goToTab } from './support/ui.js';
import { apiLogin, approveViaApi, createInspectionFixture } from './support/api.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PNG_BYTES = readFileSync(path.join(FIXTURES, 'signature.png'));
const JPEG_BYTES = readFileSync(path.join(FIXTURES, 'signature.jpg'));

async function openSignatureModalFor(page, inspectionId) {
    await goToTab(page, 'Inspeksi');
    await page.locator('#allInspeksiTable').getByRole('row', { name: inspectionId }).getByTestId('row-approve-btn').click();
    await expect(page.locator('#approvalModal')).toHaveClass(/show/);
    await page.locator('#approvalContent').getByRole('button', { name: /Setujui/ }).click();
    const modal = page.locator('#signatureModal');
    await expect(modal).toHaveClass(/show/);
    return modal;
}

/** Coretan zig-zag dengan mouse di tengah kanvas. */
async function drawWithMouse(page) {
    const box = await page.locator('#signatureCanvas').boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 20, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
        await page.mouse.move(box.x + 20 + i * 20, y + (i % 2 ? 15 : -15), { steps: 3 });
    }
    await page.mouse.up();
}

/**
 * Isi berkas tanda tangan yang tersimpan untuk keputusan `approvalId`, lewat
 * endpoint terotorisasi. Chromium tidak memaparkan isi body multipart berkas ke
 * Playwright (postData null), jadi bukti "yang dikirim = berkas yang dipilih,
 * sebagai berkas, bukan base64" diambil dari sisi server.
 */
async function fetchStoredSignature(session, inspectionId, approvalId) {
    const res = await session.context.get(`${API}/inspections/${inspectionId}/approvals/${approvalId}/signature`);
    expect(res.status()).toBe(200);
    return { contentType: res.headers()['content-type'], bytes: await res.body() };
}

async function fetchInspection(session, inspectionId) {
    const res = await session.context.get(`${API}/inspections/${inspectionId}`);
    expect(res.status()).toBe(200);
    return res.json();
}

test('unggah: Setujui nonaktif sampai tanda tangan sah; isi bukan gambar & >1 MB ditolak; ganti/hapus; JPEG terkirim multipart -> tahap maju', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    const modal = await openSignatureModalFor(page, inspection.id);
    const confirm = modal.getByRole('button', { name: 'Setujui' });
    await expect(confirm).toBeDisabled();

    await modal.getByRole('radio', { name: 'Upload Tanda Tangan' }).check();
    const fileInput = page.locator('#signatureFile');

    // HTML yang menyamar sebagai .png, dan PNG di atas 1 MB — ditolak di browser.
    await fileInput.setInputFiles({ name: 'ttd.png', mimeType: 'image/png', buffer: Buffer.from('<!doctype html><script>alert(1)</script>') });
    await expect(page.locator('#signatureError')).toContainText('PNG atau JPG');
    await expect(confirm).toBeDisabled();
    await expect(page.locator('#signaturePreviewBox')).toBeHidden();
    await fileInput.setInputFiles({ name: 'besar.png', mimeType: 'image/png', buffer: Buffer.concat([PNG_BYTES, Buffer.alloc(1024 * 1024)]) });
    await expect(page.locator('#signatureError')).toContainText('1 MB');
    await expect(confirm).toBeDisabled();

    // PNG sah -> pratinjau & aktif; hapus -> kembali nonaktif.
    await fileInput.setInputFiles({ name: 'ttd.png', mimeType: 'image/png', buffer: PNG_BYTES });
    await expect(page.locator('#signatureError')).toHaveText('');
    await expect(page.locator('#signaturePreview')).toBeVisible();
    await expect(confirm).toBeEnabled();
    await page.locator('#signatureRemoveFile').click();
    await expect(page.locator('#signaturePreviewBox')).toBeHidden();
    await expect(confirm).toBeDisabled();

    // Ganti ke JPEG, lalu kirim.
    await fileInput.setInputFiles({ name: 'ttd.jpg', mimeType: 'image/jpeg', buffer: JPEG_BYTES });
    await expect(confirm).toBeEnabled();
    expect(await page.locator('#signaturePreview').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    const [request] = await Promise.all([
        page.waitForRequest((req) => req.url().endsWith(`/inspections/${inspection.id}/approve`)),
        confirm.click(),
    ]);
    expect(request.headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/);

    await expect(page.locator('#toastMessage')).toContainText('menyetujui inspeksi');
    await expect(modal).not.toHaveClass(/show/);
    const saved = await fetchInspection(arif, inspection.id);
    expect(saved.currentApprovalStage).toBe('manajer');
    expect(saved.approvalHistory).toHaveLength(1);
    expect(saved.approvalHistory[0]).toMatchObject({ stage: 'koordinator_k3l', decision: 'approved', reviewerName: 'Dewi', signatureMethod: 'upload', hasSignature: true });
    // Tersimpan byte-demi-byte sama dengan JPEG yang dipilih — terkirim sebagai berkas, tidak diubah/di-base64.
    const stored = await fetchStoredSignature(arif, inspection.id, saved.approvalHistory[0].id);
    expect(stored.contentType).toBe('image/jpeg');
    expect(Buffer.compare(stored.bytes, JPEG_BYTES)).toBe(0);
});

test('kanvas: kosong/ketukan ditolak; Hapus; ganti cara membuang data lama; coretan terkirim sebagai PNG; klik ganda tidak menggandakan persetujuan', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);
    await approveViaApi(await apiLogin('dewi'), inspection.id, 'koordinator_k3l');

    await loginViaUi(page, 'andi');
    const modal = await openSignatureModalFor(page, inspection.id);
    const confirm = modal.getByRole('button', { name: 'Setujui' });
    await modal.getByRole('radio', { name: 'Gambar Tanda Tangan' }).check();
    await expect(page.locator('#signatureCanvas')).toBeVisible();
    await expect(confirm).toBeDisabled();

    await page.locator('#signatureCanvas').click({ position: { x: 40, y: 40 } });
    await expect(confirm, 'satu ketukan bukan tanda tangan').toBeDisabled();

    await drawWithMouse(page);
    await expect(page.locator('#signaturePreview')).toBeVisible();
    await expect(confirm).toBeEnabled();
    await page.locator('#signatureClearCanvas').click();
    await expect(confirm).toBeDisabled();
    await expect(page.locator('#signaturePreviewBox')).toBeHidden();

    // Berganti cara membuang coretan sebelumnya.
    await drawWithMouse(page);
    await expect(confirm).toBeEnabled();
    await modal.getByRole('radio', { name: 'Upload Tanda Tangan' }).check();
    await expect(confirm).toBeDisabled();
    await modal.getByRole('radio', { name: 'Gambar Tanda Tangan' }).check();
    await expect(confirm).toBeDisabled();

    await drawWithMouse(page);
    await expect(confirm).toBeEnabled();
    const approveRequests = [];
    page.on('request', (req) => { if (req.url().endsWith('/approve')) approveRequests.push(req); });
    await confirm.dblclick();
    await expect(page.locator('#toastMessage')).toContainText('menyetujui inspeksi');

    expect(approveRequests).toHaveLength(1);
    expect(approveRequests[0].headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/);

    const saved = await fetchInspection(arif, inspection.id);
    expect(saved.currentApprovalStage).toBe('ketua_p2k3');
    expect(saved.approvalHistory.map((entry) => [entry.stage, entry.signatureMethod])).toEqual([
        ['koordinator_k3l', 'upload'], ['manajer', 'canvas'],
    ]);
    // Kanvas tersimpan sebagai PNG sungguhan (byte awal PNG), hasil ekspor kanvas.
    const stored = await fetchStoredSignature(arif, inspection.id, saved.approvalHistory[1].id);
    expect(stored.contentType).toBe('image/png');
    expect([...stored.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('Ketua menyetujui lewat UI -> COMPLETED tanpa aksi Setujui lagi; tanda tangan tampil di riwayat lewat API terotorisasi; plant lain tidak bisa mengambilnya', async ({ page, browser }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);
    await approveViaApi(await apiLogin('dewi'), inspection.id, 'koordinator_k3l');
    await approveViaApi(await apiLogin('andi'), inspection.id, 'manajer', 'canvas');

    await loginViaUi(page, 'hadi');
    const modal = await openSignatureModalFor(page, inspection.id);
    await modal.getByRole('radio', { name: 'Upload Tanda Tangan' }).check();
    await page.locator('#signatureFile').setInputFiles({ name: 'ketua.png', mimeType: 'image/png', buffer: PNG_BYTES });
    await modal.getByRole('button', { name: 'Setujui' }).click();
    await expect(page.locator('#toastMessage')).toContainText('Semua tahap pengesahan telah disetujui');
    expect((await fetchInspection(arif, inspection.id)).status).toBe('completed');

    // Pemilik membuka detail: tiga gambar tanda tangan, dari endpoint API (bukan /uploads), benar-benar termuat.
    const ownerPage = await newIsolatedPage(browser);
    await loginViaUi(ownerPage, 'arif');
    await goToTab(ownerPage, 'Dashboard');
    await ownerPage.locator('#inspeksiTableBody').getByRole('row', { name: inspection.id }).getByTestId('row-detail-btn').click();
    const signatures = ownerPage.locator('#detailModal').getByTestId('stage-signature').locator('img');
    await expect(signatures).toHaveCount(3);
    for (const img of await signatures.all()) {
        await expect(img).toHaveAttribute('src', new RegExp(`/api/inspections/${inspection.id}/approvals/\\d+/signature$`));
        await expect.poll(() => img.evaluate((node) => node.complete && node.naturalWidth)).toBeGreaterThan(0);
    }
    const signatureSrc = await signatures.first().getAttribute('src');
    await ownerPage.keyboard.press('Escape');
    await expect(ownerPage.locator('#detailModal')).not.toHaveClass(/show/);

    // Selesai: tidak ada lagi tombol Setujui.
    await goToTab(ownerPage, 'Inspeksi');
    await ownerPage.locator('#allInspeksiTable').getByRole('row', { name: inspection.id }).getByTestId('row-approve-btn').click();
    await expect(ownerPage.locator('#approvalContent').getByRole('button', { name: /Setujui/ })).toHaveCount(0);
    await ownerPage.close();

    // Koordinator plant lain: URL yang sama -> 404.
    const rina = await apiLogin('rina');
    expect((await rina.context.get(signatureSrc)).status()).toBe(404);
});
