/* tables.view.js — tabel dashboard, inspeksi, jadwal, dan perbaikan.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 8). Hanya wrapper "WithSearch",
 * renderJadwalTable, dan pemuat Inspeksi Terbaru (loadRecentInspections,
 * bindRecentInspectionsSearch — berhalaman di server) yang diekspor — itu
 * satu-satunya yang dipanggil dari luar berkas ini (initApp() & aksi halaman).
 * renderInspeksiTable/renderPerbaikanTable sengaja tidak diekspor: tidak ada
 * pemanggil lain di luar berkas ini. (updateNotifBadge dihapus bersama lonceng
 * notifikasi header — hitungannya selalu 0, tidak pernah berfungsi.)
 *
 * Phase 14.1-E: tombol "Kelola Pengesahan" (ikon stempel) pada baris tabel
 * Semua Inspeksi diberi data-testid="row-approve-btn" — ikon tanpa teks tidak
 * punya accessible name apa pun untuk getByRole(), jadi tidak ada locator
 * semantik yang bisa membedakannya.
 *
 * Phase 15: alasan yang sama berlaku untuk tombol detail (ikon mata) di
 * tabel Dashboard — diberi data-testid="row-detail-btn", dipakai test upload
 * foto sungguhan untuk membuka modal detail lalu lightbox.
 *
 * Phase 16.2 (U-03/U-06): label status perbaikan dan ringkasan pengesahan
 * diambil dari shared/labels.js — sebelumnya ditulis ulang di sini dengan
 * kosakata yang berbeda antartabel (dan berbeda dari modal/PDF/Excel).
 */

import { escapeHtml, highlight } from '../../shared/html.js';
import { formatDate, isOverdue } from '../../shared/date.js';
import { PERIODE_LIST } from '../../config/constants.js';
import { getRepairStatus } from '../../domain/inspection-rules.js';
import { ACTION_STATUS } from '../../domain/statuses.js';
import { isFullyApproved, countApproved } from '../../domain/approval-rules.js';
import { formatApprovalStatus, formatInspectionStatus, formatInspectionStatusDetail, formatRepairStatus } from '../../shared/labels.js';
import { DEFAULT_PAGE_LIMIT, pageRange, pageWindow } from '../../shared/pagination.js';
import { reportError } from '../../shared/errors.js';
import * as scheduleRules from '../../domain/schedule-rules.js';
import * as scheduleRepository from '../../repositories/schedule-repository.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import * as plantRepository from '../../repositories/plant-repository.js';
import { canApprove, canDelete, canDeleteDraft, canEdit, canReject, canRevise, canSubmit } from '../../domain/inspection-policy.js';
import { overdueIndicator } from '../components/overdue-indicator.js';
import { ROLE } from '../../config/constants.js';
import { getCurrentUser } from '../../infrastructure/session.js';

// Dipakai ketiga tabel di berkas ini (inspeksi, jadwal, perbaikan): ikon kecil
// + tooltip di samping tanggal (components/overdue-indicator.js), bukan badge besar.
const OVERDUE_BADGE = overdueIndicator();

/**
 * Tombol siklus hidup untuk Safety Officer PEMILIK (Phase 17.3B): Edit/Revisi,
 * Ajukan, Hapus draft — hanya dirender bila domain/inspection-policy.js
 * mengizinkannya untuk pengguna login. Pengguna lain hanya melihat. Server
 * tetap otoritatif walau tombol ini dimanipulasi.
 */
function ownerLifecycleButtons(item) {
    const user = getCurrentUser();
    const id = escapeHtml(item.id);
    const buttons = [];
    if (canEdit(user, item) || canRevise(user, item)) {
        const label = canRevise(user, item) ? 'Revisi' : 'Edit';
        buttons.push(`<button class="btn-sm primary" data-action="editInspeksi" data-id="${id}" data-testid="row-edit-btn" title="${label}"><i class="fas fa-pen"></i> ${label}</button>`);
    }
    if (canSubmit(user, item)) {
        const label = canRevise(user, item) ? 'Ajukan Ulang' : 'Ajukan';
        buttons.push(`<button class="btn-sm info" data-action="ajukanInspeksi" data-id="${id}" data-testid="row-submit-btn" title="${label}"><i class="fas fa-paper-plane"></i> ${label}</button>`);
    }
    if (canDeleteDraft(user, item)) {
        buttons.push(`<button class="btn-sm danger" data-action="hapusDraftInspeksi" data-id="${id}" data-testid="row-delete-draft-btn" title="Hapus draft"><i class="fas fa-trash"></i></button>`);
    }
    return buttons.join(' ');
}

/**
 * Phase 18: tombol hapus inspeksi untuk Admin (domain/inspection-policy.js
 * canDelete — non-draft). Hanya dirender untuk Admin; server tetap
 * otoritatif (DELETE /api/inspections/:id, inspection-service removeAsAdmin).
 */
function adminDeleteButton(item) {
    const user = getCurrentUser();
    if (!user || user.role !== ROLE.ADMIN || !canDelete(user, item)) return '';
    return `<button class="btn-sm danger" data-action="hapusInspeksiAdmin" data-id="${escapeHtml(item.id)}" data-testid="row-admin-delete-btn" title="Hapus inspeksi (Admin)"><i class="fas fa-trash-alt"></i></button>`;
}

/** Badge status alur kerja inspeksi — tabel Semua Data Inspeksi. */
function inspectionStatusBadge(item) {
    return `<span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(formatInspectionStatus(item.status))}</span>`;
}

/**
 * Status di tabel Inspeksi Terbaru: status alur kerja (teks berwarna, bukan
 * pill) + keterangan tahap yang ditunggu (labels.js). Status tindakan
 * perbaikan sengaja TIDAK ikut — siklusnya terpisah dari alur kerja inspeksi.
 */
function recentStatusCell(item) {
    const detail = formatInspectionStatusDetail(item);
    return `<span class="inspection-status ${escapeHtml(item.status)}" data-testid="recent-status">${escapeHtml(formatInspectionStatus(item.status))}</span>`
        + (detail ? `<span class="inspection-status-detail" data-testid="recent-status-detail">${escapeHtml(detail)}</span>` : '');
}

function renderInspeksiTable(data, tbodyId, isFull, highlightQuery = '') {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (data.length === 0) {
        const colspan = isFull ? 9 : 6;
        tbody.innerHTML =
            `<tr><td colspan="${colspan}" style="text-align:center;padding:2rem;color:#8a6a6a;">Tidak ada data ditemukan</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        const overdue = isOverdue(item.dueDate);
        const jmlTemuan = item.temuan ? item.temuan.length : 0;
        const temuanPreview = item.temuan && item.temuan.length > 0 ? item.temuan[0].deskripsi : '-';

        const lokasiDisplay = highlight(item.lokasi, highlightQuery);
        const temuanDisplay = highlight(temuanPreview, highlightQuery);
        // Temuan pertama + jumlah eksplisit di baris kedua (sebelumnya "… +1 lagi").
        const temuanCell = jmlTemuan > 0
            ? `<span class="temuan-preview">${temuanDisplay}</span><span class="temuan-count" data-testid="temuan-count">${jmlTemuan} temuan</span>`
            : '-';

        const overdueBadge = overdue ? OVERDUE_BADGE : '';

        const exportBtn = item.temuan && item.temuan.length > 0 ?
            `<button class="btn-export-temuan" data-action="exportTemuanPerItem" data-id="${escapeHtml(item.id)}" title="Export temuan ke Excel"><i class="fas fa-file-excel"></i></button>` :
            '';

        const allApproved = isFullyApproved(item);
        const pdfBtn = allApproved ?
            `<button class="btn-pdf" data-action="cetakPDF" data-id="${escapeHtml(item.id)}" title="Cetak PDF Laporan"><i class="fas fa-file-pdf"></i></button>` :
            `<button class="btn-pdf" disabled title="Harus disetujui semua tahap terlebih dahulu"><i class="fas fa-file-pdf"></i></button>`;

        const approvalStatus = formatApprovalStatus(item);
        const approvalColor = allApproved ? 'selesai' : countApproved(item) > 0 ? 'proses' : 'menunggu';

        if (isFull) {
            return `
                    <tr>
                        <td><strong>${escapeHtml(item.id)}</strong></td>
                        <td>${lokasiDisplay}</td>
                        <td>${escapeHtml(item.keteranganLokasi || '-')}</td>
                        <td>${escapeHtml(item.tanggal)}</td>
                        <td>${escapeHtml(item.petugas)}</td>
                        <td>${jmlTemuan}</td>
                        <td>${inspectionStatusBadge(item)}</td>
                        <td>
                            <span class="status-badge ${approvalColor}">${approvalStatus}</span>
                            <button class="btn-sm info" data-action="openApprovalModal" data-id="${escapeHtml(item.id)}" data-testid="row-approve-btn" style="margin-top:0.2rem;"><i class="fas fa-stamp"></i></button>
                        </td>
                        <td>${ownerLifecycleButtons(item)} ${adminDeleteButton(item)} ${exportBtn} ${pdfBtn}</td>
                    </tr>
                `;
        } else {
            // Aksi hanya yang benar-benar bisa dijalankan pengguna ini: Pengesahan
            // hanya untuk peninjau yang berwenang atas tahap yang sedang berjalan
            // (aturan domain yang sama dengan server — role, tahap, plant); status
            // pengesahan untuk yang lain dibaca di Detail. PDF hanya setelah
            // selesai. Server tetap otoritatif atas setiap aksi.
            const user = getCurrentUser();
            const id = escapeHtml(item.id);
            const approvalBtn = canApprove(user, item) || canReject(user, item)
                ? `<button class="btn-sm warning" data-action="openApprovalModal" data-id="${id}" data-testid="recent-approval-btn" title="Pengesahan"><i class="fas fa-stamp"></i></button>`
                : '';
            // Revisi inspeksi (alur pengesahan) hanya untuk Safety Officer pemiliknya
            // selama Perlu Revisi — tombol berteks, dibedakan dari "Perbaikan &
            // Progres" (tindakan perbaikan temuan, siklus terpisah).
            const reviseBtn = canRevise(user, item)
                ? `<button class="btn-sm primary btn-revise" data-action="editInspeksi" data-id="${id}" data-testid="recent-revise-btn" title="Revisi inspeksi ${id}"><i class="fas fa-pen"></i> Revisi</button>`
                : '';
            return `
                    <tr>
                        <td><strong>${id}</strong></td>
                        <td>${lokasiDisplay}</td>
                        <td>${temuanCell}</td>
                        <td class="due-date-cell">${escapeHtml(item.dueDate || '-')} ${overdueBadge}</td>
                        <td>${recentStatusCell(item)}</td>
                        <td>
                            <button class="btn-sm info" data-action="openDetailModal" data-id="${id}" data-testid="row-detail-btn" title="Lihat detail" aria-label="Lihat detail ${id}"><i class="fas fa-eye"></i></button>
                            ${reviseBtn}
                            <button class="btn-sm outline" data-action="openPerbaikanModal" data-id="${id}" data-testid="recent-perbaikan-btn" title="Perbaikan &amp; Progres (tindakan perbaikan temuan)" aria-label="Perbaikan &amp; Progres ${id}"><i class="fas fa-tools"></i></button>
                            ${approvalBtn}
                            ${exportBtn}
                            ${allApproved ? pdfBtn : ''}
                        </td>
                    </tr>
                `;
        }
    }).join('');
}

export async function renderJadwalTable(data = null, highlightQuery = '') {
    const tbody = document.getElementById('jadwalTableBody');
    if (!tbody) return;
    const displayData = data !== null ? data : await scheduleRepository.getAll();
    // Phase 18: hapus jadwal khusus Admin (DELETE /api/schedules/:id requireRole('admin')) — tombolnya pun hanya untuk Admin.
    const canDeleteSchedules = getCurrentUser()?.role === ROLE.ADMIN;
    // Ubah jadwal: hanya role yang juga diizinkan server (PUT /api/schedules/:id).
    const canEditSchedules = scheduleRules.canManageSchedules(getCurrentUser());

    if (displayData.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#8a6a6a;">Tidak ada data ditemukan</td></tr>';
        return;
    }

    const limitedData = displayData.slice(0, 100);

    const rows = await Promise.all(limitedData.map(async (item) => {
        const periode = PERIODE_LIST.find(p => p.id === item.periode);
        const plant = await plantRepository.findById(item.plantId);

        const plantDisplay = highlight(item.plantName, highlightQuery);
        const officerDisplay = highlight(item.officer, highlightQuery);
        const periodeDisplay = highlight(periode ? periode.name : 'Periode ' + item.periode, highlightQuery);
        const tanggalJadwalDisplay = item.tanggalJadwal ? formatDate(item.tanggalJadwal) : '-';
        const tanggalRealisasiDisplay = item.tanggalRealisasi ? formatDate(item.tanggalRealisasi) : '-';
        const mingguDisplay = item.minggu ? `Minggu ${item.minggu}` : '-';

        const isOverdueSchedule = scheduleRules.isOverdue(item);

        let statusClass = 'proses';
        let statusText = 'Aktif';
        if (item.tanggalRealisasi) {
            statusClass = 'selesai';
            statusText = 'Selesai';
        } else if (isOverdueSchedule) {
            statusClass = 'terlambat';
            statusText = '⚠️ Overdue';
        }

        return `
                <tr>
                    <td>${plantDisplay} ${plant ? '<span style="font-size:0.6rem;color:#8a6a6a;">(' + escapeHtml(plant.code) + ')</span>' : ''}</td>
                    <td>${periodeDisplay}</td>
                    <td>${escapeHtml(mingguDisplay)}</td>
                    <td>${escapeHtml(tanggalJadwalDisplay)} ${isOverdueSchedule ? OVERDUE_BADGE : ''}</td>
                    <td>${escapeHtml(tanggalRealisasiDisplay)}</td>
                    <td>${officerDisplay}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        ${canEditSchedules ? `<button class="btn-sm warning" data-action="editJadwal" data-id="${escapeHtml(item.id)}" data-testid="schedule-edit-btn" aria-label="Edit jadwal ${escapeHtml(item.id)}"><i class="fas fa-edit"></i></button>` : ''}
                        ${canDeleteSchedules ? `<button class="btn-sm danger" data-action="hapusJadwal" data-id="${escapeHtml(item.id)}" data-testid="schedule-delete-btn"><i class="fas fa-trash"></i></button>` : ''}
                        ${canEditSchedules || canDeleteSchedules ? '' : '<span style="color:#b8a0a0;">-</span>'}
                    </td>
                </tr>
            `;
    }));
    tbody.innerHTML = rows.join('');
}

async function renderPerbaikanTable(data = null, highlightQuery = '') {
    const tbody = document.getElementById('perbaikanTableBody');
    if (!tbody) return;
    const sourceData = data !== null ? data : await inspectionRepository.getAll();
    const displayData = sourceData.filter(item => item.perbaikan && item.perbaikan.length > 0);

    if (displayData.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#8a6a6a;">Tidak ada data ditemukan</td></tr>';
        return;
    }

    // Tabel operasional: status perbaikan sebagai teks (tanpa bar/persentase —
    // jumlah tindakan selesai jadi keterangan di bawahnya); pola sel & tombol
    // sama dengan tabel Inspeksi Terbaru.
    tbody.innerHTML = displayData.map(item => {
        const id = escapeHtml(item.id);
        const statusPerbaikan = getRepairStatus(item);
        const lastAction = item.perbaikan[item.perbaikan.length - 1];
        const jmlTemuan = item.temuan ? item.temuan.length : 0;
        const temuanText = jmlTemuan > 0 ? item.temuan[0].deskripsi : '-';
        const closedCount = item.perbaikan.filter((action) => action.status === ACTION_STATUS.CLOSED).length;

        const lokasiDisplay = highlight(item.lokasi, highlightQuery);
        const temuanDisplay = highlight(temuanText, highlightQuery);
        const actionDisplay = highlight(lastAction ? lastAction.action : '-', highlightQuery);
        const picDisplay = highlight(lastAction ? lastAction.pic : '-', highlightQuery);
        const temuanCell = jmlTemuan > 0
            ? `<span class="temuan-preview">${temuanDisplay}</span><span class="temuan-count">${jmlTemuan} temuan</span>`
            : '-';

        return `
                <tr data-testid="perbaikan-row">
                    <td><strong>${id}</strong></td>
                    <td>${lokasiDisplay}</td>
                    <td>${temuanCell}</td>
                    <td class="due-date-cell">${escapeHtml(item.dueDate || '-')} ${isOverdue(item.dueDate) ? OVERDUE_BADGE : ''}</td>
                    <td>${actionDisplay}</td>
                    <td>${picDisplay}</td>
                    <td>
                        <span class="repair-status ${escapeHtml(statusPerbaikan)}" data-testid="repair-status">${escapeHtml(formatRepairStatus(statusPerbaikan))}</span>
                        <span class="inspection-status-detail" data-testid="repair-status-detail">${closedCount} dari ${item.perbaikan.length} tindakan selesai</span>
                    </td>
                    <td class="perbaikan-aksi">
                        <button class="btn-sm info" data-action="openDetailModal" data-id="${id}" title="Lihat detail" aria-label="Lihat detail ${id}"><i class="fas fa-eye"></i></button>
                        <button class="btn-sm outline" data-action="openPerbaikanModal" data-id="${id}" data-testid="perbaikan-open-btn" title="Perbaikan &amp; Progres (tindakan perbaikan temuan)" aria-label="Perbaikan &amp; Progres ${id}"><i class="fas fa-tools"></i></button>
                    </td>
                </tr>
            `;
    }).join('');
}

// ========================================================================
// Inspeksi Terbaru — berhalaman di server (GET /api/inspections?page=&limit=&q=):
// cakupan visibilitas, pencarian, urutan, LIMIT/OFFSET semuanya di database.
// Tabel lain, statistik, dan ekspor tetap memakai daftar penuh (getAll).
// ========================================================================

let recentState = { page: 1, search: '' };
let recentRequest = 0;

/** Baris tabel Inspeksi Terbaru dari data yang sudah diambil (tanpa fetch sendiri — juga diuji xss-regression.test.js). */
export function renderInspeksiWithSearch(data, query) {
    renderInspeksiTable(data, 'inspeksiTableBody', false, query);
}

function renderRecentPagination(pagination) {
    const nav = document.getElementById('inspeksiPagination');
    if (!nav) return;
    const range = pageRange(pagination);
    if (!range) { nav.innerHTML = ''; return; }
    const { page, totalPages, total } = pagination;
    // Layar sempit hanya "1–10 dari 57" (.pagination-summary-long disembunyikan, 16-responsive.css).
    const summary = `<p class="pagination-summary" data-testid="recent-pagination-summary">`
        + `<span class="pagination-summary-long">Menampilkan </span>${range.from}–${range.to} dari ${total}`
        + `<span class="pagination-summary-long"> inspeksi</span></p>`;
    if (totalPages <= 1) { nav.innerHTML = summary; return; }

    const button = (target, label, disabled) =>
        `<button type="button" class="pagination-btn" data-action="recentInspectionsPage" data-page="${target}"${disabled ? ' disabled' : ''}>${label}</button>`;
    const pages = pageWindow(page, totalPages).map((number) => (number === page
        ? `<span class="pagination-btn current" aria-current="page">${number}</span>`
        : button(number, number, false))).join('');
    nav.innerHTML = `${summary}
        <div class="pagination-controls">
            ${button(page - 1, '← Sebelumnya', page <= 1)}
            <span class="pagination-pages">${pages}</span>
            <span class="pagination-compact">${page} / ${totalPages}</span>
            ${button(page + 1, 'Berikutnya →', page >= totalPages)}
        </div>`;
}

/**
 * Memuat & merender satu halaman Inspeksi Terbaru. Pencarian yang berubah
 * kembali ke halaman 1; tanpa perubahan pencarian (mis. refresh setelah aksi)
 * halaman aktif dipertahankan. Jawaban yang sudah basi (pencarian keburu
 * berganti) diabaikan.
 */
export async function loadRecentInspections({ page, search = recentState.search } = {}) {
    const targetPage = search !== recentState.search ? 1 : (page ?? recentState.page);
    const request = ++recentRequest;
    let result = await inspectionRepository.getPage({ page: targetPage, limit: DEFAULT_PAGE_LIMIT, search });
    // Halaman aktif bisa hilang setelah datanya berkurang (mis. inspeksi dihapus) -> halaman terakhir yang ada.
    if (result.items.length === 0 && result.pagination.totalPages > 0 && targetPage > result.pagination.totalPages) {
        result = await inspectionRepository.getPage({ page: result.pagination.totalPages, limit: DEFAULT_PAGE_LIMIT, search });
    }
    if (request !== recentRequest) return;

    recentState = { page: result.pagination.page, search };
    renderInspeksiWithSearch(result.items, search);
    renderRecentPagination(result.pagination);
    const count = document.getElementById('searchInspeksiCount');
    if (count) count.textContent = search ? `${result.pagination.total} hasil` : '';
}

/**
 * Pencarian Inspeksi Terbaru — dijalankan di server atas SELURUH data yang
 * terlihat (bukan hanya halaman yang sedang tampil), sesaat setelah berhenti
 * mengetik. Menggantikan setupSearch() (penyaringan di browser) untuk tabel ini.
 */
export function bindRecentInspectionsSearch() {
    const input = document.getElementById('searchInspeksiInput');
    const clear = document.getElementById('clearSearchInspeksi');
    if (!input) return Promise.resolve();
    let timer = null;
    const load = () => loadRecentInspections({ search: input.value.trim() })
        .catch((error) => { reportError('muat inspeksi terbaru', error, ''); });
    const onInput = () => {
        clear.classList.toggle('visible', input.value.trim() !== '');
        clearTimeout(timer);
        timer = setTimeout(load, 250);
    };
    input.addEventListener('input', onInput);
    clear.addEventListener('click', () => {
        input.value = '';
        onInput();
        input.focus();
    });
    return load();
}

export function renderAllInspeksiWithSearch(data, query) {
    renderInspeksiTable(data, 'allInspeksiTable', true, query);
}

export async function renderJadwalWithSearch(data, query) {
    await renderJadwalTable(data, query);
}

export async function renderPerbaikanWithSearch(data, query) {
    await renderPerbaikanTable(data, query);
}
