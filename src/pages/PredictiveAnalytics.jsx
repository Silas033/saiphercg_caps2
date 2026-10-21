import { useEffect, useRef, useState } from 'react';
import { fetchPredictive, getCachedPredictive } from '../data/analyticsApi';
import { DEFAULT_FORECAST_SETTINGS } from '../data/forecastSettings';
import { DEFAULT_SCOPE, monthLabel } from '../hooks/useAnalytics';
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
const forecastModelLabel = value => ({ arima: 'ARIMA', prophet: 'Prophet-style', random_forest: 'Random Forest Regression' }[value] || value);
const reliabilityLabel = value => ({ very_low: 'Very low', low: 'Low', backtested: 'Backtested' }[value] || 'Unavailable');
const ROWS_PER_PAGE = 30;

export default function PredictiveAnalytics({ scope = DEFAULT_SCOPE, active = true, forecastSettings = DEFAULT_FORECAST_SETTINGS, onForecastSettingsChange = () => {}, onViewPrescriptive = () => {}, onReturnToStrategy = () => {}, onExitPairForecast = () => {}, selectionRequest = null, prescriptiveReturn = null }) {
    const [target, setTarget] = useState(forecastSettings.target);
    const [horizon, setHorizon] = useState(forecastSettings.horizon);
    const [forecastModel, setForecastModel] = useState(forecastSettings.model);
    const [category, setCategory] = useState('');
    const [provinceKey, setProvinceKey] = useState('');
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
    const forceRefresh = useRef(false);
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
        setDraftTarget(forecastSettings.target);
        setDraftHorizon(forecastSettings.horizon);
        setDraftForecastModel(forecastSettings.model);
    }, [forecastSettings.target, forecastSettings.horizon, forecastSettings.model]);

    useEffect(() => {
        setCategory('');
        setProvinceKey('');
        setDraftCategory('');
        setDraftProvinceKey('');
    }, [scopeKey]);

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
        const controller = new AbortController();
        const requestParams = { scope, target, horizon, model: forecastModel, category, provinceKey };
        const cached = forceRefresh.current ? null : getCachedPredictive(requestParams);
        if (cached) {
            setState({ key: requestKey, loading: false, data: cached });
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
                setState({ key: requestKey, loading: false, data: result });
            } catch (error) {
                if (error.name !== 'AbortError') setState({ key: requestKey, loading: false, error: error.message });
            }
        }

        load();
        return () => controller.abort();
    }, [scopeKey, target, horizon, forecastModel, category, provinceKey, revision, requestKey, active]);

    const current = state.key === requestKey ? state : (() => {
        const data = getCachedPredictive({ scope, target, horizon, model: forecastModel, category, provinceKey });
        return data ? { key: requestKey, loading: false, data } : { loading: true };
    })();
    const data = current.data;
    const loading = current.loading;
    const selectedProvince = data?.options.provinces.find(item => item.key === provinceKey);
    const selectionLabel = [selectedProvince?.name, category].filter(Boolean).join(' × ') || 'All Provinces × All Categories';
    const hasPendingChanges = draftTarget !== target || draftHorizon !== horizon || draftForecastModel !== forecastModel || draftCategory !== category || draftProvinceKey !== provinceKey;

    function generateForecast() {
        setTarget(draftTarget);
        setHorizon(draftHorizon);
        setForecastModel(draftForecastModel);
        onForecastSettingsChange({ target: draftTarget, horizon: draftHorizon, model: draftForecastModel });
        setCategory(draftCategory);
        setProvinceKey(draftProvinceKey);
    }

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

    return <div className="rd-page predictive-page">
        <header className="rd-header">
            <div>
                <span className="rd-eyebrow">PREDICTIVE ANALYTICS</span>
                <h1>Demand Forecast</h1>
                <p>Compare expected demand across product categories and provinces, then inspect any province × category forecast.</p>
            </div>
            {data && <div className="rd-header-note"><span>Forecast scope</span><strong>{selectionLabel}</strong><small>{data.horizon}-month horizon · {data.unit}</small></div>}
        </header>

        <section className="rd-card predictive-controls">
            <div className="rd-card-head between"><div><h2>Forecast parameters</h2><p>Choose a metric, category, province, forecasting model, and forecast horizon, then generate the forecast.</p></div>
                <div className="predictive-control-actions">
                    <button className="predictive-refresh" type="button" onClick={regenerate} disabled={loading || hasPendingChanges}>{loading ? 'Updating…' : 'Refresh data'}</button>
                    <button className="predictive-generate" type="button" onClick={generateForecast} disabled={loading}>{loading ? 'Generating…' : 'Generate Forecast'}</button>
                </div>
            </div>
            <div className="predictive-control-grid">
                <label className="rd-field"><span>Metric</span><select value={draftTarget} onChange={event => setDraftTarget(event.target.value)}><option value="revenue">Revenue (₱)</option><option value="orders">Orders</option><option value="quantity">Quantity</option></select></label>
                <label className="rd-field"><span>Product category</span><select value={draftCategory} onChange={event => setDraftCategory(event.target.value)}><option value="">All Categories</option>{data?.options.categories.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
                <label className="rd-field"><span>Province</span><select value={draftProvinceKey} onChange={event => setDraftProvinceKey(event.target.value)}><option value="">All Provinces</option>{data?.options.provinces.map(item => <option key={item.key} value={item.key}>{item.name} · {item.region}</option>)}</select></label>
                <label className="rd-field"><span>Forecast horizon</span><select value={draftHorizon} onChange={event => setDraftHorizon(Number(event.target.value))}><option value={3}>3 Months</option><option value={6}>6 Months</option><option value={9}>9 Months</option><option value={12}>12 Months</option></select></label>
                <label className="rd-field"><span>Forecasting model</span><select value={draftForecastModel} onChange={event => setDraftForecastModel(event.target.value)}><option value="arima">ARIMA</option><option value="prophet">Prophet</option><option value="random_forest">Random Forest Regression</option></select></label>
            </div>
            {hasPendingChanges && <p className="predictive-pending-note" role="status">Parameters changed. Select Generate Forecast to update the results.</p>}
            <p className="predictive-scope-note">Analytics Scope: {scope.region || 'All Regions'} · {scope.province || 'All Provinces'} · {scope.categories == null ? 'All categories' : scope.categories.join(', ') || 'No categories selected'} · {scope.period || 'All Available Data'} · {scope.returns || 'Include All'}{scope.period === 'Custom Range' ? ` (${scope.start} to ${scope.end})` : ''}</p>
            <p className="predictive-method-note">Exploratory forecasts can be generated with 3 consecutive observed months. Reliability is limited with fewer than 18 months; 3–5 months are too few to measure forecast accuracy. Missing months remain unknown and block forecasting. Verify the first and last months are fully uploaded.</p>
        </section>

        {loading && <p className="predictive-status" role="status">Loading scoped history and calculating forecasts…</p>}
        {current.error && <section className="rd-card predictive-error" role="alert"><h2>Forecast unavailable</h2><p>{current.error}</p><button type="button" className="rd-link-button" onClick={regenerate}>Retry</button></section>}

        {data && <>
            <section className="rd-kpi-grid four predictive-kpis" aria-label="Forecast summary">
                <Kpi label="Projected monthly demand" value={formatValue(data.chart.forecastDemand, target)} detail="Average forecast per month across the selected horizon" />
                <Kpi label="Forecast growth" value={formatPercent(data.chart.growth)} detail="Forecast average compared with the latest 12-month average" />
                <Kpi label="Forecastable pairs" value={`${data.options.forecastablePairs} / ${data.options.totalPairs}`} detail="Province × category pairs meeting history checks" />
                <Kpi label="Backtest MAPE" value={data.chart.validation?.mape == null ? 'N/A' : `${formatValue(data.chart.validation.mape, 'quantity')}%`} detail="Lower is closer; zero-demand months are excluded" />
            </section>

            <section className="rd-card predictive-chart-card">
                <div className="rd-card-head between"><div><h2>Historical vs Forecast Demand</h2><p>{selectionLabel} · monthly {data.unit} · {data.chart.model || forecastModelLabel(forecastModel)}</p></div><span className={`predictive-status-pill ${data.chart.status}`}>{data.chart.status === 'available' ? 'Forecast available' : 'Insufficient history'}</span></div>
                {data.chart.history.length ? <ForecastChart result={data.chart} target={target} /> : <EmptyState message="No matching transactions are available for this scope." />}
                {data.chart.status !== 'available' && data.chart.history.length > 0 && <p className="predictive-inline-warning">{data.chart.reason}</p>}
                {data.chart.status === 'available' && data.chart.reliability !== 'backtested' && <p className="predictive-inline-warning" role="status">{data.chart.reliability === 'very_low' ? 'Very low reliability' : 'Low reliability'}: {data.chart.coverage.calendarMonths} consecutive months are available. {data.chart.validation ? `The backtest covers only ${data.chart.validation.months} month${data.chart.validation.months === 1 ? '' : 's'}, so its error metrics are highly uncertain.` : 'There are too few months to run a meaningful backtest, so forecast accuracy cannot be measured yet.'} Treat this as an exploratory estimate.</p>}
            </section>

            {data.detail && <section className="rd-card predictive-detail-card">
                <div className="rd-card-head between"><div><h2>{data.detail.province} × {data.detail.category}</h2><p>{data.detail.region} · selected province and product category</p></div><div className="predictive-detail-actions">{prescriptiveReturn && <><button type="button" className="predictive-return-strategy" onClick={onReturnToStrategy}>← Return to this strategy</button><button type="button" className="predictive-return-overview" onClick={exitPairForecast}>Back to Predictive overview</button></>}<span className={`predictive-status-pill ${data.detail.status}`}>{data.detail.status === 'available' ? 'Available' : 'Insufficient history'}</span></div></div>
                {data.detail.status === 'available' ? <>
                    <div className="predictive-detail-grid">
                        <Metric label="Current monthly average" value={formatValue(data.detail.currentDemand, target)} />
                        <Metric label="Forecast monthly average" value={formatValue(data.detail.forecastDemand, target)} />
                        <Metric label="Change / month" value={formatChange(data.detail.currentDemand, data.detail.forecastDemand, target)} />
                        <Metric label="Forecast growth" value={formatPercent(data.detail.growth)} />
                        <Metric label="Expected demand at horizon end" value={formatValue(data.detail.endDemand, target)} />
                    </div>
                    <p className="predictive-interpretation">{data.detail.category} in {data.detail.province} is projected to show {data.detail.trend.toLowerCase()} demand over the selected {horizon}-month horizon. This is forecast evidence, not a business recommendation.</p>
                </> : <p className="predictive-inline-warning">{data.detail.reason || 'There is no transaction history for this province and category.'} {data.detail.coverage.orders ? `${data.detail.coverage.orders} orders across ${data.detail.coverage.activeMonths} active months.` : ''}</p>}
            </section>}

            <div className="rd-grid-two predictive-grid">
                <section className="rd-card predictive-fit-card predictive-category-card">
                    <div className="rd-card-head"><div><h2>Product Category Forecast</h2><p>{selectedProvince ? `Categories within ${selectedProvince.name}` : 'Compare categories across the current analysis scope.'}</p></div></div>
                    <div className="rd-table-wrap"><table className="rd-table predictive-table"><thead><tr><th>Category</th><th>Current / month</th><th>Forecast / month</th><th>Change / month</th><th>Growth</th><th>Trend</th><th>Status</th></tr></thead><tbody>
                        {data.categoryRows.map(row => <tr key={row.category} className={draftCategory === row.category ? 'predictive-selected-row' : ''}>
                            <td><button type="button" className="predictive-select-link" aria-pressed={draftCategory === row.category} onClick={() => setDraftCategory(row.category)}>{row.category}</button></td>
                            <td>{formatValue(row.currentDemand, target)}</td><td>{formatValue(row.forecastDemand, target)}</td><td>{formatChange(row.currentDemand, row.forecastDemand, target)}</td><td>{formatPercent(row.growth)}</td><td>{trendLabel(row.trend)}</td><td><Status status={row.status} /></td>
                        </tr>)}
                        {!data.categoryRows.length && <tr><td colSpan="7">No categories are available in this scope.</td></tr>}
                    </tbody></table></div>
                </section>

                <section className="rd-card predictive-fit-card predictive-province-card forecast-fixed-card">
                    <div className="rd-card-head"><div><h2>Province Forecast</h2><p>{category ? `Where ${category} is forecast to perform.` : 'Compare provinces across the current analysis scope.'}</p></div></div>
                    <div className="forecast-panel-scroll"><div className="rd-table-wrap"><table className="rd-table predictive-table"><thead><tr><th>Province</th><th>Region</th><th>Current / month</th><th>Forecast / month</th><th>Change / month</th><th>Growth</th><th>Status</th></tr></thead><tbody>
                        {rowsForPage(data.provinceRows, provincePage).map(row => <tr key={row.key} className={draftProvinceKey === row.key ? 'predictive-selected-row' : ''}>
                            <td><button type="button" className="predictive-select-link" aria-pressed={draftProvinceKey === row.key} onClick={() => setDraftProvinceKey(row.key)}>{row.name}</button></td>
                            <td>{row.region}</td><td>{formatValue(row.currentDemand, target)}</td><td>{formatValue(row.forecastDemand, target)}</td><td>{formatChange(row.currentDemand, row.forecastDemand, target)}</td><td>{formatPercent(row.growth)}</td><td><Status status={row.status} /></td>
                        </tr>)}
                        {!data.provinceRows.length && <tr><td colSpan="6">No provinces are available in this scope.</td></tr>}
                    </tbody></table></div></div>
                    <SectionPagination total={data.provinceRows.length} page={provincePage} setPage={setProvincePage} label="Province forecast" />
                </section>
            </div>

            <section className="rd-card predictive-fit-card predictive-overview-card forecast-fixed-card">
                <div className="rd-card-head between"><div><h2>Forecast Overview</h2><p>Ranked by average monthly forecast demand over the selected horizon. Use a row to open its category and province.</p></div><span className="rd-tag">{data.overview.length} forecastable pairs</span></div>
                <div className="forecast-panel-scroll">
                    {data.overview.length ? <div className="rd-table-wrap predictive-ranked-wrap"><table className="rd-table predictive-table"><thead><tr><th>Rank</th><th>Province</th><th>Region</th><th>Category</th><th>Forecast / month</th><th>Growth</th><th>Trend</th><th>History evidence</th></tr></thead><tbody>
                        {rowsForPage(data.overview, overviewPage).map((row, index) => <tr key={row.key}><td>{(overviewPage - 1) * ROWS_PER_PAGE + index + 1}</td><td><button type="button" className="predictive-select-link" onClick={() => setDraftProvinceKey(JSON.stringify([row.region, row.province]))}>{row.province}</button></td><td>{row.region}</td><td><button type="button" className="predictive-select-link" onClick={() => setDraftCategory(row.category)}>{row.category}</button></td><td>{formatValue(row.forecastDemand, target)}</td><td>{formatPercent(row.growth)}</td><td>{trendLabel(row.trend)}</td><td>{row.coverage.calendarMonths} mo · {reliabilityLabel(row.reliability)}</td></tr>)}
                    </tbody></table></div> : <EmptyState message="No province × category pair currently meets the forecast history checks." />}
                    {data.insufficient.length > 0 && <details className="predictive-insufficient">
                        <summary>Insufficient history ({data.insufficient.length} pairs)</summary>
                        <p>These pairs are kept separate from forecast rankings because their history is too short, has gaps, or contains negative monthly demand.</p>
                        <div className="rd-table-wrap"><table className="rd-table predictive-table"><thead><tr><th>Province</th><th>Region</th><th>Category</th><th>Orders</th><th>Observed months</th><th>Reason</th></tr></thead><tbody>
                            {rowsForPage(data.insufficient, insufficientPage).map(row => <tr key={row.key}><td>{row.province}</td><td>{row.region}</td><td>{row.category}</td><td>{row.coverage.orders.toLocaleString()}</td><td>{row.coverage.activeMonths} / {row.coverage.calendarMonths}</td><td>{row.reason}</td></tr>)}
                        </tbody></table></div>
                        <SectionPagination total={data.insufficient.length} page={insufficientPage} setPage={setInsufficientPage} label="Insufficient history" />
                    </details>}
                </div>
                <SectionPagination total={data.overview.length} page={overviewPage} setPage={setOverviewPage} label="Forecast overview" />
            </section>

            <div className="rd-grid-two predictive-grid">
                <section className="rd-card predictive-fit-card predictive-reliability-card forecast-fixed-card">
                    <div className="rd-card-head"><div><h2>Forecast Reliability</h2><p>{data.chart.validation ? `Historical holdout test for ${selectionLabel}` : `${data.chart.coverage.calendarMonths} observed months for ${selectionLabel}`}</p></div></div>
                    <div className="forecast-panel-scroll">
                    {data.chart.validation ? <>
                        <dl className="predictive-validation-metrics">
                            <div><dt>Model</dt><dd>{data.chart.model}</dd></div>
                            <div><dt>Backtest period</dt><dd>{data.chart.validation.months} months · {monthLabel(data.chart.validation.start)} to {monthLabel(data.chart.validation.end)}</dd></div>
                            <div><dt>MAPE</dt><dd>{data.chart.validation.mape == null ? 'Not available' : `${formatValue(data.chart.validation.mape, 'quantity')}%`}</dd></div>
                            <div><dt>MAE</dt><dd>{formatValue(data.chart.validation.mae, target)}</dd></div>
                            <div><dt>RMSE</dt><dd>{formatValue(data.chart.validation.rmse, target)}</dd></div>
                            <div><dt>Observations</dt><dd>{data.chart.coverage.calendarMonths} monthly · {data.chart.coverage.activeMonths} active</dd></div>
                        </dl>
                        <div className="rd-table-wrap"><table className="rd-table predictive-table"><thead><tr><th>Test month</th><th>Actual</th><th>Predicted</th></tr></thead><tbody>{rowsForPage(data.chart.validation.points, reliabilityPage).map(point => <tr key={point.month}><td>{monthLabel(point.month)}</td><td>{formatValue(point.actual, target)}</td><td>{formatValue(point.predicted, target)}</td></tr>)}</tbody></table></div>
                        <p className="predictive-method-note">MAPE excludes actual zero-demand months. The final model uses all observed history; backtest results use only earlier training months.</p>
                    </> : data.chart.status === 'available' ? <div className="predictive-inline-warning" role="status"><strong>Very limited reliability evidence</strong><p>{data.chart.coverage.calendarMonths} consecutive months can produce an exploratory forecast, but there are too few observations for a meaningful holdout backtest. No accuracy percentage is available; treat the projection as highly uncertain.</p></div> : <EmptyState message={data.chart.reason || 'A backtest is not available for this scope.'} />}
                    </div>
                    {data.chart.validation && <SectionPagination total={data.chart.validation.points.length} page={reliabilityPage} setPage={setReliabilityPage} label="Forecast reliability" always />}
                </section>

                <section className="rd-card predictive-fit-card predictive-range-card forecast-fixed-card">
                    <div className="rd-card-head"><div><h2>Forecast Range</h2><p>Expected demand and backtest-error range for each month ahead.</p></div></div>
                    <div className="forecast-panel-scroll">
                    {data.chart.status === 'available' ? <>
                        <div className="predictive-range-summary"><span>At horizon end · {monthLabel(data.chart.forecast.at(-1).month)}</span><strong>{formatValue(data.chart.forecast.at(-1).value, target)}</strong><small>{formatValue(data.chart.forecast.at(-1).lower, target)} – {formatValue(data.chart.forecast.at(-1).upper, target)}</small></div>
                        <div className="rd-table-wrap"><table className="rd-table predictive-table"><thead><tr><th>Month</th><th>Estimate</th><th>Lower range</th><th>Upper range</th></tr></thead><tbody>{rowsForPage(data.chart.forecast, rangePage).map(row => <tr key={row.month}><td>{monthLabel(row.month)}</td><td>{formatValue(row.value, target)}</td><td>{formatValue(row.lower, target)}</td><td>{formatValue(row.upper, target)}</td></tr>)}</tbody></table></div>
                        <p className="predictive-method-note">{data.chart.forecast[0]?.rangeMethod === 'backtest_rmse' ? 'The range expands with horizon and uses backtest RMSE. It is not a confidence interval; observed forecast errors may fall outside it.' : 'No backtest is available. This illustrative range uses historical variability with a 25% minimum buffer. It is a display heuristic, not a measured confidence interval.'}</p>
                    </> : <EmptyState message={data.chart.reason || 'A forecast range is unavailable for this scope.'} />}
                    </div>
                    <SectionPagination total={data.chart.forecast?.length || 0} page={rangePage} setPage={setRangePage} label="Forecast range" always />
                </section>
            </div>

            <section className="rd-card predictive-signals">
                <div className="rd-card-head"><div><h2>Notable Future Signals</h2><p>Province × category forecasts with the strongest positive projected growth. These are signals, not recommendations.</p></div></div>
                {data.signals.length ? <div className="predictive-signal-grid">{data.signals.map(row => {
                    const absoluteChange = row.currentDemand == null || row.forecastDemand == null ? null : row.forecastDemand - row.currentDemand;
                    return <button type="button" className="predictive-signal" key={row.key} onClick={() => { setDraftCategory(row.category); setDraftProvinceKey(JSON.stringify([row.region, row.province])); }}>
                    <strong>{row.province} × {row.category}</strong><span>{formatPercent(row.growth)} · {row.trend}</span>
                    <small className="predictive-signal-metrics"><span><b>Current / mo</b>{formatValue(row.currentDemand, target)}</span><span><b>Forecast / mo</b>{formatValue(row.forecastDemand, target)}</span><span className={absoluteChange != null && absoluteChange < 0 ? 'negative' : 'positive'}><b>Change / mo</b>{absoluteChange == null ? 'N/A' : `${absoluteChange > 0 ? '+' : ''}${formatValue(absoluteChange, target)}`}</span></small>
                </button>;
                })}</div> : <EmptyState message="Future signals will appear when combinations have enough continuous history." />}
            </section>

            <section className="predictive-handoff">
                <div><strong>Continue to Prescriptive Analytics</strong><small>Predictive Analytics reports estimates and validation; it does not make business recommendations.</small></div>
                <button type="button" onClick={onViewPrescriptive}>View Prescriptive Analytics <span aria-hidden="true">→</span></button>
            </section>
        </>}
    </div>;
}

function Kpi({ label, value, detail }) {
    return <div className="rd-kpi"><div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div></div>;
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

function Metric({ label, value }) {
    return <div className="predictive-metric"><small>{label}</small><strong>{value}</strong></div>;
}

function Status({ status }) {
    return <span className={`predictive-status-pill ${status}`}>{status === 'available' ? 'Available' : 'Insufficient history'}</span>;
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

function ForecastChart({ result, target }) {
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
    const forecastLine = forecast.length && history.length
        ? [{ ...history.at(-1) }, ...forecast].map((point, index) => `${xPosition(history.length - 1 + index)},${yPosition(point.value)}`).join(' ')
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
                        <path d={makeLine(history)} className="predictive-chart-history" />
                        {forecastLine && <polyline points={forecastLine} className="predictive-chart-forecast" />}
                        {history.map((point, index) => point.value == null ? null : <circle key={`actual-${point.month}`} cx={xPosition(index)} cy={yPosition(point.value)} r="4" tabIndex="0" aria-label={`Actual, ${formatPeriod(point.month)}, ${formatValue(point.value, target)}`} onPointerEnter={() => setHoveredPoint({ point, kind: 'Actual' })} onPointerLeave={() => setHoveredPoint(null)} onFocus={() => setHoveredPoint({ point, kind: 'Actual' })} onBlur={() => setHoveredPoint(null)} className="predictive-chart-actual"><title>{`${formatPeriod(point.month)} · Actual · ${formatValue(point.value, target)}`}</title></circle>)}
                        {forecast.map((point, index) => <circle key={`forecast-${point.month}`} cx={xPosition(history.length + index)} cy={yPosition(point.value)} r="4" tabIndex="0" aria-label={`Forecast, ${formatPeriod(point.month)}, ${formatValue(point.value, target)}, range ${formatValue(point.lower, target)} to ${formatValue(point.upper, target)}`} onPointerEnter={() => setHoveredPoint({ point, kind: 'Forecast' })} onPointerLeave={() => setHoveredPoint(null)} onFocus={() => setHoveredPoint({ point, kind: 'Forecast' })} onBlur={() => setHoveredPoint(null)} className="predictive-chart-projected"><title>{`${formatPeriod(point.month)} · Forecast · ${formatValue(point.value, target)} · Range ${formatValue(point.lower, target)}–${formatValue(point.upper, target)}`}</title></circle>)}
                        {history.length > 0 && <line x1={dividerX} x2={dividerX} y1={plotTop} y2={plotBottom} className="predictive-chart-divider" />}
                        {xTicks.map(({ index, label }) => <text key={`x-${index}`} x={xPosition(index)} y={plotHeight - 15} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{label}</text>)}
                    </svg>
                </div>
            </div>
            <div className="predictive-chart-legend"><span><i className="history-key" />Historical demand</span><span><i className="forecast-key" />Forecast demand</span><span><i className="range-key" />{forecast[0]?.rangeMethod === 'backtest_rmse' ? 'Backtest-error range' : 'Illustrative range'}</span></div>
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
