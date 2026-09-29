/* detail-modal.view.js — modal detail inspeksi (read-only).
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 8). Detail = melihat informasi:
 * tanpa tombol aksi (pengesahan & ekspor dilakukan lewat tombol di tabel);
 * tahap pengesahan tampil lengkap tapi hanya-baca. Satu-satunya pengecualian:
 * inspeksi Perlu Revisi menampilkan permintaan revisinya, dan HANYA Safety
 * Officer pemiliknya (canRevise) mendapat tombol "Revisi Inspeksi".
 */

import { escapeHtml, jsArg } from '../../shared/html.js';
import { isOverdue } from '../../shared/date.js';
import { photoUrl } from '../../infrastructure/api-client.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import { bindModalClose, openModal } from '../components/modal.js';
import { overdueIndicator } from '../components/overdue-indicator.js';
import { documentationPhotos } from '../components/documentation-photos.js';
import { renderRevisionInfo } from '../components/revision-info.js';
import { getCurrentUser } from '../../infrastructure/session.js';
import { canRevise } from '../../domain/inspection-policy.js';
import { showToast } from '../components/toast.js';
import { renderApprovalStages } from './approval.view.js';
import { formatInspectionStatus } from '../../shared/labels.js';
import { totalStages } from '../../domain/approval-rules.js';

/**
 * Galeri foto sungguhan: gambar dimuat dari endpoint terotorisasi
 * (photoUrl — sesi + cakupan visibilitas inspeksi, bukan /uploads), utuh
 * (tanpa dipotong), klik membuka lightbox. Sebelumnya hanya ikon 📷 + nama.
 */
function renderGallery(photos) {
    if (photos.length === 0) return '<div style="color:#8a6a6a;font-size:0.8rem;">Tidak ada dokumentasi foto.</div>';
    const images = jsArg(photos.map(({ id, originalName }) => ({ id, originalName })));
    return photos.map((photo, index) => `
        <button type="button" class="gallery-item" data-action="openLightbox" data-images="${images}" data-index="${index}" data-testid="detail-photo" title="Buka ${escapeHtml(photo.originalName)}">
            <span class="gallery-thumb">
                <img src="${escapeHtml(photoUrl(photo.id))}" alt="${escapeHtml(`${photo.slot}: ${photo.originalName}`)}">
                <span class="gallery-missing">Gambar tidak dapat ditampilkan</span>
            </span>
            <span class="gallery-caption">
                <span class="gallery-slot">${escapeHtml(photo.slot)}</span>
                <span class="file-name">${escapeHtml(photo.originalName)}</span>
            </span>
        </button>`).join('');
}

/**
 * Gambar yang gagal dimuat (berkas tidak ada di server — mis. data seed tanpa
 * berkas — atau isinya tidak bisa ditampilkan) diberi keterangan, bukan ikon
 * gambar rusak. Nama berkas & lightbox tetap ada.
 */
function markUnavailablePhotos(container) {
    container.querySelectorAll('.detail-gallery img').forEach((img) => {
        const mark = () => {
            const item = img.closest('.gallery-item');
            item.classList.add('unavailable');
            item.disabled = true; // tidak ada yang bisa diperbesar
        };
        img.addEventListener('error', mark, { once: true });
        if (img.complete && img.naturalWidth === 0) mark();
    });
}

export async function openDetailModal(id) {
    const item = await inspectionRepository.findById(id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    const content = document.getElementById('detailContent');

    const temuanHtml = item.temuan && item.temuan.length > 0 ?
        item.temuan.map(t =>
            `<li><span>${escapeHtml(t.deskripsi)}</span><span class="temuan-kategori">${escapeHtml(t.kategori)}</span></li>`
        ).join('') :
        '<li style="color:#8a6a6a;">Tidak ada temuan</li>';

    const photos = documentationPhotos(item);
    const overdueBadge = isOverdue(item.dueDate) ? overdueIndicator() : '';

    content.innerHTML = `
            <div class="detail-container">
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-hashtag"></i> ID Inspeksi</span>
                        <span class="value" style="color:#b31b1b;font-weight:700;">${escapeHtml(item.id)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><i class="fas fa-map-marker-alt"></i> Status</span>
                        <span class="value"><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(formatInspectionStatus(item.status))}</span></span>
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

                ${renderRevisionInfo(item, canRevise(getCurrentUser(), item) ? 'owner' : 'viewer')}

                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-list"></i> Temuan (${item.temuan ? item.temuan.length : 0})</div>
                    <ul class="temuan-list-detail">${temuanHtml}</ul>
                </div>

                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-images"></i> Dokumentasi Foto (${photos.length})</div>
                    <div class="detail-gallery">${renderGallery(photos)}</div>
                    ${photos.length > 0 ? '<div style="font-size:0.7rem;color:#8a6a6a;margin-top:0.4rem;">Klik foto untuk memperbesar</div>' : ''}
                </div>

                <div class="detail-section">
                    <div class="section-title"><i class="fas fa-stamp"></i> Pengesahan (${totalStages()} Tahap)</div>
                    ${renderApprovalStages(item, undefined, { readOnly: true })}
                </div>
            </div>
        `;
    markUnavailablePhotos(content);
    openModal('detailModal');
}

bindModalClose('detailModal', 'closeDetailModal');
