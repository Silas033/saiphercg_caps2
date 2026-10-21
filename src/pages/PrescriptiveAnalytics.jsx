import { useEffect, useRef, useState } from 'react';
import { FaChevronDown, FaInfoCircle, FaLightbulb, FaSyncAlt } from 'react-icons/fa';
import { fetchPrescriptive, getCachedPrescriptive } from '../data/analyticsApi';
import { DEFAULT_FORECAST_SETTINGS } from '../data/forecastSettings';
import { DEFAULT_SCOPE, monthLabel } from '../hooks/useAnalytics';
import '../styles/analytics-redesign.css';
import '../styles/prescriptive.css';

const PAGE_SIZE = 30;
const STRATEGIES = [
    { key: 'PROMOTE / INCREASE FOCUS', title: 'Promote / Increase Focus', description: 'High relative demand with positive growth evidence.', tone: 'promote' },
    { key: 'MAINTAIN / DEFEND', title: 'Maintain / Defend', description: 'Strong established demand with steady or slower growth.', tone: 'maintain' },
    { key: 'TEST / EXPLORE', title: 'Test / Explore', description: 'Moderate relative demand with stronger growth evidence.', tone: 'test' },
    { key: 'MONITOR / DEPRIORITIZE', title: 'Monitor / Deprioritize', description: 'Lower demand or weak growth; keep monitoring.', tone: 'monitor' },
    { key: 'INSUFFICIENT HISTORY', title: 'Insufficient History', description: 'The evidence thresholds are not met for a normal strategy.', tone: 'insufficient' }
];

const number = value => value == null || !Number.isFinite(Number(value)) ? 'N/A' : new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 }).format(value);
const metricValue = (value, target) => value == null || !Number.isFinite(Number(value)) ? 'N/A' : target === 'revenue'
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: Math.abs(Number(value)) >= 1_000_000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(Number(value)) >= 1_000_000 ? 2 : 0 }).format(value)
    : number(value);
const percent = value => value == null || !Number.isFinite(Number(value)) ? 'N/A' : `${value > 0 ? '+' : ''}${number(value)}%`;
const strategyMeta = value => STRATEGIES.find(item => item.key === value) || STRATEGIES.at(-1);
const forecastModelName = value => ({ arima: 'ARIMA', prophet: 'Prophet-style', random_forest: 'Random Forest Regression' }[value] || value);
const reliabilityName = value => ({ very_low: 'very low reliability', low: 'low reliability', backtested: 'backtest available' }[value] || 'reliability unavailable');

export default function PrescriptiveAnalytics({ scope = DEFAULT_SCOPE, active = true, forecastSettings = DEFAULT_FORECAST_SETTINGS, onViewPredictive = () => {}, returnRequest = null }) {
    const { horizon, target, model } = forecastSettings;
    const [category, setCategory] = useState('All Categories');
    const [selectedKey, setSelectedKey] = useState('');
    const [showSummaryLightbox, setShowSummaryLightbox] = useState(false);
    const [page, setPage] = useState(1);
    const [showAll, setShowAll] = useState(false);
    const [revision, setRevision] = useState(0);
    const forceRefresh = useRef(false);
    const scopeKey = JSON.stringify(scope);
    const requestKey = JSON.stringify({ scopeKey, horizon, target, model, revision });
    const [state, setState] = useState(() => {
        const data = getCachedPrescriptive({ scope, horizon, target, model });
        return { key: data ? requestKey : '', loading: !data, data };
    });

    useEffect(() => {
        if (!active) return undefined;
        const controller = new AbortController();
        const options = { scope, horizon, target, model };
        const cached = forceRefresh.current ? null : getCachedPrescriptive(options);
        if (cached) {
            setState({ key: requestKey, loading: false, data: cached });
            return () => controller.abort();
        }
        setState(previous => previous.key === requestKey
            ? { ...previous, loading: true, error: '' }
            : { key: requestKey, loading: true, error: '' });

        async function load() {
            try {
                const refresh = forceRefresh.current;
                forceRefresh.current = false;
                const result = await fetchPrescriptive({ ...options, refresh }, controller.signal);
                setState({ key: requestKey, loading: false, data: result });
            } catch (error) {
                if (error.name !== 'AbortError') setState({ key: requestKey, loading: false, error: error.message });
            }
        }
        load();
        return () => controller.abort();
    }, [scopeKey, requestKey, active, revision, horizon, target, model]);

    useEffect(() => {
        setCategory('All Categories');
        setSelectedKey('');
        setPage(1);
        setShowAll(false);
    }, [scopeKey]);

    useEffect(() => {
        if (!returnRequest) return;
        setCategory(returnRequest.category);
        setSelectedKey(returnRequest.pairKey);
        setPage(1);
        setShowAll(false);
        requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('prescriptive-selected-strategy')?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
    }, [returnRequest?.requestId]);

    useEffect(() => {
        if (!showSummaryLightbox) return undefined;
        function closeOnEscape(event) {
            if (event.key === 'Escape') setShowSummaryLightbox(false);
        }
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [showSummaryLightbox]);

    const current = state.key === requestKey ? state : (() => {
        const data = getCachedPrescriptive({ scope, horizon, target, model });
        return data ? { data, loading: false } : { loading: true };
    })();
    const data = current.data;
    const isOverview = category === 'All Categories';
    const categoryRows = data?.pairs.filter(row => isOverview || row.category === category) || [];
    const eligibleRows = categoryRows.filter(row => row.eligible);
    const selected = categoryRows.find(row => row.key === selectedKey) || eligibleRows[0] || categoryRows[0];
    const selectedRank = selected?.eligible ? eligibleRows.findIndex(row => row.key === selected.key) + 1 : null;
    const pageCount = Math.max(1, Math.ceil(categoryRows.length / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;
    const pageRows = isOverview && !showAll ? categoryRows.slice(0, 5) : categoryRows.slice(start, start + PAGE_SIZE);
    const summary = Object.fromEntries(STRATEGIES.slice(0, 4).map(item => [item.key, eligibleRows.filter(row => row.strategy === item.key).length]));
    const notable = eligibleRows.slice(0, 5);
    const otherOpportunities = selected && !isOverview
        ? data?.pairs.filter(row => row.eligible && row.category !== category).slice(0, 4) || []
        : [];

    function refresh() {
        forceRefresh.current = true;
        setRevision(value => value + 1);
    }

    function selectPair(row) {
        setSelectedKey(row.key);
    }

    function showAllRecommendations() {
        setShowAll(true);
        setPage(1);
        requestAnimationFrame(() => document.getElementById('prescriptive-recommendations')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }

    function collapseRecommendations() {
        setShowAll(false);
        setPage(1);
        requestAnimationFrame(() => document.getElementById('prescriptive-notable-opportunities')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }

    if (current.loading && !data) return <div className="rd-page prescriptive-page"><PageHeader scope={scope} /><div className="rd-card prescriptive-loading" role="status">Loading scoped evidence and evaluating strategy eligibility…</div></div>;
    if (current.error && !data) return <div className="rd-page prescriptive-page"><PageHeader scope={scope} /><div className="rd-card prescriptive-error" role="alert"><strong>Prescriptive recommendations are unavailable.</strong><p>{current.error}</p><button type="button" className="prescriptive-button" onClick={refresh}>Retry</button></div></div>;
    if (!data) return null;

    return <div className="rd-page prescriptive-page">
        <PageHeader scope={scope} data={data} />

        <section className="rd-card prescriptive-category-card">
            <label htmlFor="prescriptive-category"><span className="prescriptive-step">1</span><span><strong>Select product category</strong><small>Start with what to evaluate. Province recommendations and evidence update with the selection.</small></span></label>
            <div className="prescriptive-select-wrap"><select id="prescriptive-category" value={category} onChange={event => { setCategory(event.target.value); setSelectedKey(''); setPage(1); setShowAll(false); }}><option>All Categories</option>{data.categories.map(item => <option key={item}>{item}</option>)}</select><FaChevronDown aria-hidden="true" /></div>
        </section>

        <div className="prescriptive-summary-heading"><div className="prescriptive-summary-title"><h2>Strategy Classification Summary</h2><button type="button" className="prescriptive-summary-help" aria-label="Open strategy summary notes" title="Open notes" onClick={() => setShowSummaryLightbox(true)}>?</button></div><p>Eligible province × category pairs by recommended strategy.</p></div>
        {showSummaryLightbox && <div className="prescriptive-lightbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowSummaryLightbox(false); }}>
            <section className="prescriptive-lightbox" role="dialog" aria-modal="true" aria-label="Decision support classification guide">
                <div className="prescriptive-lightbox-head"><div><span>DECISION SUPPORT CLASSIFICATION GUIDE</span><h2>Strategy guide</h2></div><button type="button" aria-label="Close guide" onClick={() => setShowSummaryLightbox(false)}>×</button></div>
                <div className="prescriptive-lightbox-guide">{STRATEGIES.map(item => <article className={`prescriptive-lightbox-guide-item ${item.tone}`} key={item.key}><strong>{item.title}</strong><p>{item.description}</p></article>)}</div>
            </section>
        </div>}
        <section className="prescriptive-strategy-summary" aria-label="Strategy summary">
            {STRATEGIES.slice(0, 4).map(item => <article className={`prescriptive-summary-card ${item.tone}`} key={item.key}>
                <div><span className="prescriptive-status-dot" /><strong>{item.title}</strong></div>
                <b>{summary[item.key]}</b><p>{item.description}</p>
            </article>)}
        </section>
        <p className="prescriptive-summary-note">Counts represent eligible province × category combinations in {isOverview ? 'the current scope' : category}. {categoryRows.filter(row => !row.eligible).length} combinations have insufficient history and are excluded from normal strategy counts. Forecast basis: {target === 'revenue' ? 'Revenue' : target === 'orders' ? 'Orders' : 'Net units'} · {horizon} months · {forecastModelName(model)}. Matching province × category forecast evidence uses the same settings as Predictive Analytics.</p>

        {selected ? <section id="prescriptive-selected-strategy" className={`prescriptive-featured ${selected.eligible ? '' : 'insufficient'}`} aria-label={selected.eligible ? 'Recommendation' : 'Insufficient history'}>
            <div className="prescriptive-featured-kicker"><span>{selected.eligible ? 'RECOMMENDED STRATEGY' : 'INSUFFICIENT HISTORY'}</span><span>{isOverview ? 'All categories' : `Selected category · ${category}`}</span>{selectedRank && <span className="prescriptive-rank">Eligible rank #{selectedRank}</span>}</div>
            <div className="prescriptive-featured-main">
                <div className="prescriptive-featured-place"><span>{selected.category}</span><h2>{selected.province}</h2><small>{selected.region}</small><StrategyBadge strategy={selected.strategy} /></div>
                <div className="prescriptive-featured-metrics">
                    <Metric label="Current demand / month" value={metricValue(selected.demand, target)} />
                    <Metric label="Historical orders" value={number(selected.orders)} />
                    <Metric label="YoY growth" value={percent(selected.yoyGrowth)} tone={growthTone(selected.yoyGrowth)} />
                    <Metric label="Forecast growth" value={selected.forecastAvailable ? percent(selected.forecastGrowth) : 'Unavailable'} tone={growthTone(selected.forecastGrowth)} />
                    <Metric label="Opportunity score" value={selected.eligible ? `${number(selected.opportunityScore)} / 100` : 'Not scored'} />
                </div>
            </div>
            <div className="prescriptive-recommendation"><FaLightbulb aria-hidden="true" /><div><span>RECOMMENDED STRATEGY</span><strong>{recommendationText(selected)}</strong><p>{evidenceSentence(selected)}</p><button type="button" className="prescriptive-link-button" onClick={() => onViewPredictive({ category: selected.category, provinceKey: JSON.stringify([selected.region, selected.province]), pairKey: selected.key, region: selected.region, province: selected.province })}>Open this pair’s forecast and reliability →</button></div></div>
        </section> : <section className="rd-card prescriptive-empty"><h2>No matching province and category data</h2><p>Try a broader analysis scope in Analytics Scope or run Data Preparation.</p></section>}

        {isOverview && <section className="rd-card prescriptive-notable-card" id="prescriptive-notable-opportunities">
            <div className="rd-card-head between"><div><h2>Top strategic opportunities across all categories</h2><p>Start with a short list of supported strategies, then open all recommendations when needed.</p></div><span className="rd-tag">{eligibleRows.length} eligible</span></div>
            {notable.length ? <div className="prescriptive-notable-list">{notable.map((row, index) => <button type="button" key={row.key} className={`prescriptive-notable ${selected?.key === row.key ? 'selected' : ''}`} onClick={() => selectPair(row)}>
                <span className="prescriptive-notable-rank">{index + 1}</span><span className="prescriptive-notable-copy"><strong>{row.province} <i>×</i> {row.category}</strong><small>{row.region} · {metricValue(row.demand, target)} / month · Growth {percent(row.forecastAvailable ? row.forecastGrowth : row.yoyGrowth)}</small></span><StrategyBadge strategy={row.strategy} /><span className="prescriptive-arrow" aria-hidden="true">→</span>
            </button>)}</div> : <Empty message="No eligible combinations meet the minimum evidence thresholds in this scope." />}
            {!showAll && categoryRows.length > 5 && <button type="button" className="prescriptive-button secondary" onClick={showAllRecommendations}>View all recommendations <span aria-hidden="true">→</span></button>}
        </section>}

        <section className="rd-card prescriptive-recommendations-card" id="prescriptive-recommendations">
            <div className="rd-card-head between"><div><h2>{isOverview ? showAll ? 'All Province × Category Recommendations' : 'Province Recommendations' : 'Province Recommendations'}</h2><p>{isOverview ? 'Strategy classifications for eligible province and category combinations.' : `Strategy classifications for ${category} across the selected scope.`}</p></div><div className="prescriptive-recommendations-header-actions"><span className="rd-tag">{categoryRows.length} combinations</span>{isOverview && showAll && <button type="button" className="prescriptive-button secondary" onClick={collapseRecommendations}>Collapse recommendations <span aria-hidden="true">↑</span></button>}</div></div>
            {categoryRows.length ? <>
                <div className="rd-table-wrap prescriptive-table-scroll"><table className="rd-table prescriptive-table"><thead><tr><th>Province</th>{isOverview && <th>Category</th>}<th>Region</th><th>Current demand</th><th>YoY growth</th><th>Forecast growth</th><th>Opportunity score</th><th>Strategy classification</th><th>Action</th></tr></thead><tbody>
                    {pageRows.map(row => <tr key={row.key} className={selected?.key === row.key ? 'selected-row' : ''} onClick={() => selectPair(row)}>
                        <td><strong>{row.province}</strong>{!row.eligible && <small>{row.orders} orders · {row.activeMonths} active months</small>}</td>{isOverview && <td>{row.category}</td>}<td>{row.region}</td><td>{metricValue(row.demand, target)}</td><td className={growthTone(row.yoyGrowth)}>{percent(row.yoyGrowth)}</td><td className={growthTone(row.forecastGrowth)}>{row.forecastAvailable ? percent(row.forecastGrowth) : 'Unavailable'}</td><td>{row.opportunityScore == null ? '—' : number(row.opportunityScore)}</td><td><StrategyBadge strategy={row.strategy} /></td><td><button type="button" className="prescriptive-link-button" onClick={event => { event.stopPropagation(); selectPair(row); document.getElementById('why-this-province')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>View details</button></td>
                    </tr>)}
                </tbody></table></div>
                {(showAll || !isOverview) && <Pagination page={page} pageCount={pageCount} total={categoryRows.length} setPage={setPage} />}
            </> : <Empty message="No province and category combinations match this analysis scope." />}
        </section>

        {selected && <section className="prescriptive-evidence-section" id="why-this-province">
            <div className="rd-card prescriptive-evidence-card">
                <div className="rd-card-head between"><div><span className="prescriptive-section-kicker">DECISION SUPPORT EVIDENCE</span><h2>Why this province? <span>({selected.province} × {selected.category})</span></h2><p>Evidence eligibility and component scores behind the strategy classification.</p></div><span className={`prescriptive-eligibility ${selected.eligible ? 'eligible' : 'insufficient'}`}>{selected.eligible ? '✓ Eligible for strategy evaluation' : '! Insufficient history'}</span></div>
                <div className="prescriptive-eligibility-grid">
                    <EligibilityCheck pass={selected.orders >= data.minimumOrders} label={`Minimum order volume met (${number(selected.orders)} / ${data.minimumOrders})`} />
                    <EligibilityCheck pass={selected.activeMonths >= data.minimumActiveMonths} label={`Minimum active months met (${selected.activeMonths} / ${data.minimumActiveMonths})`} />
                    <EligibilityCheck pass={selected.calendarMonths > 0} label={selected.calendarMonths ? `Historical data available (${selected.calendarMonths} months)` : 'Historical data available'} />
                    <EligibilityCheck pass={selected.forecastAvailable} label={selected.forecastAvailable ? `Forecast evidence available (${data.horizon}-month ${forecastModelName(model)}; ${reliabilityName(selected.forecastReliability)})` : 'Forecast unavailable; historical growth used'} neutral={!selected.forecastAvailable} />
                </div>
                {!selected.eligible && <div className="prescriptive-insufficient-message">Not enough evidence is available to produce a normal strategy classification. This combination is not ranked as a normal recommendation.</div>}
                <div className="prescriptive-evidence-layout">
                    <div className="prescriptive-factor-list">
                        <Factor label="Demand strength" score={selected.factors.demandStrength} description={`Relative current monthly demand: ${metricValue(selected.demand, target)}.`} tone="blue" />
                        <Factor label="Growth momentum" score={selected.factors.growthMomentum} description={growthDescription(selected)} tone="green" />
                        <Factor label="Demand consistency" score={selected.factors.demandConsistency} description={`${selected.activeMonths} of ${selected.calendarMonths} months with transaction activity.`} tone="purple" />
                        <Factor label="Category affinity" score={selected.factors.categoryAffinity} description={selected.affinityRatio == null ? 'Relative category share is unavailable.' : `${number(selected.affinityRatio)}× the category’s overall share.`} tone="amber" />
                    </div>
                    <div className="prescriptive-score-card"><span>Opportunity score</span><strong>{selected.opportunityScore == null ? '—' : number(selected.opportunityScore)}</strong><small>out of 100</small><StrategyBadge strategy={selected.strategy} /></div>
                </div>
                <div className="prescriptive-evidence-details">
                    <Metric label="Province category share" value={selected.categoryShare == null ? 'N/A' : `${number(selected.categoryShare)}%`} />
                    <Metric label="Overall category share" value={selected.overallCategoryShare == null ? 'N/A' : `${number(selected.overallCategoryShare)}%`} />
                    <Metric label="Relative category affinity" value={selected.affinityRatio == null ? 'N/A' : `${number(selected.affinityRatio)}×`} />
                    <Metric label="Forecast trend" value={selected.forecastAvailable ? selected.forecastTrend : 'Unavailable'} />
                </div>
                <details className="prescriptive-score-explainer"><summary>How is this score calculated?</summary><p>The score combines demand strength (35%), growth momentum (30%), demand consistency (20%), and category affinity (15%). Demand strength is ranked within this scope: the top third is high and the middle third is moderate. Growth momentum blends available year-over-year and forecast growth; a 5% mean growth signal maps to 60/100. Promote requires high relative demand and at least that growth signal; Maintain requires high demand with growth momentum of at least 40/100; Test requires moderate demand with at least 60/100 momentum. Other eligible combinations are monitored. Strategy labels follow the demand and growth evidence pattern, not the weighted score alone.</p></details>
            </div>

            <div className="rd-card prescriptive-whitespace-card"><div className="rd-card-head between"><div><h2>Internal whitespace / penetration gap</h2><p>Relative transaction mix for this category.</p></div><span className="rd-tag muted">Secondary indicator</span></div><div className="prescriptive-whitespace-values"><Metric label="Category share in province" value={selected.categoryShare == null ? 'N/A' : `${number(selected.categoryShare)}%`} /><Metric label="Overall category share" value={selected.overallCategoryShare == null ? 'N/A' : `${number(selected.overallCategoryShare)}%`} /><Metric label="Relative difference" value={selected.affinityRatio == null ? 'N/A' : `${number(selected.affinityRatio)}×`} /></div><p className="prescriptive-footnote"><FaInfoCircle aria-hidden="true" /> Internal estimate from observed transaction patterns. It is not external market size or actual untapped market value.</p></div>
        </section>}

        {!isOverview && <section className="rd-card prescriptive-other-card">
            <div className="rd-card-head"><div><h2>Other strategic opportunities</h2><p>Opportunities outside {category}. Select one to evaluate its province and category evidence.</p></div></div>
            {otherOpportunities.length ? <div className="prescriptive-other-grid">{otherOpportunities.map(row => <button type="button" className="prescriptive-other-opportunity" key={row.key} onClick={() => { setCategory(row.category); setSelectedKey(row.key); setPage(1); setShowAll(false); }}><strong>{row.province} × {row.category}</strong><small>{row.region}</small><StrategyBadge strategy={row.strategy} /><span>{otherReason(row)} <b aria-hidden="true">→</b></span></button>)}</div> : <Empty message={`No eligible opportunities outside ${category} in this scope.`} />}
        </section>}

        <button type="button" className="prescriptive-refresh" onClick={refresh} disabled={current.loading}><FaSyncAlt aria-hidden="true" /> {current.loading ? 'Refreshing…' : 'Refresh scoped evidence'}</button>
    </div>;
}

function PageHeader({ scope, data }) {
    return <header className="rd-header prescriptive-header"><div><span className="rd-eyebrow">PRESCRIPTIVE ANALYTICS</span><h1>Prescriptive Analytics</h1><p>What should we focus on, where, and why?</p></div><div className="prescriptive-header-facts"><div><span>Analysis period</span><strong>{data?.effectiveRange?.start && data?.effectiveRange?.end ? `${monthLabel(data.effectiveRange.start)} – ${monthLabel(data.effectiveRange.end)}` : scope.period || 'All available data'}</strong></div><div><span>Scope</span><strong>{scope.region || 'All Regions'} · {scope.province || 'All Provinces'}</strong></div><div><span>Returns</span><strong>{scope.returns || 'Include All'}</strong></div></div></header>;
}

function Metric({ label, value, tone = '' }) {
    return <div className={`prescriptive-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function StrategyBadge({ strategy }) {
    const meta = strategyMeta(strategy);
    return <span className={`prescriptive-strategy-badge ${meta.tone}`}>{meta.title}</span>;
}

function EligibilityCheck({ pass, label, neutral = false }) {
    return <span className={`${pass ? 'pass' : neutral ? 'neutral' : 'fail'}`}><b aria-hidden="true">{pass ? '✓' : neutral ? 'i' : '!'}</b>{label}</span>;
}

function Factor({ label, score, description, tone }) {
    return <div className={`prescriptive-factor ${tone}`}><div className="prescriptive-factor-head"><strong>{label}</strong><b>{score == null ? 'N/A' : `${number(score)} / 100`}</b></div><div className="prescriptive-progress"><span style={{ width: `${Math.max(0, Math.min(100, Number(score) || 0))}%` }} /></div><small>{description}</small></div>;
}

function Pagination({ page, pageCount, total, setPage }) {
    const startPage = Math.max(1, Math.min(page - 2, pageCount - 4));
    const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => startPage + index);
    return <nav className="prescriptive-pagination" aria-label="Province recommendations pagination"><span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span><div><button type="button" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))} aria-label="Previous page">‹</button>{pages.map(value => <button type="button" key={value} className={page === value ? 'active' : ''} aria-current={page === value ? 'page' : undefined} onClick={() => setPage(value)}>{value}</button>)}<button type="button" disabled={page === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))} aria-label="Next page">›</button></div></nav>;
}

function Empty({ message }) {
    return <div className="prescriptive-empty-state">{message}</div>;
}

function growthTone(value) {
    return value == null ? '' : value > 0 ? 'positive' : value < 0 ? 'negative' : '';
}

function recommendationText(row) {
    const focus = {
        'PROMOTE / INCREASE FOCUS': `Increase promotional focus for ${row.category} in ${row.province}.`,
        'MAINTAIN / DEFEND': `Maintain focus on ${row.category} in ${row.province}.`,
        'TEST / EXPLORE': `Test commercial activity for ${row.category} in ${row.province}.`,
        'MONITOR / DEPRIORITIZE': `Continue monitoring ${row.category} in ${row.province} before adding focus.`,
        'INSUFFICIENT HISTORY': `Collect more history for ${row.category} in ${row.province} before assigning a normal strategy.`
    };
    return focus[row.strategy] || focus['INSUFFICIENT HISTORY'];
}

function evidenceSentence(row) {
    if (!row.eligible) return 'The current order volume or active-month history is below the minimum evidence threshold.';
    const signals = [];
    if (row.demand != null) signals.push('observed demand');
    if (row.yoyGrowth != null || row.forecastGrowth != null) signals.push('growth evidence');
    if (row.activeMonths) signals.push('transaction activity');
    if (row.affinityRatio != null) signals.push('category affinity');
    return `${row.province} is evaluated using ${signals.join(', ')}${row.forecastAvailable ? ', and forecast evidence' : ''}. This recommendation supports management focus; it does not guarantee an outcome.`;
}

function growthDescription(row) {
    const historical = row.yoyGrowth == null ? 'year-over-year growth unavailable' : `year-over-year growth ${percent(row.yoyGrowth)}`;
    const forecast = row.forecastAvailable ? `forecast growth ${percent(row.forecastGrowth)}` : 'forecast unavailable; historical evidence used';
    return `${historical}; ${forecast}.`;
}

function otherReason(row) {
    if (row.strategy === 'PROMOTE / INCREASE FOCUS') return 'Consistent demand with positive growth evidence.';
    if (row.strategy === 'MAINTAIN / DEFEND') return 'Established demand with steady growth evidence.';
    if (row.strategy === 'TEST / EXPLORE') return 'Moderate demand with stronger growth evidence.';
    return 'Monitor demand and growth before increasing focus.';
}
