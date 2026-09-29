/* revision.spec.js — UX inspeksi yang Perlu Revisi.
 *
 * Pemilik (Safety Officer) melihat siapa yang meminta revisi, kapan, dan
 * alasannya — di tabel Inspeksi Terbaru (tombol Revisi) dan di Detail (blok
 * "Perlu Revisi" + "Revisi Inspeksi"), merevisi lewat form yang sama, lalu
 * mengajukan ulang ke tahap yang menolak (bukan kembali ke Koordinator).
 * Riwayat pengesahan lama tetap utuh; tindakan perbaikan (siklus terpisah)
 * tidak tersentuh. Pengguna lain hanya melihat informasinya.
 */

import { API } from './support/env.js';
import { test, expect, newIsolatedPage } from './support/test.js';
import { loginViaUi, goToTab } from './support/ui.js';
import { apiLogin, approveViaApi, createInspectionFixture } from './support/api.js';

async function rejectViaApi(session, inspectionId, stageId, reason) {
    const res = await session.context.post(`/api/inspections/${inspectionId}/reject`, {
        headers: { 'X-CSRF-Token': session.csrfToken }, data: { stageId, reason },
    });
    expect(res.status(), await res.text()).toBe(200);
}

async function fetchAs(session, inspectionId) {
    const res = await session.context.get(`${API}/inspections/${inspectionId}`);
    expect(res.status()).toBe(200);
    return res.json();
}

const historyOf = (inspection) => inspection.approvalHistory
    .map((entry) => [entry.stage, entry.attempt, entry.decision, entry.rejectionReason]);

async function recentRow(page, id) {
    await page.locator('#searchInspeksiInput').fill(id);
    const row = page.locator('#inspeksiTableBody tr').first();
    await expect(row.locator('td').first()).toHaveText(id);
    await expect(page.getByTestId('recent-pagination-summary')).toHaveText('Menampilkan 1–1 dari 1 inspeksi');
    return row;
}

async function expectNotVisible(page, id) {
    await page.locator('#searchInspeksiInput').fill(id);
    await expect(page.locator('#inspeksiTableBody')).toContainText('Tidak ada data ditemukan');
}

const stageBlock = (container, title) => container.locator('.approval-stage', { has: container.page().locator('.stage-title', { hasText: title }) });

/** Tanggal keputusan persis seperti ditampilkan aplikasi (formatDate, locale id-ID di browser). */
const displayDate = (page, iso) => page.evaluate((value) => new Date(value).toLocaleDateString('id-ID'), iso);

async function logout(page) {
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByTestId('user-name')).not.toBeVisible();
}

test('ditolak Manajer: pemilik melihat alasan + Revisi (tabel & Detail), merevisi lewat form yang sama -> kembali ke Manajer; riwayat & tindakan perbaikan utuh; Manajer memutuskan lagi', async ({ page, browser }) => {
    const arif = await apiLogin('arif');
    const dewi = await apiLogin('dewi');
    const andi = await apiLogin('andi');
    const reason = `Foto bukti belum menunjukkan kondisi aktual ${Date.now()}`;
    const inspection = await createInspectionFixture(arif);
    await approveViaApi(dewi, inspection.id, 'koordinator_k3l');
    await rejectViaApi(andi, inspection.id, 'manajer', reason);

    // Tindakan perbaikan (siklus terpisah) boleh berjalan selama Perlu Revisi.
    const rejected = await fetchAs(arif, inspection.id);
    expect(rejected.status).toBe('revision_required');
    const action = rejected.perbaikan[0];
    const progressed = await arif.context.put(`${API}/inspections/${inspection.id}/corrective-actions/${action.id}`, {
        headers: { 'X-CSRF-Token': arif.csrfToken }, data: { status: 'on-progress' },
    });
    expect(progressed.status(), await progressed.text()).toBe(200);
    const actionsBefore = (await fetchAs(arif, inspection.id)).perbaikan.map((entry) => [entry.id, entry.status]);
    expect(actionsBefore).toContainEqual([action.id, 'on-progress']);

    await loginViaUi(page, 'arif');

    // 1. Tabel: Revisi (pensil) jelas, Lihat tetap ada, Perbaikan & Progres berlabel sendiri.
    let row = await recentRow(page, inspection.id);
    await expect(row.getByTestId('recent-status')).toHaveText('Perlu Revisi');
    await expect(row.getByTestId('recent-revise-btn')).toHaveText('Revisi');
    await expect(row.getByTestId('recent-revise-btn').locator('i.fa-pen')).toHaveCount(1);
    await expect(row.getByTestId('row-detail-btn')).toHaveAttribute('title', 'Lihat detail');
    await expect(row.getByTestId('recent-perbaikan-btn')).toHaveAttribute('title', /^Perbaikan & Progres/);
    await expect(row.getByTestId('recent-approval-btn'), 'Safety Officer tidak pernah Setujui/Tolak').toHaveCount(0);

    // 2. Detail: blok Perlu Revisi setelah informasi utama.
    await row.getByTestId('row-detail-btn').click();
    const detail = page.locator('#detailModal');
    await expect(detail).toHaveClass(/show/);
    const info = detail.getByTestId('revision-info');
    await expect(info.locator('.revision-info-title')).toHaveText('Perlu Revisi');
    await expect(info.getByTestId('revision-requested-by')).toHaveText('Manajer Bagian · Andi');
    const rejection = rejected.approvalHistory.find((entry) => entry.decision === 'rejected');
    await expect(info.getByTestId('revision-date')).toHaveText(await displayDate(page, rejection.decidedAt));
    await expect(info.getByTestId('revision-reason')).toHaveText(reason);
    await expect(info.getByTestId('revision-next')).toHaveText('Perbaiki inspeksi sesuai alasan revisi, lalu ajukan ulang. Inspeksi akan kembali ke Manajer Bagian.');
    expect(await detail.locator('.detail-container > *').evaluateAll((nodes) => nodes.map((node) => node.className)))
        .toEqual(['detail-grid', 'revision-info', 'detail-section', 'detail-section', 'detail-section']);

    // Riwayat: tahap yang menolak dengan alasannya; tahap sebelumnya tetap disetujui; tanpa emoji.
    const manajerStage = stageBlock(detail, 'Manajer Bagian');
    await expect(manajerStage.locator('.stage-status')).toHaveText('Ditolak');
    await expect(manajerStage.locator('.stage-detail')).toContainText('Andi');
    await expect(manajerStage.getByTestId('stage-reason')).toHaveText(reason);
    await expect(manajerStage.getByTestId('stage-awaiting-revision')).toHaveText('Menunggu revisi Safety Officer');
    await expect(stageBlock(detail, 'Koordinator K3L Bagian').locator('.stage-status')).toHaveText('Disetujui');
    expect(await detail.locator('.approval-stages').textContent()).not.toMatch(/[✅❌⏳]/u);
    await expect(detail.locator('[data-action="approveStage"], [data-action="rejectStage"], [data-action="openApprovalModal"]')).toHaveCount(0);

    // 3. "Revisi Inspeksi" membuka form inspeksi yang sudah ada, dengan permintaan revisinya.
    await info.getByTestId('detail-revise-btn').click();
    await expect(detail).not.toHaveClass(/show/);
    await expect(page.locator('#panel-form')).toHaveClass(/active/);
    await expect(page.locator('#inspeksiFormTitle')).toHaveText(`Revisi ${inspection.id}`);
    const notice = page.locator('#revisionNotice');
    await expect(notice.getByTestId('revision-reason')).toHaveText(reason);
    await expect(notice.getByTestId('revision-next')).toContainText('Simpan & Ajukan Ulang');
    await expect(notice.getByTestId('detail-revise-btn')).toHaveCount(0);
    await page.locator('#formKeteranganLokasi').fill(`${inspection.tag} direvisi`);
    await page.getByRole('button', { name: 'Simpan & Ajukan Ulang' }).click();
    await expect(page.locator('#toastMessage')).toContainText('diajukan ulang ke Manajer Bagian', { timeout: 15_000 });

    // 4. Kembali ke tahap yang menolak; riwayat lama & tindakan perbaikan tidak berubah.
    const resubmitted = await fetchAs(arif, inspection.id);
    expect(resubmitted.status).toBe('in_review');
    expect(resubmitted.currentApprovalStage).toBe('manajer');
    expect(resubmitted.keteranganLokasi).toBe(`${inspection.tag} direvisi`);
    expect(historyOf(resubmitted)).toEqual([['koordinator_k3l', 1, 'approved', null], ['manajer', 1, 'rejected', reason]]);
    expect(resubmitted.perbaikan.map((entry) => [entry.id, entry.status])).toEqual(actionsBefore);

    await goToTab(page, 'Dashboard');
    row = await recentRow(page, inspection.id);
    await expect(row.getByTestId('recent-status-detail')).toHaveText('Menunggu Manajer Bagian');
    await expect(row.getByTestId('recent-revise-btn')).toHaveCount(0);

    // 5. Manajer yang menolak memutuskan lagi; attempt lama tetap tampil + attempt berikutnya menunggu.
    const managerPage = await newIsolatedPage(browser);
    await loginViaUi(managerPage, 'andi');
    const managerRow = await recentRow(managerPage, inspection.id);
    await expect(managerRow.getByTestId('recent-revise-btn')).toHaveCount(0);
    await managerRow.getByTestId('recent-approval-btn').click();
    const stage = stageBlock(managerPage.locator('#approvalContent'), 'Manajer Bagian');
    await expect(stage.getByRole('button', { name: /Setujui/ })).toBeVisible();
    await expect(stage.getByRole('button', { name: /Tolak/ })).toBeVisible();
    const attempts = stage.getByTestId('stage-attempt');
    await expect(attempts).toHaveCount(1);
    await expect(attempts.first()).toHaveAttribute('data-decision', 'rejected');
    await expect(attempts.first()).toContainText('Percobaan 1');
    await expect(attempts.first().getByTestId('stage-reason')).toHaveText(reason);
    await expect(stage.getByTestId('stage-attempt-pending')).toHaveText(/Percobaan 2\s+Menunggu persetujuan Manajer Bagian/);
    await managerPage.close();

    await approveViaApi(andi, inspection.id, 'manajer');
    const approved = await fetchAs(arif, inspection.id);
    expect(approved.currentApprovalStage).toBe('ketua_p2k3');
    expect(historyOf(approved)).toEqual([
        ['koordinator_k3l', 1, 'approved', null], ['manajer', 1, 'rejected', reason], ['manajer', 2, 'approved', null],
    ]);
    for (const session of [arif, dewi, andi]) await session.context.dispose();
});

test('ditolak Ketua: pengguna selain pemilik hanya melihat informasi revisi (tanpa tombol Revisi); diajukan ulang -> kembali ke Ketua, bukan Koordinator', async ({ page }) => {
    const arif = await apiLogin('arif');
    const reason = `Lengkapi tanggal pemasangan APAR ${Date.now()}`;
    const inspection = await createInspectionFixture(arif);
    for (const [username, stage] of [['dewi', 'koordinator_k3l'], ['andi', 'manajer']]) {
        const session = await apiLogin(username);
        await approveViaApi(session, inspection.id, stage);
        await session.context.dispose();
    }
    const hadi = await apiLogin('hadi');
    await rejectViaApi(hadi, inspection.id, 'ketua_p2k3', reason);

    // Peninjau yang pernah menyetujui (Koordinator plant-nya, Manajer) dan Admin tetap melihat — hanya informasi.
    for (const username of ['dewi', 'andi', 'admin']) {
        await loginViaUi(page, username);
        const row = await recentRow(page, inspection.id);
        await expect(row.getByTestId('recent-status'), username).toHaveText('Perlu Revisi');
        await expect(row.getByTestId('recent-revise-btn'), username).toHaveCount(0);
        await expect(row.getByTestId('recent-approval-btn'), username).toHaveCount(0);
        await row.getByTestId('row-detail-btn').click();
        const info = page.locator('#detailModal').getByTestId('revision-info');
        await expect(info.getByTestId('revision-requested-by'), username).toHaveText('Ketua P2K3 · Hadi');
        await expect(info.getByTestId('revision-reason'), username).toHaveText(reason);
        await expect(info.getByTestId('revision-next'), username).toHaveText('Menunggu revisi dari Safety Officer. Setelah diajukan ulang, inspeksi kembali ke Ketua P2K3.');
        await expect(page.locator('#detailModal [data-action]:not([data-action="openLightbox"])'), `${username}: tanpa aksi`).toHaveCount(0);
        await page.locator('#closeDetailModal').click();
        await logout(page);
    }

    // Di luar cakupan tetap tidak melihat (visibilitas tidak berubah).
    for (const username of ['tulus', 'rina']) {
        await loginViaUi(page, username);
        await expectNotVisible(page, inspection.id);
        await logout(page);
    }

    const resubmit = await arif.context.post(`${API}/inspections/${inspection.id}/submit`, { headers: { 'X-CSRF-Token': arif.csrfToken } });
    expect(resubmit.status(), await resubmit.text()).toBe(200);
    const resubmitted = await fetchAs(arif, inspection.id);
    expect([resubmitted.status, resubmitted.currentApprovalStage]).toEqual(['in_review', 'ketua_p2k3']);
    expect(historyOf(resubmitted).map(([stage, attempt, decision]) => [stage, attempt, decision])).toEqual([
        ['koordinator_k3l', 1, 'approved'], ['manajer', 1, 'approved'], ['ketua_p2k3', 1, 'rejected'],
    ]);

    await loginViaUi(page, 'hadi');
    const row = await recentRow(page, inspection.id);
    await expect(row.getByTestId('recent-approval-btn')).toHaveCount(1);
    for (const session of [arif, hadi]) await session.context.dispose();
});
