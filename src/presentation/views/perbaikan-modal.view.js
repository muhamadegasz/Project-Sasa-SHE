/* perbaikan-modal.view.js — modal timeline & form tambah progres perbaikan.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 8). `tambahPerbaikanCustom`
 * (baca form ini, panggil service, buka ulang modal) TETAP di legacy-app.js —
 * itu controller, bukan view; lihat docs/DECISIONS.md K-12.
 */

import { escapeHtml, jsArg } from '../../shared/html.js';
import { isOverdue } from '../../shared/date.js';
import { getProgress, getRepairStatus } from '../../domain/inspection-rules.js';
import { isFullyApproved } from '../../domain/approval-rules.js';
import { formatApprovalStatus } from '../../shared/labels.js';
import { getRandomOfficer } from '../../data/officers.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import { bindModalClose } from '../components/modal.js';
import { showToast } from '../components/toast.js';

export function openPerbaikanModal(id) {
    const item = inspectionRepository.findById(id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    const modal = document.getElementById('perbaikanModal');
    const content = document.getElementById('modalContent');

    const progress = getProgress(item);
    const statusPerbaikan = getRepairStatus(item);

    const statusMap = {
        'closed': '✅ Closed',
        'on-progress': '🔄 On Progress',
        'open': '⏳ Open'
    };

    let timelineHtml = '';
    if (item.perbaikan && item.perbaikan.length > 0) {
        timelineHtml = item.perbaikan.map(p => {
            const fotoList = p.foto && p.foto.length > 0 ? p.foto : [];
            const galleryHtml = fotoList.length > 0 ?
                fotoList.map(f => `
                    <div class="thumb-mini" data-action="openLightbox" data-images="${jsArg(fotoList)}" data-index="${fotoList.indexOf(f)}" title="${escapeHtml(f)}">
                        📷
                    </div>
                `).join('') :
                '<span style="font-size:0.6rem;color:#c62828;">⚠️ Belum ada foto</span>';
            return `
                    <div class="perbaikan-item">
                        <span class="date">${escapeHtml(p.tgl)}</span>
                        <span class="action">${escapeHtml(p.action)}</span>
                        <span class="status-mini ${escapeHtml(p.status)}">${escapeHtml(statusMap[p.status] || p.status)}</span>
                        <span class="pic-name">- ${escapeHtml(p.pic)}</span>
                        <div class="foto-thumbs">${galleryHtml}</div>
                    </div>
                `;
        }).join('');
    } else {
        timelineHtml = '<div style="padding:0.8rem;color:#8a6a6a;text-align:center;">Belum ada tindakan perbaikan</div>';
    }

    const statusPerbaikanMap = {
        'selesai_perbaikan': 'Closed',
        'perbaikan': 'On Progress',
        'tinjau': 'Open'
    };

    const allApproved = isFullyApproved(item);

    content.innerHTML = `
            <div class="perbaikan-info-box">
                <div class="info-row">
                    <span class="label">ID Inspeksi</span>
                    <span class="value"><strong>${escapeHtml(item.id)}</strong></span>
                </div>
                <div class="info-row">
                    <span class="label">Lokasi / Plant</span>
                    <span class="value">${escapeHtml(item.lokasi)}</span>
                </div>
                <div class="info-row">
                    <span class="label">Due Date Plant</span>
                    <span class="value">${escapeHtml(item.dueDate || '-')} ${isOverdue(item.dueDate) ? '<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>' : ''}</span>
                </div>
                <div class="info-row">
                    <span class="label">Status</span>
                    <span class="value"><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></span>
                </div>
                <div class="info-row" style="margin-top:0.3rem;padding-top:0.5rem;border-top:2px solid #f0e0e0;">
                    <span class="label">Pengesahan</span>
                    <span class="value">
                        <span class="status-badge ${allApproved ? 'selesai' : 'proses'}">
                            ${allApproved ? '✅ Lengkap (4/4)' : formatApprovalStatus(item)}
                        </span>
                        ${!allApproved ? `<button class="btn-sm info" data-action="openApprovalModal" data-id="${escapeHtml(item.id)}" style="margin-left:0.3rem;font-size:0.55rem;"><i class="fas fa-stamp"></i></button>` : ''}
                    </span>
                </div>
                <div class="info-row">
                    <span class="label">Progres Perbaikan</span>
                    <span class="value">
                        <div class="progress-wrapper" style="min-width:150px;">
                            <div class="progress-bar-container" style="flex:1;">
                                <div class="progress-fill ${statusPerbaikan}" style="width:${progress}%"></div>
                            </div>
                            <span class="progress-text">${progress}%</span>
                            <span class="status-badge ${statusPerbaikan}" style="font-size:0.6rem;">${statusPerbaikanMap[statusPerbaikan] || statusPerbaikan}</span>
                        </div>
                    </span>
                </div>
            </div>

            <h4 style="color:#7a3a3a;font-size:0.9rem;margin-bottom:0.8rem;"><i class="fas fa-history"></i> Timeline Perbaikan</h4>
            <div class="perbaikan-timeline">
                ${timelineHtml}
            </div>

            <div class="perbaikan-form-section">
                <h5><i class="fas fa-camera"></i> Tambah Progres</h5>
                <div class="form-group">
                    <label>Tindakan <span style="color:#c62828;">*</span></label>
                    <input type="text" id="newAction" placeholder="Deskripsi tindakan...">
                </div>
                <div class="form-row" style="grid-template-columns:1fr 1fr;">
                    <div class="form-group">
                        <label>Status <span style="color:#c62828;">*</span></label>
                        <select id="newStatus">
                            <option value="on-progress">🔄 On Progress</option>
                            <option value="closed">✅ Closed</option>
                            <option value="open">⏳ Open</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>PIC <span style="color:#c62828;">*</span></label>
                        <input type="text" id="newPIC" placeholder="Nama PIC" value="${escapeHtml(getRandomOfficer())}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Foto Perbaikan <span style="color:#c62828;">*</span></label>
                    <div class="file-input-wrapper">
                        <input type="file" id="newFoto" accept="image/*" multiple>
                        <span class="file-count" id="newFotoCount">Belum ada file</span>
                    </div>
                </div>
                <button class="btn-sm primary" data-action="tambahPerbaikanCustom" data-id="${escapeHtml(item.id)}" style="margin-top:0.5rem;padding:0.5rem 1.5rem;">
                    <i class="fas fa-plus"></i> Tambah Progres
                </button>
            </div>
        `;

    document.getElementById('newFoto').addEventListener('change', function() {
        const count = this.files.length;
        document.getElementById('newFotoCount').textContent = count > 0 ? `${count} file dipilih` : 'Belum ada file';
    });

    modal.classList.add('show');
}

bindModalClose('perbaikanModal', 'closePerbaikanModal');
