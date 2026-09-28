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
import { isStageApproved, latestDecision, totalStages } from '../../domain/approval-rules.js';
import { isAwaitingStage } from '../../domain/workflow-rules.js';
import { INSPECTION_STATUS } from '../../domain/statuses.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import { signatureUrl } from '../../infrastructure/api-client.js';
import { bindModalClose, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

/**
 * Watermark tersimpan (Phase 17.4D) di atas gambar tanda tangan, di posisi
 * tengah yang sama dengan pratinjau saat menyetujui. Teks tetap dari sistem;
 * dari server hanya angka posisi, dipaksa ke 0..1.
 */
function renderStageWatermark(watermark) {
    if (!watermark) return '';
    const percent = (value) => Math.min(Math.max(Number(value) || 0, 0), 1) * 100;
    return `<svg class="signature-watermark" data-testid="stage-watermark" viewBox="0 0 120 28" aria-hidden="true" style="left:${percent(watermark.x)}%;top:${percent(watermark.y)}%"><rect x="2" y="2" width="116" height="24" rx="6"/><text x="60" y="20">SHE Sasa</text></svg>`;
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

export function renderApprovalStages(item) {
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
