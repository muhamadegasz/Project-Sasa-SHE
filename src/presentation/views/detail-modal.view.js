/* detail-modal.view.js — modal detail inspeksi (read-only).
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 8).
 */

import { escapeHtml, jsArg } from '../../shared/html.js';
import { isOverdue } from '../../shared/date.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import { bindModalClose, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { renderApprovalStages } from './approval.view.js';

export async function openDetailModal(id) {
    const item = await inspectionRepository.findById(id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    const content = document.getElementById('detailContent');

    const statusMap = { 'selesai': 'Selesai', 'proses': 'Proses', 'tinjau': 'Tinjau' };

    const temuanHtml = item.temuan && item.temuan.length > 0 ?
        item.temuan.map(t =>
            `<li><span>${escapeHtml(t.deskripsi)}</span><span class="temuan-kategori">${escapeHtml(t.kategori)}</span></li>`
        ).join('') :
        '<li style="color:#8a6a6a;">Tidak ada temuan</li>';

    const allPhotos = [...(item.fotoDekat || []), ...(item.fotoJauh || [])];
    const galleryHtml = allPhotos.length > 0 ?
        allPhotos.map((photo, idx) =>
                `<div class="gallery-item" data-action="openLightbox" data-images="${jsArg(allPhotos)}" data-index="${idx}" title="Klik untuk preview">
                    <span class="preview-icon">📷</span>
                    <span class="file-name">${escapeHtml(photo.originalName)}</span>
                </div>`
            ).join('') :
        '<div style="color:#8a6a6a;font-size:0.8rem;">Tidak ada foto</div>';

    const overdueBadge = isOverdue(item.dueDate) ?
        `<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>` :
        '';

    content.innerHTML = `
            <div class="detail-container">
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-hashtag"></i> ID Inspeksi</span>
                        <span class="value" style="color:#b31b1b;font-weight:700;">${escapeHtml(item.id)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-map-marker-alt"></i> Status</span>
                        <span class="value"><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(statusMap[item.status] || item.status)}</span></span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-building"></i> Lokasi / Plant</span>
                        <span class="value">${escapeHtml(item.lokasi)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-tag"></i> Keterangan Lokasi</span>
                        <span class="value">${escapeHtml(item.keteranganLokasi || '-')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-calendar-day"></i> Tanggal Inspeksi</span>
                        <span class="value">${escapeHtml(item.tanggal)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-user"></i> Safety Officer</span>
                        <span class="value">${escapeHtml(item.petugas)}</span>
                    </div>
                    <div class="detail-item" style="grid-column:1/3;">
                        <span class="label"><i class="fas fa-clock"></i> Due Date ke Plant</span>
                        <span class="value">${escapeHtml(item.dueDate || '-')} ${overdueBadge}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-list"></i> Temuan (${item.temuan ? item.temuan.length : 0})</div>
                    <ul class="temuan-list-detail">${temuanHtml}</ul>
                    ${item.temuan && item.temuan.length > 0 ? `
                        <div style="margin-top:0.5rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
                            <button class="btn-export-temuan" data-action="exportTemuanPerItem" data-id="${escapeHtml(item.id)}">
                                <i class="fas fa-file-excel"></i> Export Temuan
                            </button>
                        </div>
                    ` : ''}
                </div>

                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-images"></i> Dokumentasi Foto</div>
                    <div class="detail-gallery">${galleryHtml}</div>
                    <div style="font-size:0.65rem;color:#8a6a6a;margin-top:0.3rem;">Klik gambar untuk preview</div>
                </div>

                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-stamp"></i> Pengesahan (4 Tahap)</div>
                    ${renderApprovalStages(item)}
                    <div style="margin-top:0.5rem;">
                        <button class="btn-sm primary" data-action="openApprovalModal" data-id="${escapeHtml(item.id)}"><i class="fas fa-stamp"></i> Kelola Pengesahan</button>
                    </div>
                </div>
            </div>
        `;
    openModal('detailModal');
}

bindModalClose('detailModal', 'closeDetailModal');
