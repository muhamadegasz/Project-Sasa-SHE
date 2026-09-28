/* cdn-integrity.spec.js — SECURITY.md S-05: setiap sumber CDN memakai
 * Subresource Integrity, dan keempat pustaka tetap termuat dengan hash itu.
 */

import { test, expect } from './support/test.js';

test('S-05: semua script/stylesheet CDN ber-SRI + crossorigin, dan pustakanya termuat tanpa galat integritas', async ({ page }) => {
    const integrityErrors = [];
    page.on('console', (message) => { if (/integrity/i.test(message.text())) integrityErrors.push(message.text()); });

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Masuk' })).toBeVisible();

    const external = await page.$$eval('script[src^="http"], link[rel="stylesheet"][href^="http"]', (elements) =>
        elements.filter((el) => !/fonts\.googleapis\.com/.test(el.src || el.href)).map((el) => ({
            url: el.src || el.href, integrity: el.getAttribute('integrity'), crossorigin: el.getAttribute('crossorigin'),
        })));
    expect(external).toHaveLength(4);
    for (const resource of external) {
        expect(resource.integrity, resource.url).toMatch(/^sha(384|512)-[A-Za-z0-9+/]+=*$/);
        expect(resource.crossorigin, resource.url).toBe('anonymous');
    }

    const loaded = await page.evaluate(() => ({
        chart: typeof window.Chart === 'function',
        xlsx: typeof window.XLSX === 'object' && typeof window.XLSX.utils === 'object',
        html2pdf: typeof window.html2pdf === 'function',
        fontAwesome: [...document.styleSheets].some((sheet) => /font-awesome/.test(sheet.href || '') && sheet.cssRules.length > 0),
    }));
    expect(loaded).toEqual({ chart: true, xlsx: true, html2pdf: true, fontAwesome: true });
    expect(integrityErrors).toEqual([]);
});
