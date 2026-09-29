/* approval.view.js — daftar tahap pengesahan dan modal kelola pengesahan.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 8). `approveStage`/`rejectStage`
 * (memanggil service, lalu membuka ulang modal ini) TETAP di legacy-app.js —
 * itu controller, bukan view; lihat docs/DECISIONS.md K-12.
 *
 * Phase 17.2: tiga tahap, dibaca dari riwayat append-only
 * (item.approvalHistory) dan tahap berjalan (item.currentApprovalStage).
 * Tombol aksi tetap hanya muncul di tahap yang sedang menunggu, untuk siapa
 * pun — penyembunyian berdasar role adalah UI Phase 17.3; wewenangnya sudah
 * ditegakkan approval-service + server (domain/inspection-policy.js).
 *
 * Phase 17.4B: tahap yang disetujui menampilkan gambar tanda tangannya lewat
 * endpoint API terotorisasi (signatureUrl), atau keterangan bila persetujuan
 * lama tidak bertanda tangan.
 */

import { escapeHtml } from '../../shared/html.js';
import { formatDate } from '../../shared/date.js';
import { formatInspectionStatus } from '../../shared/labels.js';
import { APPROVAL_STAGES } from '../../config/constants.js';
import { isStageApproved, latestDecision, stageDecisions, totalStages } from '../../domain/approval-rules.js';
import { isAwaitingStage } from '../../domain/workflow-rules.js';
import { APPROVAL_DECISION, INSPECTION_STATUS } from '../../domain/statuses.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import { signatureUrl } from '../../infrastructure/api-client.js';
import { getCurrentUser } from '../../infrastructure/session.js';
import { canApprove, canReject } from '../../domain/inspection-policy.js';
import { bindModalClose, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { WATERMARK_LOGO_URL } from '../components/watermark.js';

/**
 * Watermark tersimpan (Phase 17.4D) di atas gambar tanda tangan, di posisi
 * tengah yang sama dengan pratinjau saat menyetujui. Gambarnya logo perusahaan
 * (aset lokal, components/watermark.js); dari server hanya angka posisi,
 * dipaksa ke 0..1.
 */
function renderStageWatermark(watermark) {
    if (!watermark) return '';
    const percent = (value) => Math.min(Math.max(Number(value) || 0, 0), 1) * 100;
    return `<img class="signature-watermark" data-testid="stage-watermark" style="left:${percent(watermark.x)}%;top:${percent(watermark.y)}%" src="${escapeHtml(WATERMARK_LOGO_URL)}" alt="" aria-hidden="true" draggable="false">`;
}

/** Tanda tangan sebuah persetujuan: gambar dari API (tautan membuka ukuran penuh), atau keterangan data lama. */
function renderStageSignature(item, decision) {
    if (!decision.hasSignature || decision.id == null) {
        return '<span class="stage-signature-note">Tanpa tanda tangan (data lama)</span>';
    }
    const url = escapeHtml(signatureUrl(item.id, decision.id));
    return `
        <a class="stage-signature" href="${url}" target="_blank" rel="noopener noreferrer" data-testid="stage-signature" title="Buka tanda tangan">
            <img src="${url}" alt="Tanda tangan ${escapeHtml(decision.reviewerName || '')}" loading="lazy">${renderStageWatermark(decision.watermark)}
        </a>`;
}

/**
 * Release: seluruh attempt satu tahap, urut attempt (riwayat append-only).
 * Ditampilkan bila tahap punya keputusan yang BELUM terwakili ringkasan
 * kartunya — mis. ditolak lalu disetujui pada attempt berikutnya, atau
 * ditolak lalu diajukan ulang dan kini menunggu lagi (penolakan itu dulu
 * tidak terlihat sama sekali). Tahap dengan satu keputusan yang sudah
 * diringkas kartu tidak diulang. Hanya membaca item.approvalHistory.
 */
function renderStageHistory(item, stage, summarizedLatest) {
    const decisions = stageDecisions(item, stage.id);
    if (decisions.length <= (summarizedLatest ? 1 : 0)) return '';
    const attempts = decisions.map((decision) => {
        const approved = decision.decision === APPROVAL_DECISION.APPROVED;
        const reason = !approved
            ? `<div class="stage-attempt-reason">Alasan: ${escapeHtml(decision.rejectionReason || '-')}</div>`
            : '';
        return `
            <li class="stage-attempt ${approved ? 'approved' : 'rejected'}" data-testid="stage-attempt" data-decision="${escapeHtml(decision.decision)}">
                <span class="stage-attempt-round">Percobaan ${escapeHtml(decision.attempt)}</span>
                ${approved ? '✅ Disetujui' : '❌ Ditolak'} · ${escapeHtml(decision.reviewerName || '-')} · ${escapeHtml(formatDate(decision.decidedAt))}
                ${reason}
            </li>`;
    }).join('');
    return `<ol class="stage-history" data-testid="stage-history" aria-label="Riwayat ${escapeHtml(stage.title)}">${attempts}</ol>`;
}

/**
 * Release: apakah `user` boleh memutuskan tahap yang sedang berjalan — aturan
 * domain yang sama dengan server (role + tahap + plant Koordinator). Hanya
 * menentukan TAMPILAN; server tetap otoritatif.
 */
export function canDecideCurrentStage(user, item) {
    return canApprove(user, item) || canReject(user, item);
}

/**
 * `user` (bawaan: pengguna login) menentukan apakah tombol Setujui/Tolak
 * dirender. Selain peninjau yang berwenang atas tahap yang sedang berjalan —
 * termasuk Safety Officer pembuat inspeksi, yang BUKAN tahap pengesahan —
 * tahap itu tampil hanya-baca.
 */
export function renderApprovalStages(item, user = getCurrentUser()) {
    return `
        <div class="approval-stages">
            ${APPROVAL_STAGES.map((stage) => {
                const latest = latestDecision(item, stage.id);
                const isAwaiting = isAwaitingStage(item, stage.id);
                const isRejectedAwaitingRevision = item.status === INSPECTION_STATUS.REVISION_REQUIRED
                    && item.currentApprovalStage === stage.id;
                const isCompleted = !isAwaiting && !isRejectedAwaitingRevision && isStageApproved(item, stage.id);

                let statusClass = 'waiting';
                let statusText = '⏳ Menunggu';
                let detail = 'Belum mencapai tahap ini';
                let actionHtml = '';
                let signatureHtml = '';

                if (isCompleted) {
                    statusClass = 'done';
                    statusText = '✅ Disetujui';
                    detail = `${escapeHtml(latest.reviewerName || '-')} · ${escapeHtml(formatDate(latest.decidedAt))}`;
                    signatureHtml = renderStageSignature(item, latest);
                } else if (isRejectedAwaitingRevision) {
                    statusText = '❌ Ditolak';
                    detail = `${escapeHtml(latest.reviewerName || '-')}: ${escapeHtml(latest.rejectionReason || '-')} · menunggu revisi Safety Officer`;
                } else if (isAwaiting && !canDecideCurrentStage(user, item)) {
                    // Release: hanya informasi — tanpa tombol aksi untuk yang tidak berwenang.
                    statusClass = 'in-progress';
                    statusText = '⏳ Menunggu Persetujuan';
                    detail = `Menunggu persetujuan ${escapeHtml(stage.title)}
                        <span class="stage-readonly-note" data-testid="stage-readonly"><i class="fas fa-eye"></i> Hanya informasi — keputusan diambil oleh ${escapeHtml(stage.title)}</span>`;
                } else if (isAwaiting) {
                    statusClass = 'in-progress';
                    statusText = '⏳ Menunggu Persetujuan';
                    detail = 'Menunggu persetujuan';
                    actionHtml = `
                        <button class="stage-action-btn approve" data-action="approveStage" data-id="${escapeHtml(item.id)}" data-stage="${escapeHtml(stage.id)}">
                            <i class="fas fa-check"></i> Setujui
                        </button>
                        <button class="stage-action-btn reject" data-action="rejectStage" data-id="${escapeHtml(item.id)}" data-stage="${escapeHtml(stage.id)}">
                            <i class="fas fa-times"></i> Tolak
                        </button>
                    `;
                }

                const stageClass = isCompleted ? 'completed' : (isAwaiting ? 'current' : 'pending');

                return `
                    <div class="approval-stage ${stageClass}">
                        <div class="stage-number">${stage.order}</div>
                        <div class="stage-info">
                            <div class="stage-title">${escapeHtml(stage.title)}</div>
                            <div class="stage-detail">${detail}</div>
                            ${signatureHtml}
                            ${renderStageHistory(item, stage, isCompleted || isRejectedAwaitingRevision)}
                        </div>
                        <span class="stage-status ${statusClass}">${statusText}</span>
                        ${actionHtml}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

export async function openApprovalModal(inspeksiId) {
    const item = await inspectionRepository.findById(inspeksiId);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }

    const content = document.getElementById('approvalContent');
    // Release: judul mengikuti peran — hanya peninjau yang berwenang atas
    // tahap berjalan yang melihat "Pengesahan"; yang lain melihat status.
    document.getElementById('approvalModalTitleText').textContent = canDecideCurrentStage(getCurrentUser(), item)
        ? 'Pengesahan Inspeksi'
        : 'Status Persetujuan Inspeksi';

    content.innerHTML = `
        <div class="detail-container">
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="label">ID Inspeksi</span>
                    <span class="value" style="color:#b31b1b;font-weight:700;">${escapeHtml(item.id)}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Lokasi / Plant</span>
                    <span class="value">${escapeHtml(item.lokasi)}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Safety Officer</span>
                    <span class="value">${escapeHtml(item.petugas)}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Status</span>
                    <span class="value"><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(formatInspectionStatus(item.status))}</span></span>
                </div>
            </div>

            <div class="detail-section">
                <div class="section-title"><i class="fas fa-stamp"></i> Tahap Pengesahan (${totalStages()} Tahap)</div>
                ${renderApprovalStages(item)}
            </div>

            ${item.temuan && item.temuan.length > 0 ? `
                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-list"></i> Daftar Temuan</div>
                    <ul class="temuan-list-detail">
                        ${item.temuan.map(t => `<li><span>${escapeHtml(t.deskripsi)}</span><span class="temuan-kategori">${escapeHtml(t.kategori)}</span></li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;

    openModal('approvalModal');
}

bindModalClose('approvalModal', 'closeApprovalModal');
