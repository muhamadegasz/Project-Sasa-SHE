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
import { documentationPhotos } from '../components/documentation-photos.js';

const PHOTO_UNAVAILABLE = 'Berkas foto tidak tersedia';

/**
 * Section Dokumentasi Foto: foto sungguhan (gambar yang disiapkan
 * preparePhotoImages — ukuran & rasio aspek asli, tidak dipotong), dua per
 * baris. Setiap baris foto tidak dibelah antarhalaman, dan judul section
 * menempel pada baris pertama (tidak tertinggal sendirian di bawah halaman);
 * baris berikutnya boleh berlanjut ke halaman selanjutnya (15-print.css).
 * Foto yang berkasnya tidak ada di server ditandai, bukan diganti ikon kamera.
 */
function buildPhotoSection(item, photoImages) {
    const title = '<div class="title"><i class="fas fa-images"></i> Dokumentasi Foto</div>';
    const photos = documentationPhotos(item);
    if (photos.length === 0) {
        return `<div class="pdf-photos-start">${title}<p class="pdf-photo-empty">Tidak ada dokumentasi foto.</p></div>`;
    }
    const figures = photos.map((photo) => {
        const src = photoImages.get(photo.id);
        const media = src
            ? `<img class="pdf-photo-img" src="${escapeHtml(src)}" alt="${escapeHtml(`${photo.slot}: ${photo.originalName}`)}">`
            : `<div class="pdf-photo-missing">${PHOTO_UNAVAILABLE}</div>`;
        return `
            <figure class="pdf-photo" data-photo-id="${escapeHtml(photo.id)}">
                ${media}
                <figcaption>${escapeHtml(photo.slot)} · ${escapeHtml(photo.originalName)}</figcaption>
            </figure>`;
    });
    const rows = [];
    for (let index = 0; index < figures.length; index += 2) {
        rows.push(`<div class="pdf-photo-row">${figures.slice(index, index + 2).join('')}</div>`);
    }
    return `<div class="pdf-photos-start">${title}${rows[0]}</div>${rows.slice(1).join('')}`
        + `<div class="pdf-photo-count">${photos.length} foto</div>`;
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
 * Menyiapkan foto dokumentasi untuk PDF: setiap foto diambil lewat endpoint
 * terotorisasi yang sama dengan Detail/lightbox (sesi + cakupan visibilitas
 * inspeksi — bukan /uploads, bukan URL publik baru), menjadi URL blob:
 * sementara; berkas asli tidak diubah. 404 = berkasnya tidak ada di server
 * (mis. data seed tanpa berkas) -> dicetak sebagai "tidak tersedia". Kegagalan
 * lain (sesi, jaringan, server) = error: PDF tidak dibuat setengah-setengah.
 *
 * @returns {Promise<{ images: Map<number, string>, release: () => void }>}
 */
export async function preparePhotoImages(item) {
    const photos = documentationPhotos(item);
    const results = await Promise.allSettled(photos.map((photo) => inspectionRepository.fetchPhotoImage(photo.id)));
    const images = new Map();
    const urls = [];
    let failure = null;
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            const url = URL.createObjectURL(result.value);
            urls.push(url);
            images.set(photos[index].id, url);
        } else if (result.reason?.status !== 404 && !failure) {
            failure = result.reason;
        }
    });
    const release = () => urls.forEach((url) => URL.revokeObjectURL(url));
    if (failure) { release(); throw failure; }
    return { images, release };
}

/**
 * Menunggu semua gambar laporan siap sebelum html2canvas memotret. Foto yang
 * terambil tetapi isinya tidak bisa ditampilkan diberi keterangan yang sama
 * dengan berkas yang tidak ada — bukan kotak kosong/rusak di PDF.
 */
export async function settleReportImages(container) {
    await Promise.all([...container.querySelectorAll('img')].map((img) => img.decode().catch(() => {
        if (!img.classList.contains('pdf-photo-img')) return;
        const missing = document.createElement('div');
        missing.className = 'pdf-photo-missing';
        missing.textContent = PHOTO_UNAVAILABLE;
        img.replaceWith(missing);
    })));
}

/**
 * Markup lengkap laporan inspeksi (header, info, temuan, perbaikan, foto,
 * tanda tangan, footer). `signatureImages`: hasil prepareSignatureImages()
 * (id keputusan -> src gambar); tanpa itu blok pengesahan hanya berisi nama.
 * `photoImages`: hasil preparePhotoImages() (id foto -> src gambar).
 */
export function buildInspectionReportHtml(item, signatureImages = new Map(), photoImages = new Map()) {
    const now = new Date();

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

                <div class="section pdf-table-section">
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

                <div class="section pdf-table-section">
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

                <div class="section pdf-photos" data-testid="pdf-photos">
                    ${buildPhotoSection(item, photoImages)}
                </div>

                <!-- Penutup = Lembar Pengesahan + footer: satu blok yang tidak dibelah
                     (15-print.css), jadi footer tidak pernah sendirian di halaman baru.
                     Stempel ditambatkan ke footer, tidak menutupi tanda tangan. -->
                <div class="pdf-closing">
                    <div class="section">
                        <div class="title"><i class="fas fa-stamp"></i> Lembar Pengesahan</div>
                        <div class="signature-block" style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:1rem;margin-top:0.5rem;">
                            ${buildApprovalSignatures(item, signatureImages)}
                        </div>
                    </div>

                    <div class="pdf-footer">
                        <div class="legal-text">
                            <i class="fas fa-check-circle"></i>
                            Dokumen ini dihasilkan oleh <strong>Sistem Informasi K3 SHE Sasa</strong>. Setiap tahap
                            persetujuan tercatat di sistem beserta nama penyetuju dan tanggal keputusannya.
                            <br>
                            <span style="font-size:0.65rem;">Tanda tangan pada dokumen ini berupa gambar tanda tangan yang dibubuhkan melalui sistem, bukan tanda tangan elektronik tersertifikasi.</span>
                        </div>

                        <div style="margin-top:0.5rem;font-size:0.6rem;color:#aaa;text-align:center;">
                            Dicetak pada: ${now.toLocaleString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            <br>
                            © SHE Sasa - Sistem Informasi K3
                        </div>

                        <div class="pdf-stamp">
                            DISETUJUI
                            <small>Elektronik</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
}
