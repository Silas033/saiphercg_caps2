import { analyzeRows, selectAnalyticsRows, datasetBounds, completenessNote, shiftMonth, ORDER_COUNT_NOTE } from './analytics.js';

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const nextMonth = shiftMonth;


const FORECAST_HORIZONS = [3, 6, 9, 12];
const MINIMUM_HISTORY = 3;
const meanOf = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const pairKey = (region, province) => JSON.stringify([region, province]);

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

// ARIMA(1,1,1) without drift, estimated by conditional sum of squares on the
// first differences: z[t] = phi*z[t-1] + e[t] + theta*e[t-1]. phi and theta are
// found by a bounded grid search followed by a local refinement, so the fit is
// deterministic and does not depend on any hard-coded MA coefficient.
const ARIMA_MIN_DIFFERENCES = 6;
function arimaResiduals(differences, phi, theta) {
    const residuals = [0];
    for (let index = 1; index < differences.length; index += 1) {
        residuals.push(differences[index] - phi * differences[index - 1] - theta * residuals[index - 1]);
    }
    return residuals;
}
function arimaFit(differences) {
    const sse = (phi, theta) => arimaResiduals(differences, phi, theta).reduce((sum, e) => sum + e * e, 0);
    let best = { phi: 0, theta: 0, score: sse(0, 0) };
    const search = (center, radius, step) => {
        for (let phi = Math.max(-0.95, center.phi - radius); phi <= Math.min(0.95, center.phi + radius) + 1e-9; phi += step) {
            for (let theta = Math.max(-0.95, center.theta - radius); theta <= Math.min(0.95, center.theta + radius) + 1e-9; theta += step) {
                const score = sse(phi, theta);
                if (score < best.score - 1e-9) best = { phi, theta, score };
            }
        }
    };
    search({ phi: 0, theta: 0 }, 0.95, 0.05);
    search(best, 0.05, 0.005);
    return best;
}

function arimaForecast(values, horizon) {
    const differences = values.slice(1).map((value, index) => value - values[index]);
    const estimated = differences.length >= ARIMA_MIN_DIFFERENCES;
    const { phi, theta } = estimated ? arimaFit(differences) : { phi: 0, theta: 0 };
    const residuals = arimaResiduals(differences, phi, theta);
    let step = phi * differences.at(-1) + theta * residuals.at(-1);
    let level = values.at(-1);
    const forecasts = [];
    for (let index = 0; index < horizon; index += 1) {
        level = Math.max(0, level + step);
        forecasts.push(level);
        step = phi * step;
    }
    forecasts.label = estimated
        ? 'ARIMA(1,1,1)'
        : 'ARIMA(0,1,0) random walk (too few months to estimate the AR and MA terms)';
    forecasts.parameters = { phi, theta, estimated };
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

// Part-months are removed, and the series is extended to the anchor month
// (the dataset's last complete month, or the custom range end if earlier).
// Months after a series' last sale therefore count as missing, so an inactive or
// discontinued series cannot produce a forecast that starts in the past.
function toSeries(analysis, target, anchorEnd = null, adjustedMonths = new Set()) {
    const points = analysis.trend
        .filter(month => !month.partial)
        .map(month => {
            const adjusted = adjustedMonths.has(month.name);
            // Adjusted months are withheld from model fitting without being marked as missing.
            return { month: month.name, value: month.rows && !adjusted ? month[target] : null, rows: month.rows, adjusted };
        });
    if (anchorEnd && points.length) {
        for (let month = nextMonth(points.at(-1).month, 1); month <= anchorEnd; month = nextMonth(month, 1)) {
            points.push({ month, value: null, rows: 0, adjusted: adjustedMonths.has(month) });
        }
    }
    return points;
}

// Builds the series the models are fitted on. Adjusted months are not representative demand:
// leading and trailing ones are cut off (a trailing run is skipped again when
// projecting forward), and interior ones are filled by straight-line interpolation
// so the monthly spacing the models rely on is preserved. Filled months are flagged
// and are never scored in the backtest.
function modelSeries(history) {
    const first = history.findIndex(point => !point.adjusted);
    let last = -1;
    history.forEach((point, index) => { if (!point.adjusted) last = index; });
    if (first === -1) return { points: [], tailSkip: history.length };
    const points = [];
    for (let index = first; index <= last; index += 1) {
        const point = history[index];
        if (!point.adjusted) {
            if (point.value !== null) points.push({ month: point.month, value: point.value, imputed: false });
            continue;
        }
        let before = index - 1;
        while (history[before].adjusted) before -= 1;
        let after = index + 1;
        while (history[after].adjusted) after += 1;
        const a = history[before].value;
        const b = history[after].value;
        if (a === null || b === null) continue;
        points.push({ month: point.month, value: a + (b - a) * (index - before) / (after - before), imputed: true });
    }
    return { points, tailSkip: history.length - 1 - last };
}

function forecastAnchor(rows, filters) {
    const lastComplete = datasetBounds(rows).lastCompleteMonth;
    if (!lastComplete) return null;
    return filters.period === 'Custom Range' && /^\d{4}-\d{2}/.test(filters.end || '') && filters.end.slice(0, 7) < lastComplete
        ? filters.end.slice(0, 7)
        : lastComplete;
}

function evaluateSeries(series, horizon, target, filters = {}, orderCount = 0, model = 'arima') {
    const history = series.map(point => ({ ...point }));
    const { points: modelPoints, tailSkip } = modelSeries(history);
    const values = modelPoints.map(point => point.value);
    const observedCount = modelPoints.filter(point => !point.imputed).length;
    const active = history.filter(point => point.value !== null);
    // Adjusted months are explicitly known, so they are not "missing".
    const missing = history.filter(point => point.value === null && !point.adjusted).map(point => point.month);
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
            observedMonths: observedCount,
            missingMonths: missing,
            adjustedMonths: history.filter(point => point.adjusted).map(point => point.month),
            imputedMonths: modelPoints.filter(point => point.imputed).map(point => point.month),
            start: history[0]?.month ?? null,
            end: history.at(-1)?.month ?? null,
            orders: orderCount
        }
    };

    if (!history.length) result.reason = 'No matching transaction history is available in this scope.';
    else if (!customRangeIsComplete(filters)) result.reason = 'Choose complete calendar months for the selected custom date range.';
    else if (missing.length) {
        const trimmed = history.slice(0, history.length - tailSkip);
        let trailing = 0;
        while (trailing < trimmed.length && trimmed[trimmed.length - 1 - trailing].value === null && !trimmed[trimmed.length - 1 - trailing].adjusted) trailing += 1;
        result.reason = trailing > 0
            ? `No sales records in the latest ${trailing} month${trailing === 1 ? '' : 's'} (through ${history.at(-1).month}); this series looks inactive or discontinued. Missing months are unknown demand, not zero demand.`
            : `History has ${missing.length} month${missing.length === 1 ? '' : 's'} with no records. Missing months are unknown demand, not zero demand.`;
    }
    else if (values.some(value => value < 0)) result.reason = 'Negative monthly demand totals cannot be forecast. Review return treatment or choose another metric.';
    else if (observedCount < MINIMUM_HISTORY) result.reason = `At least ${MINIMUM_HISTORY} consecutive observed months are required for an exploratory forecast; this scope has ${observedCount}.`;
    if (result.reason) return result;

    const holdoutMonths = observedCount < 6 ? 0 : observedCount >= 36 ? 12 : Math.min(6, observedCount - 3);
    const training = values.slice(0, values.length - holdoutMonths);
    let rmse = null;
    if (holdoutMonths > 0) {
        const predictedAll = runModel(training, holdoutMonths, model);
        // Interpolated months are not real observations, so they are not scored.
        const testPoints = modelPoints.slice(values.length - holdoutMonths)
            .map((point, index) => ({ ...point, predicted: predictedAll[index] }))
            .filter(point => !point.imputed);
        const actual = testPoints.map(point => point.value);
        const predicted = testPoints.map(point => point.predicted);
        if (actual.length) {
            const errors = actual.map((value, index) => value - predicted[index]);
            const absoluteErrors = errors.map(Math.abs);
            const nonzeroPercentageErrors = actual.flatMap((value, index) => value === 0 ? [] : [Math.abs(errors[index] / value) * 100]);
            rmse = Math.sqrt(meanOf(errors.map(error => error ** 2)));
            // Benchmark: repeat the last training month for every test month.
            const baselineErrors = actual.map(value => value - training.at(-1));
            const baselineMae = meanOf(baselineErrors.map(Math.abs));
            const baselineRmse = Math.sqrt(meanOf(baselineErrors.map(error => error ** 2)));
            const baselineNonzero = actual.flatMap((value, index) => value === 0 ? [] : [Math.abs(baselineErrors[index] / value) * 100]);
            const modelMae = meanOf(absoluteErrors);

            result.validation = {
                months: holdoutMonths,
                scoredMonths: actual.length,
                trainingMonths: training.length,
                start: testPoints[0].month,
                end: testPoints.at(-1).month,
                mae: modelMae,
                rmse,
                mape: meanOf(nonzeroPercentageErrors),
                mapeExcludedMonths: actual.length - nonzeroPercentageErrors.length,
                baselineMae,
                baselineRmse,
                baselineMape: meanOf(baselineNonzero),
                beatsBaseline: modelMae < baselineMae,
                improvementVsBaseline: baselineMae > 0 ? (1 - modelMae / baselineMae) * 100 : null,
                points: testPoints.map(point => ({ month: point.month, actual: point.value, predicted: point.predicted }))
            };
        }
    }

    // Project from the last normal month, then skip known adjusted months.
    const rawForecast = runModel(values, horizon + tailSkip, model);
    const valuesForecast = rawForecast.slice(tailSkip);
    valuesForecast.label = rawForecast.label;
    const modelLabel = valuesForecast.label || MODEL_NAMES[model];
    const average = meanOf(values);
    const historicalSpread = Math.sqrt(meanOf(values.map(value => (value - average) ** 2)));
    const fallbackRange = Math.max(historicalSpread, Math.abs(average) * 0.25, 1);
    const rangeMethod = rmse === null ? 'historical_variability' : 'backtest_rmse';
    const next = valuesForecast.map((value, index) => {
        const month = nextMonth(result.coverage.end, index + 1);
        const range = (rmse ?? fallbackRange) * Math.sqrt(index + 1 + tailSkip);
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
    result.model = modelLabel;
    result.forecast = next;
    result.forecastDemand = forecastDemand;
    result.endDemand = valuesForecast.at(-1);
    result.growth = growth;
    result.trend = growth === null ? 'Unavailable' : growth > 2 ? 'Increasing' : growth < -2 ? 'Decreasing' : 'Stable';
    result.growthWithinError = rmse !== null && result.currentDemand !== null && Math.abs(forecastDemand - result.currentDemand) < rmse;
    result.reliability = observedCount < 6 ? 'very_low' : observedCount < 18 ? 'low' : (result.validation?.beatsBaseline ? 'backtested' : 'backtested_weak');
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

function summarize(analysis, target, horizon, filters, { includeSeries = false, includeValidationPoints = false, anchorEnd = null, adjustedMonths = new Set() } = {}, model = 'arima') {
    const result = evaluateSeries(toSeries(analysis, target, anchorEnd, adjustedMonths), horizon, target, filters, analysis.summary.orders, model);
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
        growthWithinError: result.growthWithinError ?? null,
        trend: result.trend,
        coverage: result.coverage,
        reliability: result.reliability,
        validation,
        ...(includeSeries ? { history: result.history, forecast: result.forecast } : {})
    };
}

function effectiveForecastFilters(rows, filters) {
    if (filters.period !== 'Last 12 Months' && filters.period !== 'Last 24 Months') return { ...filters };
    // "Last N months" for forecasting means the N most recent COMPLETE months.
    const latestMonth = datasetBounds(rows).lastCompleteMonth;
    if (!latestMonth) return { ...filters };
    const start = nextMonth(latestMonth, -(filters.period === 'Last 12 Months' ? 11 : 23));
    const end = new Date(Date.UTC(Number(latestMonth.slice(0, 4)), Number(latestMonth.slice(5, 7)), 0));
    return {
        ...filters,
        period: 'Custom Range',
        start: `${start}-01`,
        end: end.toISOString().slice(0, 10)
    };
}

function buildPairForecasts(rows, filters, horizon, target, model, base = analyzeRows(rows, filters)) {
    const pairForecasts = [];
    const anchorEnd = forecastAnchor(rows, filters);
    const adjustedMonths = datasetBounds(rows).adjustedMonths;
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
                    ...summarize(analysis, target, horizon, filters, { anchorEnd, adjustedMonths }, model)
                });
            }
        }
    }
    return { base, pairForecasts };
}

export function predictiveAnalytics(rows, filters = {}, horizon = 6, target = 'revenue', category = '', provinceKey = '', model = 'arima') {
    if (!FORECAST_HORIZONS.includes(horizon)) throw new Error('Choose a 3, 6, 9, or 12 month horizon.');
    if (!['revenue', 'orders', 'quantity'].includes(target)) throw new Error('Choose revenue, orders, or quantity as the forecast metric.');
    if (model !== 'auto' && !Object.hasOwn(MODEL_NAMES, model)) throw new Error('Choose a supported forecasting model.');
    if (typeof category !== 'string' || typeof provinceKey !== 'string') throw new Error('Invalid predictive selection.');

    const effectiveFilters = effectiveForecastFilters(rows, filters);
    const anchorEnd = forecastAnchor(rows, effectiveFilters);
    const adjustedMonths = datasetBounds(rows).adjustedMonths;
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

    if (model === 'auto') {
        const selectionAnalysis = scopedAnalysis(rows, effectiveFilters, { category, province: selectedProvince });
        const comparison = Object.entries(MODEL_NAMES).map(([candidate, name]) => {
            const evaluated = evaluateSeries(
                toSeries(selectionAnalysis, target, anchorEnd, adjustedMonths),
                horizon,
                target,
                effectiveFilters,
                selectionAnalysis.summary.orders,
                candidate
            );
            return { model: candidate, name, rmse: evaluated.validation?.rmse ?? null };
        });
        const comparable = comparison
            .filter(item => Number.isFinite(item.rmse))
            .sort((left, right) => left.rmse - right.rmse);
        const assignedModel = comparable[0]?.model || 'arima';
        const modelAssignment = {
            requested: 'auto',
            assignedModel,
            assignedModelName: MODEL_NAMES[assignedModel],
            metric: 'RMSE',
            error: comparable[0]?.rmse ?? null,
            comparedModels: comparison,
            fallback: comparable.length === 0
        };
        const result = predictiveAnalytics(rows, filters, horizon, target, category, provinceKey, assignedModel);
        return { ...result, modelAssignment };
    }

    const { pairForecasts } = buildPairForecasts(rows, effectiveFilters, horizon, target, model, base);

    const pairFilter = pairForecasts.filter(item => (!category || item.category === category)
        && (!selectedProvince || (item.province === selectedProvince.name && item.region === selectedProvince.region)));
    const compareDemand = (left, right) => (right.forecastDemand ?? -Infinity) - (left.forecastDemand ?? -Infinity);
    const overview = pairFilter.filter(item => item.status === 'available').sort(compareDemand);
    const insufficient = pairFilter.filter(item => item.status !== 'available');
    const availablePairCount = pairForecasts.filter(item => item.status === 'available').length;

    const categoryRows = categories.map(name => {
        const analysis = scopedAnalysis(rows, effectiveFilters, { category: name, province: selectedProvince });
        return { category: name, ...summarize(analysis, target, horizon, effectiveFilters, { anchorEnd, adjustedMonths }, model) };
    }).sort(compareDemand);

    const provinceRows = provinces.map(province => {
        const analysis = scopedAnalysis(rows, effectiveFilters, {
            category,
            province: { name: province.name, region: province.region }
        });
        return { ...province, ...summarize(analysis, target, horizon, effectiveFilters, { anchorEnd, adjustedMonths }, model) };
    }).sort(compareDemand);

    const chartAnalysis = scopedAnalysis(rows, effectiveFilters, { category, province: selectedProvince });
    const chart = summarize(chartAnalysis, target, horizon, effectiveFilters, { includeSeries: true, includeValidationPoints: true, anchorEnd, adjustedMonths }, model);
    const detail = selectedProvince && category
        ? {
            province: selectedProvince.name,
            region: selectedProvince.region,
            category,
            ...summarize(scopedAnalysis(rows, effectiveFilters, { category, province: selectedProvince }), target, horizon, effectiveFilters, { anchorEnd, adjustedMonths }, model)
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
        dataCompleteness: completenessNote(datasetBounds(rows)),
        notes: target === 'orders' ? [ORDER_COUNT_NOTE] : [],
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
// Relative, uncalibrated scoring heuristics. Weights and cut-offs are exposed in
// the API response so the page can state exactly what the score is made of.
export const PRESCRIPTIVE_WEIGHTS = Object.freeze({ demandStrength: 0.35, growthMomentum: 0.30, demandConsistency: 0.20, categoryAffinity: 0.15 });
export const STRATEGY_THRESHOLDS = Object.freeze({ strongDemandPercentile: 67, moderateDemandPercentile: 34, strongGrowthPercent: 5, steadyGrowthPercent: -5 });
// Growth 0% -> 50, +25% -> 88, +50% -> 98; symmetric and never hard-clipped at +/-25%.
export const growthScore = growth => 50 + 50 * Math.tanh(growth / 25);
// Local-vs-overall sales mix: ratio 1 -> 50, 2 -> 75, 4+ -> 100, 0.5 -> 25, 0.25- -> 0.
export const mixScore = ratio => clampScore(50 + 25 * Math.log2(Math.min(4, Math.max(0.25, ratio))));
// Mid-rank percentile so tied demand values receive identical scores.
export function percentileRanks(entries) {
    const ordered = [...entries].sort((a, b) => a.value - b.value);
    const ranks = new Map();
    for (let start = 0; start < ordered.length;) {
        let end = start;
        while (end + 1 < ordered.length && ordered[end + 1].value === ordered[start].value) end += 1;
        const percentile = ordered.length <= 1 ? 50 : (start + end) / 2 / (ordered.length - 1) * 100;
        for (let index = start; index <= end; index += 1) ranks.set(ordered[index].key, percentile);
        start = end + 1;
    }
    return ranks;
}
const rounded = value => value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;

export function prescriptiveAnalytics(rows, filters = {}, horizon = 6, target = 'revenue', model = 'arima') {
    if (!FORECAST_HORIZONS.includes(horizon)) throw new Error('Choose a 3, 6, 9, or 12 month horizon.');
    if (!['revenue', 'orders', 'quantity'].includes(target)) throw new Error('Choose revenue, orders, or quantity as the decision metric.');
    if (!Object.hasOwn(MODEL_NAMES, model)) throw new Error('Choose a supported forecasting model.');

    const effectiveFilters = effectiveForecastFilters(rows, filters);
    const { selected: selectedWithPartial, scope } = selectAnalyticsRows(rows, effectiveFilters, { summaryOnly: true });
    const bounds = datasetBounds(rows);
    const anchorEnd = forecastAnchor(rows, effectiveFilters);
    const monthOfRow = row => String(row.year_month || row.order_creation_date || '').slice(0, 7);
    // A part-month must not count as a full month of sales.
    const selected = selectedWithPartial.filter(row => !bounds.partialMonths.has(monthOfRow(row)) && !bounds.adjustedMonths.has(monthOfRow(row)));
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
        const end = anchorEnd && anchorEnd > orderedMonths.at(-1) ? anchorEnd : orderedMonths.at(-1);
        while (cursor.toISOString().slice(0, 7) <= end) {
            // Preserve missing calendar months so consistency and eligibility do not hide gaps.
            const name = cursor.toISOString().slice(0, 7);
            if (!bounds.adjustedMonths.has(name)) monthNames.push(name);
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
        // Average over the latest 12 calendar months. Months with no records inside a
        // covered dataset are zero sales, so sparse pairs are not inflated by
        // averaging only their active months.
        const currentDemand = forecast?.status === 'available' ? forecast.currentDemand : meanOf(history.slice(-12).map(point => point.value ?? 0));
        let yoyChange = null;
        let yoyGrowth = null;
        let yoyMonthsCompared = null;
        let yoyMonths = null;
        const firstCoveredMonth = bounds.dateMin?.slice(0, 7);
        const lastCoveredMonth = bounds.coverageEnd?.slice(0, 7);
        const currentMonths = anchorEnd ? Array.from({ length: 12 }, (_, offset) => shiftMonth(anchorEnd, offset - 11)) : [];
        const pairable = currentMonths.filter(month => {
            const priorMonth = shiftMonth(month, -12);
            return month >= firstCoveredMonth && month <= lastCoveredMonth
                && priorMonth >= firstCoveredMonth && priorMonth <= lastCoveredMonth
                && !bounds.partialMonths.has(month) && !bounds.partialMonths.has(priorMonth)
                && !bounds.adjustedMonths.has(month) && !bounds.adjustedMonths.has(priorMonth);
        });
        const monthlyValue = month => {
            const value = pair.byMonth.get(month);
            return value ? target === 'orders' ? value.orders.size : value[target] : null;
        };
        if (pairable.length >= 6 && pairable.every(month => monthlyValue(month) !== null && monthlyValue(shiftMonth(month, -12)) !== null)) {
            const current = pairable.reduce((sum, month) => sum + monthlyValue(month), 0);
            const prior = pairable.reduce((sum, month) => sum + monthlyValue(shiftMonth(month, -12)), 0);
            if (prior > 0) {
                yoyChange = current - prior;
                yoyGrowth = yoyChange / prior * 100;
                yoyMonthsCompared = pairable.length;
                yoyMonths = pairable;
            }
        }
        const provinceKey = JSON.stringify([pair.region, pair.province]);
        const provinceShare = provinceRevenue.get(provinceKey) > 0 ? pair.revenue / provinceRevenue.get(provinceKey) : null;
        const overallShare = totalRevenue > 0 ? (categoryRevenue.get(pair.category) || 0) / totalRevenue : null;
        const affinityRatio = provinceShare != null && overallShare > 0 ? provinceShare / overallShare : null;
        const usableForecastGrowth = forecast?.status === 'available' ? forecast.growth : null;
        const growthEvidence = [yoyGrowth, usableForecastGrowth].filter(value => value != null && Number.isFinite(value));
        const growthEvidenceAvailable = growthEvidence.length > 0;
        const meanGrowth = growthEvidenceAvailable ? growthEvidence.reduce((sum, value) => sum + value, 0) / growthEvidence.length : null;
        const growthMomentum = growthEvidenceAvailable ? growthScore(meanGrowth) : null;
        const demandConsistency = months.length ? activeMonths / months.length * 100 : 0;
        const categoryAffinity = affinityRatio == null ? 50 : mixScore(affinityRatio);
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
            yoyChange: rounded(yoyChange),
            yoyGrowth: rounded(yoyGrowth),
            yoyMonthsCompared,
            yoyMonths,
            growthEvidenceAvailable,
            meanGrowth: rounded(meanGrowth),
            forecastDemand: forecast?.forecastDemand ?? null,
            forecastGrowth: rounded(forecast?.status === 'available' ? forecast.growth : null),
            forecastTrend: forecast?.trend ?? 'Unavailable',
            forecastAvailable: forecast?.status === 'available',
            forecastReason: forecast?.reason ?? 'No matching predictive series is available for this combination.',
            forecastModel: forecast?.model ?? null,
            forecastReliability: forecast?.reliability ?? null,
            forecastMape: rounded(forecast?.validation?.mape ?? null),
            forecastBeatsBenchmark: forecast?.validation?.beatsBaseline ?? null,
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
    const demandRanks = percentileRanks(scoreRows.map(pair => ({ key: pair.key, value: pair.demand ?? 0 })));
    for (const pair of scoreRows) {
        const demandStrength = demandRanks.get(pair.key) ?? 50;
        pair.factors.demandStrength = rounded(demandStrength);
        const w = PRESCRIPTIVE_WEIGHTS;
        pair.opportunityScore = rounded(demandStrength * w.demandStrength + pair.factors.growthMomentum * w.growthMomentum + pair.factors.demandConsistency * w.demandConsistency + pair.factors.categoryAffinity * w.categoryAffinity);
        const t = STRATEGY_THRESHOLDS;
        if (demandStrength >= t.strongDemandPercentile && pair.meanGrowth >= t.strongGrowthPercent) pair.strategy = 'EXPAND SELECTIVELY';
        else if (demandStrength >= t.strongDemandPercentile && pair.meanGrowth >= t.steadyGrowthPercent) pair.strategy = 'SUSTAIN CORE DEMAND';
        else if (demandStrength >= t.moderateDemandPercentile && pair.meanGrowth >= t.strongGrowthPercent) pair.strategy = 'PILOT AND VALIDATE';
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
        scoring: {
            weights: PRESCRIPTIVE_WEIGHTS,
            thresholds: STRATEGY_THRESHOLDS,
            growthMomentum: '50 + 50 x tanh(average growth % / 25)',
            salesMix: '50 + 25 x log2(local category share / overall category share), limited to ratios between 0.25 and 4',
            note: 'Relative heuristics for ranking combinations against each other. They are not calibrated probabilities or return estimates.'
        },
        dataCompleteness: completenessNote(bounds),
        notes: target === 'orders' ? [ORDER_COUNT_NOTE] : [],
        effectiveRange: { start: months[0] || null, end: months.at(-1) || null },
        categories,
        pairs: pairs.sort((a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1) || a.province.localeCompare(b.province) || a.category.localeCompare(b.category)),
        source: 'supabase'
    };
}
