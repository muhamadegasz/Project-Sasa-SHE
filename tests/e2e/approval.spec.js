/* approval.spec.js — Phase 14.1-G: APPROVAL #9-12, diperbarui Phase 17.2
 * (tiga tahap berkode string, riwayat append-only, alasan penolakan wajib,
 * wewenang lewat domain/inspection-policy.js).
 *
 * Setiap test membuat inspeksi fixture-nya SENDIRI lewat API (support/api.js)
 * — tidak ada test yang bergantung pada inspeksi buatan test lain. Fixture
 * dibuat di plant 1, plant yang ditugaskan ke koordinator seed "dewi".
 */

import { API } from './support/env.js';
import { test, expect } from './support/test.js';
import { loginViaUi, goToTab } from './support/ui.js';
import { apiLogin, approveViaApi, createInspectionFixture } from './support/api.js';


async function openApprovalModalFor(page, inspectionId) {
    await goToTab(page, 'Inspeksi');
    const row = page.locator('#allInspeksiTable').getByRole('row', { name: inspectionId });
    await row.getByTestId('row-approve-btn').click();
    await expect(page.locator('#approvalModal')).toHaveClass(/show/);
}

/**
 * Membaca inspeksi lewat API dengan sesi `requestContext` (page.request milik
 * pengguna UI, atau context apiLogin()). Sejak Phase 17.3A server hanya
 * menyajikan inspeksi yang boleh dilihat sesi itu — penolak tidak melihat
 * inspeksi yang sedang direvisi, jadi hasil keputusan umumnya dibaca sebagai
 * pemiliknya (Safety Officer pembuat).
 */
async function fetchInspection(requestContext, inspectionId) {
    const res = await requestContext.get(`${API}/inspections/${inspectionId}`);
    expect(res.status(), 'inspeksi harus terlihat oleh sesi pembacanya').toBe(200);
    return res.json();
}

// Phase 17.4A: persetujuan wajib bertanda tangan. Phase 17.4B: "Setujui"
// membuka modal tanda tangan yang tombol kirimnya nonaktif sampai ada tanda
// tangan sah (alur unggah/kanvas lengkap diuji di signature.spec.js); server
// tetap menolak persetujuan tanpa tanda tangan yang dikirim langsung.
test('koordinator K3L plant yang bersangkutan: persetujuan tanpa tanda tangan tidak bisa dikirim (UI) & ditolak (server); bertanda tangan -> tahap maju ke Manajer', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    await openApprovalModalFor(page, inspection.id);

    await page.locator('#approvalContent').getByRole('button', { name: /Setujui/ }).click();
    await expect(page.locator('#signatureModal')).toHaveClass(/show/);
    await expect(page.locator('#signatureModal').getByRole('button', { name: 'Setujui' })).toBeDisabled();

    const { csrfToken } = await (await page.request.get(`${API}/auth/me`)).json();
    const unsigned = await page.request.post(`${API}/inspections/${inspection.id}/approve`, {
        headers: { 'X-CSRF-Token': csrfToken },
        data: { stageId: 'koordinator_k3l' },
    });
    expect(unsigned.status()).toBe(400);
    expect((await unsigned.json()).error).toBe('SIGNATURE_REQUIRED');
    const untouched = await fetchInspection(arif.context, inspection.id);
    expect(untouched.approvalHistory).toHaveLength(0);
    expect(untouched.currentApprovalStage).toBe('koordinator_k3l');

    await approveViaApi(await apiLogin('dewi'), inspection.id, 'koordinator_k3l');
    const body = await fetchInspection(arif.context, inspection.id);
    expect(body.status).toBe('in_review');
    expect(body.currentApprovalStage).toBe('manajer');
    expect(body.approvalHistory).toHaveLength(1);
    expect(body.approvalHistory[0]).toMatchObject({
        stage: 'koordinator_k3l', attempt: 1, decision: 'approved', reviewerName: 'Dewi', signatureMethod: 'upload', hasSignature: true,
    });
});

test('koordinator K3L bisa menolak dengan alasan — inspeksi perlu revisi, tahap tetap di Koordinator', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    await openApprovalModalFor(page, inspection.id);

    // Phase 17.3B: alasan wajib diisi lewat modal penolakan (menggantikan prompt()).
    await page.locator('#approvalContent').getByRole('button', { name: /Tolak/ }).click();
    const rejectModal = page.locator('#rejectModal');
    await expect(rejectModal).toHaveClass(/show/);

    // Alasan kosong ditolak di form, tanpa mengirim apa pun.
    await rejectModal.getByRole('button', { name: 'Tolak Inspeksi' }).click();
    await expect(page.locator('#toastMessage')).toContainText('Alasan penolakan wajib diisi');
    await expect(rejectModal).toHaveClass(/show/);

    await rejectModal.getByLabel(/Alasan penolakan/).fill('Foto area kurang jelas');
    const [rejectRequest] = await Promise.all([
        page.waitForRequest((req) => req.url().endsWith(`/inspections/${inspection.id}/reject`)),
        rejectModal.getByRole('button', { name: 'Tolak Inspeksi' }).click(),
    ]);
    // Phase 17.4B: penolakan tetap JSON tanpa data tanda tangan.
    expect(rejectRequest.postDataJSON()).toEqual({ stageId: 'koordinator_k3l', reason: 'Foto area kurang jelas' });
    await expect(page.locator('#toastMessage')).toContainText('menolak inspeksi');
    await expect(rejectModal).not.toHaveClass(/show/);

    const body = await fetchInspection(arif.context, inspection.id);
    expect(body.status).toBe('revision_required');
    expect(body.currentApprovalStage).toBe('koordinator_k3l');
    expect(body.approvalHistory[0]).toMatchObject({ stage: 'koordinator_k3l', decision: 'rejected', rejectionReason: 'Foto area kurang jelas' });
});

test('Safety Officer: modal status hanya-baca (tanpa Setujui/Tolak) dengan riwayat; persetujuan/penolakan langsung tetap ditolak server', async ({ page }) => {
    const arif = await apiLogin('arif');
    const dewi = await apiLogin('dewi');
    const inspection = await createInspectionFixture(arif);
    // Riwayat: Koordinator menolak, pemilik mengajukan ulang -> kembali menunggu Koordinator.
    const reject = await dewi.context.post(`/api/inspections/${inspection.id}/reject`, {
        headers: { 'X-CSRF-Token': dewi.csrfToken }, data: { stageId: 'koordinator_k3l', reason: 'Lengkapi foto area' },
    });
    expect(reject.status()).toBe(200);
    const resubmit = await arif.context.post(`/api/inspections/${inspection.id}/submit`, { headers: { 'X-CSRF-Token': arif.csrfToken } });
    expect(resubmit.status()).toBe(200);

    // arif (safety_officer) — pembuat inspeksi, BUKAN tahap pengesahan.
    await loginViaUi(page, 'arif');
    await openApprovalModalFor(page, inspection.id);
    const content = page.locator('#approvalContent');
    await expect(page.locator('#approvalModalTitle')).toHaveText(/Status Persetujuan Inspeksi/);
    await expect(content.getByRole('button', { name: /Setujui|Tolak/ })).toHaveCount(0);
    await expect(content.locator('[data-action="approveStage"], [data-action="rejectStage"]')).toHaveCount(0);
    await expect(content.getByTestId('stage-readonly')).toHaveCount(1);
    await expect(content).toContainText('Menunggu persetujuan Koordinator K3L Bagian');
    await expect(content.getByTestId('stage-attempt')).toHaveCount(1);
    await expect(content.getByTestId('stage-attempt')).toContainText('Alasan: Lengkapi foto area');
    await page.keyboard.press('Escape');

    // Modal detail memakai tampilan tahap yang sama: juga tanpa tombol aksi.
    await goToTab(page, 'Dashboard');
    await page.locator('#inspeksiTableBody').getByRole('row', { name: inspection.id }).getByTestId('row-detail-btn').click();
    await expect(page.locator('#detailModal')).toHaveClass(/show/);
    await expect(page.locator('#detailModal').locator('[data-action="approveStage"], [data-action="rejectStage"]')).toHaveCount(0);

    // Pemeriksaan di browser bukan otorisasi: kirim langsung ke server dengan
    // sesi arif sendiri — server yang harus menolak, tanpa perubahan apa pun.
    const { csrfToken } = await (await page.request.get(`${API}/auth/me`)).json();
    const directApprove = await page.request.post(`${API}/inspections/${inspection.id}/approve`, {
        headers: { 'X-CSRF-Token': csrfToken },
        data: { stageId: 'koordinator_k3l' },
    });
    expect(directApprove.status()).toBe(403);
    const directReject = await page.request.post(`${API}/inspections/${inspection.id}/reject`, {
        headers: { 'X-CSRF-Token': csrfToken },
        data: { stageId: 'koordinator_k3l', reason: 'Menolak inspeksi sendiri' },
    });
    expect(directReject.status()).toBe(403);

    const body = await fetchInspection(page.request, inspection.id);
    expect(body.approvalHistory, 'hanya penolakan Koordinator — permintaan pemilik ditolak server').toHaveLength(1);
    expect([body.status, body.currentApprovalStage]).toEqual(['in_review', 'koordinator_k3l']);
    await arif.context.dispose();
    await dewi.context.dispose();
});

test('peninjau berwenang: Koordinator plant-nya melihat "Pengesahan Inspeksi" dengan Setujui DAN Tolak di tahapnya saja; Admin hanya-baca', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    await openApprovalModalFor(page, inspection.id);
    const content = page.locator('#approvalContent');
    await expect(page.locator('#approvalModalTitle')).toHaveText(/Pengesahan Inspeksi/);
    await expect(page.locator('#approvalModalTitle')).not.toHaveText(/Status Persetujuan/);
    await expect(content.locator('[data-action="approveStage"]')).toHaveCount(1);
    await expect(content.locator('[data-action="rejectStage"]')).toHaveCount(1);
    await expect(content.locator('[data-action="approveStage"]')).toHaveAttribute('data-stage', 'koordinator_k3l');
    await expect(content.locator('[data-action="rejectStage"]')).toHaveAttribute('data-stage', 'koordinator_k3l');
    await expect(content.getByTestId('stage-readonly')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Admin melihat inspeksi yang sedang direview, tapi bukan tahap pengesahan.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByTestId('user-name')).not.toBeVisible();
    await loginViaUi(page, 'admin');
    await openApprovalModalFor(page, inspection.id);
    await expect(page.locator('#approvalModalTitle')).toHaveText(/Status Persetujuan Inspeksi/);
    await expect(content.locator('[data-action="approveStage"], [data-action="rejectStage"]')).toHaveCount(0);
    await expect(content.getByTestId('stage-readonly')).toHaveCount(1);
    await arif.context.dispose();
});

test('Koordinator yang sudah menyetujui tetap melihat inspeksinya di tahap Manajer — hanya-baca, tanpa Setujui/Tolak; server tetap menolak keputusan', async ({ page }) => {
    const arif = await apiLogin('arif');
    const dewi = await apiLogin('dewi');
    const inspection = await createInspectionFixture(arif);
    await approveViaApi(dewi, inspection.id, 'koordinator_k3l');

    await loginViaUi(page, 'dewi');
    await openApprovalModalFor(page, inspection.id); // baris masih ada di daftar dewi
    const content = page.locator('#approvalContent');
    await expect(page.locator('#approvalModalTitle')).toHaveText(/Status Persetujuan Inspeksi/);
    await expect(content.locator('[data-action="approveStage"], [data-action="rejectStage"]')).toHaveCount(0);
    await expect(content.getByTestId('stage-readonly')).toHaveCount(1);
    await expect(content).toContainText('Menunggu persetujuan Manajer Bagian');

    // Tahap miliknya tampil sebagai keputusan yang sudah diambil, dengan tanda tangannya (lewat API terotorisasi).
    const koordinator = content.locator('.approval-stage', { has: page.locator('.stage-title', { hasText: 'Koordinator K3L Bagian' }) });
    await expect(koordinator.locator('.stage-status')).toContainText('Disetujui');
    await expect(koordinator.locator('.stage-detail')).toContainText('Dewi');
    const signature = koordinator.getByTestId('stage-signature').locator('img:not(.signature-watermark)');
    await expect.poll(() => signature.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');

    const { csrfToken } = await (await page.request.get(`${API}/auth/me`)).json();
    const rejectOwnStage = await page.request.post(`${API}/inspections/${inspection.id}/reject`, {
        headers: { 'X-CSRF-Token': csrfToken },
        data: { stageId: 'koordinator_k3l', reason: 'Menolak setelah menyetujui' },
    });
    expect([rejectOwnStage.status(), (await rejectOwnStage.json()).error]).toEqual([400, 'STAGE_NOT_CURRENT']);
    const managerStage = await page.request.post(`${API}/inspections/${inspection.id}/reject`, {
        headers: { 'X-CSRF-Token': csrfToken },
        data: { stageId: 'manajer', reason: 'Bukan tahap saya' },
    });
    expect(managerStage.status()).toBe(403);

    const body = await fetchInspection(page.request, inspection.id);
    expect(body.approvalHistory, 'hanya persetujuan dewi').toHaveLength(1);
    expect([body.status, body.currentApprovalStage]).toEqual(['in_review', 'manajer']);
    await arif.context.dispose();
    await dewi.context.dispose();
});

test('alur pengesahan tidak bisa dilompati lewat UI — hanya tahap yang sedang berjalan yang punya tombol aksi', async ({ page }) => {
    const arif = await apiLogin('arif');
    const inspection = await createInspectionFixture(arif);

    await loginViaUi(page, 'dewi');
    await openApprovalModalFor(page, inspection.id);

    const approveButtons = page.locator('#approvalContent').getByRole('button', { name: /Setujui/ });
    await expect(approveButtons, 'hanya SATU tombol setujui — tahap Manajer dan Ketua belum menawarkan aksi apa pun').toHaveCount(1);
    await expect(approveButtons.first()).toHaveAttribute('data-stage', 'koordinator_k3l');
});
