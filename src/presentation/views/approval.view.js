/* approval.view.js — daftar tahap pengesahan dan modal kelola pengesahan.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 8). `approveStage`/`rejectStage`
 * (memanggil service, lalu membuka ulang modal ini) TETAP di legacy-app.js —
 * itu controller, bukan view; lihat docs/DECISIONS.md K-12.
 */

import { escapeHtml } from '../../shared/html.js';
import { APPROVAL_STAGES } from '../../config/constants.js';
import { canApproveStage } from '../../domain/approval-rules.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import { bindModalClose, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

export function renderApprovalStages(item) {
    const approvals = item.approvals || {};

    return `
        <div class="approval-stages">
            ${APPROVAL_STAGES.map((stage) => {
                const approval = approvals[stage.id] || { approved: false, by: null, jabatan: stage.title, tanggal: null };
                const isCompleted = approval.approved === true;
                const isCurrent = canApproveStage(item, stage);

                let statusClass = 'waiting';
                let statusText = 'Menunggu';
                let actionHtml = '';

                if (isCompleted) {
                    statusClass = 'done';
                    statusText = '✅ Disetujui';
                } else if (isCurrent) {
                    statusClass = 'in-progress';
                    statusText = '⏳ Menunggu Persetujuan';
                    actionHtml = `
                        <button class="stage-action-btn approve" data-action="approveStage" data-id="${escapeHtml(item.id)}" data-stage="${stage.id}">
                            <i class="fas fa-check"></i> Setujui
                        </button>
                        <button class="stage-action-btn reject" data-action="rejectStage" data-id="${escapeHtml(item.id)}" data-stage="${stage.id}">
                            <i class="fas fa-times"></i> Tolak
                        </button>
                    `;
                } else {
                    statusClass = 'waiting';
                    statusText = '⏳ Menunggu';
                }

                const stageClass = isCompleted ? 'completed' : (isCurrent ? 'current' : 'pending');

                return `
                    <div class="approval-stage ${stageClass}">
                        <div class="stage-number">${stage.order}</div>
                        <div class="stage-info">
                            <div class="stage-title">${escapeHtml(stage.title)}</div>
                            <div class="stage-detail">
                                ${isCompleted ? `${escapeHtml(approval.by)} · ${escapeHtml(approval.tanggal)}` : (isCurrent ? 'Menunggu persetujuan' : 'Belum mencapai tahap ini')}
                            </div>
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
                    <span class="value"><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></span>
                </div>
            </div>

            <div class="detail-section">
                <div class="section-title"><i class="fas fa-stamp"></i> Tahap Pengesahan (4 Tahap)</div>
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
