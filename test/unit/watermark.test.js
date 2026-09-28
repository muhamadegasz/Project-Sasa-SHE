/* watermark.test.js — Phase 17.4D: aturan watermark persetujuan
 * (domain/signature-rules.js checkWatermark). Murni, tanpa repository.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkWatermark, WATERMARK_DEFAULT_POSITION } from '../../src/domain/signature-rules.js';

test('watermark tidak aktif (tidak dikirim / false / "false") -> tanpa posisi', () => {
    for (const input of [undefined, null, {}, { enabled: false }, { enabled: 'false' }]) {
        assert.deepEqual(checkWatermark(input), { value: null }, JSON.stringify(input));
    }
});

test('watermark aktif dengan posisi ternormalisasi sah -> {x, y} (angka atau teks desimal multipart)', () => {
    assert.deepEqual(checkWatermark({ enabled: true, x: 0.25, y: 0.75 }), { value: { x: 0.25, y: 0.75 } });
    assert.deepEqual(checkWatermark({ enabled: 'true', x: '0.25', y: '0.75' }), { value: { x: 0.25, y: 0.75 } });
    assert.deepEqual(checkWatermark({ enabled: true, ...WATERMARK_DEFAULT_POSITION }), { value: { x: 0.5, y: 0.5 } });
    // Dibulatkan ke presisi kolom DECIMAL(5,4).
    assert.deepEqual(checkWatermark({ enabled: 'true', x: '0.123456', y: '0.99994' }), { value: { x: 0.1235, y: 0.9999 } });
});

test('batas posisi: 0 dan 1 (tepi area) sah; sedikit di luar ditolak', () => {
    assert.deepEqual(checkWatermark({ enabled: true, x: 0, y: 1 }), { value: { x: 0, y: 1 } });
    assert.deepEqual(checkWatermark({ enabled: 'true', x: '1', y: '0' }), { value: { x: 1, y: 0 } });
    assert.deepEqual(checkWatermark({ enabled: 'true', x: '1.0000', y: '0.0' }), { value: { x: 1, y: 0 } });
    for (const [x, y] of [[-0.0001, 0.5], [1.0001, 0.5], [0.5, -0.0001], [0.5, 1.0001], ['1.00001', '0.5'], ['0.5', '-0.1']]) {
        assert.deepEqual(checkWatermark({ enabled: true, x, y }), { error: 'POSITION_INVALID' }, `${x},${y}`);
    }
});

test('X tidak valid -> POSITION_INVALID', () => {
    for (const x of ['abc', ' 0.5', '0.5 ', '1e-1', '0x1', 'Infinity', 'NaN', '.5', Number.NaN, Number.POSITIVE_INFINITY, ['0.5'], { v: 0.5 }, true]) {
        assert.deepEqual(checkWatermark({ enabled: true, x, y: 0.5 }), { error: 'POSITION_INVALID' }, String(x));
    }
});

test('Y tidak valid -> POSITION_INVALID', () => {
    for (const y of ['abc', '2', '-0', '1,5', Number.NaN, ['0.5', '0.6'], false]) {
        assert.deepEqual(checkWatermark({ enabled: true, x: 0.5, y }), { error: 'POSITION_INVALID' }, String(y));
    }
});

test('aktif tanpa posisi lengkap -> POSITION_REQUIRED', () => {
    for (const input of [
        { enabled: true },
        { enabled: 'true', x: '0.5' },
        { enabled: 'true', y: '0.5' },
        { enabled: true, x: null, y: 0.5 },
        { enabled: 'true', x: '', y: '0.5' },
        { enabled: 'true', x: '0.5', y: '' },
    ]) {
        assert.deepEqual(checkWatermark(input), { error: 'POSITION_REQUIRED' }, JSON.stringify(input));
    }
});

test('penanda aktif tidak dikenal, atau posisi dikirim saat tidak aktif -> INVALID (tidak diabaikan diam-diam)', () => {
    for (const input of [
        { enabled: 'yes', x: 0.5, y: 0.5 },
        { enabled: '1', x: 0.5, y: 0.5 },
        { enabled: 1, x: 0.5, y: 0.5 },
        { enabled: ['true', 'true'], x: 0.5, y: 0.5 },
        { enabled: 'false', x: '0.5', y: '0.5' },
        { enabled: false, x: 0.5 },
        { x: '0.5', y: '0.5' },
    ]) {
        assert.deepEqual(checkWatermark(input), { error: 'INVALID' }, JSON.stringify(input));
    }
});
