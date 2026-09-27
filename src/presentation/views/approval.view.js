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
 */

import { escapeHtml } from '../../shared/html.js';
import { formatDate } from '../../shared/date.js';
import { formatInspectionStatus } from '../../shared/labels.js';
import { APPROVAL_STAGES } from '../../config/constants.js';
import { isStageApproved, latestDecision, totalStages } from '../../domain/approval-rules.js';
import { isAwaitingStage } from '../../domain/workflow-rules.js';
import { INSPECTION_STATUS } from '../../domain/statuses.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import { bindModalClose, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

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

                if (isCompleted) {
                    statusClass = 'done';
                    statusText = '✅ Disetujui';
                    detail = `${escapeHtml(latest.reviewerName || '-')} · ${escapeHtml(formatDate(latest.decidedAt))}`;
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
