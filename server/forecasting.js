import { analyzeRows } from './analytics.js';

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const nextMonth = (month, offset) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    return date.toISOString().slice(0, 7);
};

// Fixed, transparent benchmark methods. Holdout observations never enter fitting.
function predict(values, count, seasonal) {
    return Array.from({ length: count }, (_, i) => seasonal ? values[values.length - 12 + i % 12] : mean(values));
}

export function forecastRows(rows, filters = {}, horizon = 12, target = 'quantity') {
    if (![6, 12].includes(horizon)) throw new Error('Choose a 6 or 12 month horizon.');
    if (!['quantity', 'orders', 'revenue'].includes(target)) throw new Error('Invalid forecast target.');
    const analysis = analyzeRows(rows, filters);
    const history = analysis.trend.map(m => ({ month: m.name, value: m.rows ? m[target] : null, rows: m.rows }));
    const missingMonths = history.filter(m => m.value === null).map(m => m.month);
    const coverage = { start: history[0]?.month ?? null, end: history.at(-1)?.month ?? null, months: history.length, observedMonths: history.length - missingMonths.length, missingMonths, latestAvailableDate: analysis.scope.dateMax };
    const result = { target, unit: { quantity: 'net units', orders: 'distinct orders', revenue: 'PHP' }[target], filters, horizon, coverage, history, forecast: [], validation: null, status: 'insufficient', messages: [] };
    if (history.length < 18) result.messages.push('At least 18 consecutive observed months are required: 12 for training and 6 for backtesting.');
    if (missingMonths.length) result.messages.push('Months without records have unknown demand and are not treated as zero. Load or verify these months before forecasting.');
    if (filters.period === 'Custom Range' && (filters.start.slice(-2) !== '01' || nextMonth(filters.end.slice(0, 7), 1) + '-01' !== new Date(new Date(`${filters.end}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10))) result.messages.push('Choose complete calendar months for the custom range.');
    if (history.some(m => m.value !== null && m.value < 0)) result.messages.push('This scope has negative monthly totals. Review returns or choose a different target before demand forecasting.');
    if (result.messages.length) return result;
    const values = history.map(m => m.value);
    const seasonal = values.length >= 36;
    const holdout = seasonal ? 12 : 6;
    const train = values.slice(0, -holdout);
    const actual = values.slice(-holdout);
    const predicted = predict(train, holdout, seasonal);
    const errors = actual.map((y, i) => y - predicted[i]);
    const nonzero = actual.flatMap((y, i) => y !== 0 ? [Math.abs(errors[i] / y) * 100] : []);
    const baselineMae = mean(actual.map(y => Math.abs(y - train.at(-1))));
    result.validation = { months: holdout, start: history.at(-holdout).month, end: history.at(-1).month, trainingMonths: train.length, mae: mean(errors.map(Math.abs)), mape: nonzero.length ? mean(nonzero) : null, mapeExcludedMonths: holdout - nonzero.length, baselineMae, points: actual.map((value, i) => ({ month: history[history.length - holdout + i].month, actual: value, predicted: predicted[i] })) };
    const residuals = seasonal ? values.slice(12).map((y, i) => y - values[i]) : values.map(y => y - mean(values));
    const variance = residuals.reduce((sum, e) => sum + e * e, 0) / (residuals.length - (seasonal ? 0 : 1));
    const width = 1.96 * Math.sqrt(variance * (seasonal ? 1 : 1 + 1 / values.length));
    result.forecast = predict(values, horizon, seasonal).map((value, i) => ({ month: nextMonth(coverage.end, i + 1), value, lower: Math.max(0, value - width), upper: value + width }));
    result.model = seasonal ? 'Seasonal naive (previous year, same month)' : 'Historical mean';
    result.status = 'ready';
    result.projectedChange = values.at(-1) === 0 ? null : (result.forecast.at(-1).value - values.at(-1)) / values.at(-1) * 100;
    result.messages.push('Approximate 95% prediction intervals assume independent, normally distributed errors; lower bounds are clipped at zero. Coverage is not guaranteed.');
    result.messages.push('Transaction records do not prove that a month is fully uploaded. Verify the first and last month are complete before relying on results.');
    if (!seasonal) result.messages.push(`Fewer than 36 months: the mean method does not model seasonality.${horizon === 12 ? ' This 12-month forecast has only a 6-month backtest.' : ''}`);
    if (result.validation.mae >= baselineMae) result.messages.push('This method did not outperform the last-observation baseline on the holdout period. Use forecasts cautiously.');
    return result;
}
