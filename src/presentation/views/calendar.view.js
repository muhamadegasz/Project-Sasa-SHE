/* calendar.view.js — kalender bulanan dan modal detail hari.
 *
 * Dipindah apa adanya dari legacy-app.js (Phase 8). Menyimpan sendiri bulan/tahun
 * yang sedang ditampilkan (state presentasi murni, bukan data aplikasi).
 *
 * Status per tanggal dihitung domain/schedule-rules.js (calendarDays,
 * calendarDayState) dengan aturan yang sama dengan tabel Penjadwalan —
 * sebelumnya kalender menghitung "overdue" sendiri, dan tanggal berisi
 * realisasi + jadwal tertunda salah tampil "selesai".
 */

import { escapeHtml } from '../../shared/html.js';
import * as scheduleRepository from '../../repositories/schedule-repository.js';
import { calendarDayState, calendarDays, getState, scheduleDateKey } from '../../domain/schedule-rules.js';
import { SCHEDULE_STATE } from '../../domain/statuses.js';
import { bindModalClose, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();

/**
 * Indikator status di tanggal DAN di legenda — satu daftar, satu kelas CSS
 * (.cal-dot.<className>) per status, sehingga warna keduanya selalu sama.
 * Tanggal "campuran" menampilkan titik setiap status yang ada di dalamnya.
 */
const STATUS_INDICATORS = [
    { state: SCHEDULE_STATE.AKTIF, className: 'scheduled', label: 'Terjadwal' },
    { state: SCHEDULE_STATE.TERLAMBAT, className: 'overdue', label: 'Overdue' },
    { state: SCHEDULE_STATE.SELESAI, className: 'completed', label: 'Selesai' },
];

const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function dateKeyOf(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "2026-10-12" -> "12 Oktober 2026" (dari teks, tanpa new Date()). */
function longDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

function renderDayIndicators(counts) {
    return STATUS_INDICATORS
        .filter(({ state }) => counts[state] > 0)
        .map(({ state, className, label }) => `
            <span class="day-event ${className}" data-testid="day-event">
                <span class="cal-dot ${className}"></span><span class="day-event-label">${counts[state] > 1 ? `${counts[state]} ${label}` : label}</span>
            </span>`)
        .join('');
}

function renderOtherMonthCell(day, weekday) {
    return `<div class="day-cell other-month${weekday === 0 || weekday === 6 ? ' weekend' : ''}"><span class="day-number">${day}</span></div>`;
}

export async function renderCalendar() {
    const container = document.getElementById('calendarContainer');
    if (!container) return;

    const monthNames = MONTH_NAMES;
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1).getDay();
    const daysInMonth = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentCalendarYear, currentCalendarMonth, 0).getDate();

    const today = new Date();
    const todayKey = dateKeyOf(today.getFullYear(), today.getMonth(), today.getDate());

    // Aturan keadaan sama dengan tabel Penjadwalan (domain/schedule-rules.js).
    const days = calendarDays(await scheduleRepository.getAll(), today);

    let html = `
        <div class="calendar-header">
            <button class="nav-btn" data-action="changeCalendarMonth" data-delta="-1" aria-label="Bulan sebelumnya"><i class="fas fa-chevron-left" aria-hidden="true"></i></button>
            <span class="month-year" data-testid="calendar-month">${monthNames[currentCalendarMonth]} ${currentCalendarYear}</span>
            <button class="nav-btn" data-action="changeCalendarMonth" data-delta="1" aria-label="Bulan berikutnya"><i class="fas fa-chevron-right" aria-hidden="true"></i></button>
        </div>
        <div class="calendar-grid">
    `;

    dayNames.forEach(name => {
        html += `<div class="day-name">${name}</div>`;
    });

    for (let i = 0; i < firstDay; i++) {
        html += renderOtherMonthCell(daysInPrevMonth - firstDay + i + 1, i);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = dateKeyOf(currentCalendarYear, currentCalendarMonth, day);
        const weekday = (firstDay + day - 1) % 7;
        const counts = days[dateKey];
        const classes = ['day-cell'];
        if (dateKey === todayKey) classes.push('today');
        if (weekday === 0 || weekday === 6) classes.push('weekend');
        if (counts) classes.push('has-event');

        html += `
            <div class="${classes.join(' ')}" data-date="${escapeHtml(dateKey)}"
                 ${dateKey === todayKey ? 'aria-current="date"' : ''}
                 ${counts ? `data-action="showDayEvents" data-status="${escapeHtml(calendarDayState(counts))}"` : ''}>
                <span class="day-number">${day}</span>
                ${counts ? `<span class="day-events">${renderDayIndicators(counts)}</span>` : ''}
            </div>
        `;
    }

    // Minggu terakhir dilengkapi hari bulan berikutnya — grid bergaris tetap utuh.
    const trailing = (7 - ((firstDay + daysInMonth) % 7)) % 7;
    for (let day = 1; day <= trailing; day++) {
        html += renderOtherMonthCell(day, (firstDay + daysInMonth + day - 1) % 7);
    }

    html += `</div>`;

    html += `
        <div class="calendar-legend" data-testid="calendar-legend">
            ${STATUS_INDICATORS.map(({ className, label }) => `
                <span class="legend-item" data-status="${className}"><span class="cal-dot ${className}"></span>${label}</span>`).join('')}
            <span class="legend-item" data-status="mixed"><span class="cal-dot scheduled"></span><span class="cal-dot completed"></span>Campuran (beberapa status)</span>
        </div>
    `;

    container.innerHTML = html;
}

export async function changeCalendarMonth(delta) {
    currentCalendarMonth += delta;
    if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
    } else if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
    }
    await renderCalendar();
}

/**
 * Jadwal pada satu tanggal, dengan aturan yang sama dengan sel kalender
 * (domain calendarDays): di tanggal jadwalnya berstatus getState(); di tanggal
 * realisasinya (bila berbeda) berstatus selesai. Satu jadwal satu baris —
 * sebelumnya jadwal yang direalisasi di hari yang sama tampil dua kali, dan
 * jadwal terlewat tampil "Terjadwal" padahal selnya Overdue.
 */
function schedulesOnDate(schedules, dateKey, now) {
    const entries = [];
    for (const schedule of schedules) {
        const scheduledKey = schedule.tanggalJadwal ? scheduleDateKey(schedule.tanggalJadwal) : null;
        const realizedKey = schedule.tanggalRealisasi ? scheduleDateKey(schedule.tanggalRealisasi) : null;
        if (scheduledKey === dateKey) {
            entries.push({ schedule, state: getState(schedule, now), scheduledKey, realizedKey });
        } else if (realizedKey === dateKey) {
            entries.push({ schedule, state: SCHEDULE_STATE.SELESAI, scheduledKey, realizedKey });
        }
    }
    return entries;
}

/** Ringkasan dari hitungan sel kalender yang sama (calendarDays). */
function renderDaySummary(counts) {
    const total = STATUS_INDICATORS.reduce((sum, { state }) => sum + counts[state], 0);
    const parts = STATUS_INDICATORS
        .filter(({ state }) => counts[state] > 0)
        .map(({ state, className, label }) => `<span class="day-summary-count ${className}">${counts[state]} ${label}</span>`);
    if (parts.length === 1) {
        return `<p class="day-detail-summary" data-testid="day-summary">${total} jadwal inspeksi · ${parts[0]}</p>`;
    }
    return `
        <p class="day-detail-summary" data-testid="day-summary">${total} jadwal inspeksi</p>
        <p class="day-detail-breakdown" data-testid="day-breakdown">${parts.join(' · ')}</p>`;
}

/**
 * Satu jadwal = satu <tbody>: baris data (kolom tabel di desktop; baris
 * label–nilai di layar sempit, lihat 16-responsive.css) dan — hanya bila
 * tanggal jadwal & realisasinya berbeda — baris tanggal yang eksplisit.
 */
function renderDaySchedule({ schedule, state, scheduledKey, realizedKey }) {
    const { className, label } = STATUS_INDICATORS.find((indicator) => indicator.state === state);
    const cell = (field, heading, value) =>
        `<td class="col-${field}" data-field="${field}" data-label="${heading}">${escapeHtml(value ?? '-')}</td>`;
    const dates = realizedKey && scheduledKey && realizedKey !== scheduledKey ? `
            <tr class="day-schedule-dates">
                <td colspan="5">
                    <dl>
                        <div><dt>Tanggal Jadwal</dt><dd data-field="scheduled-date">${escapeHtml(longDate(scheduledKey))}</dd></div>
                        <div><dt>Tanggal Realisasi</dt><dd data-field="realized-date">${escapeHtml(longDate(realizedKey))}</dd></div>
                    </dl>
                </td>
            </tr>` : '';
    return `
        <tbody class="day-schedule" data-testid="day-schedule" data-status="${className}">
            <tr>
                ${cell('plant', 'Plant', schedule.plantName)}
                <td class="col-status" data-field="status" data-label="Status"><span class="day-schedule-status ${className}"><span class="cal-dot ${className}"></span>${label}</span></td>
                ${cell('periode', 'Periode', schedule.periode)}
                ${cell('minggu', 'Minggu', schedule.minggu)}
                ${cell('officer', 'Safety Officer', schedule.officer)}
            </tr>${dates}
        </tbody>`;
}

export async function showDayEvents(dateKey) {
    const schedules = await scheduleRepository.getAll();
    const now = new Date();
    const entries = schedulesOnDate(schedules, dateKey, now);
    const counts = calendarDays(schedules, now)[dateKey];

    if (entries.length === 0 || !counts) {
        showToast('📅 Tidak ada jadwal pada tanggal ini');
        return;
    }

    document.getElementById('calendarModalContent').innerHTML = `
        <div class="day-detail-header">
            <p class="day-detail-date" data-testid="day-date">${escapeHtml(longDate(dateKey))}</p>
            ${renderDaySummary(counts)}
        </div>
        <table class="day-schedule-table">
            <thead>
                <tr><th scope="col">Plant</th><th scope="col">Status</th><th scope="col" class="col-periode">Periode</th><th scope="col" class="col-minggu">Minggu</th><th scope="col">Safety Officer</th></tr>
            </thead>
            ${entries.map(renderDaySchedule).join('')}
        </table>
    `;

    openModal('calendarModal');
}

bindModalClose('calendarModal', 'closeCalendarModal');
