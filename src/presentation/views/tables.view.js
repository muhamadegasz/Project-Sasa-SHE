/* tables.view.js — tabel dashboard, inspeksi, jadwal, dan perbaikan.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 8). Hanya wrapper "WithSearch"
 * dan renderJadwalTable yang diekspor — itu satu-satunya yang dipanggil dari
 * luar berkas ini (lewat setupSearch() dan setInterval() di initApp()).
 * renderInspeksiTable/renderPerbaikanTable/updateNotifBadge sengaja tidak
 * diekspor: tidak ada pemanggil lain di luar berkas ini.
 *
 * Phase 14.1-E: tombol "Kelola Pengesahan" (ikon stempel) pada baris tabel
 * Semua Inspeksi diberi data-testid="row-approve-btn" — ikon tanpa teks tidak
 * punya accessible name apa pun untuk getByRole(), jadi tidak ada locator
 * semantik yang bisa membedakannya.
 *
 * Phase 15: alasan yang sama berlaku untuk tombol detail (ikon mata) di
 * tabel Dashboard — diberi data-testid="row-detail-btn", dipakai test upload
 * foto sungguhan untuk membuka modal detail lalu lightbox.
 */

import { escapeHtml, highlight } from '../../shared/html.js';
import { formatDate, isOverdue } from '../../shared/date.js';
import { PERIODE_LIST } from '../../config/constants.js';
import { getProgress, getRepairStatus } from '../../domain/inspection-rules.js';
import { isFullyApproved, countApproved, totalStages } from '../../domain/approval-rules.js';
import * as scheduleRules from '../../domain/schedule-rules.js';
import * as scheduleRepository from '../../repositories/schedule-repository.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import * as plantRepository from '../../repositories/plant-repository.js';

function updateNotifBadge(count) {
    const countEl = document.getElementById('notifCount');
    const dotEl = document.getElementById('notifDot');
    if (count > 0) {
        countEl.textContent = count;
        dotEl.classList.add('active');
    } else {
        countEl.textContent = '0';
        dotEl.classList.remove('active');
    }
}

function renderInspeksiTable(data, tbodyId, isFull, highlightQuery = '') {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (data.length === 0) {
        const colspan = isFull ? 9 : 7;
        tbody.innerHTML =
            `<tr><td colspan="${colspan}" style="text-align:center;padding:2rem;color:#8a6a6a;">Tidak ada data ditemukan</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        const progress = getProgress(item);
        const statusPerbaikan = getRepairStatus(item);
        const statusLabel = statusPerbaikan === 'selesai_perbaikan' ? '✅ Selesai' :
            statusPerbaikan === 'perbaikan' ? '🔄 Perbaikan' : '⏳ Tinjau';
        const overdue = isOverdue(item.dueDate);
        const jmlTemuan = item.temuan ? item.temuan.length : 0;
        const temuanPreview = item.temuan && item.temuan.length > 0 ? item.temuan[0].deskripsi : '-';
        const moreTemuan = jmlTemuan > 1 ? ` +${jmlTemuan - 1} lagi` : '';

        const lokasiDisplay = highlight(item.lokasi, highlightQuery);
        const temuanDisplay = highlight(temuanPreview, highlightQuery);

        const progressBar = `
                <div class="progress-wrapper">
                    <div class="progress-bar-container">
                        <div class="progress-fill ${statusPerbaikan}" style="width:${progress}%"></div>
                    </div>
                    <span class="progress-text">${progress}%</span>
                    <span class="progress-label">${statusLabel}</span>
                </div>
            `;

        const overdueBadge = overdue ?
            `<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>` :
            '';

        const exportBtn = item.temuan && item.temuan.length > 0 ?
            `<button class="btn-export-temuan" data-action="exportTemuanPerItem" data-id="${escapeHtml(item.id)}" title="Export temuan ke Excel"><i class="fas fa-file-excel"></i></button>` :
            '';

        const allApproved = isFullyApproved(item);
        const pdfBtn = allApproved ?
            `<button class="btn-pdf" data-action="cetakPDF" data-id="${escapeHtml(item.id)}" title="Cetak PDF Laporan"><i class="fas fa-file-pdf"></i></button>` :
            `<button class="btn-pdf" disabled title="Harus disetujui semua tahap terlebih dahulu"><i class="fas fa-file-pdf"></i></button>`;

        let approvalStatus = 'Belum';
        let approvalColor = 'menunggu';
        if (allApproved) {
            approvalStatus = '✅ Lengkap';
            approvalColor = 'selesai';
        } else {
            const approvedCount = countApproved(item);
            if (approvedCount > 0) {
                approvalStatus = `${approvedCount}/${totalStages()}`;
                approvalColor = 'proses';
            }
        }

        if (isFull) {
            return `
                    <tr>
                        <td><strong>${escapeHtml(item.id)}</strong></td>
                        <td>${lokasiDisplay}</td>
                        <td>${escapeHtml(item.keteranganLokasi || '-')}</td>
                        <td>${escapeHtml(item.tanggal)}</td>
                        <td>${escapeHtml(item.petugas)}</td>
                        <td>${jmlTemuan}</td>
                        <td><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></td>
                        <td>
                            <span class="status-badge ${approvalColor}">${approvalStatus}</span>
                            <button class="btn-sm info" data-action="openApprovalModal" data-id="${escapeHtml(item.id)}" data-testid="row-approve-btn" style="margin-top:0.2rem;"><i class="fas fa-stamp"></i></button>
                        </td>
                        <td>${exportBtn} ${pdfBtn}</td>
                    </tr>
                `;
        } else {
            return `
                    <tr>
                        <td><strong>${escapeHtml(item.id)}</strong></td>
                        <td>${lokasiDisplay}</td>
                        <td>${temuanDisplay}${moreTemuan}</td>
                        <td>${escapeHtml(item.dueDate || '-')} ${overdueBadge}</td>
                        <td><span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></td>
                        <td>${progressBar}</td>
                        <td>
                            <button class="btn-sm info" data-action="openDetailModal" data-id="${escapeHtml(item.id)}" data-testid="row-detail-btn"><i class="fas fa-eye"></i></button>
                            <button class="btn-sm primary" data-action="openPerbaikanModal" data-id="${escapeHtml(item.id)}"><i class="fas fa-tools"></i></button>
                            <button class="btn-sm warning" data-action="openApprovalModal" data-id="${escapeHtml(item.id)}"><i class="fas fa-stamp"></i></button>
                            ${exportBtn}
                            ${pdfBtn}
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
    let notifCount = 0;

    if (displayData.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#8a6a6a;">Tidak ada data ditemukan</td></tr>';
        updateNotifBadge(0);
        return 0;
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
            statusText = '✅ Selesai';
        } else if (isOverdueSchedule) {
            statusClass = 'terlambat';
            statusText = '⚠️ Overdue';
        }

        return `
                <tr>
                    <td>${plantDisplay} ${plant ? '<span style="font-size:0.6rem;color:#8a6a6a;">(' + escapeHtml(plant.code) + ')</span>' : ''}</td>
                    <td>${periodeDisplay}</td>
                    <td>${escapeHtml(mingguDisplay)}</td>
                    <td>${escapeHtml(tanggalJadwalDisplay)} ${isOverdueSchedule ? '<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>' : ''}</td>
                    <td>${escapeHtml(tanggalRealisasiDisplay)}</td>
                    <td>${officerDisplay}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button class="btn-sm warning" data-action="editJadwal" data-id="${escapeHtml(item.id)}"><i class="fas fa-edit"></i></button>
                        <button class="btn-sm danger" data-action="hapusJadwal" data-id="${escapeHtml(item.id)}"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
    }));
    tbody.innerHTML = rows.join('');

    if (data === null) {
        updateNotifBadge(notifCount);
    }
    return notifCount;
}

async function renderPerbaikanTable(data = null, highlightQuery = '') {
    const tbody = document.getElementById('perbaikanTableBody');
    if (!tbody) return;
    const sourceData = data !== null ? data : await inspectionRepository.getAll();
    const displayData = sourceData.filter(item => item.perbaikan && item.perbaikan.length > 0);

    if (displayData.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#8a6a6a;">Tidak ada data ditemukan</td></tr>';
        return;
    }

    tbody.innerHTML = displayData.map(item => {
        const progress = getProgress(item);
        const statusPerbaikan = getRepairStatus(item);
        const lastAction = item.perbaikan[item.perbaikan.length - 1];
        const temuanText = item.temuan && item.temuan.length > 0 ? item.temuan[0].deskripsi : '-';
        const overdue = isOverdue(item.dueDate);

        const lokasiDisplay = highlight(item.lokasi, highlightQuery);
        const temuanDisplay = highlight(temuanText, highlightQuery);
        const actionDisplay = highlight(lastAction ? lastAction.action : '-', highlightQuery);
        const picDisplay = highlight(lastAction ? lastAction.pic : '-', highlightQuery);

        const overdueBadge = overdue ?
            `<span class="overdue-badge"><i class="fas fa-exclamation-circle"></i> OVERDUE</span>` :
            '';

        const progressBar = `
                <div class="progress-wrapper">
                    <div class="progress-bar-container">
                        <div class="progress-fill ${statusPerbaikan}" style="width:${progress}%"></div>
                    </div>
                    <span class="progress-text">${progress}%</span>
                </div>
            `;

        const statusMap = {
            'selesai_perbaikan': 'Closed',
            'perbaikan': 'On Progress',
            'tinjau': 'Open'
        };

        return `
                <tr>
                    <td><strong>${escapeHtml(item.id)}</strong></td>
                    <td>${lokasiDisplay}</td>
                    <td>${temuanDisplay}</td>
                    <td>${escapeHtml(item.dueDate || '-')} ${overdueBadge}</td>
                    <td>${actionDisplay}</td>
                    <td>${picDisplay}</td>
                    <td>${progressBar}</td>
                    <td><span class="status-badge ${statusPerbaikan}">${statusMap[statusPerbaikan] || statusPerbaikan}</span></td>
                    <td>
                        <button class="btn-sm primary" data-action="openPerbaikanModal" data-id="${escapeHtml(item.id)}"><i class="fas fa-edit"></i></button>
                        <button class="btn-sm info" data-action="openDetailModal" data-id="${escapeHtml(item.id)}"><i class="fas fa-eye"></i></button>
                    </td>
                </tr>
            `;
    }).join('');
}

export function renderInspeksiWithSearch(data, query) {
    renderInspeksiTable(data, 'inspeksiTableBody', false, query);
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
