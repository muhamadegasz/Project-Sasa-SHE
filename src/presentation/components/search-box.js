/* search-box.js — pencarian langsung-ketik dengan tombol hapus dan penghitung hasil.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 7). Sudah berupa factory
 * sejak semula dan dipakai 4 kali (pencarian inspeksi, semua inspeksi,
 * jadwal, perbaikan) — tidak ada duplikasi untuk dihilangkan di sini,
 * dipindah semata agar sejajar dengan komponen presentasi lain.
 */

import { filterByFields } from '../../services/search-service.js';

/**
 * @param {string} inputId
 * @param {string} clearId
 * @param {string} countId
 * @param {() => object[]} dataGetter
 * @param {(items: object[], query: string) => void} renderFunction
 * @param {string[]} searchFields
 */
export function setupSearch(inputId, clearId, countId, dataGetter, renderFunction, searchFields) {
    const input = document.getElementById(inputId);
    const clearBtn = document.getElementById(clearId);
    const countEl = document.getElementById(countId);
    if (!input) return;

    function doSearch() {
        const query = input.value.trim().toLowerCase();
        const data = dataGetter();
        if (query === '') {
            clearBtn.classList.remove('visible');
            countEl.textContent = '';
            renderFunction(data, '');
            return;
        }
        clearBtn.classList.add('visible');
        const filtered = filterByFields(data, query, searchFields);
        countEl.textContent = `${filtered.length} dari ${data.length}`;
        renderFunction(filtered, query);
    }
    input.addEventListener('input', doSearch);
    clearBtn.addEventListener('click', function() {
        input.value = '';
        doSearch();
        input.focus();
    });
    doSearch();
}
