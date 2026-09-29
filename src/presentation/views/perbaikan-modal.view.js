/* perbaikan-modal.view.js — modal daftar tindakan & form tambah progres perbaikan.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 8). `tambahPerbaikanCustom`
 * (baca form ini, panggil service, buka ulang modal) TETAP di legacy-app.js —
 * itu controller, bukan view; lihat docs/DECISIONS.md K-12.
 *
 * Tampilan operasional: informasi inspeksi (label–nilai), lalu tindakan
 * perbaikan sebagai tabel (baris label–nilai di layar sempit, 16-responsive.css).
 * Tanpa progress bar/persentase, pill metadata, atau ikon hiasan.
 */

import { escapeHtml, jsArg } from '../../shared/html.js';
import { isOverdue } from '../../shared/date.js';
import { nextActionStatuses } from '../../domain/inspection-rules.js';
import { formatActionStatus, formatInspectionStatus } from '../../shared/labels.js';
import { ACTION_STATUS } from '../../domain/statuses.js';
import { getRandomOfficer } from '../../data/officers.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import { bindModalClose, openModal } from '../components/modal.js';
import { overdueIndicator } from '../components/overdue-indicator.js';
import { canEditCorrectiveAction, isOwningOfficer } from '../../domain/inspection-policy.js';
import { getCurrentUser } from '../../infrastructure/session.js';
import { showToast } from '../components/toast.js';

/**
 * Foto satu tindakan: tautan teks "N foto" yang membuka lightbox (foto
 * sungguhan lewat endpoint terotorisasi), bukan kotak ikon per foto.
 */
function renderActionPhotos(photos) {
    if (!photos || photos.length === 0) return '<span class="perbaikan-muted">Belum ada foto</span>';
    const names = photos.map((photo) => photo.originalName).join(', ');
    return `<button type="button" class="perbaikan-photo-link" data-action="openLightbox" data-images="${jsArg(photos)}" data-index="0"
        data-testid="action-photos" title="${escapeHtml(names)}">${photos.length} foto</button>`;
}

export async function openPerbaikanModal(id) {
    const item = await inspectionRepository.findById(id);
    if (!item) { showToast('⚠️ Data tidak ditemukan'); return; }
    const content = document.getElementById('modalContent');

    // Release: pemilik bisa memajukan status tindakan yang sudah ada
    // (open -> on-progress -> closed, tanpa foto). Server tetap memeriksa ulang.
    // Tombol hanya dirender bila memang bisa dipakai pengguna ini.
    const canChangeStatus = canEditCorrectiveAction(getCurrentUser(), item);
    const statusButtons = (p) => {
        if (!canChangeStatus || p.id == null) return '';
        return nextActionStatuses(p.status).map((next) => `
            <button type="button" class="btn-sm outline perbaikan-status-btn" data-action="ubahStatusPerbaikan"
                data-id="${escapeHtml(item.id)}" data-action-id="${escapeHtml(p.id)}" data-status="${escapeHtml(next)}"
                data-testid="action-status-btn">Tandai ${escapeHtml(formatActionStatus(next))}</button>`).join('');
    };

    const actions = item.perbaikan || [];
    const closedCount = actions.filter((action) => action.status === ACTION_STATUS.CLOSED).length;
    const actionRows = actions.map((p) => `
                <tr data-testid="perbaikan-item" data-action-id="${escapeHtml(p.id ?? '')}">
                    <td class="col-date" data-label="Tanggal">${escapeHtml(p.tgl)}</td>
                    <td class="col-action" data-label="Tindakan">${escapeHtml(p.action)}</td>
                    <td data-label="PIC">${escapeHtml(p.pic)}</td>
                    <td data-label="Status"><span class="status-mini ${escapeHtml(p.status)}">${escapeHtml(formatActionStatus(p.status))}</span></td>
                    <td class="col-foto" data-label="Foto">${renderActionPhotos(p.foto)}</td>
                    ${canChangeStatus ? `<td class="col-aksi" data-label="Aksi"><span class="perbaikan-status-actions">${statusButtons(p) || '<span class="perbaikan-muted">-</span>'}</span></td>` : ''}
                </tr>`).join('');
    const actionsHtml = actions.length > 0
        ? `<table class="perbaikan-actions-table">
                <thead>
                    <tr><th>Tanggal</th><th>Tindakan</th><th>PIC</th><th>Status</th><th>Foto</th>${canChangeStatus ? '<th>Aksi</th>' : ''}</tr>
                </thead>
                <tbody>${actionRows}</tbody>
            </table>`
        : '<p class="perbaikan-muted perbaikan-empty">Belum ada tindakan perbaikan.</p>';

    // Phase 17.3B: form tambah progres hanya untuk Safety Officer PEMILIK
    // inspeksi; pengguna lain hanya melihat daftar tindakan (server tetap menolak 403).
    const canAddAction = canEditCorrectiveAction(getCurrentUser(), item);
    // Pemilik yang tidak boleh lagi menambah = inspeksi sudah COMPLETED (final).
    const viewOnlyNote = isOwningOfficer(getCurrentUser(), item)
        ? 'Inspeksi sudah selesai (final) — tindakan perbaikan hanya dapat dilihat.'
        : 'Hanya Safety Officer pemilik inspeksi ini yang dapat menambah progres perbaikan.';

    // Informasi inspeksi lalu daftar tindakan. Pengesahan sengaja tidak di sini —
    // alurnya terpisah (tombol Pengesahan di tabel / modal Detail).
    content.innerHTML = `
            <dl class="perbaikan-summary" data-testid="perbaikan-summary">
                <div>
                    <dt>ID Inspeksi</dt>
                    <dd><strong>${escapeHtml(item.id)}</strong></dd>
                </div>
                <div>
                    <dt>Lokasi / Plant</dt>
                    <dd>${escapeHtml(item.lokasi)}</dd>
                </div>
                <div>
                    <dt>Due Date</dt>
                    <dd>${escapeHtml(item.dueDate || '-')} ${isOverdue(item.dueDate) ? overdueIndicator() : ''}</dd>
                </div>
                <div>
                    <dt>Status</dt>
                    <dd><span class="inspection-status ${escapeHtml(item.status)}">${escapeHtml(formatInspectionStatus(item.status))}</span></dd>
                </div>
            </dl>

            <div class="perbaikan-section-head">
                <h4 class="perbaikan-section-title">Temuan / Tindakan Perbaikan</h4>
                ${actions.length > 0 ? `<span class="perbaikan-muted" data-testid="perbaikan-count">${actions.length} tindakan, ${closedCount} selesai</span>` : ''}
            </div>
            ${actionsHtml}

            ${canAddAction ? `<div class="perbaikan-form-section">
                <h5>Tambah Progres</h5>
                <div class="form-group">
                    <label>Tindakan <span style="color:#c62828;">*</span></label>
                    <input type="text" id="newAction" placeholder="Deskripsi tindakan...">
                </div>
                <div class="form-row" style="grid-template-columns:1fr 1fr;">
                    <div class="form-group">
                        <label>Status <span style="color:#c62828;">*</span></label>
                        <select id="newStatus">
                            <option value="${ACTION_STATUS.ON_PROGRESS}">${formatActionStatus(ACTION_STATUS.ON_PROGRESS)}</option>
                            <option value="${ACTION_STATUS.CLOSED}">${formatActionStatus(ACTION_STATUS.CLOSED)}</option>
                            <option value="${ACTION_STATUS.OPEN}">${formatActionStatus(ACTION_STATUS.OPEN)}</option>
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
                    Tambah Progres
                </button>
            </div>` : `<p class="perbaikan-view-only" data-testid="perbaikan-view-only">${viewOnlyNote}</p>`}
        `;

    const fotoInput = document.getElementById('newFoto');
    if (fotoInput) fotoInput.addEventListener('change', function() {
        const count = this.files.length;
        document.getElementById('newFotoCount').textContent = count > 0 ? `${count} file dipilih` : 'Belum ada file';
    });

    openModal('perbaikanModal');
}

bindModalClose('perbaikanModal', 'closePerbaikanModal');
