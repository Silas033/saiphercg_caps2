import { useEffect, useRef, useState } from 'react';
import { FaLightbulb, FaChartLine, FaInfoCircle, FaSlidersH } from 'react-icons/fa';
import { fetchPredictive, getCachedPredictive } from '../data/analyticsApi';
import { DEFAULT_FORECAST_SETTINGS } from '../data/forecastSettings';
import { describeAdjustment } from '../data/adjustmentText';
import { DEFAULT_SCOPE, monthLabel, useAnalytics } from '../hooks/useAnalytics';
import '../styles/analytics-redesign.css';
import '../styles/predictive.css';

const formatValue = (value, target) => {
    if (value == null || !Number.isFinite(Number(value))) return 'N/A';
    return new Intl.NumberFormat('en-PH', target === 'revenue'
        ? { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }
        : { maximumFractionDigits: 2 }).format(value);
};

const formatPercent = value => value == null ? 'N/A' : `${value > 0 ? '+' : ''}${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 }).format(value)}%`;
const formatChange = (current, forecast, target) => current == null || forecast == null ? 'N/A' : `${forecast - current > 0 ? '+' : ''}${formatValue(forecast - current, target)}`;
const forecastModelLabel = value => ({ arima: 'ARIMA', prophet: 'Prophet-style', random_forest: 'Random Forest Regression', auto: 'Auto (Least Error)' }[value] || value);
const reliabilityLabel = value => ({ very_low: 'Early projection', low: 'Moderate history', backtested: 'Backtested · beats last-month benchmark', backtested_weak: 'Backtested · no better than last-month benchmark' }[value] || 'Needs more history');
const provinceSelectionLabel = key => {
    if (!key) return 'All Provinces';
    try {
        const [region, province] = JSON.parse(key);
        return province ? `${province} · ${region}` : 'Selected province';
    } catch {
        return 'Selected province';
    }
};
const ROWS_PER_PAGE = 30;
const EMPTY_FORECAST_SELECTION = Object.freeze({ category: '', provinceKey: '' });
const adjustmentInfo = (completeness, month) => {
    const rows = (completeness?.adjustments || []).filter(item => item.start?.slice(0, 7) <= month && item.end?.slice(0, 7) >= month && item.exclude_from_training);
    return { kinds: [...new Set(rows.map(item => item.kind))], reason: rows.find(item => item.reason)?.reason || '' };
};

export default function PredictiveAnalytics({ scope = DEFAULT_SCOPE, active = true, forecastSettings = DEFAULT_FORECAST_SETTINGS, onForecastSettingsChange = () => {}, forecastSelection = EMPTY_FORECAST_SELECTION, onForecastSelectionChange = () => {}, onViewPrescriptive = () => {}, onReturnToStrategy = () => {}, onExitPairForecast = () => {}, selectionRequest = null, prescriptiveReturn = null }) {
    const { data: scopeAnalytics } = useAnalytics(scope, active);
    const [target, setTarget] = useState(forecastSettings.target);
    const [horizon, setHorizon] = useState(forecastSettings.horizon);
    const [forecastModel, setForecastModel] = useState(forecastSettings.model);
    const [modelAssignment, setModelAssignment] = useState(forecastSettings.modelAssignment || null);
    const [category, setCategory] = useState(forecastSelection.category || '');
    const [provinceKey, setProvinceKey] = useState(forecastSelection.provinceKey || '');
    const [draftTarget, setDraftTarget] = useState(forecastSettings.target);
    const [draftHorizon, setDraftHorizon] = useState(forecastSettings.horizon);
    const [draftForecastModel, setDraftForecastModel] = useState(forecastSettings.model);
    const [draftCategory, setDraftCategory] = useState('');
    const [draftProvinceKey, setDraftProvinceKey] = useState('');
    const [revision, setRevision] = useState(0);
    const [provincePage, setProvincePage] = useState(1);
    const [overviewPage, setOverviewPage] = useState(1);
    const [insufficientPage, setInsufficientPage] = useState(1);
    const [reliabilityPage, setReliabilityPage] = useState(1);
    const [rangePage, setRangePage] = useState(1);
    const [showReliabilityModal, setShowReliabilityModal] = useState(false);
    const [showForecastControlsModal, setShowForecastControlsModal] = useState(false);
    const [showCategoryForecast, setShowCategoryForecast] = useState(false);
    const [showProvinceForecast, setShowProvinceForecast] = useState(false);
    const forceRefresh = useRef(false);
    const resolvedRequestKey = useRef(null);
    const scopeKey = JSON.stringify(scope);
    const requestKey = JSON.stringify({ scopeKey, target, horizon, forecastModel, category, provinceKey, revision });
    const [state, setState] = useState(() => {
        const data = getCachedPredictive({ scope, target, horizon, model: forecastModel, category, provinceKey });
        return { key: data ? requestKey : '', loading: !data, data };
    });

    useEffect(() => {
        setTarget(forecastSettings.target);
        setHorizon(forecastSettings.horizon);
        setForecastModel(forecastSettings.model);
        setModelAssignment(forecastSettings.modelAssignment || null);
        setDraftTarget(forecastSettings.target);
        setDraftHorizon(forecastSettings.horizon);
        setDraftForecastModel(forecastSettings.model);
    }, [forecastSettings.target, forecastSettings.horizon, forecastSettings.model, forecastSettings.modelAssignment]);

    useEffect(() => {
        setCategory('');
        setProvinceKey('');
        setDraftCategory('');
        setDraftProvinceKey('');
    }, [scopeKey]);

    useEffect(() => {
        const nextCategory = forecastSelection.category || '';
        const nextProvinceKey = forecastSelection.provinceKey || '';
        setCategory(nextCategory);
        setProvinceKey(nextProvinceKey);
        setDraftCategory(nextCategory);
        setDraftProvinceKey(nextProvinceKey);
    }, [forecastSelection.category, forecastSelection.provinceKey]);

    useEffect(() => {
        if (!selectionRequest) return;
        setCategory(selectionRequest.category);
        setDraftCategory(selectionRequest.category);
        setProvinceKey(selectionRequest.provinceKey);
        setDraftProvinceKey(selectionRequest.provinceKey);
    }, [selectionRequest?.requestId]);

    useEffect(() => {
        setProvincePage(1);
        setOverviewPage(1);
        setInsufficientPage(1);
        setReliabilityPage(1);
        setRangePage(1);
    }, [scopeKey, target, horizon, forecastModel, category, provinceKey, revision]);

    useEffect(() => {
        if (!active) return undefined;
        if (resolvedRequestKey.current === requestKey && !forceRefresh.current) return undefined;
        resolvedRequestKey.current = null;
        const controller = new AbortController();
        const requestParams = { scope, target, horizon, model: forecastModel, category, provinceKey };
        const cached = forceRefresh.current ? null : getCachedPredictive(requestParams);
        if (cached) {
            if (cached.modelAssignment?.assignedModel) {
                const assignment = cached.modelAssignment;
                const assignedModel = assignment.assignedModel;
                const assignedSettings = { target, horizon, model: assignedModel, modelAssignment: assignment };
                const assignedKey = JSON.stringify({ scopeKey, target, horizon, forecastModel: assignedModel, category, provinceKey, revision });
                setModelAssignment(assignment);
                setForecastModel(assignedModel);
                setDraftForecastModel(assignedModel);
                onForecastSettingsChange(assignedSettings);
                resolvedRequestKey.current = assignedKey;
                setState({ key: assignedKey, loading: false, data: cached });
            } else {
                resolvedRequestKey.current = requestKey;
                setState({ key: requestKey, loading: false, data: cached });
            }
            return () => controller.abort();
        }
        setState({ key: requestKey, loading: true });

        async function load() {
            try {
                const refresh = forceRefresh.current;
                forceRefresh.current = false;
                const result = await fetchPredictive({
                    ...requestParams,
                    refresh
                }, controller.signal);
                if (result.modelAssignment?.assignedModel) {
                    const assignment = result.modelAssignment;
                    const assignedModel = assignment.assignedModel;
                    const assignedSettings = { target, horizon, model: assignedModel, modelAssignment: assignment };
                    const assignedKey = JSON.stringify({ scopeKey, target, horizon, forecastModel: assignedModel, category, provinceKey, revision });
                    setModelAssignment(assignment);
                    setForecastModel(assignedModel);
                    setDraftForecastModel(assignedModel);
                    onForecastSettingsChange(assignedSettings);
                    resolvedRequestKey.current = assignedKey;
                    setState({ key: assignedKey, loading: false, data: result });
                } else {
                    resolvedRequestKey.current = requestKey;
                    setState({ key: requestKey, loading: false, data: result });
                }
            } catch (error) {
                if (error.name !== 'AbortError') setState({ key: requestKey, loading: false, error: error.message });
            }
        }

        load();
        return () => controller.abort();
    }, [scopeKey, target, horizon, forecastModel, category, provinceKey, revision, requestKey, active, onForecastSettingsChange]);

    const current = state.key === requestKey ? state : (() => {
        const data = getCachedPredictive({ scope, target, horizon, model: forecastModel, category, provinceKey });
        return data ? { key: requestKey, loading: false, data } : { loading: true };
    })();
    const data = current.data;
    const loading = current.loading;
    const controlCategories = data?.options.categories || scopeAnalytics?.scope?.categories || [];
    const controlProvinces = data?.options.provinces || (scopeAnalytics?.scope?.geography || []).flatMap(region => region.provinces.map(name => ({ key: JSON.stringify([region.region, name]), name, region: region.region })));
    const selectedProvince = controlProvinces.find(item => item.key === provinceKey);
    const selectedProvinceLabel = selectedProvince
        ? `${selectedProvince.name} · ${selectedProvince.region}`
        : provinceSelectionLabel(provinceKey);
    const selectionLabel = [selectedProvince?.name, category].filter(Boolean).join(' × ') || 'All Provinces × All Categories';
    const targetLabel = target === 'revenue' ? 'Revenue' : target === 'orders' ? 'Orders' : 'Units Sold';
    const globalCategoriesLabel = scope.categories == null
        ? 'All Categories'
        : scope.categories.length ? scope.categories.join(', ') : 'No Categories';
    const globalPeriodLabel = scope.period === 'Custom Range'
        ? `${scope.start || 'Start date'} – ${scope.end || 'End date'}`
        : scope.period || 'All Available Data';
    const hasPendingChanges = draftTarget !== target || draftHorizon !== horizon || draftForecastModel !== forecastModel || draftCategory !== category || draftProvinceKey !== provinceKey;

    function generateForecast() {
        setTarget(draftTarget);
        setHorizon(draftHorizon);
        setForecastModel(draftForecastModel);
        setModelAssignment(null);
        if (draftForecastModel !== 'auto') {
            onForecastSettingsChange({ target: draftTarget, horizon: draftHorizon, model: draftForecastModel, modelAssignment: null });
        }
        setCategory(draftCategory);
        setProvinceKey(draftProvinceKey);
        onForecastSelectionChange({ category: draftCategory, provinceKey: draftProvinceKey });
    }

    function openForecastControls() {
        setDraftTarget(target);
        setDraftHorizon(horizon);
        setDraftForecastModel(forecastModel);
        setDraftCategory(category);
        setDraftProvinceKey(provinceKey);
        setShowForecastControlsModal(true);
    }

    function closeForecastControls() {
        setDraftTarget(target);
        setDraftHorizon(horizon);
        setDraftForecastModel(forecastModel);
        setDraftCategory(category);
        setDraftProvinceKey(provinceKey);
        setShowForecastControlsModal(false);
    }

    function applyForecastControls() {
        generateForecast();
        setShowForecastControlsModal(false);
    }

    useEffect(() => {
        if (!showForecastControlsModal) return undefined;
        const handleKeyDown = event => {
            if (event.key === 'Escape') closeForecastControls();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showForecastControlsModal, target, horizon, forecastModel, category, provinceKey]);

    function exitPairForecast() {
        setCategory('');
        setProvinceKey('');
        setDraftCategory('');
        setDraftProvinceKey('');
        onExitPairForecast();
    }

    function regenerate() {
        forceRefresh.current = true;
        setRevision(value => value + 1);
    }

    const monthlyDemandVal = data ? formatValue(data.chart.forecastDemand, target) : '';
    const totalHorizonVal = data?.chart.forecastDemand != null ? formatValue(data.chart.forecastDemand * data.horizon, target) : '';
    const unitWord = target === 'revenue' ? 'revenue' : target === 'orders' ? 'orders' : 'product units';
    const growthVal = data ? formatPercent(data.chart.growth) : '';
    const isGrowthPos = data && data.chart.growth > 0;
    const isGrowthNeg = data && data.chart.growth < 0;
    const readyPairs = data?.options.forecastablePairs || 0;
    const totalPairs = data?.options.totalPairs || 0;
    const readyPct = totalPairs > 0 ? Math.round((readyPairs / totalPairs) * 100) : 0;
    return <div className="rd-page predictive-page">
        <header className="rd-header" id="pa-parameters">
            <div>
                <span className="rd-eyebrow">PREDICTIVE ANALYTICS</span>
                <h1>Demand Forecast</h1>
                <p>Compare expected demand across product categories and provinces, then inspect any province × category forecast.</p>
            </div>
            <div className="rd-header-note predictive-header-note" aria-label="Active forecast settings">
                <div className="predictive-header-note-title">
                    <span>Forecast settings</span>
                    <button type="button" className="predictive-edit-settings" onClick={openForecastControls}>
                        <FaSlidersH aria-hidden="true" /> Edit settings
                    </button>
                </div>
                <div className="predictive-header-settings-scroll">
                    <div className="predictive-header-settings-grid">
                        <div><small>Sales metric</small><strong>{targetLabel}</strong></div>
                        <div><small>Product category</small><strong>{category || 'All Categories'}</strong></div>
                        <div><small>Province</small><strong>{selectedProvinceLabel}</strong></div>
                        <div><small>Forecast duration</small><strong>{horizon} months</strong></div>
                        <div><small>Forecasting model</small><strong>{forecastModelLabel(forecastModel)}</strong>{modelAssignment?.requested === 'auto' && <em className="predictive-auto-assigned-label">Auto-assigned · lowest RMSE on the test months (selected on the same months it is scored on, so slightly optimistic)</em>}</div>
                    </div>
                </div>
                {data?.dataCompleteness?.partialMonths?.length > 0 && <p className="predictive-inline-warning" role="status">Forecasts use complete months only. {data.dataCompleteness.partialMonths.map(monthLabel).join(', ')} {data.dataCompleteness.partialMonths.length === 1 ? 'is' : 'are'} excluded because the data runs only through {data.dataCompleteness.dataThrough}.</p>}
                {data?.notes?.map(note => <p key={note} className="predictive-method-note">{note}</p>)}
                <p className="predictive-header-global-scope">
                    Analysis scope: {scope.region || 'All Regions'} · {scope.province || 'All Provinces'} · {globalCategoriesLabel} · {globalPeriodLabel} · {scope.returns || 'Include All'}
                </p>
            </div>
        </header>

        {loading && <p className="predictive-status" role="status">Loading scoped history and calculating forecasts…</p>}
        {current.error && <section className="rd-card predictive-error" role="alert"><h2>Forecast unavailable</h2><p>{current.error}</p><button type="button" className="rd-link-button" onClick={regenerate}>Retry</button></section>}

        {data && <>
            <section className="rd-card predictive-signals" id="pa-signals">
                <div className="rd-card-head between">
                    <div>
                        <h2>Notable Growth Opportunities</h2>
                        <p>Province and product combinations showing the strongest projected sales growth.</p>
                    </div>
                    <span className="rd-tag">{data.signals.length} growth signals</span>
                </div>
                {data.signals.length ? <div className="predictive-signal-grid">{data.signals.map(row => {
                    const absoluteChange = row.currentDemand == null || row.forecastDemand == null ? null : row.forecastDemand - row.currentDemand;
                    const changeStr = absoluteChange == null ? 'N/A' : `${absoluteChange > 0 ? '+' : ''}${formatValue(absoluteChange, target)}`;
                    const curStr = formatValue(row.currentDemand, target);
                    const fcastStr = formatValue(row.forecastDemand, target);
                    const growthStr = formatPercent(row.growth);

                    return <button type="button" className="predictive-signal" key={row.key} onClick={() => {
                        setDraftCategory(row.category);
                        setDraftProvinceKey(JSON.stringify([row.region, row.province]));
                        document.getElementById('pa-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}>
                        <div className="predictive-signal-head">
                            <strong>{row.province} × {row.category}</strong>
                            <span>{growthStr} · {row.trend}</span>
                        </div>
                        <small className="predictive-signal-metrics">
                            <span><b>Current / mo</b>{curStr}</span>
                            <span><b>Forecast / mo</b>{fcastStr}</span>
                            <span className={absoluteChange != null && absoluteChange < 0 ? 'negative' : 'positive'}>
                                <b>Change / mo</b>{changeStr}
                            </span>
                        </small>
                        <div className="predictive-signal-hover-popover" role="tooltip">
                            <div className="predictive-popover-title">
                                <strong>{row.province} × {row.category}</strong>
                            </div>
                            <p className="predictive-popover-meaning">
                                Currently averaging <b>{curStr}/mo</b>. Over the next {horizon} months, demand is projected to climb to <b>{fcastStr}/mo</b> — a concrete net increase of <b>{changeStr}/mo</b> ({growthStr} expansion, {row.trend.toLowerCase()} trend).
                            </p>
                            <p className="predictive-popover-guidance">
                                <b>Decision guidance:</b> High-opportunity segment for preferential stock allocation and targeted campaigns. Click to isolate its demand trajectory in the chart below.
                            </p>
                        </div>
                    </button>;
                })}</div> : <EmptyState message="Growth opportunities will appear when combinations have enough continuous history." />}
            </section>

        {data && <div className="predictive-summary-shell">
          <section className="rd-card predictive-summary-card">
            <div className="predictive-summary-heading">
                <h2>Forecast Summary</h2>
                <button type="button" className="predictive-kpi-inspect-btn" onClick={() => setShowReliabilityModal(true)}>Inspect Accuracy &amp; Bounds ⓘ</button>
            </div>
            <section className="rd-kpi-grid predictive-kpis" aria-label="Forecast summary">
                <Kpi
                    label="Projected Monthly Demand"
                    value={monthlyDemandVal}
                    detail="Average projected sales per month across the selected duration"
                    meaning={`This ${monthlyDemandVal} is the forecasted average monthly ${unitWord} for ${selectionLabel} over the upcoming ${data.horizon} months using ${data.chart.model || forecastModelLabel(forecastModel)} (accumulating to ~${totalHorizonVal} over the entire ${data.horizon}-month horizon).`}
                />
                <Kpi
                    label="Projected Growth"
                    value={growthVal}
                    detail="Projected monthly average vs. the trailing 12-month average"
                    meaning={`${growthVal} compares the average projected month over the next ${data.horizon} months with the average of the latest 12 complete months${isGrowthPos ? ' (projected above it)' : isGrowthNeg ? ' (projected below it)' : ''}. It is not a year-over-year figure and does not adjust for seasonality.${data.chart.growthWithinError ? ' This difference is smaller than the typical monthly forecast error of the backtest, so treat the direction as uncertain.' : ''}`}
                
                />
                <Kpi
                    label="Forecast-Ready Segments"
                    value={`${readyPairs} / ${totalPairs}`}
                    detail="Province × category combinations with sufficient sales history"
                    meaning={`Exactly ${readyPairs} out of ${totalPairs} province-category segments (${readyPct}%) have satisfied the continuity requirement (at least 3 to 18 consecutive months) for dependable algorithmic projection.`}
                />
            </section>
          </section>
        </div>}

            <section className="rd-card predictive-fit-card predictive-overview-card" id="pa-overview">
                <div className="rd-card-head between"><div><h2>Forecast Overview</h2><p>Ranked by average monthly forecast demand over the selected horizon. Use a row to open its category and province.</p></div><span className="rd-tag">{data.overview.length} forecastable pairs</span></div>
                <div className="forecast-panel-scroll">
                    {data.overview.length ? <div className="rd-table-wrap predictive-ranked-wrap"><table className="rd-table predictive-table"><thead><tr><th>Rank</th><th>Province</th><th>Region</th><th>Category</th><th>Forecast / month</th><th>Growth</th><th>Trend</th><th>Sales History</th></tr></thead><tbody>
                        {rowsForPage(data.overview, overviewPage).map((row, index) => {
                            const fcastStr = formatValue(row.forecastDemand, target);
                            const gStr = formatPercent(row.growth);
                            return <tr key={row.key}>
                                <td>{(overviewPage - 1) * ROWS_PER_PAGE + index + 1}</td>
                                <td><button type="button" className="predictive-select-link" onClick={() => { setDraftProvinceKey(JSON.stringify([row.region, row.province])); document.getElementById('pa-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} title={`Select ${row.province}`}>{row.province}</button></td>
                                <td>{row.region}</td>
                                <td><button type="button" className="predictive-select-link" onClick={() => { setDraftCategory(row.category); document.getElementById('pa-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} title={`Select ${row.category}`}>{row.category}</button></td>
                                <td title={`Specific projected monthly demand: ${fcastStr} for ${row.category} in ${row.province}.`}>{fcastStr}</td>
                                <td title={`Specific projected growth: ${gStr} relative to past 12-month baseline.`}>{gStr}</td>
                                <td title={`Trend: ${trendLabel(row.trend)}`}>{trendLabel(row.trend)}</td>
                                <td title={`History coverage: ${row.coverage.calendarMonths} calendar months of data with ${reliabilityLabel(row.reliability)} reliability.`}>{row.coverage.calendarMonths} mo · {reliabilityLabel(row.reliability)}</td>
                            </tr>;
                        })}
                    </tbody></table></div> : <EmptyState message="No province × category pair currently meets the forecast history checks." />}
                </div>
                <SectionPagination total={data.overview.length} page={overviewPage} setPage={setOverviewPage} label="Forecast overview" />
                {data.insufficient.length > 0 && <details className="predictive-insufficient">
                    <summary>Pairs requiring more sales history ({data.insufficient.length} pairs)</summary>
                    <p>These pairs are kept separate from forecast rankings because their sales history is under 3 months, has inactive gaps, or contains irregular adjustments.</p>
                    <div className="rd-table-wrap"><table className="rd-table predictive-table"><thead><tr><th>Province</th><th>Region</th><th>Category</th><th>Orders</th><th>Available months</th><th>Requirement status</th></tr></thead><tbody>
                        {rowsForPage(data.insufficient, insufficientPage).map(row => <tr key={row.key}><td>{row.province}</td><td>{row.region}</td><td>{row.category}</td><td>{row.coverage.orders.toLocaleString()}</td><td>{row.coverage.activeMonths} / {row.coverage.calendarMonths}</td><td>{row.reason}</td></tr>)}
                    </tbody></table></div>
                    <SectionPagination total={data.insufficient.length} page={insufficientPage} setPage={setInsufficientPage} label="Insufficient history" />
                </details>}
            </section>

            <section className="rd-card predictive-chart-card" id="pa-chart">
                <div className="rd-card-head between">
                    <div>
                        <h2>Historical Sales vs Projected Demand</h2>
                        <p>{selectionLabel} · monthly {data.unit} · {data.chart.model || forecastModelLabel(forecastModel)}</p>
                    </div>
                    <div className="predictive-chart-head-actions">
                        <span className={`predictive-status-pill ${data.chart.status}`}>{data.chart.status === 'available' ? 'Forecast ready' : 'Insufficient sales history'}</span>
                    </div>
                </div>
                {data.chart.history.length ? <ForecastChart result={data.chart} target={target} dataCompleteness={data.dataCompleteness} /> : <EmptyState message="No matching transactions are available for this scope." />}
                {data.chart.status !== 'available' && data.chart.history.length > 0 && <p className="predictive-inline-warning">{data.chart.reason}</p>}
                {data.chart.status === 'available' && data.chart.reliability !== 'backtested' && <p className="predictive-inline-warning" role="status">{data.chart.reliability === 'backtested_weak' ? `Backtested, but this model did not beat simply repeating the last observed month on the test months (MAE ${formatValue(data.chart.validation.mae, target)} vs ${formatValue(data.chart.validation.baselineMae, target)}). Treat the projection as indicative only.` : `${data.chart.reliability === 'very_low' ? 'Early estimate (limited history)' : 'Moderate history'}: ${data.chart.coverage.calendarMonths} consecutive months are available. ${data.chart.validation ? `Tested across ${data.chart.validation.months} test month${data.chart.validation.months === 1 ? '' : 's'}${data.chart.validation.beatsBaseline ? '' : ', without beating the last-month benchmark'}.` : 'Additional continuous months will improve forecast accuracy.'} Treat this as an early projection.`}</p>}
            </section>

            {data.detail && (() => {
                const curDetailVal = formatValue(data.detail.currentDemand, target);
                const fcastDetailVal = formatValue(data.detail.forecastDemand, target);
                const chgDetailVal = formatChange(data.detail.currentDemand, data.detail.forecastDemand, target);
                const growthDetailVal = formatPercent(data.detail.growth);
                const endDetailVal = formatValue(data.detail.endDemand, target);
                const diffVal = data.detail.forecastDemand != null && data.detail.currentDemand != null ? data.detail.forecastDemand - data.detail.currentDemand : null;
                const diffStr = diffVal == null ? 'N/A' : `${diffVal > 0 ? '+' : ''}${formatValue(diffVal, target)}`;
                const isDetailPos = diffVal != null && diffVal > 0;
                const isDetailNeg = diffVal != null && diffVal < 0;

                return <section className="rd-card predictive-detail-card">
                    <div className="rd-card-head between"><div><h2>{data.detail.province} × {data.detail.category}</h2><p>{data.detail.region} · selected province and product category</p></div><div className="predictive-detail-actions">{prescriptiveReturn && <><button type="button" className="predictive-return-strategy" onClick={onReturnToStrategy}>← Return to this strategy</button><button type="button" className="predictive-return-overview" onClick={exitPairForecast}>Back to Predictive overview</button></>}<span className={`predictive-status-pill ${data.detail.status}`}>{data.detail.status === 'available' ? 'Available' : 'Insufficient history'}</span></div></div>
                    {data.detail.status === 'available' ? <>
                        <div className="predictive-detail-grid">
                            <Metric
                                label="Current monthly average"
                                value={curDetailVal}
                                meaning={`This ${curDetailVal}/mo is the actual average monthly ${unitWord} recorded in ${data.detail.province} for ${data.detail.category} over the past 12 active months. It serves as your historical benchmark baseline.`}
                            />
                            <Metric
                                label="Forecast monthly average"
                                value={fcastDetailVal}
                                meaning={`This ${fcastDetailVal}/mo is the projected average monthly demand for ${data.detail.category} in ${data.detail.province} over the upcoming ${horizon}-month period (${draftForecastModel.toUpperCase()} projection). Use this figure to budget monthly stock.`}
                            />
                            <Metric
                                label="Change / month"
                                value={chgDetailVal}
                                meaning={isDetailPos
                                    ? `A projected net gain of ${diffStr} each month compared to historical baseline. Plan to increase supplier orders by ~${formatValue(diffVal, target)}/mo to meet demand without stockouts.`
                                    : isDetailNeg
                                    ? `A projected net drop of ${diffStr} per month compared to baseline. Trim monthly replenishment by ~${formatValue(Math.abs(diffVal), target)}/mo to prevent excess holding costs.`
                                    : `A 0 net difference: Monthly demand is projected to match the historical baseline exactly.`
                                }
                            />
                            <Metric
                                label="Forecast growth"
                                value={growthDetailVal}
                                meaning={data.detail.growth > 0
                                    ? `An expansion of ${growthDetailVal} over baseline demand for ${data.detail.category} in ${data.detail.province}. Indicates healthy market traction and growing buyer demand.`
                                    : data.detail.growth < 0
                                    ? `A contraction of ${growthDetailVal} below baseline demand, indicating softer purchasing activity in this province.`
                                    : `A flat 0.0% growth: Demand trajectory is stable with no change from baseline sales.`
                                }
                            />
                            <Metric
                                label="Expected demand at horizon end"
                                value={endDetailVal}
                                meaning={`By Month ${horizon} (the final month of the ${horizon}-month forecast), monthly demand is predicted to reach ${endDetailVal}. Use this target to plan required end-of-period inventory capacity.`}
                            />
                        </div>
                        <p className="predictive-interpretation">{data.detail.category} in {data.detail.province} is projected to show {data.detail.trend.toLowerCase()} demand over the selected {horizon}-month horizon. This is forecast evidence, not a business recommendation.</p>
                    </> : <p className="predictive-inline-warning">{data.detail.reason || 'There is no transaction history for this province and category.'} {data.detail.coverage.orders ? `${data.detail.coverage.orders} orders across ${data.detail.coverage.activeMonths} active months.` : ''}</p>}
                </section>;
            })()}

            <div className="predictive-breakdown-stack" id="pa-breakdown">
                <section className={`rd-card predictive-fit-card predictive-category-card ${showCategoryForecast ? '' : 'forecast-collapsed'}`}>
                    <div className="rd-card-head between">
                        <div>
                            <h2>Product Category Forecast</h2>
                            <p>{selectedProvince ? `Categories within ${selectedProvince.name}` : 'Compare categories across the current analysis scope.'}</p>
                        </div>
                        <div className="predictive-section-actions">
                            <span className="rd-tag">{data.categoryRows.length} {data.categoryRows.length === 1 ? 'product category' : 'product categories'}</span>
                            <button type="button" className="predictive-collapse-toggle" aria-expanded={showCategoryForecast} aria-controls="product-category-forecast-table" onClick={() => setShowCategoryForecast(value => !value)}>
                                {showCategoryForecast ? 'Hide Product Category Forecast' : 'Show Product Category Forecast'}
                            </button>
                        </div>
                    </div>
                    <div className="rd-table-wrap" id="product-category-forecast-table" hidden={!showCategoryForecast}><table className="rd-table predictive-table"><thead><tr><th>Category</th><th>Current / month</th><th>Forecast / month</th><th>Change / month</th><th>Growth</th><th>Trend</th><th>Status</th></tr></thead><tbody>
                        {data.categoryRows.map(row => {
                            const curStr = formatValue(row.currentDemand, target);
                            const fcastStr = formatValue(row.forecastDemand, target);
                            const chgStr = formatChange(row.currentDemand, row.forecastDemand, target);
                            const gStr = formatPercent(row.growth);
                            return <tr key={row.category} className={draftCategory === row.category ? 'predictive-selected-row' : ''}>
                                <td><button type="button" className="predictive-select-link" aria-pressed={draftCategory === row.category} onClick={() => setDraftCategory(row.category)} title={`Click to filter forecast chart to ${row.category}`}>{row.category}</button></td>
                                <td title={`Specific baseline: ${curStr} average monthly sales over the past 12 active months.`}>{curStr}</td>
                                <td title={`Specific forecast: ${fcastStr} average monthly sales projected over the next ${horizon} months.`}>{fcastStr}</td>
                                <td title={`Specific change: ${chgStr} net shift per month compared to historical baseline.`}>{chgStr}</td>
                                <td title={`Specific growth: ${gStr} expansion/contraction rate against past baseline.`}>{gStr}</td>
                                <td title={`Trend classification: ${trendLabel(row.trend)} based on forecast regression.`}>{trendLabel(row.trend)}</td>
                                <td><Status status={row.status} /></td>
                            </tr>;
                        })}
                        {!data.categoryRows.length && <tr><td colSpan="7">No categories are available in this scope.</td></tr>}
                    </tbody></table></div>
                </section>

                <section className={`rd-card predictive-fit-card predictive-province-card forecast-fixed-card ${showProvinceForecast ? '' : 'forecast-collapsed'}`}>
                    <div className="rd-card-head between">
                        <div>
                            <h2>Province Forecast</h2>
                            <p>{category ? `Where ${category} is forecast to perform.` : 'Compare provinces across the current analysis scope.'}</p>
                        </div>
                        <div className="predictive-section-actions">
                            <span className="rd-tag">{data.provinceRows.length} provinces</span>
                            <button type="button" className="predictive-collapse-toggle" aria-expanded={showProvinceForecast} aria-controls="province-forecast-table" onClick={() => setShowProvinceForecast(value => !value)}>
                                {showProvinceForecast ? 'Hide Province Forecast' : 'Show all Province Forecast'}
                            </button>
                        </div>
                    </div>
                    <div className="forecast-panel-scroll" id="province-forecast-table" hidden={!showProvinceForecast}><div className="rd-table-wrap"><table className="rd-table predictive-table"><thead><tr><th>Province</th><th>Region</th><th>Current / month</th><th>Forecast / month</th><th>Change / month</th><th>Growth</th><th>Status</th></tr></thead><tbody>
                        {rowsForPage(data.provinceRows, provincePage).map(row => {
                            const curStr = formatValue(row.currentDemand, target);
                            const fcastStr = formatValue(row.forecastDemand, target);
                            const chgStr = formatChange(row.currentDemand, row.forecastDemand, target);
                            const gStr = formatPercent(row.growth);
                            return <tr key={row.key} className={draftProvinceKey === row.key ? 'predictive-selected-row' : ''}>
                                <td><button type="button" className="predictive-select-link" aria-pressed={draftProvinceKey === row.key} onClick={() => setDraftProvinceKey(row.key)} title={`Click to filter forecast chart to ${row.name}`}>{row.name}</button></td>
                                <td>{row.region}</td>
                                <td title={`Specific baseline: ${curStr} average monthly sales in ${row.name}.`}>{curStr}</td>
                                <td title={`Specific forecast: ${fcastStr} average monthly sales projected in ${row.name}.`}>{fcastStr}</td>
                                <td title={`Specific change: ${chgStr} net shift per month in ${row.name}.`}>{chgStr}</td>
                                <td title={`Specific growth: ${gStr} projected growth in ${row.name}.`}>{gStr}</td>
                                <td><Status status={row.status} /></td>
                            </tr>;
                        })}
                        {!data.provinceRows.length && <tr><td colSpan="6">No provinces are available in this scope.</td></tr>}
                    </tbody></table></div></div>
                    {showProvinceForecast && <SectionPagination total={data.provinceRows.length} page={provincePage} setPage={setProvincePage} label="Province forecast" />}
                </section>
            </div>

            <section className="predictive-handoff">
                <div><strong>Continue to Strategic Recommendations (Prescriptive Analytics)</strong><small>Explore automated action plans, target priorities, and resource allocation based on these forecasts.</small></div>
                <button type="button" onClick={onViewPrescriptive}>View Prescriptive Analytics <span aria-hidden="true">→</span></button>
            </section>

            {showForecastControlsModal && (
                <div className="prescriptive-lightbox-backdrop predictive-controls-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeForecastControls(); }}>
                    <section
                        className="prescriptive-lightbox predictive-controls-lightbox"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="predictive-controls-dialog-title"
                        onKeyDown={event => { if (event.key === 'Escape') closeForecastControls(); }}
                    >
                        <div className="prescriptive-lightbox-head">
                            <div>
                                <span>FORECAST CONTROLS</span>
                                <h2 id="predictive-controls-dialog-title">Edit Forecast Settings</h2>
                                <p>Choose the metric, product category, province, forecast duration, and model for this projection.</p>
                            </div>
                            <button type="button" aria-label="Close forecast settings" onClick={closeForecastControls}>×</button>
                        </div>
                        <div className="predictive-modal-control-scroll">
                            <div className="predictive-control-grid predictive-modal-control-grid">
                                <label className="rd-field"><span>Sales Metric</span><select value={draftTarget} onChange={event => setDraftTarget(event.target.value)}><option value="revenue">Revenue (₱)</option><option value="orders">Orders</option><option value="quantity">Units Sold</option></select></label>
                                <label className="rd-field"><span>Product category</span><select value={draftCategory} onChange={event => setDraftCategory(event.target.value)}><option value="">All Categories</option>{draftCategory && !controlCategories.includes(draftCategory) && <option value={draftCategory}>{draftCategory}</option>}{controlCategories.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
                                <label className="rd-field"><span>Province</span><select value={draftProvinceKey} onChange={event => setDraftProvinceKey(event.target.value)}><option value="">All Provinces</option>{draftProvinceKey && !controlProvinces.some(item => item.key === draftProvinceKey) && <option value={draftProvinceKey}>{provinceSelectionLabel(draftProvinceKey)}</option>}{controlProvinces.map(item => <option key={item.key} value={item.key}>{item.name} · {item.region}</option>)}</select></label>
                                <label className="rd-field"><span>Forecast duration</span><select value={draftHorizon} onChange={event => setDraftHorizon(Number(event.target.value))}><option value={3}>3 Months Ahead</option><option value={6}>6 Months Ahead</option><option value={9}>9 Months Ahead</option><option value={12}>12 Months Ahead</option></select></label>
                                <label className="rd-field predictive-model-field">
                                    <span>Forecasting model</span>
                                    <select value={draftForecastModel} onChange={event => setDraftForecastModel(event.target.value)}>
                                        <option value="auto">Auto (Least Error)</option>
                                        <option value="arima">ARIMA (Trend &amp; Seasonality)</option>
                                        <option value="prophet">Prophet (Flexible Growth &amp; Cycles)</option>
                                        <option value="random_forest">Random Forest (Pattern-Based ML)</option>
                                    </select>
                                    {draftForecastModel === 'auto' && <small className="predictive-auto-model-note">Compares all models using validation RMSE and assigns the lowest-error model.</small>}
                                    {modelAssignment?.requested === 'auto' && draftForecastModel === modelAssignment.assignedModel && <small className="predictive-auto-model-note" role="status">
                                        {modelAssignment.fallback
                                            ? `Auto-assigned ${modelAssignment.assignedModelName}; there was not enough holdout history to compare model errors.`
                                            : `Auto-assigned ${modelAssignment.assignedModelName} · lowest validation RMSE: ${formatValue(modelAssignment.error, draftTarget)}.`}
                                    </small>}
                                </label>
                            </div>
                        </div>
                        <p className="predictive-modal-scope">Analysis scope: {scope.region || 'All Regions'} · {scope.province || 'All Provinces'} · {globalCategoriesLabel} · {globalPeriodLabel} · {scope.returns || 'Include All'}</p>
                        {hasPendingChanges && <p className="predictive-pending-note" role="status">Parameters changed. Select Generate Forecast to update the results.</p>}
                        <p className="predictive-method-note">Initial projections can be generated with at least 3 consecutive months of sales. Full accuracy testing becomes highly reliable with 18+ months of data. Continuous, unbroken monthly records provide the most accurate forecast.</p>
                        <div className="predictive-modal-actions">
                            <button type="button" className="predictive-modal-cancel" onClick={closeForecastControls}>Cancel</button>
                            <button type="button" className="predictive-refresh" onClick={regenerate} disabled={loading || hasPendingChanges}>{loading ? 'Updating…' : 'Refresh data'}</button>
                            <button type="button" className="predictive-generate" onClick={applyForecastControls} disabled={loading && !hasPendingChanges}>{loading && !hasPendingChanges ? 'Generating…' : 'Generate Forecast'}</button>
                        </div>
                    </section>
                </div>
            )}

            {showReliabilityModal && (
                <div className="prescriptive-lightbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowReliabilityModal(false); }}>
                    <section className="prescriptive-lightbox predictive-verification-lightbox" role="dialog" aria-modal="true" aria-label="Forecast Accuracy and Demand Bounds">
                        <div className="prescriptive-lightbox-head">
                            <div>
                                <span>MODEL VERIFICATION & DEMAND BOUNDARIES</span>
                                <h2>Forecast Accuracy & Expected Demand Range</h2>
                                <p className="predictive-modal-sub">{selectionLabel} · Model: {data.chart.model || forecastModelLabel(forecastModel)} · Duration: {horizon} months ahead</p>
                            </div>
                            <button type="button" aria-label="Close modal" onClick={() => setShowReliabilityModal(false)}>×</button>
                        </div>

                        <div className="predictive-modal-grid">
                            <section className="rd-card predictive-fit-card predictive-reliability-card">
                                <div className="rd-card-head">
                                    <div>
                                        <h3>Historical Model Accuracy Test</h3>
                                        <p>{data.chart.validation ? `Tested on real past sales across ${data.chart.validation.months} holdout months` : `${data.chart.coverage.calendarMonths} months of sales history available`}</p>
                                    </div>
                                </div>
                                <div className="forecast-panel-scroll">
                                {data.chart.validation ? <>
                                    <dl className="predictive-validation-metrics">
                                        <div><dt>Forecasting model</dt><dd>{data.chart.model}</dd></div>
                                        <div><dt>Historical test period</dt><dd>{data.chart.validation.months} months · {monthLabel(data.chart.validation.start)} to {monthLabel(data.chart.validation.end)}</dd></div>
                                        <div><dt>Average Error % (MAPE)</dt><dd>{data.chart.validation.mape == null ? 'Not available' : `${formatValue(data.chart.validation.mape, 'quantity')}%`}</dd></div>
                                        <div><dt>Average Error (MAE)</dt><dd>{formatValue(data.chart.validation.mae, target)}</dd></div>
                                        <div><dt>Error Variation (RMSE)</dt><dd>{formatValue(data.chart.validation.rmse, target)}</dd></div>
                                        <div><dt>Benchmark: repeat last month (MAE)</dt><dd>{formatValue(data.chart.validation.baselineMae, target)} · RMSE {formatValue(data.chart.validation.baselineRmse, target)}{data.chart.validation.baselineMape == null ? '' : ` · MAPE ${formatPercent(data.chart.validation.baselineMape).replace('+', '')}`}</dd></div>
                                        <div><dt>Versus benchmark</dt><dd>{data.chart.validation.improvementVsBaseline == null ? 'Not available' : data.chart.validation.beatsBaseline ? `${formatPercent(data.chart.validation.improvementVsBaseline)} lower error (better)` : `${formatPercent(Math.abs(data.chart.validation.improvementVsBaseline)).replace('+', '')} higher error (worse)`}</dd></div>
                                        <div><dt>Available history</dt><dd>{data.chart.coverage.calendarMonths} monthly records · {data.chart.coverage.activeMonths} active</dd></div>
                                    </dl>
                                    <div className="rd-table-wrap"><table className="rd-table predictive-table"><thead><tr><th>Test month</th><th>Actual sales</th><th>Predicted sales</th></tr></thead><tbody>{rowsForPage(data.chart.validation.points, reliabilityPage).map(point => <tr key={point.month}><td>{monthLabel(point.month)}</td><td>{formatValue(point.actual, target)}</td><td>{formatValue(point.predicted, target)}</td></tr>)}</tbody></table></div>
                                    <p className="predictive-method-note">Average Error % (MAPE) evaluates model accuracy against actual historical sales. A forecast is only useful if it beats the benchmark of repeating the last observed month; compare the two rows above.</p>
                                </> : data.chart.status === 'available' ? <div className="predictive-inline-warning" role="status"><strong>Limited historical testing data</strong><p>{data.chart.coverage.calendarMonths} consecutive months can produce an early projection, but additional monthly records are needed for a full historical accuracy test. Treat this projection as an initial estimate.</p></div> : <EmptyState message={data.chart.reason || 'An accuracy test is not available for this scope.'} />}
                                </div>
                                {data.chart.validation && <SectionPagination total={data.chart.validation.points.length} page={reliabilityPage} setPage={setReliabilityPage} label="Forecast reliability" always />}
                            </section>

                            <section className="rd-card predictive-fit-card predictive-range-card">
                                <div className="rd-card-head">
                                    <div>
                                        <h3>Expected Demand Range (Lower & Upper)</h3>
                                        <p>Projected monthly demand alongside an indicative lower and upper range.</p>
                                    </div>
                                </div>
                                <div className="forecast-panel-scroll">
                                {data.chart.status === 'available' ? <>
                                    <div className="predictive-range-summary"><span>Projected for final month · {monthLabel(data.chart.forecast.at(-1).month)}</span><strong>{formatValue(data.chart.forecast.at(-1).value, target)}</strong><small>{formatValue(data.chart.forecast.at(-1).lower, target)} – {formatValue(data.chart.forecast.at(-1).upper, target)}</small></div>
                                    <div className="rd-table-wrap"><table className="rd-table predictive-table"><thead><tr><th>Month</th><th>Projected demand</th><th>Lower range</th><th>Upper range</th></tr></thead><tbody>{rowsForPage(data.chart.forecast, rangePage).map(row => <tr key={row.month}><td>{monthLabel(row.month)}</td><td>{formatValue(row.value, target)}</td><td>{formatValue(row.lower, target)}</td><td>{formatValue(row.upper, target)}</td></tr>)}</tbody></table></div>
                                    <p className="predictive-method-note">{data.chart.forecast[0]?.rangeMethod === 'backtest_rmse' ? 'Indicative range: the projection plus or minus the backtest RMSE multiplied by the square root of the months ahead. It is not a 95% prediction interval, and actual demand can fall outside it.' : 'This illustrative range uses historical variability with a 25% minimum buffer to show potential demand swings.'}</p>
                                </> : <EmptyState message={data.chart.reason || 'A forecast range is unavailable for this scope.'} />}
                                </div>
                                <SectionPagination total={data.chart.forecast?.length || 0} page={rangePage} setPage={setRangePage} label="Forecast range" always />
                            </section>
                        </div>

                        <div className="prescriptive-lightbox-actions">
                            <button type="button" onClick={() => setShowReliabilityModal(false)}>Close Details</button>
                        </div>
                    </section>
                </div>
            )}
        </>}
        <button type="button" className="predictive-page-refresh" onClick={regenerate} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh data'}
        </button>
    </div>;
}

function Kpi({ label, value, detail, meaning }) {
    return (
        <div className="rd-kpi predictive-kpi-card" tabIndex="0">
            <div>
                <div className="predictive-kpi-header">
                    <small>{label}</small>
                    {meaning && (
                        <span className="predictive-kpi-info-icon" title={`More about ${label}`}>
                            <FaInfoCircle />
                        </span>
                    )}
                </div>
                <strong>{value}</strong>
                <span>{detail}</span>
            </div>
            {meaning && (
                <div className="predictive-card-hover-popover" role="tooltip">
                    <div className="predictive-popover-title"><strong>{label}</strong></div>
                    <p className="predictive-popover-meaning">{meaning}</p>
                </div>
            )}
        </div>
    );
}

function rowsForPage(rows, page) {
    const start = (page - 1) * ROWS_PER_PAGE;
    return rows.slice(start, start + ROWS_PER_PAGE);
}

function SectionPagination({ total, page, setPage, label, always = false }) {
    const pageCount = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
    if (!always && pageCount === 1) return null;
    const firstPage = Math.max(1, Math.min(page - 2, pageCount - 4));
    const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => firstPage + index);
    const firstRecord = total ? (page - 1) * ROWS_PER_PAGE + 1 : 0;
    const lastRecord = Math.min(page * ROWS_PER_PAGE, total);

    return <nav className="forecast-section-pagination" aria-label={`${label} pagination`}>
        <span>{total ? `${firstRecord}–${lastRecord} of ${total}` : '0 records'}</span>
        <div className="forecast-page-buttons">
            <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹</button>
            {pages.map(number => <button type="button" key={number} aria-label={`Page ${number}`} aria-current={page === number ? 'page' : undefined} className={page === number ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}
            <button type="button" aria-label="Next page" disabled={page === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>›</button>
        </div>
    </nav>;
}

function Metric({ label, value, meaning }) {
    return (
        <div className="predictive-metric" tabIndex="0">
            <div className="predictive-metric-top">
                <small>{label}</small>
                {meaning && <FaInfoCircle className="predictive-metric-info-icon" />}
            </div>
            <strong>{value}</strong>
            {meaning && (
                <div className="predictive-metric-hover-popover" role="tooltip">
                    <div className="predictive-popover-title">
                        <FaLightbulb />
                        <strong>Meaning of {value}</strong>
                    </div>
                    <p className="predictive-popover-meaning">
                        <b>{label}:</b> {meaning}
                    </p>
                </div>
            )}
        </div>
    );
}

function Status({ status }) {
    const isReady = status === 'available';
    const text = isReady ? 'Available' : 'Insufficient history';
    const meaning = isReady
        ? 'Meets the continuous monthly transaction requirement (at least 3 to 18 consecutive months). Projections are active.'
        : 'Has fewer than 3 continuous months of records or broken transaction gaps. Projections are paused until more data is uploaded.';
    return (
        <span className="predictive-status-wrap">
            <span className={`predictive-status-pill ${status}`}>{text}</span>
            <span className="predictive-status-hover-popover" role="tooltip">
                <div className="predictive-popover-title">
                    <FaLightbulb />
                    <strong>Status: {text}</strong>
                </div>
                <p className="predictive-popover-meaning">
                    {meaning}
                </p>
            </span>
        </span>
    );
}

function trendLabel(trend) {
    if (trend === 'Increasing') return '↑ Increasing';
    if (trend === 'Decreasing') return '↓ Decreasing';
    if (trend === 'Stable') return '→ Stable';
    return 'N/A';
}

function EmptyState({ message }) {
    return <p className="predictive-empty">{message}</p>;
}

export function ForecastChart({ result, target, dataCompleteness }) {
    const [xInterval, setXInterval] = useState('monthly');
    const [yInterval, setYInterval] = useState('auto');
    const [zoom, setZoom] = useState(1);
    const [expanded, setExpanded] = useState(false);
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const history = result.history;
    const forecast = result.forecast;
    const points = [...history, ...forecast];
    const chartValues = points.flatMap(point => [point.value, point.lower, point.upper].filter(value => Number.isFinite(value)));
    const rawMinimum = Math.min(0, ...chartValues);
    const rawMaximum = Math.max(1, ...chartValues);
    const rawSpan = rawMaximum - rawMinimum || 1;
    const autoInterval = niceAxisInterval(rawSpan / 4);
    const numericYInterval = Number(yInterval);
    const validManualInterval = yInterval !== 'auto' && Number.isFinite(numericYInterval) && numericYInterval > 0;
    const requestedInterval = validManualInterval ? numericYInterval : autoInterval;
    const manualIntervalTooSmall = yInterval !== 'auto' && (!validManualInterval || rawSpan / requestedInterval > 12);
    const axisInterval = manualIntervalTooSmall ? autoInterval : requestedInterval;
    const minimum = Math.floor(rawMinimum / axisInterval) * axisInterval;
    const maximum = Math.max(minimum + axisInterval, Math.ceil(rawMaximum / axisInterval) * axisInterval);
    const span = maximum - minimum || 1;
    const plotWidth = 800 * zoom;
    const plotHeight = expanded ? 430 : 290;
    const plotTop = 25;
    const plotBottom = plotHeight - 50;
    const xPosition = index => 64 + index * (plotWidth - 110) / Math.max(1, points.length - 1);
    const yPosition = value => plotBottom - (value - minimum) / span * (plotBottom - plotTop);
    const xLabelEvery = Math.max(1, Math.ceil(points.length / Math.max(4, Math.floor((plotWidth - 100) / 60))));
    const xTickIndices = new Set(points.length ? [0, points.length - 1] : []);
    points.forEach((point, index) => {
        if (xInterval === 'yearly' ? point.month.endsWith('-01') : index % xLabelEvery === 0) xTickIndices.add(index);
    });
    const xTicks = thinAxisTickIndices([...xTickIndices], points.length, xPosition, 60).map(index => ({
        index,
        label: xInterval === 'yearly' ? points[index].month.slice(0, 4) : monthLabel(points[index].month)
    }));
    const yTicks = Array.from({ length: Math.floor((maximum - minimum) / axisInterval) + 1 }, (_, index) => minimum + index * axisInterval);
    const formatPeriod = month => {
        const date = new Date(`${month}-01T00:00:00Z`);
        return `${new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)} (${month})`;
    };
    useEffect(() => {
        if (!expanded) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        function closeOnEscape(event) {
            if (event.key === 'Escape') setExpanded(false);
        }
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [expanded]);
    const makeLine = rows => {
        let connected = false;
        return rows.map((point, index) => {
            if (point.value == null) {
                connected = false;
                return '';
            }
            const command = connected ? 'L' : 'M';
            connected = true;
            return `${command} ${xPosition(index)} ${yPosition(point.value)}`;
        }).filter(Boolean).join(' ');
    };
    // Start the forecast line at the last month with real sales; adjusted months at the end have no value.
    const lastObservedIndex = history.reduce((found, point, index) => point.value == null ? found : index, -1);
    const columnWidth = (plotWidth - 110) / Math.max(1, points.length - 1);
    const forecastLine = forecast.length && lastObservedIndex >= 0
        ? [`${xPosition(lastObservedIndex)},${yPosition(history[lastObservedIndex].value)}`, ...forecast.map((point, index) => `${xPosition(history.length + index)},${yPosition(point.value)}`)].join(' ')
        : '';
    const band = forecast.length ? [
        ...forecast.map((point, index) => `${xPosition(history.length + index)},${yPosition(point.upper)}`),
        ...forecast.map((point, index) => `${xPosition(history.length + index)},${yPosition(point.lower)}`).reverse()
    ].join(' ') : '';
    const dividerX = history.length ? xPosition(history.length - 1) : xPosition(0);

    return <>
        <div className={`predictive-chart-shell ${expanded ? 'expanded' : ''}`}>
            <div className="predictive-chart-toolbar" aria-label="Chart controls">
                <label><span>X-axis labels</span><select value={xInterval} onChange={event => setXInterval(event.target.value)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
                <label><span>Y-axis interval</span><input type="number" min="0" step="any" value={yInterval === 'auto' ? '' : yInterval} placeholder="Auto" aria-label="Y-axis value interval" onChange={event => setYInterval(event.target.value || 'auto')} /></label>
                <button type="button" className="predictive-chart-control" onClick={() => setYInterval('auto')} disabled={yInterval === 'auto'}>Auto scale</button>
                <div className="predictive-chart-zoom" aria-label="Chart zoom controls"><button type="button" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(1, value - 0.5))} disabled={zoom <= 1}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(3, value + 0.5))} disabled={zoom >= 3}>+</button></div>
                {!expanded && <button type="button" className="predictive-chart-control expand" onClick={() => setExpanded(true)}>Expand chart</button>}
                {expanded && <button type="button" className="predictive-chart-control expand" onClick={() => setExpanded(false)}>Close expanded chart ×</button>}
            </div>
            {manualIntervalTooSmall && <p className="predictive-chart-hint" role="status">That interval is too small for this value range, so the axis uses an automatic interval to keep labels readable.</p>}
            <div className="predictive-chart-scroll">
                <div className="predictive-chart-plot">
                    {hoveredPoint && <div className="predictive-chart-tooltip" role="status"><strong>{hoveredPoint.kind}</strong><span>{formatPeriod(hoveredPoint.point.month)}</span><b>{formatValue(hoveredPoint.point.value, target)}</b>{hoveredPoint.kind === 'Forecast' && <small>Range: {formatValue(hoveredPoint.point.lower, target)} – {formatValue(hoveredPoint.point.upper, target)}</small>}</div>}
                    <svg className="predictive-chart" style={{ width: zoom > 1 ? `${plotWidth}px` : '100%', height: expanded ? 'min(62vh, 560px)' : undefined }} viewBox={`0 0 ${plotWidth} ${plotHeight}`} role="img" aria-label={`Historical and forecast monthly ${target} for the selected scope`}>
                        {yTicks.map(value => <g key={`y-${value}`}><line x1="64" x2={plotWidth - 26} y1={yPosition(value)} y2={yPosition(value)} className="predictive-chart-grid" /><text x="56" y={yPosition(value) + 4} textAnchor="end">{formatValue(value, target)}</text></g>)}
                        {band && <polygon points={band} className="predictive-chart-band" />}
                        {history.map((point, index) => point.adjusted ? <rect key={`adjusted-${point.month}`} x={xPosition(index) - columnWidth / 2} y={plotTop} width={columnWidth} height={plotBottom - plotTop} fill="currentColor" opacity="0.08"><title>{`${formatPeriod(point.month)}: adjusted period (${describeAdjustment(adjustmentInfo(dataCompleteness, point.month).kinds, adjustmentInfo(dataCompleteness, point.month).reason)}); not used for model training`}</title></rect> : null)}
                        <path d={makeLine(history)} className="predictive-chart-history" />
                        {forecastLine && <polyline points={forecastLine} className="predictive-chart-forecast" />}
                        {history.map((point, index) => point.value == null ? null : <circle key={`actual-${point.month}`} cx={xPosition(index)} cy={yPosition(point.value)} r="4" tabIndex="0" aria-label={`Actual, ${formatPeriod(point.month)}, ${formatValue(point.value, target)}`} onPointerEnter={() => setHoveredPoint({ point, kind: 'Actual' })} onPointerLeave={() => setHoveredPoint(null)} onFocus={() => setHoveredPoint({ point, kind: 'Actual' })} onBlur={() => setHoveredPoint(null)} className="predictive-chart-actual"><title>{`${formatPeriod(point.month)} · Actual · ${formatValue(point.value, target)}`}</title></circle>)}
                        {forecast.map((point, index) => <circle key={`forecast-${point.month}`} cx={xPosition(history.length + index)} cy={yPosition(point.value)} r="4" tabIndex="0" aria-label={`Forecast, ${formatPeriod(point.month)}, ${formatValue(point.value, target)}, range ${formatValue(point.lower, target)} to ${formatValue(point.upper, target)}`} onPointerEnter={() => setHoveredPoint({ point, kind: 'Forecast' })} onPointerLeave={() => setHoveredPoint(null)} onFocus={() => setHoveredPoint({ point, kind: 'Forecast' })} onBlur={() => setHoveredPoint(null)} className="predictive-chart-projected"><title>{`${formatPeriod(point.month)} · Forecast · ${formatValue(point.value, target)} · Range ${formatValue(point.lower, target)}–${formatValue(point.upper, target)}`}</title></circle>)}
                        {history.length > 0 && <line x1={dividerX} x2={dividerX} y1={plotTop} y2={plotBottom} className="predictive-chart-divider" />}
                        {xTicks.map(({ index, label }) => <text key={`x-${index}`} x={xPosition(index)} y={plotHeight - 15} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{label}</text>)}
                    </svg>
                </div>
            </div>
            <div className="predictive-chart-legend"><span><i className="history-key" />Historical demand</span><span><i className="forecast-key" />Forecast demand</span><span><i className="range-key" />{forecast[0]?.rangeMethod === 'backtest_rmse' ? 'Indicative range (±RMSE·√months ahead)' : 'Estimated range'}</span>{history.some(point => point.adjusted) && <span><i className="adjusted-key" />Adjusted period</span>}</div>
            <p className="predictive-chart-caption">Forecast starts in {forecast[0] ? monthLabel(forecast[0].month) : 'the month after the last actual observation'}. Hover or focus a point for its month, year, value{forecast.length ? ', and forecast range' : ''}. X-axis labels do not change the monthly data.</p>
        </div>
    </>;
}

function niceAxisInterval(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const fraction = value / magnitude;
    const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return niceFraction * magnitude;
}

function thinAxisTickIndices(indices, pointCount, xPosition, minSpacing) {
    if (pointCount <= 2) return [...new Set(indices)].sort((a, b) => a - b);
    const lastIndex = pointCount - 1;
    const ordered = [...new Set(indices)].sort((a, b) => a - b);
    const visible = [0];
    for (const index of ordered) {
        if (index === 0 || index === lastIndex) continue;
        if (xPosition(index) - xPosition(visible.at(-1)) >= minSpacing
            && xPosition(lastIndex) - xPosition(index) >= minSpacing) visible.push(index);
    }
    const previous = visible.at(-1);
    if (xPosition(lastIndex) - xPosition(previous) < minSpacing && visible.length > 1) visible.pop();
    if (lastIndex !== 0) visible.push(lastIndex);
    return visible;
}
