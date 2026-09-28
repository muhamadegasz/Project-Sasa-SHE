/* pdf-report.view.js — markup laporan inspeksi yang dicetak ke PDF.
 *
 * Dipindah dari legacy-app.js (Phase 8). buildInspectionReportHtml murni: item masuk,
 * HTML keluar, tidak menyentuh DOM (release: gambar tanda tangan disiapkan terpisah
 * oleh prepareSignatureImages). Pemanggil (cetakPDF di legacy-app.js) yang menyuntikkannya
 * ke #pdfContent lalu memberikannya ke infrastructure/pdf-exporter.js.
 */

import { escapeHtml } from '../../shared/html.js';
import { APPROVAL_STAGES } from '../../config/constants.js';
import { formatActionStatus, formatInspectionStatus } from '../../shared/labels.js';
import { formatDate } from '../../shared/date.js';
import { isStageApproved, latestDecision } from '../../domain/approval-rules.js';
import { INSPECTION_STATUS } from '../../domain/statuses.js';
import * as inspectionRepository from '../../repositories/inspection-repository.js';
import { composeSignature } from '../components/watermark.js';

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

/**
 * Gambar tanda tangan satu persetujuan di PDF (release): gambar yang sudah
 * disiapkan prepareSignatureImages() (tanda tangan + watermark di posisi
 * tersimpan), keterangan "data lama" untuk persetujuan tanpa tanda tangan,
 * atau garis kosong bila gambar tidak disediakan pemanggil.
 */
function buildSignatureImage(approval, signatureImages) {
    if (!approval.hasSignature || approval.id == null) {
        return '<div class="pdf-signature-note" style="font-size:0.6rem;font-style:italic;color:#888;">Tanpa tanda tangan (data lama)</div>';
    }
    const src = signatureImages.get(approval.id);
    if (!src) return '';
    return `<img class="pdf-signature" src="${escapeHtml(src)}" alt="Tanda tangan ${escapeHtml(approval.reviewerName || '')}" style="display:block;max-width:170px;max-height:64px;margin:0.2rem auto;">`;
}

/**
 * Phase 17.2: satu blok per tahap pengesahan (tiga), dari keputusan terakhirnya.
 * Release: termasuk gambar tanda tangan keputusan itu (+ watermark bila ada).
 */
function buildApprovalSignatures(item, signatureImages) {
    return APPROVAL_STAGES.map(s => {
        if (isStageApproved(item, s.id)) {
            const approval = latestDecision(item, s.id);
            return `
                <div class="sign-item" data-stage="${escapeHtml(s.id)}">
                    <div style="font-size:0.7rem;color:#888;">${escapeHtml(s.title)}</div>
                    ${buildSignatureImage(approval, signatureImages)}
                    <div class="sign-name">${escapeHtml(approval.reviewerName || '-')}</div>
                    <div style="font-size:0.7rem;color:#666;">${escapeHtml(s.title)}</div>
                    <div class="sign-line"></div>
                    <div style="font-size:0.6rem;color:#888;">${escapeHtml(formatDate(approval.decidedAt))}</div>
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

/**
 * Menyiapkan gambar tanda tangan untuk PDF: untuk setiap tahap yang disetujui
 * (keputusan terakhirnya, sama dengan yang dicetak), gambar diambil lewat
 * endpoint terotorisasi lalu digabung dengan watermark di posisi tersimpan
 * (components/watermark.js). Hasilnya URL blob: sementara — sumber sama
 * dengan halaman, jadi html2canvas bisa merendernya tanpa masalah CORS.
 * Persetujuan lama tanpa tanda tangan dilewati. Gagal memuat satu tanda
 * tangan = error (PDF tidak dibuat setengah-setengah).
 *
 * @returns {Promise<{ images: Map<number, string>, release: () => void }>}
 */
export async function prepareSignatureImages(item) {
    const urls = [];
    const images = new Map();
    try {
        for (const stage of APPROVAL_STAGES) {
            if (!isStageApproved(item, stage.id)) continue;
            const approval = latestDecision(item, stage.id);
            if (!approval.hasSignature || approval.id == null) continue;
            const blob = await inspectionRepository.fetchSignatureImage(item.id, approval.id);
            const url = URL.createObjectURL(await composeSignature(blob, approval.watermark || null));
            urls.push(url);
            images.set(approval.id, url);
        }
    } catch (error) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        throw error;
    }
    return { images, release: () => urls.forEach((url) => URL.revokeObjectURL(url)) };
}

/**
 * Markup lengkap laporan inspeksi (header, info, temuan, perbaikan, foto,
 * tanda tangan, footer). `signatureImages`: hasil prepareSignatureImages()
 * (id keputusan -> src gambar); tanpa itu blok pengesahan hanya berisi nama.
 */
export function buildInspectionReportHtml(item, signatureImages = new Map()) {
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
                        <div class="value"><span style="background:${item.status === INSPECTION_STATUS.COMPLETED ? '#e8f5e9' : item.status === INSPECTION_STATUS.IN_REVIEW ? '#fff3e0' : '#fce4ec'};padding:0.1rem 0.6rem;border-radius:60px;font-size:0.75rem;">${escapeHtml(formatInspectionStatus(item.status))}</span></div>
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
                        ${buildApprovalSignatures(item, signatureImages)}
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
