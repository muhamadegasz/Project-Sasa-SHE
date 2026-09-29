/* calendar.spec.js — kalender "Jadwal Inspeksi Mingguan" di Dashboard.
 *
 * Status tiap tanggal (Terjadwal / Overdue / Selesai / Campuran) harus benar-
 * benar tampil di tanggalnya, dengan warna yang SAMA dengan legenda. Data dibuat
 * lewat API di bulan yang tidak dipakai spec lain (dihitung relatif terhadap
 * hari ini), lalu kalender dinavigasi ke bulan itu lewat tombol sungguhan.
 */

import { test, expect } from './support/test.js';
import { loginViaUi } from './support/ui.js';
import { apiLogin } from './support/api.js';

const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const NOW = new Date();

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
const monthLabel = (year, month) => `${MONTH_NAMES[month]} ${year}`;

/**
 * Bulan fixture relatif terhadap hari ini: cukup dekat supaya navigasinya
 * hanya beberapa klik, dan di luar rentang seed jadwal (-7..+35 hari). Tanggal
 * yang dipakai (3, 8, 9, 14, 16, 17, 19, 22, 28) tidak bentrok dengan tanggal
 * tetap di schedule.spec.js (5, 12, 25).
 */
function monthFromNow(offset) {
    const date = new Date(NOW.getFullYear(), NOW.getMonth() + offset, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
}

async function createSchedules(rows) {
    const arif = await apiLogin('arif');
    for (const row of rows) {
        const res = await arif.context.post('/api/schedules', {
            headers: { 'X-CSRF-Token': arif.csrfToken },
            data: { plantId: 9, officer: 'Arif', tahun: 2026, periode: 1, minggu: 1, tanggalRealisasi: '', ...row },
        });
        expect(res.status(), await res.text()).toBe(201);
    }
    await arif.context.dispose();
}

/** Navigasi lewat tombol sungguhan dari bulan yang sedang tampil, menunggu tiap render selesai. */
async function goToMonth(page, year, month) {
    const label = page.getByTestId('calendar-month');
    const [name, yearText] = (await label.textContent()).trim().split(' ');
    let current = { year: Number(yearText), month: MONTH_NAMES.indexOf(name) };
    const diff = (year - current.year) * 12 + (month - current.month);
    const button = page.getByRole('button', { name: diff < 0 ? 'Bulan sebelumnya' : 'Bulan berikutnya' });
    for (let step = 0; step < Math.abs(diff); step++) {
        const next = new Date(current.year, current.month + Math.sign(diff), 1);
        current = { year: next.getFullYear(), month: next.getMonth() };
        await button.click();
        await expect(label).toHaveText(monthLabel(current.year, current.month));
    }
}

const cell = (page, key) => page.locator(`#calendarContainer .day-cell[data-date="${key}"]`);

async function dotColor(locator) {
    return locator.evaluate((element) => getComputedStyle(element).backgroundColor);
}

test('status per tanggal: Terjadwal, Overdue, Selesai, Campuran tampil di tanggalnya; warna titik = warna legenda', async ({ page }) => {
    const past = monthFromNow(-3);
    const future = monthFromNow(3);
    const p = (day) => dateKey(past.year, past.month, day);
    const f = (day) => dateKey(future.year, future.month, day);
    await createSchedules([
        { tanggalJadwal: p(8) },                                   // overdue
        { tanggalJadwal: p(14), tanggalRealisasi: p(14) },         // selesai (satu kali, hari yang sama)
        { tanggalJadwal: p(19), tanggalRealisasi: p(19) },         // campuran: selesai + tertunda
        { tanggalJadwal: p(19) },
        { tanggalJadwal: p(22) },                                  // campuran: tertunda + realisasi jadwal lain
        { tanggalJadwal: p(3), tanggalRealisasi: p(22) },
        { tanggalJadwal: f(16) },                                  // terjadwal
        { tanggalJadwal: f(17) }, { tanggalJadwal: f(17) },        // dua terjadwal di satu tanggal
    ]);

    await loginViaUi(page, 'arif');
    const legend = page.getByTestId('calendar-legend');
    await expect(legend.locator('.legend-item')).toHaveText(['Terjadwal', 'Overdue', 'Selesai', 'Campuran (beberapa status)']);
    const legendColor = {};
    for (const status of ['scheduled', 'overdue', 'completed']) {
        legendColor[status] = await dotColor(legend.locator(`.legend-item[data-status="${status}"] .cal-dot`));
    }
    expect(new Set(Object.values(legendColor)).size, 'tiga status, tiga warna berbeda').toBe(3);

    await goToMonth(page, past.year, past.month);
    for (const [day, state, indicators] of [
        [8, 'terlambat', ['overdue']],
        [14, 'selesai', ['completed']],
        [19, 'campuran', ['overdue', 'completed']],
        [22, 'campuran', ['overdue', 'completed']],
        [3, 'selesai', ['completed']],
    ]) {
        const target = cell(page, p(day));
        await expect(target, `tgl ${day}`).toHaveAttribute('data-status', state);
        const items = target.getByTestId('day-event');
        await expect(items, `tgl ${day}`).toHaveCount(indicators.length);
        for (const [index, status] of indicators.entries()) {
            await expect(items.nth(index)).toHaveClass(new RegExp(status));
            expect(await dotColor(items.nth(index).locator('.cal-dot')), `tgl ${day} ${status} = legenda`).toBe(legendColor[status]);
        }
    }
    await expect(cell(page, p(14)).getByTestId('day-event')).toHaveText('Selesai');
    await expect(cell(page, p(11)), 'tanggal tanpa jadwal tanpa indikator').not.toHaveAttribute('data-status', /.+/);
    await expect(cell(page, p(11)).getByTestId('day-event')).toHaveCount(0);

    // Klik tanggal berjadwal membuka detail hari (perilaku yang sudah ada).
    await cell(page, p(19)).click();
    await expect(page.locator('#calendarModal')).toHaveClass(/show/);
    await expect(page.locator('#calendarModalContent')).toContainText('Logistic');
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.getByTestId('user-name')).toBeVisible();
    await goToMonth(page, future.year, future.month);
    await expect(cell(page, f(16))).toHaveAttribute('data-status', 'aktif');
    await expect(cell(page, f(16)).getByTestId('day-event')).toHaveText('Terjadwal');
    expect(await dotColor(cell(page, f(16)).locator('.cal-dot'))).toBe(legendColor.scheduled);
    await expect(cell(page, f(17)).getByTestId('day-event')).toHaveText('2 Terjadwal');
});

test('navigasi bulan & hari ini: bulan berjalan menandai tanggal hari ini; maju/mundur mengganti bulan; minggu selalu utuh', async ({ page }) => {
    await loginViaUi(page, 'arif');
    const label = page.getByTestId('calendar-month');
    await expect(label).toHaveText(monthLabel(NOW.getFullYear(), NOW.getMonth()));

    const today = page.locator('#calendarContainer .day-cell[aria-current="date"]');
    await expect(today).toHaveCount(1);
    await expect(today).toHaveClass(/today/);
    await expect(today).toHaveAttribute('data-date', dateKey(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()));
    await expect(today.locator('.day-number')).toHaveText(String(NOW.getDate()));
    const todayStyle = await today.locator('.day-number').evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(todayStyle, 'hari ini diberi penekanan').not.toBe('rgba(0, 0, 0, 0)');

    const next = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 1);
    const previous = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1);
    await page.getByRole('button', { name: 'Bulan berikutnya' }).click();
    await expect(label).toHaveText(monthLabel(next.getFullYear(), next.getMonth()));
    await expect(today).toHaveCount(0);
    await page.getByRole('button', { name: 'Bulan sebelumnya' }).click();
    await page.getByRole('button', { name: 'Bulan sebelumnya' }).click();
    await expect(label).toHaveText(monthLabel(previous.getFullYear(), previous.getMonth()));
    const cellCount = await page.locator('#calendarContainer .day-cell').count();
    expect(cellCount % 7, 'grid berisi minggu utuh').toBe(0);
    await page.getByRole('button', { name: 'Bulan berikutnya' }).click();
    await expect(label).toHaveText(monthLabel(NOW.getFullYear(), NOW.getMonth()));
    await expect(today).toHaveCount(1);
});

test('responsif: 375/390/1280/1440 — tanpa luapan horizontal, angka & titik status di dalam selnya, legenda rapi', async ({ page }) => {
    const month = monthFromNow(-4);
    const d = (day) => dateKey(month.year, month.month, day);
    await createSchedules([
        { tanggalJadwal: d(9), tanggalRealisasi: d(9) },
        { tanggalJadwal: d(9) }, { tanggalJadwal: d(9) },
        { tanggalJadwal: d(28), tanggalRealisasi: d(28) },
    ]);
    await loginViaUi(page, 'arif');
    await goToMonth(page, month.year, month.month);
    await expect(cell(page, d(9))).toHaveAttribute('data-status', 'campuran');

    for (const [width, height] of [[375, 667], [390, 844], [1280, 800], [1440, 900]]) {
        await page.setViewportSize({ width, height });
        const layout = await page.evaluate((keys) => {
            const container = document.getElementById('calendarContainer').getBoundingClientRect();
            const inside = (inner, outer) => inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5
                && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;
            const cells = [...document.querySelectorAll('#calendarContainer .day-cell')];
            const legend = document.querySelector('#calendarContainer .calendar-legend');
            return {
                pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
                cellsInside: cells.every((c) => inside(c.getBoundingClientRect(), container)),
                numbersInside: cells.every((c) => inside(c.querySelector('.day-number').getBoundingClientRect(), c.getBoundingClientRect())),
                dotsInside: keys.every((key) => {
                    const c = document.querySelector(`.day-cell[data-date="${key}"]`);
                    return [...c.querySelectorAll('.cal-dot')].every((dot) => {
                        const r = dot.getBoundingClientRect();
                        return r.width >= 6 && inside(r, c.getBoundingClientRect());
                    });
                }),
                legendFits: legend.scrollWidth <= legend.clientWidth + 0.5 && inside(legend.getBoundingClientRect(), container),
            };
        }, [d(9), d(28)]);
        expect(layout.pageOverflow, `${width}px: tanpa scroll horizontal`).toBe(false);
        expect(layout.cellsInside, `${width}px: sel di dalam kalender`).toBe(true);
        expect(layout.numbersInside, `${width}px: angka tanggal tidak terpotong`).toBe(true);
        expect(layout.dotsInside, `${width}px: titik status utuh di dalam sel`).toBe(true);
        expect(layout.legendFits, `${width}px: legenda tidak meluap`).toBe(true);
    }
});

/** Isi satu jadwal di modal Detail Jadwal (satu <tbody>), tanpa bergantung pada tata letak. */
async function readScheduleRow(row) {
    return row.evaluate((body) => {
        const field = (name) => body.querySelector(`[data-field="${name}"]`)?.textContent.trim() ?? null;
        return {
            status: body.dataset.status,
            plant: field('plant'), label: field('status'), periode: field('periode'), minggu: field('minggu'), officer: field('officer'),
            scheduledDate: field('scheduled-date'), realizedDate: field('realized-date'),
        };
    });
}

test('modal Detail Jadwal: tanggal, ringkasan = sel kalender, tabel Plant/Status/Periode/Minggu/Safety Officer; tanggal eksplisit bila berbeda; tanpa emoji/pill', async ({ page }) => {
    const past = monthFromNow(-5);
    const future = monthFromNow(5);
    const d = (day) => dateKey(past.year, past.month, day);
    const f = (day) => dateKey(future.year, future.month, day);
    const long = (target, day) => `${day} ${MONTH_NAMES[target.month]} ${target.year}`;
    await createSchedules([
        { tanggalJadwal: d(16), plantId: 1, officer: 'Tulus', periode: 2, minggu: 3 },        // overdue
        { tanggalJadwal: d(16), tanggalRealisasi: d(16), plantId: 16, officer: 'Mustofa' },  // selesai, hari yang sama -> satu baris, tanpa tanggal tambahan
        { tanggalJadwal: d(16), tanggalRealisasi: d(23), plantId: 9, officer: 'Melka' },     // selesai, direalisasi tanggal lain
        { tanggalJadwal: f(9), plantId: 9, officer: 'Arif', periode: 4, minggu: 2 },         // satu jadwal terjadwal
    ]);

    await loginViaUi(page, 'arif');
    const legendColor = {};
    for (const status of ['scheduled', 'overdue', 'completed']) {
        legendColor[status] = await dotColor(page.locator(`.calendar-legend .legend-item[data-status="${status}"] .cal-dot`));
    }
    await goToMonth(page, past.year, past.month);
    await expect(cell(page, d(16)).getByTestId('day-event')).toHaveText(['Overdue', '2 Selesai']);

    const modal = page.locator('#calendarModal');
    const rows = modal.getByTestId('day-schedule');
    await cell(page, d(16)).click();
    await expect(modal).toHaveClass(/show/);
    await expect(page.locator('#calendarModalTitle')).toHaveText('Detail Jadwal');
    await expect(modal.getByTestId('day-date')).toHaveText(long(past, 16));
    await expect(modal.getByTestId('day-summary')).toHaveText('3 jadwal inspeksi');
    await expect(modal.getByTestId('day-breakdown'), 'sama dengan indikator sel').toHaveText('1 Overdue · 2 Selesai');
    await expect(modal.locator('.day-schedule-table thead th')).toHaveText(['Plant', 'Status', 'Periode', 'Minggu', 'Safety Officer']);
    await expect(rows, 'jadwal yang direalisasi di hari yang sama tidak diulang').toHaveCount(3);
    const expected = [
        { status: 'overdue', plant: 'Electrical dan Instrument', label: 'Overdue', periode: '2', minggu: '3', officer: 'Tulus', scheduledDate: null, realizedDate: null },
        { status: 'completed', plant: 'UTILITY', label: 'Selesai', periode: '1', minggu: '1', officer: 'Mustofa', scheduledDate: null, realizedDate: null },
        { status: 'completed', plant: 'Logistic', label: 'Selesai', periode: '1', minggu: '1', officer: 'Melka', scheduledDate: long(past, 16), realizedDate: long(past, 23) },
    ];
    for (const [index, row] of expected.entries()) {
        expect(await readScheduleRow(rows.nth(index)), row.plant).toEqual(row);
        expect(await rows.nth(index).locator('.day-schedule-status').evaluate((el) => getComputedStyle(el).color), `${row.plant}: warna status = legenda`)
            .toBe(legendColor[row.status]);
    }
    const presentation = await page.locator('#calendarModalContent').evaluate((root) => ({
        text: root.textContent,
        rounded: [...root.querySelectorAll('*')]
            .filter((el) => !el.classList.contains('cal-dot') && parseFloat(getComputedStyle(el).borderTopLeftRadius) > 0)
            .map((el) => el.className),
    }));
    expect(presentation.text, 'tanpa emoji').not.toMatch(/\p{Extended_Pictographic}/u);
    expect(presentation.text, 'tanggal tidak digabung ke kalimat metadata').not.toMatch(/Dijadwalkan|Direalisasi/);
    expect(presentation.rounded, 'tanpa pill/kartu di dalam modal').toEqual([]);

    for (const [width, height] of [[375, 667], [390, 844], [1280, 800], [1440, 900]]) {
        await page.setViewportSize({ width, height });
        const layout = await page.locator('#calendarModal .modal-box').evaluate((box) => {
            const rect = box.getBoundingClientRect();
            const rows = [...box.querySelectorAll('[data-testid="day-schedule"]')];
            const visible = (el) => el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
            const fields = rows.flatMap((row) => [...row.querySelectorAll('[data-field]')]);
            const valueCells = [...box.querySelectorAll('td[data-field="periode"], td[data-field="minggu"], td[data-field="officer"]')];
            return {
                left: rect.left, right: rect.right, width: rect.width,
                contentOverflow: box.scrollWidth > box.clientWidth,
                pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
                allFieldsVisible: fields.every(visible),
                fieldsInside: fields.every((el) => el.getBoundingClientRect().right <= rect.right + 0.5),
                headerVisible: visible(box.querySelector('.day-schedule-table thead')),
                labels: valueCells.map((td) => getComputedStyle(td, '::before').content),
                plantFont: parseFloat(getComputedStyle(box.querySelector('[data-field="plant"]')).fontSize),
                valueFont: parseFloat(getComputedStyle(box.querySelector('td[data-field="officer"]')).fontSize),
            };
        });
        expect(layout.left, `${width}px: modal di dalam layar`).toBeGreaterThanOrEqual(0);
        expect(layout.right, `${width}px: modal di dalam layar`).toBeLessThanOrEqual(width);
        expect(layout.contentOverflow || layout.pageOverflow, `${width}px: tanpa luapan horizontal`).toBe(false);
        expect(layout.allFieldsVisible, `${width}px: tidak ada data yang hilang`).toBe(true);
        expect(layout.fieldsInside, `${width}px: data di dalam modal`).toBe(true);
        expect(layout.plantFont, `${width}px: plant tetap terbaca`).toBeGreaterThanOrEqual(14);
        expect(layout.valueFont, `${width}px: nilai tidak terlalu kecil`).toBeGreaterThanOrEqual(13);
        if (width >= 1280) {
            expect(layout.headerVisible, `${width}px: tabel dengan header kolom`).toBe(true);
            expect(layout.width, `${width}px: modal 720–800px`).toBeGreaterThanOrEqual(720);
            expect(layout.width).toBeLessThanOrEqual(800);
        } else {
            expect(layout.headerVisible, `${width}px: tanpa header tabel — baris label–nilai`).toBe(false);
            expect(layout.labels.every((content) => /^"(Periode|Minggu|Safety Officer)"$/.test(content)), `${width}px: setiap nilai berlabel`).toBe(true);
        }
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('#closeCalendarModal').click();
    await expect(modal).not.toHaveClass(/show/);

    // Satu jadwal, ditampilkan di tanggal realisasinya (jadwal aslinya tanggal 16).
    await cell(page, d(23)).click();
    await expect(modal.getByTestId('day-summary')).toHaveText('1 jadwal inspeksi · 1 Selesai');
    await expect(modal.getByTestId('day-breakdown')).toHaveCount(0);
    await expect(rows).toHaveCount(1);
    expect(await readScheduleRow(rows.first())).toEqual(expected[2]);
    await page.locator('#closeCalendarModal').click();

    // Satu jadwal terjadwal di masa depan.
    await goToMonth(page, future.year, future.month);
    await cell(page, f(9)).click();
    await expect(modal.getByTestId('day-date')).toHaveText(long(future, 9));
    await expect(modal.getByTestId('day-summary')).toHaveText('1 jadwal inspeksi · 1 Terjadwal');
    await expect(rows).toHaveCount(1);
    expect(await readScheduleRow(rows.first())).toEqual({
        status: 'scheduled', plant: 'Logistic', label: 'Terjadwal', periode: '4', minggu: '2', officer: 'Arif', scheduledDate: null, realizedDate: null,
    });
    expect(await modal.locator('.day-summary-count').evaluate((el) => getComputedStyle(el).color)).toBe(legendColor.scheduled);
});
