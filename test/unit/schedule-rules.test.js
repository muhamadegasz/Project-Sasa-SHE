/* schedule-rules.test.js — status jadwal per tanggal kalender (domain/schedule-rules.js). Murni, `now` dikunci. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    CALENDAR_MIXED, calendarDayState, calendarDays, getState, isOverdue, scheduleDateKey,
} from '../../src/domain/schedule-rules.js';

const NOW = new Date('2026-09-20T05:00:00Z');
const counts = (aktif, terlambat, selesai) => ({ aktif, terlambat, selesai });

test('kalender: terjadwal (masa depan) -> aktif', () => {
    const days = calendarDays([{ tanggalJadwal: '2026-09-25', tanggalRealisasi: null }], NOW);
    assert.deepEqual(days, { '2026-09-25': counts(1, 0, 0) });
    assert.equal(calendarDayState(days['2026-09-25']), 'aktif');
});

test('kalender: lewat tanggal & belum realisasi -> terlambat (aturan sama dengan tabel: getState/isOverdue)', () => {
    const schedule = { tanggalJadwal: '2026-09-10', tanggalRealisasi: null };
    assert.equal(isOverdue(schedule, NOW), true);
    assert.equal(getState(schedule, NOW), 'terlambat');
    assert.equal(calendarDayState(calendarDays([schedule], NOW)['2026-09-10']), 'terlambat');
});

test('kalender: realisasi di hari yang sama dihitung SEKALI sebagai selesai', () => {
    const days = calendarDays([{ tanggalJadwal: '2026-09-14', tanggalRealisasi: '2026-09-14' }], NOW);
    assert.deepEqual(days, { '2026-09-14': counts(0, 0, 1) });
    assert.equal(calendarDayState(days['2026-09-14']), 'selesai');
});

test('kalender: realisasi di tanggal lain menandai kedua tanggal selesai', () => {
    const days = calendarDays([{ tanggalJadwal: '2026-09-03', tanggalRealisasi: '2026-09-24' }], NOW);
    assert.deepEqual(days, { '2026-09-03': counts(0, 0, 1), '2026-09-24': counts(0, 0, 1) });
});

test('kalender: campuran — selesai bersama yang belum, termasuk realisasi jadwal lain + jadwal tertunda (dulu salah "selesai")', () => {
    const sameDay = calendarDays([
        { tanggalJadwal: '2026-09-21', tanggalRealisasi: '2026-09-21' },
        { tanggalJadwal: '2026-09-21', tanggalRealisasi: null },
    ], NOW)['2026-09-21'];
    assert.deepEqual(sameDay, counts(1, 0, 1));
    assert.equal(calendarDayState(sameDay), CALENDAR_MIXED);

    const realizationPlusPending = calendarDays([
        { tanggalJadwal: '2026-09-15', tanggalRealisasi: null },
        { tanggalJadwal: '2026-09-03', tanggalRealisasi: '2026-09-15' },
    ], NOW)['2026-09-15'];
    assert.deepEqual(realizationPlusPending, counts(0, 1, 1));
    assert.equal(calendarDayState(realizationPlusPending), CALENDAR_MIXED);
});

test('kalender: beberapa jadwal satu status dijumlah; tanpa campuran bila semua belum selesai', () => {
    const days = calendarDays([
        { tanggalJadwal: '2026-09-28', tanggalRealisasi: null },
        { tanggalJadwal: '2026-09-28', tanggalRealisasi: null },
    ], NOW);
    assert.deepEqual(days['2026-09-28'], counts(2, 0, 0));
    assert.equal(calendarDayState(days['2026-09-28']), 'aktif');
});

test('kalender: kunci tanggal diambil dari teks "YYYY-MM-DD" (tanpa new Date(), tidak bergeser zona waktu); jadwal tanpa tanggal diabaikan', () => {
    assert.equal(scheduleDateKey('2026-10-01'), '2026-10-01');
    assert.equal(scheduleDateKey('2026-10-01T00:00:00.000Z'), '2026-10-01');
    assert.deepEqual(calendarDays([{ tanggalJadwal: null, tanggalRealisasi: null }], NOW), {});
});
