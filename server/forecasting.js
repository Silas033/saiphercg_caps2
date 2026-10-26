import { analyzeRows, selectAnalyticsRows } from './analytics.js';

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

const FORECAST_HORIZONS = [3, 6, 9, 12];
const MINIMUM_HISTORY = 3;
const meanOf = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const pairKey = (region, province) => JSON.stringify([region, province]);

function dampedTrend(values, horizon) {
    const alpha = 0.45;
    const beta = 0.2;
    const damping = 0.85;
    const initialWindow = Math.min(6, values.length - 1);
    let level = values[0];
    let trend = (values[initialWindow] - values[0]) / initialWindow;

    for (let index = 1; index < values.length; index += 1) {
        const previousLevel = level;
        const oneStepForecast = level + damping * trend;
        level = alpha * values[index] + (1 - alpha) * oneStepForecast;
        trend = beta * (level - previousLevel) + (1 - beta) * damping * trend;
    }

    return Array.from({ length: horizon }, (_, index) => {
        const step = index + 1;
        const dampedSteps = damping * (1 - damping ** step) / (1 - damping);
        return Math.max(0, level + trend * dampedSteps);
    });
}

const MODEL_NAMES = { arima: 'ARIMA(1,1,1)', prophet: 'Prophet-style trend and yearly seasonality', random_forest: 'Random Forest Regression' };

function solveLinear(matrix, vector) {
    const size = vector.length;
    const rows = matrix.map((row, index) => [...row, vector[index]]);
    for (let column = 0; column < size; column += 1) {
        let pivot = column;
        for (let row = column + 1; row < size; row += 1) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
        [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
        const divisor = rows[column][column];
        if (Math.abs(divisor) < 1e-10) continue;
        for (let j = column; j <= size; j += 1) rows[column][j] /= divisor;
        for (let row = 0; row < size; row += 1) {
            if (row === column) continue;
            const factor = rows[row][column];
            for (let j = column; j <= size; j += 1) rows[row][j] -= factor * rows[column][j];
        }
    }
    return rows.map(row => Number.isFinite(row[size]) ? row[size] : 0);
}

function regress(features, labels, ridge = 1e-6) {
    const width = features[0].length;
    const matrix = Array.from({ length: width }, () => Array(width).fill(0));
    const vector = Array(width).fill(0);
    features.forEach((row, sample) => row.forEach((x, i) => {
        vector[i] += x * labels[sample];
        row.forEach((y, j) => { matrix[i][j] += x * y; });
    }));
    for (let i = 1; i < width; i += 1) matrix[i][i] += ridge;
    return solveLinear(matrix, vector);
}

function arimaForecast(values, horizon) {
    if (values.length < 3) return dampedTrend(values, horizon);
    const differences = values.slice(1).map((value, index) => value - values[index]);
    const meanDifference = mean(differences);
    const centered = differences.map(value => value - meanDifference);
    const denominator = centered.slice(0, -1).reduce((sum, value) => sum + value * value, 0);
    const phi = denominator ? Math.max(-0.95, Math.min(0.95, centered.slice(1).reduce((sum, value, index) => sum + value * centered[index], 0) / denominator)) : 0;
    let residuals = [0];
    for (let index = 1; index < centered.length; index += 1) residuals[index] = centered[index] - phi * centered[index - 1] - 0.2 * residuals[index - 1];
    const residualDenominator = residuals.slice(0, -1).reduce((sum, value) => sum + value * value, 0);
    const theta = residualDenominator ? Math.max(-0.8, Math.min(0.8, residuals.slice(1).reduce((sum, value, index) => sum + value * residuals[index], 0) / residualDenominator)) : 0;
    let differenceForecast = meanDifference + phi * (differences.at(-1) - meanDifference) + theta * residuals.at(-1);
    let level = values.at(-1);
    const forecasts = [];
    for (let index = 0; index < horizon; index += 1) {
        level = Math.max(0, level + differenceForecast);
        forecasts.push(level);
        differenceForecast = meanDifference + phi * (differenceForecast - meanDifference);
    }
    return forecasts;
}

function prophetForecast(values, horizon) {
    const featuresAt = time => [1, time / Math.max(values.length, 1), ...[1, 2].flatMap(harmonic => [Math.sin(2 * Math.PI * harmonic * time / 12), Math.cos(2 * Math.PI * harmonic * time / 12)])];
    const features = values.map((_, time) => featuresAt(time));
    const coefficients = regress(features, values, 0.01);
    return Array.from({ length: horizon }, (_, index) => Math.max(0, featuresAt(values.length + index).reduce((sum, feature, i) => sum + feature * coefficients[i], 0)));
}

function randomForestForecast(values, horizon) {
    const first = Math.min(3, values.length - 1);
    const featureAt = time => [time / values.length, ...[1, 2, 3, 6, 12].map(lag => values[Math.max(0, time - lag)]), Math.sin(2 * Math.PI * time / 12), Math.cos(2 * Math.PI * time / 12)];
    const samples = Array.from({ length: values.length - first }, (_, offset) => ({ x: featureAt(first + offset), y: values[first + offset] }));
    const trees = Array.from({ length: 17 }, (_, treeIndex) => {
        // Deterministic bootstrap keeps the model reproducible across requests.
        const nodes = samples.map((_, index) => {
            const bootIndex = Math.floor(Math.abs(Math.sin((treeIndex + 1) * 92821 + (index + 1) * 68917) * 1e9)) % samples.length;
            return samples[bootIndex];
        });
        const build = (items, depth, salt) => {
            const prediction = mean(items.map(item => item.y));
            if (depth >= 4 || items.length < 4) return { prediction };
            let best = null;
            const itemMean = mean(items.map(item => item.y));
            const featureCount = items[0].x.length;
            for (let offset = 0; offset < Math.min(4, featureCount); offset += 1) {
                const feature = (salt + offset * 3) % featureCount;
                const ordered = [...new Set(items.map(item => item.x[feature]))].sort((a, b) => a - b);
                for (let cut = 1; cut < ordered.length; cut += 1) {
                    const threshold = (ordered[cut - 1] + ordered[cut]) / 2;
                    const left = items.filter(item => item.x[feature] <= threshold);
                    const right = items.filter(item => item.x[feature] > threshold);
                    if (left.length < 2 || right.length < 2) continue;
                    const leftMean = mean(left.map(row => row.y));
                    const rightMean = mean(right.map(row => row.y));
                    const score = left.reduce((sum, item) => sum + (item.y - leftMean) ** 2, 0) + right.reduce((sum, item) => sum + (item.y - rightMean) ** 2, 0);
                    if (!best || score < best.score) best = { feature, threshold, left, right, score };
                }
            }
            return best ? { feature: best.feature, threshold: best.threshold, left: build(best.left, depth + 1, salt + 1), right: build(best.right, depth + 1, salt + 3) } : { prediction: itemMean };
        };
        return build(nodes, 0, treeIndex);
    });
    const predictTree = (tree, features) => {
        let node = tree;
        while (node.feature !== undefined) node = features[node.feature] <= node.threshold ? node.left : node.right;
        return node.prediction;
    };
    const forecast = [];
    for (let step = 0; step < horizon; step += 1) {
        const time = values.length + step;
        const features = [time / values.length, ...[1, 2, 3, 6, 12].map(lag => {
            const index = time - lag;
            return index < values.length ? values[Math.max(0, index)] : forecast[index - values.length];
        }), Math.sin(2 * Math.PI * time / 12), Math.cos(2 * Math.PI * time / 12)];
        forecast.push(Math.max(0, mean(trees.map(tree => predictTree(tree, features)))));
    }
    return forecast;
}

function runModel(values, horizon, model) {
    if (model === 'arima') return arimaForecast(values, horizon);
    if (model === 'prophet') return prophetForecast(values, horizon);
    return randomForestForecast(values, horizon);
}

function monthIsLastDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(8, 10) === '01';
}

function customRangeIsComplete(filters) {
    return filters.period !== 'Custom Range' || (filters.start?.slice(-2) === '01' && monthIsLastDay(filters.end));
}

function toSeries(analysis, target) {
    return analysis.trend.map(month => ({
        month: month.name,
        value: month.rows ? month[target] : null,
        rows: month.rows
    }));
}

function evaluateSeries(series, horizon, target, filters = {}, orderCount = 0, model = 'arima') {
    const history = series.map(point => ({ ...point }));
    const active = history.filter(point => point.value !== null);
    const values = active.map(point => point.value);
    const missing = history.filter(point => point.value === null).map(point => point.month);
    const result = {
        status: 'insufficient',
        reason: '',
        history,
        forecast: [],
        validation: null,
        model: null,
        currentDemand: meanOf(values.slice(-12)),
        forecastDemand: null,
        growth: null,
        endDemand: null,
        trend: null,
        coverage: {
            calendarMonths: history.length,
            activeMonths: active.length,
            missingMonths: missing,
            start: history[0]?.month ?? null,
            end: history.at(-1)?.month ?? null,
            orders: orderCount
        }
    };

    if (!history.length) result.reason = 'No matching transaction history is available in this scope.';
    else if (!customRangeIsComplete(filters)) result.reason = 'Choose complete calendar months for the selected custom date range.';
    else if (missing.length) result.reason = `History has ${missing.length} month${missing.length === 1 ? '' : 's'} with no records. Missing months are unknown demand, not zero demand.`;
    else if (values.some(value => value < 0)) result.reason = 'Negative monthly demand totals cannot be forecast. Review return treatment or choose another metric.';
    else if (history.length < MINIMUM_HISTORY) result.reason = `At least ${MINIMUM_HISTORY} consecutive observed months are required for an exploratory forecast; this scope has ${history.length}.`;
    if (result.reason) return result;

    const holdoutMonths = values.length < 6 ? 0 : values.length >= 36 ? 12 : Math.min(6, values.length - 3);
    const training = values.slice(0, -holdoutMonths);
    let rmse = null;
    if (holdoutMonths > 0) {
        const actual = values.slice(-holdoutMonths);
        const predicted = runModel(training, holdoutMonths, model);
        const errors = actual.map((value, index) => value - predicted[index]);
        const absoluteErrors = errors.map(Math.abs);
        const nonzeroPercentageErrors = actual.flatMap((value, index) => value === 0 ? [] : [Math.abs(errors[index] / value) * 100]);
        rmse = Math.sqrt(meanOf(errors.map(error => error ** 2)));
        const baselineMae = meanOf(actual.map(value => Math.abs(value - training.at(-1))));

        result.validation = {
            months: holdoutMonths,
            trainingMonths: training.length,
            start: history.at(-holdoutMonths).month,
            end: history.at(-1).month,
            mae: meanOf(absoluteErrors),
            rmse,
            mape: meanOf(nonzeroPercentageErrors),
            mapeExcludedMonths: holdoutMonths - nonzeroPercentageErrors.length,
            baselineMae,
            points: actual.map((value, index) => ({
                month: history[history.length - holdoutMonths + index].month,
                actual: value,
                predicted: predicted[index]
            }))
        };
    }

    const valuesForecast = runModel(values, horizon, model);
    const average = meanOf(values);
    const historicalSpread = Math.sqrt(meanOf(values.map(value => (value - average) ** 2)));
    const fallbackRange = Math.max(historicalSpread, Math.abs(average) * 0.25, 1);
    const rangeMethod = rmse === null ? 'historical_variability' : 'backtest_rmse';
    const next = valuesForecast.map((value, index) => {
        const month = nextMonth(result.coverage.end, index + 1);
        const range = (rmse ?? fallbackRange) * Math.sqrt(index + 1);
        return {
            month,
            value,
            lower: Math.max(0, value - range),
            upper: value + range,
            rangeMethod
        };
    });
    const forecastDemand = meanOf(valuesForecast);
    const growth = result.currentDemand === 0 ? null : (forecastDemand - result.currentDemand) / result.currentDemand * 100;

    result.status = 'available';
    result.reason = '';
    result.model = MODEL_NAMES[model];
    result.forecast = next;
    result.forecastDemand = forecastDemand;
    result.endDemand = valuesForecast.at(-1);
    result.growth = growth;
    result.trend = growth === null ? 'Unavailable' : growth > 2 ? 'Increasing' : growth < -2 ? 'Decreasing' : 'Stable';
    result.reliability = values.length < 6 ? 'very_low' : values.length < 18 ? 'low' : 'backtested';
    return result;
}

function scopedAnalysis(rows, filters, { category = '', province = null } = {}) {
    const nextFilters = { ...filters };
    if (category) nextFilters.categories = [category];
    if (province) {
        nextFilters.region = province.region;
        nextFilters.province = province.name;
    }
    return analyzeRows(rows, nextFilters, { summaryOnly: true });
}

function summarize(analysis, target, horizon, filters, { includeSeries = false, includeValidationPoints = false } = {}, model = 'arima') {
    const result = evaluateSeries(toSeries(analysis, target), horizon, target, filters, analysis.summary.orders, model);
    const validation = result.validation && !includeValidationPoints
        ? Object.fromEntries(Object.entries(result.validation).filter(([key]) => key !== 'points'))
        : result.validation;
    return {
        status: result.status,
        reason: result.reason,
        model: result.model,
        currentDemand: result.currentDemand,
        forecastDemand: result.forecastDemand,
        endDemand: result.endDemand,
        growth: result.growth,
        trend: result.trend,
        coverage: result.coverage,
        reliability: result.reliability,
        validation,
        ...(includeSeries ? { history: result.history, forecast: result.forecast } : {})
    };
}

function effectiveForecastFilters(rows, filters) {
    const unboundedFilters = { ...filters, period: 'All Available Data', start: '', end: '' };
    const unbounded = analyzeRows(rows, unboundedFilters, { summaryOnly: true });
    if (filters.period !== 'Last 12 Months' && filters.period !== 'Last 24 Months') return { ...filters };
    const latestMonth = unbounded.trend.at(-1)?.name;
    if (!latestMonth) return { ...filters };
    const start = new Date(`${latestMonth}-01T00:00:00Z`);
    start.setUTCMonth(start.getUTCMonth() - (filters.period === 'Last 12 Months' ? 11 : 23));
    const end = new Date(Date.UTC(Number(latestMonth.slice(0, 4)), Number(latestMonth.slice(5, 7)), 0));
    return {
        ...filters,
        period: 'Custom Range',
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
    };
}

function buildPairForecasts(rows, filters, horizon, target, model, base = analyzeRows(rows, filters)) {
    const pairForecasts = [];
    for (const region of base.regions) {
        for (const province of region.provinces) {
            for (const item of province.categories) {
                const analysis = scopedAnalysis(rows, filters, {
                    category: item.name,
                    province: { name: province.name, region: region.name }
                });
                pairForecasts.push({
                    key: JSON.stringify([region.name, province.name, item.name]),
                    province: province.name,
                    region: region.name,
                    category: item.name,
                    ...summarize(analysis, target, horizon, filters, {}, model)
                });
            }
        }
    }
    return { base, pairForecasts };
}

export function predictiveAnalytics(rows, filters = {}, horizon = 6, target = 'revenue', category = '', provinceKey = '', model = 'arima') {
    if (!FORECAST_HORIZONS.includes(horizon)) throw new Error('Choose a 3, 6, 9, or 12 month horizon.');
    if (!['revenue', 'orders', 'quantity'].includes(target)) throw new Error('Choose revenue, orders, or quantity as the forecast metric.');
    if (!Object.hasOwn(MODEL_NAMES, model)) throw new Error('Choose a supported forecasting model.');
    if (typeof category !== 'string' || typeof provinceKey !== 'string') throw new Error('Invalid predictive selection.');

    const effectiveFilters = effectiveForecastFilters(rows, filters);
    const base = analyzeRows(rows, effectiveFilters);
    const categories = base.categories.map(item => item.name);
    const provinces = base.regions.flatMap(region => region.provinces.map(province => ({
        key: pairKey(region.name, province.name),
        name: province.name,
        region: region.name
    })));
    const provinceMap = new Map(provinces.map(province => [province.key, province]));
    let selectedProvince = provinceKey ? provinceMap.get(provinceKey) : null;
    if (provinceKey && !selectedProvince) {
        try {
            const [requestedRegion, requestedName] = JSON.parse(provinceKey);
            const normalize = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
            const provinceMatches = provinces.filter(item => normalize(item.name) === normalize(requestedName));
            selectedProvince = provinceMatches.find(item => normalize(item.region) === normalize(requestedRegion))
                || (provinceMatches.length === 1 ? provinceMatches[0] : null);
        } catch {
            // The validation below handles malformed or out-of-scope keys.
        }
    }
    if (category && !categories.includes(category)) throw new Error('The selected category is outside the current analysis scope.');
    if (provinceKey && !selectedProvince) throw new Error('The selected province is outside the current analysis scope.');

    const { pairForecasts } = buildPairForecasts(rows, effectiveFilters, horizon, target, model, base);

    const pairFilter = pairForecasts.filter(item => (!category || item.category === category)
        && (!selectedProvince || (item.province === selectedProvince.name && item.region === selectedProvince.region)));
    const compareDemand = (left, right) => (right.forecastDemand ?? -Infinity) - (left.forecastDemand ?? -Infinity);
    const overview = pairFilter.filter(item => item.status === 'available').sort(compareDemand);
    const insufficient = pairFilter.filter(item => item.status !== 'available');
    const availablePairCount = pairForecasts.filter(item => item.status === 'available').length;

    const categoryRows = categories.map(name => {
        const analysis = scopedAnalysis(rows, effectiveFilters, { category: name, province: selectedProvince });
        return { category: name, ...summarize(analysis, target, horizon, effectiveFilters, {}, model) };
    }).sort(compareDemand);

    const provinceRows = provinces.map(province => {
        const analysis = scopedAnalysis(rows, effectiveFilters, {
            category,
            province: { name: province.name, region: province.region }
        });
        return { ...province, ...summarize(analysis, target, horizon, effectiveFilters, {}, model) };
    }).sort(compareDemand);

    const chartAnalysis = scopedAnalysis(rows, effectiveFilters, { category, province: selectedProvince });
    const chart = summarize(chartAnalysis, target, horizon, effectiveFilters, { includeSeries: true, includeValidationPoints: true }, model);
    const detail = selectedProvince && category
        ? {
            province: selectedProvince.name,
            region: selectedProvince.region,
            category,
            ...summarize(scopedAnalysis(rows, effectiveFilters, { category, province: selectedProvince }), target, horizon, effectiveFilters, {}, model)
        }
        : null;
    const signals = pairForecasts.filter(item => item.status === 'available' && item.growth !== null)
        .sort((left, right) => (right.growth ?? -Infinity) - (left.growth ?? -Infinity))
        .slice(0, 5);

    return {
        target,
        horizon,
        model: MODEL_NAMES[model],
        unit: { revenue: 'PHP', orders: 'orders', quantity: 'units' }[target],
        filters,
        effectiveRange: { start: chart.coverage.start, end: chart.coverage.end },
        options: {
            categories,
            provinces,
            forecastablePairs: availablePairCount,
            totalPairs: pairForecasts.length
        },
        chart,
        overview,
        insufficient,
        categoryRows,
        provinceRows,
        detail,
        signals
    };
}

const PRESCRIPTIVE_MIN_ORDERS = 20;
const PRESCRIPTIVE_MIN_ACTIVE_MONTHS = 6;
const clampScore = value => Math.max(0, Math.min(100, value));
const rounded = value => value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;

export function prescriptiveAnalytics(rows, filters = {}, horizon = 6, target = 'revenue', model = 'arima') {
    if (!FORECAST_HORIZONS.includes(horizon)) throw new Error('Choose a 3, 6, 9, or 12 month horizon.');
    if (!['revenue', 'orders', 'quantity'].includes(target)) throw new Error('Choose revenue, orders, or quantity as the decision metric.');
    if (!Object.hasOwn(MODEL_NAMES, model)) throw new Error('Choose a supported forecasting model.');

    const effectiveFilters = effectiveForecastFilters(rows, filters);
    const { selected, scope } = selectAnalyticsRows(rows, effectiveFilters, { summaryOnly: true });
    const { pairForecasts: sharedPairForecasts } = buildPairForecasts(rows, effectiveFilters, horizon, target, model);
    const forecastByPair = new Map(sharedPairForecasts.map(item => [item.key, item]));
    const pairMap = new Map();
    const categoryRevenue = new Map();
    const provinceRevenue = new Map();
    const totalRevenue = selected.reduce((sum, row) => sum + Number(row.line_revenue || 0), 0);
    const monthNames = [];
    for (const row of selected) {
        const month = String(row.year_month || row.order_creation_date || '').slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(month)) monthNames.push(month);
    }
    const orderedMonths = [...new Set(monthNames)].sort();
    if (orderedMonths.length) {
        const cursor = new Date(`${orderedMonths[0]}-01T00:00:00Z`);
        const end = orderedMonths.at(-1);
        while (cursor.toISOString().slice(0, 7) <= end) {
            // Preserve missing calendar months so consistency and eligibility do not hide gaps.
            const name = cursor.toISOString().slice(0, 7);
            monthNames.push(name);
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
    }
    const months = [...new Set(monthNames)].sort();
    const ordersByPair = new Map();
    const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const clean = value => String(value ?? '').trim();
    const pairId = (region, province, category) => JSON.stringify([region, province, category]);
    const orderId = row => clean(row.order_id);
    const regionName = row => clean(row.region) || 'Unknown Region';
    const provinceName = row => clean(row.province) || 'Unknown Province';
    const categoryName = row => clean(row.category) || 'Other / Unclassified';

    for (const row of selected) {
        const month = String(row.year_month || row.order_creation_date || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) continue;
        const region = regionName(row);
        const province = provinceName(row);
        const category = categoryName(row);
        const key = pairId(region, province, category);
        const revenue = number(row.line_revenue);
        const quantity = number(row.net_quantity);
        if (!pairMap.has(key)) pairMap.set(key, { key, region, province, category, byMonth: new Map(), orders: new Set(), revenue: 0, quantity: 0 });
        const pair = pairMap.get(key);
        if (!pair.byMonth.has(month)) pair.byMonth.set(month, { revenue: 0, quantity: 0, orders: new Set(), rows: 0 });
        const monthly = pair.byMonth.get(month);
        monthly.revenue += revenue;
        monthly.quantity += quantity;
        monthly.rows += 1;
        const id = orderId(row);
        if (id) { monthly.orders.add(id); pair.orders.add(id); }
        pair.revenue += revenue;
        pair.quantity += quantity;
        categoryRevenue.set(category, (categoryRevenue.get(category) || 0) + revenue);
        const provinceKey = JSON.stringify([region, province]);
        provinceRevenue.set(provinceKey, (provinceRevenue.get(provinceKey) || 0) + revenue);
    }

    const pairs = [...pairMap.values()].map(pair => {
        const history = months.map(month => {
            const monthly = pair.byMonth.get(month);
            const value = monthly ? target === 'orders' ? monthly.orders.size : monthly[target] : null;
            return { month, value, rows: monthly?.rows || 0 };
        });
        const activeMonths = history.filter(point => point.value !== null).length;
        const forecast = forecastByPair.get(pair.key);
        const activeValues = history.filter(point => point.value !== null).map(point => point.value);
        const currentDemand = forecast?.currentDemand ?? meanOf(activeValues.slice(-12));
        const current12 = history.slice(-12);
        const prior12 = history.slice(-24, -12);
        const complete = list => list.length === 12 && list.every(point => point.value !== null);
        const yoyGrowth = complete(current12) && complete(prior12)
            ? (() => {
                const current = current12.reduce((sum, point) => sum + point.value, 0);
                const prior = prior12.reduce((sum, point) => sum + point.value, 0);
                return prior > 0 ? (current - prior) / prior * 100 : null;
            })()
            : null;
        const provinceKey = JSON.stringify([pair.region, pair.province]);
        const provinceShare = provinceRevenue.get(provinceKey) > 0 ? pair.revenue / provinceRevenue.get(provinceKey) : null;
        const overallShare = totalRevenue > 0 ? (categoryRevenue.get(pair.category) || 0) / totalRevenue : null;
        const affinityRatio = provinceShare != null && overallShare > 0 ? provinceShare / overallShare : null;
        const usableForecastGrowth = forecast?.status === 'available' ? forecast.growth : null;
        const growthEvidence = [yoyGrowth, usableForecastGrowth].filter(value => value != null && Number.isFinite(value));
        const growthEvidenceAvailable = growthEvidence.length > 0;
        const meanGrowth = growthEvidenceAvailable ? growthEvidence.reduce((sum, value) => sum + value, 0) / growthEvidence.length : null;
        const growthMomentum = growthEvidenceAvailable ? clampScore(50 + meanGrowth * 2) : null;
        const demandConsistency = months.length ? activeMonths / months.length * 100 : 0;
        const categoryAffinity = affinityRatio == null ? 50 : clampScore(affinityRatio * 50);
        const insufficientReasons = [];
        if (pair.orders.size < PRESCRIPTIVE_MIN_ORDERS) insufficientReasons.push(`Fewer than ${PRESCRIPTIVE_MIN_ORDERS} distinct orders.`);
        if (activeMonths < PRESCRIPTIVE_MIN_ACTIVE_MONTHS) insufficientReasons.push(`Fewer than ${PRESCRIPTIVE_MIN_ACTIVE_MONTHS} active months.`);
        if (!growthEvidenceAvailable) insufficientReasons.push('No valid year-over-year growth or usable forecast growth is available.');
        const eligible = insufficientReasons.length === 0;
        return {
            key: JSON.stringify([pair.region, pair.province, pair.category]),
            region: pair.region,
            province: pair.province,
            category: pair.category,
            demand: currentDemand,
            revenue: pair.revenue,
            orders: pair.orders.size,
            quantity: pair.quantity,
            yoyGrowth: rounded(yoyGrowth),
            growthEvidenceAvailable,
            forecastDemand: forecast?.forecastDemand ?? null,
            forecastGrowth: rounded(forecast?.status === 'available' ? forecast.growth : null),
            forecastTrend: forecast?.trend ?? 'Unavailable',
            forecastAvailable: forecast?.status === 'available',
            forecastReason: forecast?.reason ?? 'No matching predictive series is available for this combination.',
            forecastModel: forecast?.model ?? null,
            forecastReliability: forecast?.reliability ?? null,
            forecastMape: rounded(forecast?.validation?.mape ?? null),
            forecastBacktestMonths: forecast?.validation?.months ?? null,
            activeMonths,
            calendarMonths: months.length,
            categoryShare: rounded(provinceShare == null ? null : provinceShare * 100),
            overallCategoryShare: rounded(overallShare == null ? null : overallShare * 100),
            affinityRatio: rounded(affinityRatio),
            factors: { demandStrength: null, growthMomentum: rounded(growthMomentum), demandConsistency: rounded(demandConsistency), categoryAffinity: rounded(categoryAffinity) },
            insufficientReasons,
            eligible,
            status: eligible ? 'eligible' : 'insufficient',
            opportunityScore: null,
            strategy: null
        };
    });

    const scoreRows = pairs.filter(pair => pair.eligible);
    const orderedDemand = [...scoreRows].sort((a, b) => (a.demand ?? 0) - (b.demand ?? 0));
    const demandRanks = new Map(orderedDemand.map((pair, index) => [pair.key, orderedDemand.length <= 1 ? 50 : index / (orderedDemand.length - 1) * 100]));
    for (const pair of scoreRows) {
        const demandStrength = demandRanks.get(pair.key) ?? 50;
        pair.factors.demandStrength = rounded(demandStrength);
        pair.opportunityScore = rounded(demandStrength * 0.35 + pair.factors.growthMomentum * 0.30 + pair.factors.demandConsistency * 0.20 + pair.factors.categoryAffinity * 0.15);
        if (demandStrength >= 67 && pair.factors.growthMomentum >= 60) pair.strategy = 'EXPAND SELECTIVELY';
        else if (demandStrength >= 67 && pair.factors.growthMomentum >= 40) pair.strategy = 'SUSTAIN CORE DEMAND';
        else if (demandStrength >= 34 && pair.factors.growthMomentum >= 60) pair.strategy = 'PILOT AND VALIDATE';
        else pair.strategy = 'MONITOR / LOWER PRIORITY';
    }

    const categories = [...new Set(pairs.map(pair => pair.category))].sort((a, b) => a.localeCompare(b));
    return {
        filters,
        horizon,
        target,
        model: MODEL_NAMES[model],
        minimumOrders: PRESCRIPTIVE_MIN_ORDERS,
        minimumActiveMonths: PRESCRIPTIVE_MIN_ACTIVE_MONTHS,
        effectiveRange: { start: months[0] || null, end: months.at(-1) || null },
        categories,
        pairs: pairs.sort((a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1) || a.province.localeCompare(b.province) || a.category.localeCompare(b.category)),
        source: 'supabase'
    };
}
