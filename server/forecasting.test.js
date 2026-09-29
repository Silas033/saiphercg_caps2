import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastRows } from './forecasting.js';
const rows = (n, value = i => i + 1) => Array.from({ length: n }, (_, i) => {
    const month = new Date(Date.UTC(2020, i, 1)).toISOString().slice(0, 7);
    return { id: i, order_id: `order-${i}`, order_creation_date: `${month}-01`, year_month: month, is_included_in_analysis: true, is_exact_duplicate: false, region: 'R', province: 'P', category: 'C', net_quantity: value(i), line_revenue: value(i) * 10 };
});
test('real mean forecast and untouched holdout, dynamic dates and unit targets', () => {
    const result = forecastRows(rows(18), {}, 6);
    assert.equal(result.status, 'ready');
    assert.equal(result.forecast[0].value, 9.5);
    assert.equal(result.forecast[0].month, '2021-07');
    assert.equal(result.validation.points[0].predicted, 6.5);
    assert.equal(result.validation.mae, 9);
    assert.equal(forecastRows(rows(18), {}, 6, 'revenue').forecast[0].value, 95);
    assert.equal(forecastRows(rows(18), {}, 6, 'orders').forecast[0].value, 1);
    assert.ok(result.forecast.every(p => p.lower <= p.value && p.upper >= p.value));
});
test('seasonal forecast repeats same month last year and validates a full year', () => {
    const result = forecastRows(rows(36, i => i % 12 + 1));
    assert.equal(result.validation.months, 12);
    assert.equal(result.validation.mae, 0);
    assert.deepEqual(result.forecast.map(p => p.value), Array.from({ length: 12 }, (_, i) => i + 1));
});
test('sparse, empty, filtered and negative series block forecasts', () => {
    for (const data of [[], rows(17), rows(20).filter((_, i) => i !== 10), rows(20, () => -1)]) assert.equal(forecastRows(data).status, 'insufficient');
    assert.equal(forecastRows(rows(20), { categories: [] }).forecast.length, 0);
    assert.equal(forecastRows(rows(20), { region: 'Other' }).forecast.length, 0);
    assert.deepEqual(forecastRows(rows(20).filter((_, i) => i !== 10)).coverage.missingMonths, ['2020-11']);
});
test('observed zero demand stays valid, with undefined percentage metrics', () => {
    const result = forecastRows(rows(18, () => 0));
    assert.equal(result.status, 'ready');
    assert.equal(result.validation.mape, null);
    assert.equal(result.projectedChange, null);
    assert.equal(result.validation.mapeExcludedMonths, 6);
});
test('scope controls are honored and partial custom months rejected', () => {
    assert.equal(forecastRows(rows(36), { period: 'Last 12 Months' }).status, 'insufficient');
    assert.equal(forecastRows(rows(36), { period: 'Custom Range', start: '2020-01-02', end: '2022-12-31' }).status, 'insufficient');
    assert.equal(forecastRows(rows(36), { period: 'Custom Range', start: '2020-01-01', end: '2022-12-31' }).status, 'ready');
    assert.throws(() => forecastRows(rows(18), {}, 7));
    assert.throws(() => forecastRows(rows(18), {}, 6, 'bad'));
});
