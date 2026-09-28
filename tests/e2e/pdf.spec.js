/* pdf.spec.js — release: PDF laporan inspeksi selesai memuat tanda tangan
 * setiap tahap, dengan watermark di posisi TERSIMPAN (bukan posisi baru).
 *
 * Isi PDF sendiri berupa satu gambar per halaman (html2pdf/html2canvas), jadi
 * bukti rendering diambil dari #pdfContent yang dipotret html2pdf: piksel
 * merah watermark diukur dan dibandingkan dengan posisi tersimpan di API.
 * Berkas tanda tangan tersimpan dibuktikan tidak berubah (byte identik).
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from './support/test.js';
import { loginViaUi, goToTab } from './support/ui.js';
import { apiLogin, createInspectionFixture } from './support/api.js';

/**
 * PDF yang benar-benar berisi halaman: html2pdf menanam setiap halaman sebagai
 * gambar JPEG. Sebelum rilis ini PDF selalu kosong (~3 KB, tanpa gambar) —
 * header %PDF saja tidak cukup sebagai bukti.
 */
function expectRenderedPdf(bytes) {
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.includes(Buffer.from('/Subtype /Image')), 'PDF memuat gambar halaman').toBe(true);
    expect(bytes.length, 'PDF tidak kosong').toBeGreaterThan(50_000);
}

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PNG_BYTES = readFileSync(path.join(FIXTURES, 'signature.png'));
const JPEG_BYTES = readFileSync(path.join(FIXTURES, 'signature.jpg'));

async function approve(session, inspectionId, stageId, { buffer, mimeType, method = 'upload' }, watermark = null) {
    const multipart = {
        stageId, signatureMethod: method,
        signature: { name: mimeType === 'image/png' ? 'ttd.png' : 'ttd.jpg', mimeType, buffer },
    };
    if (watermark) Object.assign(multipart, { watermarkEnabled: 'true', watermarkX: String(watermark.x), watermarkY: String(watermark.y) });
    const res = await session.context.post(`/api/inspections/${inspectionId}/approve`, {
        headers: { 'X-CSRF-Token': session.csrfToken }, multipart,
    });
    expect(res.status(), await res.text()).toBe(200);
}

async function fetchJson(session, url) {
    const res = await session.context.get(url);
    expect(res.status()).toBe(200);
    return res.json();
}

/** Piksel merah (watermark) per gambar tanda tangan di #pdfContent, per tahap. */
async function measureSignatures(page) {
    return page.evaluate(async () => {
        const out = {};
        for (const item of document.querySelectorAll('#pdfContent .sign-item[data-stage]')) {
            const img = item.querySelector('img.pdf-signature');
            if (!img) { out[item.dataset.stage] = null; continue; }
            await img.decode();
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const context = canvas.getContext('2d');
            context.drawImage(img, 0, 0);
            const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
            let count = 0; let minX = Infinity; let maxX = -1; let minY = Infinity; let maxY = -1;
            for (let i = 0; i < data.length; i += 4) {
                const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
                if (a > 0 && r > 150 && r - g > 40 && r - b > 40) {
                    const p = i / 4; const x = p % canvas.width; const y = Math.floor(p / canvas.width);
                    count++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                }
            }
            out[item.dataset.stage] = {
                src: img.getAttribute('src'), width: canvas.width, height: canvas.height, red: count,
                centerX: (minX + maxX) / 2 / canvas.width, centerY: (minY + maxY) / 2 / canvas.height,
                widthRatio: (maxX - minX + 1) / canvas.width,
            };
        }
        return out;
    });
}

test('PDF inspeksi selesai: tanda tangan ketiga tahap tertanam; watermark di posisi tersimpan persis; tanpa watermark bersih; berkas tanda tangan tidak berubah', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);
    await approve(await apiLogin('dewi'), inspection.id, 'koordinator_k3l', { buffer: PNG_BYTES, mimeType: 'image/png' }, { x: 0.3, y: 0.62 });
    await approve(await apiLogin('andi'), inspection.id, 'manajer', { buffer: PNG_BYTES, mimeType: 'image/png', method: 'canvas' });
    await approve(await apiLogin('hadi'), inspection.id, 'ketua_p2k3', { buffer: JPEG_BYTES, mimeType: 'image/jpeg' }, { x: 0.7, y: 0.35 });
    const saved = await fetchJson(arif, `/api/inspections/${inspection.id}`);
    expect(saved.status).toBe('completed');
    const byStage = Object.fromEntries(saved.approvalHistory.map((entry) => [entry.stage, entry]));

    await loginViaUi(page, 'arif');
    await goToTab(page, 'Inspeksi');
    const row = page.locator('#allInspeksiTable').getByRole('row', { name: inspection.id });
    const signatureRequests = [];
    page.on('request', (req) => { if (/\/approvals\/\d+\/signature$/.test(req.url())) signatureRequests.push(req.url()); });
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        row.locator('[data-action="cetakPDF"]').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^Laporan_Inspeksi_${inspection.id}_.*\\.pdf$`));
    expectRenderedPdf(readFileSync(await download.path()));
    await expect(page.locator('#toastMessage')).toContainText('berhasil dicetak');

    // Diambil lewat endpoint terotorisasi (satu per tahap), dirender sebagai blob: (bukan URL API, bukan base64).
    expect(signatureRequests).toHaveLength(3);
    const measured = await measureSignatures(page);
    for (const stage of ['koordinator_k3l', 'manajer', 'ketua_p2k3']) {
        expect(measured[stage], stage).not.toBeNull();
        expect(measured[stage].src).toMatch(/^blob:/);
    }
    for (const stage of ['koordinator_k3l', 'ketua_p2k3']) {
        const { x, y } = byStage[stage].watermark;
        expect(measured[stage].red, `${stage}: watermark tergambar`).toBeGreaterThan(50);
        expect(Math.abs(measured[stage].centerX - x), `${stage}: tengah X = ${x}`).toBeLessThan(0.03);
        expect(Math.abs(measured[stage].centerY - y), `${stage}: tengah Y = ${y}`).toBeLessThan(0.06);
        expect(measured[stage].widthRatio, `${stage}: lebar watermark 45%`).toBeGreaterThan(0.42);
        expect(measured[stage].widthRatio).toBeLessThan(0.47);
    }
    expect(byStage.manajer.watermark).toBeNull();
    expect(measured.manajer.red, 'tanpa watermark: tidak ada piksel watermark').toBe(0);

    // Berkas tanda tangan tersimpan tidak disentuh rendering PDF.
    for (const [stage, bytes] of [['koordinator_k3l', PNG_BYTES], ['manajer', PNG_BYTES], ['ketua_p2k3', JPEG_BYTES]]) {
        const res = await arif.context.get(`/api/inspections/${inspection.id}/approvals/${byStage[stage].id}/signature`);
        expect(Buffer.compare(await res.body(), bytes), stage).toBe(0);
    }
});

test('PDF: persetujuan lama tanpa tanda tangan diberi keterangan; inspeksi yang belum selesai tidak bisa dicetak', async ({ page }) => {
    const admin = await apiLogin('admin');
    const all = await fetchJson(admin, '/api/inspections');
    const legacy = all.find((item) => item.status === 'completed' && item.approvalHistory.some((entry) => entry.decision === 'approved' && !entry.hasSignature));
    expect(legacy, 'data seed memuat inspeksi selesai dengan persetujuan lama tanpa tanda tangan').toBeTruthy();
    const arif = await apiLogin('arif');
    const inReview = await createInspectionFixture(arif);

    await loginViaUi(page, 'admin');
    await goToTab(page, 'Inspeksi');
    await expect(page.locator('#allInspeksiTable').getByRole('row', { name: inReview.id }).locator('.btn-pdf')).toBeDisabled();

    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        page.locator('#allInspeksiTable').getByRole('row', { name: legacy.id }).locator('[data-action="cetakPDF"]').click(),
    ]);
    expectRenderedPdf(readFileSync(await download.path()));
    const unsignedStages = legacy.approvalHistory.filter((entry) => entry.decision === 'approved' && !entry.hasSignature).length;
    await expect(page.locator('#pdfContent .pdf-signature-note')).toHaveCount(unsignedStages);
    await expect(page.locator('#pdfContent .pdf-signature-note').first()).toHaveText('Tanpa tanda tangan (data lama)');
});
