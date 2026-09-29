import { useEffect, useState } from 'react';
import { DEFAULT_SCOPE, monthLabel } from '../hooks/useAnalytics';
import '../styles/analytics-redesign.css';

const format = value => value == null ? 'N/A' : new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(value);

export default function PredictiveAnalytics({ scope = DEFAULT_SCOPE }) {
    const [horizon, setHorizon] = useState(12);
    const [target, setTarget] = useState('quantity');
    const [revision, setRevision] = useState(0);
    const [state, setState] = useState({ loading: true });
    const key = JSON.stringify({ scope, horizon, target, revision });
    useEffect(() => {
        const controller = new AbortController();
        setState({ loading: true, key });
        async function load() {
            try {
                const params = new URLSearchParams({ filters: JSON.stringify(scope), horizon, target });
                const response = await fetch(`/api/forecasts?${params}`, { signal: controller.signal });
                if (response.status === 404) throw new Error('The running backend has not loaded the forecast endpoint. Restart it with npm run server, then click Regenerate forecast.');
                if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Forecast API unavailable. Restart the backend and check the API connection.');
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Unable to generate forecast.');
                setState({ key, data });
            } catch (error) {
                if (error.name !== 'AbortError') setState({ key, error: error.message });
            }
        }
        load();
        return () => controller.abort();
    }, [key]);
    const { data, error } = state.key === key ? state : {};
    const loading = state.key !== key || state.loading;
    return <div className="rd-page forecast-page">
        <div className="rd-header"><div><span className="rd-eyebrow">PREDICTIVE ANALYTICS</span><h1>Demand Forecast</h1><p>See estimated monthly sales, orders, or revenue based on your past records.</p></div></div>
        <section className="rd-card" style={{ marginBottom: 18 }}>
            <div className="rd-card-head"><div><h2>Forecast setup</h2><p>Change geography, categories, dates, and return treatment in Analysis Controls, then apply the scope.</p></div></div>
            <div className="rd-field-grid two">
                <label className="rd-field"><span>What to forecast</span><select value={target} onChange={e => setTarget(e.target.value)}><option value="quantity">Net units sold</option><option value="orders">Distinct orders</option><option value="revenue">Revenue (PHP)</option></select></label>
                <label className="rd-field"><span>How far ahead</span><select value={horizon} onChange={e => setHorizon(Number(e.target.value))}><option value={6}>Next 6 months</option><option value={12}>Next 12 months</option></select></label>
            </div>
            <p className="rd-note">{scope.region} · {scope.province} · {scope.categories === null ? 'All categories' : scope.categories?.join(', ') || 'No categories selected'} · {scope.period}{scope.period === 'Custom Range' ? ` (${scope.start} to ${scope.end})` : ''} · {scope.returns}</p>
            <button className="rd-primary-button" disabled={loading} onClick={() => setRevision(n => n + 1)}>{loading ? 'Calculating...' : 'Regenerate forecast'}</button>
        </section>
        {loading && <p role="status">Loading historical data and calculating forecasts...</p>}
        {error && <section className="rd-card" role="alert"><h2>Forecast unavailable</h2><p>{error}</p></section>}
        {data && <>
            <div className="rd-kpi-grid four">
                <Kpi label="Forecast unit" value={data.unit} detail="Monthly total for your selected filters" />
                <Kpi label="Historical coverage" value={`${data.coverage.observedMonths} months of data`} detail={`${monthLabel(data.coverage.start)} to ${monthLabel(data.coverage.end)}`} />
                <Kpi label="Latest dataset record" value={data.coverage.latestAvailableDate || 'No data'} detail={`Source: Supabase · loaded ${new Date(data.loadedAt).toLocaleString()}`} />
                <Kpi label="History check" value={data.status === 'ready' ? 'Forecast available' : 'Insufficient history'} detail={`${data.coverage.missingMonths.length} months without records`} />
            </div>
            <section className="rd-card forecast-notes" style={{ marginBottom: 18 }} aria-live="polite">
                <h2>What to know before using this forecast</h2>
                {data.status === 'ready' ? <ul className="forecast-note-list">
                    <li><strong>Estimates, not guarantees.</strong> Actual results may fall outside the lower and upper estimates.</li>
                    <li><strong>Check your uploads.</strong> Make sure the first and last months contain all their records. A partial month can make demand look lower than it is.</li>
                    {data.model === 'Historical mean' && <li><strong>Limited seasonal history.</strong> This forecast uses the average of past months. It does not account for seasonal changes.{horizon === 12 ? ' The 12-month forecast was tested against only 6 months of past results.' : ''}</li>}
                    {data.validation.mae >= data.validation.baselineMae && <li><strong>Use extra caution.</strong> In the historical test, this method was no more accurate than repeating the last known monthly total.</li>}
                </ul> : <ul className="forecast-note-list">{data.messages.map(message => <li key={message}>{message}</li>)}</ul>}
                {data.coverage.missingMonths.length > 0 && <p>Months to check: {data.coverage.missingMonths.map(monthLabel).join(', ')}</p>}
            </section>
            {data.status === 'ready' && <>
                <div className="rd-kpi-grid four">
                    <Kpi label="Forecast period" value={`${horizon} months`} detail={`${monthLabel(data.forecast[0].month)} to ${monthLabel(data.forecast.at(-1).month)}`} />
                    <Kpi label="Final month estimate" value={format(data.forecast.at(-1).value)} detail={data.unit} />
                    <Kpi label="Projected change" value={data.projectedChange == null ? 'N/A' : `${data.projectedChange > 0 ? '+' : ''}${format(data.projectedChange)}%`} detail="Latest historical month to final forecast month" />
                    <Kpi label="Average test error" value={format(data.validation.mae)} detail={`${data.unit} per month; lower is better`} />
                </div>
                <section className="rd-card" style={{ marginBottom: 18 }}><h2>Historical vs forecast</h2><p>{data.model} · {data.unit} · approximate 95% prediction interval</p><ForecastChart data={data} /></section>
                <div className="rd-grid-two">
                    <section className="rd-card">
                        <h2>Monthly forecast</h2>
                        <p>Estimated {data.target === 'revenue' ? 'revenue in PHP' : data.unit} for each future month.</p>
                        <p className="forecast-help">Lower and upper estimates show the approximate 95% prediction range. Actual results can fall outside it.</p>
                        <div className="rd-table-wrap"><table className="rd-table"><thead><tr><th>Month</th><th>Estimate</th><th>Lower estimate</th><th>Upper estimate</th></tr></thead><tbody>{data.forecast.map(row => <tr key={row.month}><td>{monthLabel(row.month)}</td><td>{format(row.value)}</td><td>{format(row.lower)}</td><td>{format(row.upper)}</td></tr>)}</tbody></table></div>
                        {data.target !== 'revenue' && <p className="forecast-help">Estimates may include decimals because they represent expected averages.</p>}
                    </section>
                    <section className="rd-card">
                        <h2>How accurate was the forecast?</h2>
                        <p>We used {data.validation.trainingMonths} earlier months to predict the next {data.validation.months} months, then compared those predictions with the actual results.</p>
                        <dl className="forecast-validation">
                            <div><dt>Test period</dt><dd>{monthLabel(data.validation.start)} to {monthLabel(data.validation.end)}</dd></div>
                            <div><dt>Average error per month (MAE)</dt><dd>{format(data.validation.mae)} {data.unit}</dd></div>
                            <div><dt>Average percentage error (MAPE)</dt><dd>{data.validation.mape == null ? 'Not available' : format(data.validation.mape) + '%'}</dd></div>
                        </dl>
                        <p className="forecast-help">Lower error means the predictions were closer to the actual results.</p>
                        {data.validation.mapeExcludedMonths > 0 && <p className="forecast-help">Percentage error excludes {data.validation.mapeExcludedMonths} months with zero actual results.</p>}
                        <div className="rd-table-wrap"><table className="rd-table"><thead><tr><th>Month</th><th>Actual</th><th>Predicted</th></tr></thead><tbody>{data.validation.points.map(row => <tr key={row.month}><td>{monthLabel(row.month)}</td><td>{format(row.actual)}</td><td>{format(row.predicted)}</td></tr>)}</tbody></table></div>
                        <details className="forecast-details"><summary>How the forecast is checked</summary><p>A simple comparison method repeats the last known monthly total. Its average test error was {format(data.validation.baselineMae)} {data.unit}. The final forecast uses all available history.</p><p>The 95% range is approximate. It assumes independent, normally distributed errors, and the lower estimate cannot fall below zero. Its actual coverage has not been verified.</p></details>
                    </section>
                </div>
            </>}
        </>}
    </div>;
}

function Kpi({ label, value, detail }) {
    return <div className="rd-kpi"><div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div></div>;
}

function ForecastChart({ data }) {
    const { history, forecast } = data;
    const all = [...history, ...forecast];
    const max = Math.max(1, ...all.map(p => p.upper ?? p.value));
    const x = i => 65 + i * 690 / (all.length - 1);
    const y = value => 235 - value / max * 195;
    const points = (rows, offset, field = 'value') => rows.map((p, i) => `${x(i + offset)},${y(p[field])}`).join(' ');
    const band = points(forecast, history.length, 'upper') + ' ' + forecast.map((p, i) => `${x(history.length + i)},${y(p.lower)}`).reverse().join(' ');
    return <><svg viewBox="0 0 800 290" role="img" aria-label={`Monthly ${data.unit}: historical data and ${forecast.length} forecast months with approximate 95 percent prediction intervals`} style={{ width: '100%', minHeight: 220 }}>
        {[0, 0.5, 1].map(fraction => <g key={fraction}><line x1="65" x2="755" y1={y(max * fraction)} y2={y(max * fraction)} stroke="#e1e8f2" /><text x="58" y={y(max * fraction) + 4} textAnchor="end" fontSize="10">{format(max * fraction)}</text></g>)}
        <polygon points={band} fill="#dbeafe" />
        <polyline points={points(history, 0)} fill="none" stroke="#334155" strokeWidth="2.5" />
        <polyline points={points([history.at(-1), ...forecast], history.length - 1)} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeDasharray="6 3" />
        <line x1={x(history.length - 1)} x2={x(history.length - 1)} y1="30" y2="240" stroke="#94a3b8" strokeDasharray="4 4" />
        <text x="65" y="267" fontSize="11">{monthLabel(history[0].month)}</text><text x={x(history.length - 1)} y="267" textAnchor="middle" fontSize="11">{monthLabel(history.at(-1).month)}</text><text x="755" y="267" textAnchor="end" fontSize="11">{monthLabel(forecast.at(-1).month)}</text>
    </svg><p>Solid gray: historical · Dashed blue: forecast · Shaded blue: prediction interval</p></>;
}
