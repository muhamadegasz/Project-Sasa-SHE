/* pagination-nav.js — navigasi halaman di bawah tabel: satu markup untuk
 * semua tabel berhalaman (pola Inspeksi Terbaru).
 *
 * Layar lebar: "Menampilkan 1–10 dari 57 inspeksi", lalu "← Sebelumnya 1 2 3
 * Berikutnya →". Layar sempit (16-responsive.css): "1–10 dari 57" dan
 * "← Sebelumnya 2 / 6 Berikutnya →". Tombol memakai data-action `action`
 * (didaftarkan legacy-app.js) dengan data-page tujuan.
 */

import { escapeHtml } from '../../shared/html.js';
import { pageRange, pageWindow } from '../../shared/pagination.js';

/**
 * @param {HTMLElement|null} nav elemen <nav class="table-pagination">
 * @param {{ page: number, totalPages: number, total: number, limit: number }} pagination
 * @param {{ action: string, noun: string, testId?: string }} options
 */
export function renderPaginationNav(nav, pagination, { action, noun, testId }) {
    if (!nav) return;
    const range = pageRange(pagination);
    if (!range) { nav.innerHTML = ''; return; }
    const { page, totalPages, total } = pagination;
    const testIdAttr = testId ? ` data-testid="${escapeHtml(testId)}"` : '';
    const summary = `<p class="pagination-summary"${testIdAttr}>`
        + `<span class="pagination-summary-long">Menampilkan </span>${range.from}–${range.to} dari ${total}`
        + `<span class="pagination-summary-long"> ${escapeHtml(noun)}</span></p>`;
    if (totalPages <= 1) { nav.innerHTML = summary; return; }

    const button = (target, label, disabled) =>
        `<button type="button" class="pagination-btn" data-action="${escapeHtml(action)}" data-page="${target}"${disabled ? ' disabled' : ''}>${label}</button>`;
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
