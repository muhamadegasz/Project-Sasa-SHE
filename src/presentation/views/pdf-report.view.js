/* pdf-report.view.js — markup laporan inspeksi yang dicetak ke PDF.
 *
 * Dipindah dari legacy-app.js (Phase 8). Fungsi murni: item masuk, HTML keluar,
 * tidak menyentuh DOM. Pemanggil (cetakPDF di legacy-app.js) yang menyuntikkannya
 * ke #pdfContent lalu memberikannya ke infrastructure/pdf-exporter.js.
 */

import { escapeHtml } from '../../shared/html.js';
import { APPROVAL_STAGES } from '../../config/constants.js';
import { formatActionStatus } from '../../shared/labels.js';

function buildGalleryHtml(item) {
    const allPhotos = [...(item.fotoDekat || []), ...(item.fotoJauh || [])];
    return allPhotos.length > 0 ?
        allPhotos.map(() => `<div class="pdf-thumb">📷</div>`).join('') :
        '<span style="color:#888;">Tidak ada foto</span>';
}

function buildTemuanRows(item) {
    return item.temuan && item.temuan.length > 0 ?
        item.temuan.map((t, idx) =>
            `<tr><td>${idx + 1}</td><td>${escapeHtml(t.deskripsi)}</td><td><span style="background:#f0e8e8;padding:0.1rem 0.5rem;border-radius:4px;font-size:0.7rem;">${escapeHtml(t.kategori)}</span></td></tr>`
        ).join('') :
        '<tr><td colspan="3" style="text-align:center;color:#888;">Tidak ada temuan</td></tr>';
}

function buildPerbaikanRows(item) {
    return item.perbaikan && item.perbaikan.length > 0 ?
        item.perbaikan.map(p => {
            return `<tr><td>${escapeHtml(p.tgl)}</td><td>${escapeHtml(p.action)}</td><td>${escapeHtml(p.pic)}</td><td><span style="background:${p.status === 'closed' ? '#e8f5e9' : p.status === 'on-progress' ? '#fff3e0' : '#fce4ec'};padding:0.1rem 0.5rem;border-radius:4px;font-size:0.7rem;">${escapeHtml(formatActionStatus(p.status))}</span></td></tr>`;
        }).join('') :
        '<tr><td colspan="4" style="text-align:center;color:#888;">Belum ada tindakan perbaikan</td></tr>';
}

function buildApprovalSignatures(item) {
    return APPROVAL_STAGES.map(s => {
        const approval = item.approvals && item.approvals[s.id];
        if (approval && approval.approved) {
            return `
                <div class="sign-item">
                    <div style="font-size:0.7rem;color:#888;">${escapeHtml(s.title)}</div>
                    <div class="sign-name">${escapeHtml(approval.by)}</div>
                    <div style="font-size:0.7rem;color:#666;">${escapeHtml(approval.jabatan)}</div>
                    <div class="sign-line"></div>
                    <div style="font-size:0.6rem;color:#888;">${escapeHtml(approval.tanggal)}</div>
                </div>
            `;
        }
        return `
            <div class="sign-item">
                <div style="font-size:0.7rem;color:#888;">${escapeHtml(s.title)}</div>
                <div style="font-size:0.8rem;color:#aaa;">Belum ditandatangani</div>
                <div class="sign-line" style="border-color:#ddd;"></div>
            </div>
        `;
    }).join('');
}

/** Markup lengkap laporan inspeksi (header, info, temuan, perbaikan, foto, tanda tangan, footer). */
export function buildInspectionReportHtml(item) {
    const now = new Date();
    const allPhotos = [...(item.fotoDekat || []), ...(item.fotoJauh || [])];

    return `
            <div class="pdf-header">
                <h1>SHE <span>Sasa</span></h1>
                <div class="sub">SISTEM INFORMASI K3</div>
                <div style="margin-top:0.3rem;font-size:0.8rem;color:#888;">Laporan Inspeksi Keselamatan dan Kesehatan Kerja</div>
            </div>

            <div class="pdf-body">
                <div class="info-grid">
                    <div class="item">
                        <div class="label">ID Inspeksi</div>
                        <div class="value" style="color:#b31b1b;font-weight:700;">${escapeHtml(item.id)}</div>
                    </div>
                    <div class="item">
                        <div class="label">Status</div>
                        <div class="value"><span style="background:${item.status === 'selesai' ? '#e8f5e9' : item.status === 'proses' ? '#fff3e0' : '#fce4ec'};padding:0.1rem 0.6rem;border-radius:60px;font-size:0.75rem;">${escapeHtml(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></div>
                    </div>
                    <div class="item">
                        <div class="label">Lokasi / Plant</div>
                        <div class="value">${escapeHtml(item.lokasi)}</div>
                    </div>
                    <div class="item">
                        <div class="label">Keterangan Lokasi</div>
                        <div class="value">${escapeHtml(item.keteranganLokasi || '-')}</div>
                    </div>
                    <div class="item">
                        <div class="label">Tanggal Inspeksi</div>
                        <div class="value">${escapeHtml(item.tanggal)}</div>
                    </div>
                    <div class="item">
                        <div class="label">Safety Officer</div>
                        <div class="value">${escapeHtml(item.petugas)}</div>
                    </div>
                    <div class="item">
                        <div class="label">Due Date ke Plant</div>
                        <div class="value">${escapeHtml(item.dueDate || '-')}</div>
                    </div>
                    <div class="item">
                        <div class="label">Jumlah Temuan</div>
                        <div class="value">${item.temuan ? item.temuan.length : 0}</div>
                    </div>
                </div>

                <div class="section">
                    <div class="title"><i class="fas fa-list"></i> Daftar Temuan</div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width:40px;">No</th>
                                <th>Deskripsi Temuan</th>
                                <th style="width:120px;">Kategori</th>
                            </tr>
                        </thead>
                        <tbody>${buildTemuanRows(item)}</tbody>
                    </table>
                </div>

                <div class="section">
                    <div class="title"><i class="fas fa-tools"></i> Tindakan Perbaikan</div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width:100px;">Tanggal</th>
                                <th>Tindakan</th>
                                <th style="width:100px;">PIC</th>
                                <th style="width:100px;">Status</th>
                            </tr>
                        </thead>
                        <tbody>${buildPerbaikanRows(item)}</tbody>
                    </table>
                </div>

                <div class="section">
                    <div class="title"><i class="fas fa-images"></i> Dokumentasi Foto</div>
                    <div class="pdf-gallery">${buildGalleryHtml(item)}</div>
                    <div style="font-size:0.7rem;color:#888;margin-top:0.3rem;">${allPhotos.length} foto terupload</div>
                </div>

                <div class="section">
                    <div class="title"><i class="fas fa-stamp"></i> Lembar Pengesahan</div>
                    <div class="signature-block" style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:1rem;margin-top:0.5rem;">
                        ${buildApprovalSignatures(item)}
                    </div>
                </div>
            </div>

            <div class="pdf-footer">
                <div class="legal-text">
                    <i class="fas fa-check-circle"></i>
                    Dokumen ini telah ditandatangani dan disetujui secara elektronik melalui
                    <strong>Sistem Informasi K3 SHE Sasa</strong> pada tanggal ${new Date().toLocaleString('id-ID')}.
                    <br>
                    <span style="font-size:0.65rem;">Dokumen ini sah dan berlaku sebagai bukti resmi inspeksi keselamatan dan kesehatan kerja.</span>
                </div>

                <div style="margin-top:0.5rem;font-size:0.6rem;color:#aaa;text-align:center;">
                    Dicetak pada: ${now.toLocaleString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    <br>
                    © SHE Sasa - Sistem Informasi K3
                </div>
            </div>

            <div class="pdf-stamp">
                DISETUJUI
                <small>Elektronik</small>
            </div>
        `;
}
