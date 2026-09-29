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
    const signatures = ownerPage.locator('#detailModal').getByTestId('stage-signature').locator('img:not(.signature-watermark)');
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

// =========================================================================
// Phase 17.4D — watermark opsional di atas pratinjau tanda tangan
// =========================================================================

/**
 * Keadaan watermark di pratinjau: posisi 0..1 (dari left/top %), titik
 * tengahnya di layar, apakah kotaknya utuh di dalam area tanda tangan, dan
 * apakah area itu tepat sama dengan gambar tanda tangan.
 */
async function watermarkState(page) {
    return page.evaluate(() => {
        const stage = document.getElementById('signatureStage');
        const mark = document.getElementById('signatureWatermark').getBoundingClientRect();
        const image = document.getElementById('signaturePreview').getBoundingClientRect();
        const outer = stage.getBoundingClientRect();
        const left = outer.left + stage.clientLeft;
        const top = outer.top + stage.clientTop;
        const tolerance = 0.5;
        return {
            x: parseFloat(document.getElementById('signatureWatermark').style.left) / 100,
            y: parseFloat(document.getElementById('signatureWatermark').style.top) / 100,
            centre: { x: mark.left + mark.width / 2, y: mark.top + mark.height / 2 },
            inside: mark.left >= left - tolerance && mark.top >= top - tolerance
                && mark.right <= left + stage.clientWidth + tolerance && mark.bottom <= top + stage.clientHeight + tolerance,
            areaIsImage: Math.abs(image.left - left) < 1 && Math.abs(image.top - top) < 1
                && Math.abs(image.width - stage.clientWidth) < 1 && Math.abs(image.height - stage.clientHeight) < 1,
        };
    });
}

/**
 * Watermark = logo perusahaan (aset lokal), bukan teks "SHE Sasa": <img> dari
 * src/asset/company_logo.png yang benar-benar termuat (bukan gambar rusak),
 * rasio aspek aslinya dijaga, dan semi-transparan.
 */
async function expectLogoWatermark(locator) {
    await expect.poll(() => locator.evaluate((node) => node.complete && node.naturalWidth)).toBeGreaterThan(0);
    const logo = await locator.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
            tag: node.tagName, src: node.src, html: node.outerHTML,
            naturalAspect: node.naturalWidth / node.naturalHeight, renderedAspect: rect.width / rect.height,
            opacity: getComputedStyle(node).opacity,
        };
    });
    expect(logo.tag).toBe('IMG');
    expect(logo.src).toMatch(/\/src\/asset\/company_logo\.png$/);
    expect(logo.html).not.toContain('SHE Sasa');
    expect(Math.abs(logo.renderedAspect - logo.naturalAspect) / logo.naturalAspect, 'logo tidak gepeng').toBeLessThan(0.03);
    expect(logo.opacity).toBe('0.35');
}

/** Mencatat kegagalan memuat aset logo (tidak boleh ada gambar rusak). */
function trackLogoFailures(page) {
    const failures = [];
    page.on('requestfailed', (req) => { if (req.url().includes('company_logo.png')) failures.push(`${req.url()} ${req.failure()?.errorText}`); });
    page.on('response', (res) => { if (res.url().includes('company_logo.png') && res.status() >= 400) failures.push(`${res.url()} ${res.status()}`); });
    return failures;
}

async function dragWithMouse(page, from, to) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
}

/** Sentuhan sungguhan (CDP) — Chromium meneruskannya sebagai Pointer Events pointerType 'touch'. */
async function dragWithTouch(cdp, from, to, steps = 8) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('watermark (mouse): nonaktif bawaan; diaktifkan -> tengah; digeser & dibatasi di dalam tanda tangan; posisi ternormalisasi tersimpan, berkas tetap asli, tampil di riwayat', async ({ page, browser }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    const logoFailures = trackLogoFailures(page);
    await loginViaUi(page, 'dewi');
    const modal = await openSignatureModalFor(page, inspection.id);
    await modal.getByRole('radio', { name: 'Upload Tanda Tangan' }).check();
    await page.locator('#signatureFile').setInputFiles({ name: 'ttd.png', mimeType: 'image/png', buffer: PNG_BYTES });

    const toggle = modal.getByLabel('Tambahkan watermark');
    const watermark = page.getByTestId('signature-watermark');
    await expect(toggle).not.toBeChecked();
    await expect(watermark).toBeHidden();

    await toggle.check();
    await expect(watermark).toBeVisible();
    await expectLogoWatermark(watermark);
    let state = await watermarkState(page);
    expect(state).toMatchObject({ x: 0.5, y: 0.5, inside: true, areaIsImage: true });

    // Ditarik jauh melewati pojok kiri atas -> berhenti di tepi, tetap utuh di dalam.
    const stage = await page.locator('#signatureStage').boundingBox();
    await dragWithMouse(page, state.centre, { x: stage.x - 300, y: stage.y - 300 });
    state = await watermarkState(page);
    expect(state.inside).toBe(true);
    expect(state.x).toBeLessThan(0.5);
    expect(state.y).toBeLessThan(0.5);

    // Nonaktif lalu aktif lagi: posisi terakhir dipertahankan selama modal terbuka.
    const beforeToggle = { x: state.x, y: state.y };
    await toggle.uncheck();
    await expect(watermark).toBeHidden();
    await toggle.check();
    expect(await watermarkState(page)).toMatchObject(beforeToggle);

    // Digeser ke kanan bawah.
    await dragWithMouse(page, state.centre, { x: stage.x + stage.width * 0.7, y: stage.y + stage.height * 0.7 });
    state = await watermarkState(page);
    expect(state.inside).toBe(true);
    expect(state.x).toBeGreaterThan(0.5);
    expect(state.y).toBeGreaterThan(0.5);
    const chosen = { x: state.x, y: state.y };

    await modal.getByRole('button', { name: 'Setujui' }).click();
    await expect(page.locator('#toastMessage')).toContainText('menyetujui inspeksi');

    const saved = await fetchInspection(arif, inspection.id);
    expect(saved.currentApprovalStage).toBe('manajer');
    expect(saved.approvalHistory[0].watermark.x).toBeCloseTo(chosen.x, 4);
    expect(saved.approvalHistory[0].watermark.y).toBeCloseTo(chosen.y, 4);
    // Watermark hanya metadata: berkas tanda tangan tersimpan byte-demi-byte sama dengan yang dipilih.
    const stored = await fetchStoredSignature(arif, inspection.id, saved.approvalHistory[0].id);
    expect(Buffer.compare(stored.bytes, PNG_BYTES)).toBe(0);

    // Pemilik membuka detail: watermark tampil di atas tanda tangan, di posisi yang sama.
    const ownerPage = await newIsolatedPage(browser);
    await loginViaUi(ownerPage, 'arif');
    await goToTab(ownerPage, 'Dashboard');
    await ownerPage.locator('#inspeksiTableBody').getByRole('row', { name: inspection.id }).getByTestId('row-detail-btn').click();
    const overlay = ownerPage.locator('#detailModal').getByTestId('stage-watermark');
    await expect(overlay).toHaveCount(1);
    const shown = await overlay.evaluate((node) => ({ x: parseFloat(node.style.left) / 100, y: parseFloat(node.style.top) / 100 }));
    expect(shown.x).toBeCloseTo(chosen.x, 4);
    expect(shown.y).toBeCloseTo(chosen.y, 4);
    // Area watermark di riwayat = gambar tanda tangan itu sendiri (bingkai tidak melebar).
    const thumb = ownerPage.locator('#detailModal').getByTestId('stage-signature');
    await expect.poll(() => thumb.locator('img:not(.signature-watermark)').evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    const fit = await thumb.evaluate((link) => {
        const img = link.querySelector('img:not(.signature-watermark)').getBoundingClientRect();
        return { dw: Math.abs(img.width - link.clientWidth), dh: Math.abs(img.height - link.clientHeight) };
    });
    expect(fit.dw).toBeLessThan(1);
    expect(fit.dh).toBeLessThan(1);
    // Logo yang sama, di posisi tersimpan, utuh di dalam gambar tanda tangan riwayat.
    await expectLogoWatermark(overlay);
    const overlayInside = await thumb.evaluate((link) => {
        const area = link.querySelector('img:not(.signature-watermark)').getBoundingClientRect();
        const mark = link.querySelector('.signature-watermark').getBoundingClientRect();
        return mark.left >= area.left - 0.5 && mark.top >= area.top - 0.5 && mark.right <= area.right + 0.5 && mark.bottom <= area.bottom + 0.5;
    });
    expect(overlayInside, 'logo riwayat utuh di dalam tanda tangan').toBe(true);
    await ownerPage.close();
    expect(logoFailures, 'aset logo termuat tanpa galat').toEqual([]);
});

test('tanpa watermark: persetujuan tetap sah, watermark tersimpan null', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    const modal = await openSignatureModalFor(page, inspection.id);
    await modal.getByRole('radio', { name: 'Upload Tanda Tangan' }).check();
    await page.locator('#signatureFile').setInputFiles({ name: 'ttd.png', mimeType: 'image/png', buffer: PNG_BYTES });
    await expect(modal.getByLabel('Tambahkan watermark')).not.toBeChecked();
    await modal.getByRole('button', { name: 'Setujui' }).click();
    await expect(page.locator('#toastMessage')).toContainText('menyetujui inspeksi');

    const saved = await fetchInspection(arif, inspection.id);
    expect(saved.approvalHistory[0]).toMatchObject({ stage: 'koordinator_k3l', hasSignature: true, watermark: null });
});

test.describe('layar sentuh 390px', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('watermark (sentuh): kanvas digambar & watermark digeser dengan jari; tanpa scroll horizontal/terpotong; posisi tersimpan', async ({ page }) => {
        const arif = await apiLogin('arif');
        const inspection = await createInspectionFixture(arif);
        await approveViaApi(await apiLogin('dewi'), inspection.id, 'koordinator_k3l');

        await loginViaUi(page, 'andi');
        const modal = await openSignatureModalFor(page, inspection.id);
        await modal.getByRole('radio', { name: 'Gambar Tanda Tangan' }).check();
        const cdp = await page.context().newCDPSession(page);

        await page.locator('#signatureCanvas').scrollIntoViewIfNeeded();
        const canvas = await page.locator('#signatureCanvas').boundingBox();
        await dragWithTouch(cdp, { x: canvas.x + 20, y: canvas.y + canvas.height / 2 },
            { x: canvas.x + canvas.width - 20, y: canvas.y + canvas.height / 3 }, 12);
        await expect(page.locator('#signaturePreview')).toBeVisible();

        await modal.getByLabel('Tambahkan watermark').check();
        await expect(page.getByTestId('signature-watermark')).toBeVisible();
        await expectLogoWatermark(page.getByTestId('signature-watermark'));
        await page.evaluate(() => {
            window.__watermarkPointerTypes = [];
            document.getElementById('signatureStage').addEventListener('pointerdown', (event) => window.__watermarkPointerTypes.push(event.pointerType));
        });
        await page.locator('#signatureStage').scrollIntoViewIfNeeded();
        let state = await watermarkState(page);
        expect(state).toMatchObject({ x: 0.5, y: 0.5, inside: true, areaIsImage: true });
        const stage = await page.locator('#signatureStage').boundingBox();

        await dragWithTouch(cdp, state.centre, { x: stage.x + stage.width + 100, y: stage.y + stage.height * 0.8 });
        expect(await page.evaluate(() => window.__watermarkPointerTypes)).toEqual(['touch']);
        state = await watermarkState(page);
        expect(state.inside, 'dibatasi di tepi kanan').toBe(true);
        expect(state.x).toBeGreaterThan(0.5);
        expect(state.y).toBeGreaterThan(0.5);

        // Tidak ada scroll horizontal; kotak modal tidak terpotong di sisi kiri/kanan.
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        const box = await page.locator('#signatureModal .modal-box').boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);

        await modal.getByRole('button', { name: 'Setujui' }).click();
        await expect(page.locator('#toastMessage')).toContainText('menyetujui inspeksi');
        const saved = await fetchInspection(arif, inspection.id);
        const entry = saved.approvalHistory.find((item) => item.stage === 'manajer');
        expect(entry).toMatchObject({ signatureMethod: 'canvas', hasSignature: true });
        expect(entry.watermark.x).toBeCloseTo(state.x, 4);
        expect(entry.watermark.y).toBeCloseTo(state.y, 4);
    });
});
