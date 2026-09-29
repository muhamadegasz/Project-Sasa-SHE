/* revision-info.js — informasi "Perlu Revisi" untuk inspeksi REVISION_REQUIRED.
 *
 * Dipakai modal Detail dan form revisi. Hanya MEMBACA data yang sudah ada:
 * penolakan terakhir tahap yang sedang berjalan (item.approvalHistory,
 * append-only) — tahap itu juga tahap tujuan pengajuan ulang
 * (workflow-rules.js submittedState). Tidak ada aturan baru di sini; siapa
 * yang boleh merevisi ditentukan pemanggil lewat canRevise().
 *
 * Revisi inspeksi (alur pengesahan) BUKAN tindakan perbaikan temuan
 * (corrective action) — berkas ini tidak menyentuh yang kedua.
 */

import { escapeHtml } from '../../shared/html.js';
import { formatDate } from '../../shared/date.js';
import { findStage, latestDecision } from '../../domain/approval-rules.js';
import { APPROVAL_DECISION, INSPECTION_STATUS } from '../../domain/statuses.js';

/**
 * Permintaan revisi yang sedang berlaku, atau null bila inspeksi tidak
 * berstatus REVISION_REQUIRED. Field yang tidak tersedia (data lama) null.
 */
export function revisionRequest(item) {
    if (!item || item.status !== INSPECTION_STATUS.REVISION_REQUIRED) return null;
    const stage = findStage(item.currentApprovalStage);
    const latest = latestDecision(item, item.currentApprovalStage);
    const rejection = latest && latest.decision === APPROVAL_DECISION.REJECTED ? latest : null;
    return {
        stageTitle: stage ? stage.title : null,
        reviewerName: rejection ? rejection.reviewerName || null : null,
        decidedAt: rejection ? rejection.decidedAt || null : null,
        reason: rejection ? rejection.rejectionReason || null : null,
    };
}

const NEXT_STEP = {
    owner: (stage) => `Perbaiki inspeksi sesuai alasan revisi, lalu ajukan ulang. Inspeksi akan kembali ke ${stage}.`,
    form: (stage) => `Perbaiki isi inspeksi sesuai alasan revisi, lalu pilih Simpan & Ajukan Ulang. Inspeksi akan kembali ke ${stage}.`,
    viewer: (stage) => `Menunggu revisi dari Safety Officer. Setelah diajukan ulang, inspeksi kembali ke ${stage}.`,
};

/**
 * Blok "Perlu Revisi": diminta oleh, tanggal, alasan, langkah berikutnya.
 *
 * `mode`: 'owner' (Safety Officer pemilik, di Detail — dengan tombol Revisi
 * Inspeksi), 'form' (di atas form revisi, tanpa tombol), atau 'viewer'
 * (pengguna lain — hanya informasi). String kosong bila tidak perlu revisi.
 */
export function renderRevisionInfo(item, mode = 'viewer') {
    const request = revisionRequest(item);
    if (!request) return '';
    const stage = request.stageTitle || 'tahap yang menolak';
    const requestedBy = [request.stageTitle, request.reviewerName].filter(Boolean).join(' · ') || '-';
    const next = (NEXT_STEP[mode] || NEXT_STEP.viewer)(stage);
    const action = mode === 'owner'
        ? `<button type="button" class="btn-sm primary revision-info-action" data-action="editInspeksi" data-id="${escapeHtml(item.id)}" data-testid="detail-revise-btn"><i class="fas fa-pen"></i> Revisi Inspeksi</button>`
        : '';
    return `
        <section class="revision-info" data-testid="revision-info">
            <h4 class="revision-info-title">Perlu Revisi</h4>
            <dl class="revision-info-fields">
                <div>
                    <dt>Diminta oleh</dt>
                    <dd data-testid="revision-requested-by">${escapeHtml(requestedBy)}</dd>
                </div>
                <div>
                    <dt>Tanggal</dt>
                    <dd data-testid="revision-date">${escapeHtml(formatDate(request.decidedAt))}</dd>
                </div>
                <div class="revision-info-reason">
                    <dt>Alasan Revisi</dt>
                    <dd data-testid="revision-reason">${escapeHtml(request.reason || '-')}</dd>
                </div>
            </dl>
            <p class="revision-info-next" data-testid="revision-next">${escapeHtml(next)}</p>
            ${action}
        </section>`;
}
