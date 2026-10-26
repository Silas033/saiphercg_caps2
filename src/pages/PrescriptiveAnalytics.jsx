import { useEffect, useRef, useState } from 'react';
import { FaChevronDown, FaChevronUp, FaDownload, FaInfoCircle, FaLightbulb, FaPrint, FaSyncAlt } from 'react-icons/fa';
import { fetchPrescriptive, getCachedPrescriptive } from '../data/analyticsApi';
import { DEFAULT_FORECAST_SETTINGS } from '../data/forecastSettings';
import { DEFAULT_SCOPE, monthLabel } from '../hooks/useAnalytics';
import '../styles/analytics-redesign.css';
import '../styles/prescriptive.css';

const PAGE_SIZE = 30;
const STRATEGIES = [
    { key: 'EXPAND SELECTIVELY', title: 'Expand Selectively', description: 'High demand and strong growth. Prime candidate for marketing budget and inventory expansion.', action: 'Allocate marketing resources, expand safety stock by 15–25%, and secure priority fulfillment.', tone: 'promote' },
    { key: 'SUSTAIN CORE DEMAND', title: 'Sustain Core Demand', description: 'Steady, high-volume cash flow anchor. Protect against stockouts.', action: 'Maintain reliable stock availability and safeguard on-time delivery to protect daily revenue.', tone: 'maintain' },
    { key: 'PILOT AND VALIDATE', title: 'Pilot and Validate', description: 'Emerging demand surge with moderate volume. Test before committing heavy capital.', action: 'Run a 30 to 60-day promotional test to confirm customer demand before bulk restocking.', tone: 'test' },
    { key: 'MONITOR / LOWER PRIORITY', title: 'Monitor / Lower Priority', description: 'Lower sales volume or quiet demand. Keep tracking trends.', action: 'Maintain standard availability without extra promotional spend until ordering frequency accelerates.', tone: 'monitor' }
];
const INSUFFICIENT_STATUS = { key: 'INSUFFICIENT EVIDENCE', title: 'Insufficient Evidence', description: 'Not enough transaction history to assign a confident strategy.', action: 'Collect additional monthly sales records to establish a reliable baseline.', tone: 'insufficient' };

const number = value => value == null || !Number.isFinite(Number(value)) ? 'N/A' : new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 }).format(value);
const metricValue = (value, target) => value == null || !Number.isFinite(Number(value)) ? 'N/A' : target === 'revenue'
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: Math.abs(Number(value)) >= 1_000_000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(Number(value)) >= 1_000_000 ? 2 : 0 }).format(value)
    : number(value);
const metricChange = (current, forecast, target) => current == null || forecast == null ? 'Unavailable' : metricValue(Number(forecast) - Number(current), target);
const forecastChangeValue = row => row.forecastAvailable && row.forecastDemand != null && row.demand != null && Number.isFinite(Number(row.forecastDemand)) && Number.isFinite(Number(row.demand))
    ? Number(row.forecastDemand) - Number(row.demand)
    : null;
const percent = value => value == null || !Number.isFinite(Number(value)) ? 'N/A' : `${value > 0 ? '+' : ''}${number(value)}%`;
const strategyMeta = value => STRATEGIES.find(item => item.key === value) || INSUFFICIENT_STATUS;
const forecastModelName = value => ({ arima: 'ARIMA (Trend Model)', prophet: 'Prophet (Seasonal Model)', random_forest: 'Random Forest (Pattern ML)' }[value] || value);
const reliabilityName = value => ({ very_low: 'Limited sales history', low: 'Moderate history', backtested: 'Tested against past sales' }[value] || 'History unavailable');
const forecastReliability = row => {
    if (!row.forecastAvailable) return 'Not yet projected';
    if (row.forecastMape == null) {
        return row.forecastReliability === 'backtested'
            ? 'Verified on past sales'
            : `${reliabilityName(row.forecastReliability)} (${row.activeMonths} mos)`;
    }
    const accuracy = Math.max(0, Math.min(100, Math.round((100 - Number(row.forecastMape)) * 10) / 10));
    return `${accuracy}% Accuracy (${number(row.forecastMape)}% avg error · ${row.forecastBacktestMonths} test mos)`;
};

export default function PrescriptiveAnalytics({ scope = DEFAULT_SCOPE, active = true, forecastSettings = DEFAULT_FORECAST_SETTINGS, onViewPredictive = () => {}, returnRequest = null }) {
    const { horizon, target, model } = forecastSettings;
    const [category, setCategory] = useState('All Categories');
    const [selectedKey, setSelectedKey] = useState('');
    const [showSummaryLightbox, setShowSummaryLightbox] = useState(false);
    const [showScoreModal, setShowScoreModal] = useState(false);
    const [showMixModal, setShowMixModal] = useState(false);
    const [showExtraMetrics, setShowExtraMetrics] = useState(false);
    const [showEvidenceDetails, setShowEvidenceDetails] = useState(false);
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
        if (!showSummaryLightbox && !showScoreModal && !showMixModal) return undefined;
        function closeOnEscape(event) {
            if (event.key === 'Escape') {
                setShowSummaryLightbox(false);
                setShowScoreModal(false);
                setShowMixModal(false);
            }
        }
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [showSummaryLightbox, showScoreModal, showMixModal]);

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
    const allScopePairs = data?.pairs || [];
    const allEligiblePairs = allScopePairs.filter(row => row.eligible);
    const sortOpportunities = (left, right) => {
        const leftChange = forecastChangeValue(left);
        const rightChange = forecastChangeValue(right);
        if (leftChange == null && rightChange == null) return (right.opportunityScore ?? -1) - (left.opportunityScore ?? -1);
        if (leftChange == null) return 1;
        if (rightChange == null) return -1;
        return rightChange - leftChange || (right.opportunityScore ?? -1) - (left.opportunityScore ?? -1);
    };
    const topEligible = [...allEligiblePairs].sort(sortOpportunities);
    const fallbackPairs = [...allScopePairs].filter(row => !row.eligible).sort((left, right) => (right.opportunityScore ?? -1) - (left.opportunityScore ?? -1));
    const notable = [...topEligible, ...fallbackPairs].slice(0, 5);
    const otherOpportunities = selected && !isOverview
        ? data?.pairs.filter(row => row.eligible && row.category !== category).slice(0, 4) || []
        : [];

    function refresh() {
        forceRefresh.current = true;
        setRevision(value => value + 1);
    }

    function selectPair(row) {
        if (row.category && category !== 'All Categories' && row.category !== category) {
            setCategory('All Categories');
        }
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

    function handleExportCsv() {
        if (!categoryRows.length) return;
        const metricLabel = target === 'revenue' ? 'Revenue (PHP)' : target === 'orders' ? 'Orders' : 'Units';
        const headers = [
            "Province",
            "Region",
            "Category",
            `Current Monthly Demand [${metricLabel}]`,
            `Projected Monthly Demand [${metricLabel}]`,
            `Projected Change per Month [${metricLabel}]`,
            "Historical Yearly Growth (%)",
            "Projected Growth (%)",
            "Active Months Ratio",
            "Opportunity Score (0-100)",
            "Recommended Strategy",
            "Action Guidance"
        ];

        const rows = categoryRows.map(row => {
            const currentDemandVal = row.demand != null ? Number(row.demand).toFixed(1) : "N/A";
            const forecastDemandVal = row.forecastAvailable && row.forecastDemand != null ? Number(row.forecastDemand).toFixed(1) : "N/A";
            const changeVal = row.forecastAvailable && row.forecastDemand != null && row.demand != null ? (Number(row.forecastDemand) - Number(row.demand)).toFixed(1) : "N/A";
            const yoyVal = row.yoyGrowth != null ? `${row.yoyGrowth}%` : "N/A";
            const projGrowthVal = row.forecastAvailable && row.forecastGrowth != null ? `${row.forecastGrowth}%` : "N/A";
            const consistencyVal = `${row.activeMonths} of ${row.calendarMonths} months`;
            const scoreVal = row.opportunityScore != null ? row.opportunityScore : "N/A";
            const strategyVal = strategyMeta(row.strategy).title;
            const guidanceVal = `${recommendationText(row)} ${nextStepText(row)}`;

            return [
                `"${row.province.replace(/"/g, '""')}"`,
                `"${row.region.replace(/"/g, '""')}"`,
                `"${row.category.replace(/"/g, '""')}"`,
                currentDemandVal,
                forecastDemandVal,
                changeVal,
                `"${yoyVal}"`,
                `"${projGrowthVal}"`,
                `"${consistencyVal}"`,
                scoreVal,
                `"${strategyVal}"`,
                `"${guidanceVal.replace(/"/g, '""')}"`
            ];
        });

        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const timestamp = new Date().toISOString().slice(0, 10);
        link.setAttribute("href", url);
        link.setAttribute("download", `saipher_cg_restock_requisition_${category.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function handlePrint() {
        window.print();
    }

    if (current.loading && !data) return <div className="rd-page prescriptive-page"><PageHeader scope={scope} onExportCsv={handleExportCsv} onExportPdf={handlePrint} /><div className="rd-card prescriptive-loading" role="status">Loading scoped evidence and evaluating strategy eligibility…</div></div>;
    if (current.error && !data) return <div className="rd-page prescriptive-page"><PageHeader scope={scope} onExportCsv={handleExportCsv} onExportPdf={handlePrint} /><div className="rd-card prescriptive-error" role="alert"><strong>Prescriptive recommendations are unavailable.</strong><p>{current.error}</p><button type="button" className="prescriptive-button" onClick={refresh}>Retry</button></div></div>;
    if (!data) return null;

    return <div className="rd-page prescriptive-page">
        <PageHeader scope={scope} data={data} onExportCsv={handleExportCsv} onExportPdf={handlePrint} />

        <div className="rd-card prescriptive-toolbar" id="pra-summary">
            <div className="prescriptive-toolbar-category">
                <label htmlFor="prescriptive-category">
                    <span className="prescriptive-toolbar-step">1</span>
                    <span className="prescriptive-toolbar-label">
                        <strong>Product Category</strong>
                        <small>Scope recommendations & evidence</small>
                    </span>
                </label>
                <div className="prescriptive-select-wrap">
                    <select
                        id="prescriptive-category"
                        value={category}
                        onChange={event => {
                            setCategory(event.target.value);
                            setSelectedKey('');
                            setPage(1);
                            setShowAll(false);
                        }}
                    >
                        <option>All Categories</option>
                        {data.categories.map(item => <option key={item}>{item}</option>)}
                    </select>
                    <FaChevronDown aria-hidden="true" />
                </div>
            </div>

            <div className="prescriptive-toolbar-divider" />

            <div className="prescriptive-toolbar-summary">
                <div className="prescriptive-toolbar-summary-head">
                    <span className="prescriptive-toolbar-summary-title">Strategy Classification Summary</span>
                    <button
                        type="button"
                        className="prescriptive-summary-help"
                        aria-label="Open strategy summary notes"
                        title="Open notes"
                        onClick={() => setShowSummaryLightbox(true)}
                    >
                        ?
                    </button>
                </div>
                <div className="prescriptive-summary-strip" aria-label="Strategy summary">
                    {STRATEGIES.slice(0, 4).map(item => (
                        <article className={`prescriptive-summary-card ${item.tone}`} key={item.key} title={`Specific meaning of count ${summary[item.key]}: Exactly ${summary[item.key]} province × category combinations qualify for ${item.title}. ${item.description}`}>
                            <div>
                                <span className="prescriptive-status-dot" />
                                <strong>{item.title}</strong>
                            </div>
                            <b>{summary[item.key]}</b>
                        </article>
                    ))}
                </div>
            </div>
        </div>

        {showSummaryLightbox && <div className="prescriptive-lightbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowSummaryLightbox(false); }}>
            <section className="prescriptive-lightbox" role="dialog" aria-modal="true" aria-label="Decision support classification guide">
                <div className="prescriptive-lightbox-head"><div><span>STRATEGY CLASSIFICATION GUIDE</span><h2>Strategy Guide</h2></div><button type="button" aria-label="Close guide" onClick={() => setShowSummaryLightbox(false)}>×</button></div>
                <p>Counts represent qualified province and category markets in {isOverview ? 'the current scope' : category}. {categoryRows.filter(row => !row.eligible).length > 0 ? `${categoryRows.filter(row => !row.eligible).length} combinations currently have limited transaction records and are being monitored as new sales data arrives.` : ''} Forecast basis: {target === 'revenue' ? 'Revenue' : target === 'orders' ? 'Orders' : 'Net units'} · {horizon} months · {forecastModelName(model)}.</p>
                <div className="prescriptive-lightbox-guide">{[...STRATEGIES, INSUFFICIENT_STATUS].map(item => <article className={`prescriptive-lightbox-guide-item ${item.tone}`} key={item.key}><strong>{item.title}</strong><p>{item.description}</p></article>)}</div>
            </section>
        </div>}

        <div className="prescriptive-top-row" id="pra-priorities">
            {selected ? <section id="prescriptive-selected-strategy" className={`prescriptive-featured ${selected.eligible ? '' : 'insufficient'}`} aria-label={selected.eligible ? 'Recommendation' : 'Insufficient evidence'}>
                <div className="prescriptive-featured-kicker">
                    <span>{selected.eligible ? 'RECOMMENDED STRATEGY' : 'INSUFFICIENT EVIDENCE'}</span>
                    <span>{isOverview ? 'All categories' : `Selected category · ${category}`}</span>
                    {selectedRank && <span className="prescriptive-rank">Priority rank #{selectedRank}</span>}
                </div>
                <div className="prescriptive-featured-main">
                    <div className="prescriptive-featured-place">
                        <span>{selected.category}</span>
                        <h2>{selected.province}</h2>
                        <small>{selected.region}</small>
                        <StrategyBadge strategy={selected.strategy} />
                    </div>
                    <div className={`prescriptive-featured-metrics ${showExtraMetrics ? 'expanded' : ''}`}>
                        <Metric
                            label={target === 'revenue' ? 'Current Monthly Sales' : target === 'orders' ? 'Current Monthly Orders' : 'Current Monthly Demand'}
                            value={metricValue(selected.demand, target)}
                            meaning={`Specific meaning of ${metricValue(selected.demand, target)}: Actual monthly average sales recorded in ${selected.province} for ${selected.category} over past 12 active months.`}
                        />
                        <Metric
                            label={target === 'revenue' ? 'Projected Monthly Sales' : target === 'orders' ? 'Projected Monthly Orders' : 'Projected Monthly Demand'}
                            value={selected.forecastAvailable ? metricValue(selected.forecastDemand, target) : 'Unavailable'}
                            meaning={`Specific meaning of ${selected.forecastAvailable ? metricValue(selected.forecastDemand, target) : 'Unavailable'}: Projected average monthly demand for ${selected.category} in ${selected.province} over the next ${data.horizon} months.`}
                        />
                        <Metric
                            label="Projected Monthly Change"
                            value={selected.forecastAvailable ? metricChange(selected.demand, selected.forecastDemand, target) : 'Unavailable'}
                            tone={selected.forecastAvailable && selected.forecastDemand != null && selected.demand != null ? growthTone(selected.forecastDemand - selected.demand) : ''}
                            meaning={`Specific meaning of ${selected.forecastAvailable ? metricChange(selected.demand, selected.forecastDemand, target) : 'Unavailable'}: Projected net change in monthly demand compared to current baseline sales.`}
                        />
                        {showExtraMetrics && (
                            <>
                                <Metric
                                    label="Total Completed Orders"
                                    value={number(selected.orders)}
                                    meaning={`Specific meaning of ${number(selected.orders)} orders: Total count of verified historical customer transactions recorded in this province for this category.`}
                                />
                                <Metric
                                    label="Past Year Growth"
                                    value={percent(selected.yoyGrowth)}
                                    tone={growthTone(selected.yoyGrowth)}
                                    meaning={`Specific meaning of ${percent(selected.yoyGrowth)}: Past year-over-year sales growth rate based on recorded annual transactions.`}
                                />
                                <Metric
                                    label="Projected Growth"
                                    value={selected.forecastAvailable ? percent(selected.forecastGrowth) : 'Unavailable'}
                                    tone={growthTone(selected.forecastGrowth)}
                                    meaning={`Specific meaning of ${selected.forecastAvailable ? percent(selected.forecastGrowth) : 'Unavailable'}: Projected forward-looking growth trajectory over the upcoming forecast horizon.`}
                                />
                                <div className="prescriptive-metric-wide">
                                    <Metric
                                        label="Forecast Accuracy"
                                        value={forecastReliability(selected)}
                                        meaning={`Specific reliability of ${forecastReliability(selected)}: Evaluated across ${selected.calendarMonths} months of sales history and continuity checks.`}
                                    />
                                </div>
                            </>
                        )}
                        <button
                            type="button"
                            className="prescriptive-metrics-toggle-btn"
                            onClick={() => setShowExtraMetrics(value => !value)}
                            aria-expanded={showExtraMetrics}
                        >
                            <span>{showExtraMetrics ? 'Hide detailed metrics' : 'Show detailed metrics (orders, growth, accuracy)'}</span>
                            {showExtraMetrics ? <FaChevronUp aria-hidden="true" /> : <FaChevronDown aria-hidden="true" />}
                        </button>
                    </div>
                </div>
                <div className="prescriptive-recommendation">
                    <FaLightbulb aria-hidden="true" />
                    <div>
                        <span>RECOMMENDED ACTION · STRATEGIC RATIONALE</span>
                        <strong>{recommendationText(selected)}</strong>
                        <p>{evidenceSentence(selected, target)}</p>
                        <p className="prescriptive-next-step">{nextStepText(selected)}</p>
                        <button type="button" className="prescriptive-link-button" onClick={() => onViewPredictive({ category: selected.category, provinceKey: JSON.stringify([selected.region, selected.province]), pairKey: selected.key, region: selected.region, province: selected.province })}>View {selected.province} Demand Forecast & Trends →</button>
                    </div>
                </div>
            </section> : <section className="rd-card prescriptive-empty" id="prescriptive-selected-strategy"><h2>No matching province and category data</h2><p>Try a broader analysis scope in Analytics Scope or run Data Preparation.</p></section>}

            <section className="rd-card prescriptive-notable-card" id="prescriptive-notable-opportunities">
                <div className="rd-card-head between">
                    <div>
                        <h2>Top Strategic Opportunities</h2>
                        <p>Ranked by projected growth and priority score across all categories.</p>
                    </div>
                    <span className="rd-tag">{allEligiblePairs.length ? `Top 5 of ${allEligiblePairs.length} eligible` : 'Top 5 Opportunities'}</span>
                </div>
                {notable.length ? <div className="prescriptive-notable-list">{notable.map((row, index) => <button type="button" key={row.key} className={`prescriptive-notable ${selected?.key === row.key ? 'selected' : ''}`} onClick={() => selectPair(row)}>
                    <span className="prescriptive-notable-rank">{index + 1}</span>
                    <span className="prescriptive-notable-copy">
                        <strong>{row.province} <i>×</i> {row.category}</strong>
                        <small>{row.region} · Current {metricValue(row.demand, target)} / mo · Growth {percent(row.forecastAvailable ? row.forecastGrowth : row.yoyGrowth)}</small>
                        <small>{row.forecastAvailable ? `Projected change ${metricChange(row.demand, row.forecastDemand, target)} / mo` : 'Historical sales pattern evaluated'}</small>
                    </span>
                    <StrategyBadge strategy={row.strategy} />
                    <span className="prescriptive-arrow" aria-hidden="true">→</span>
                </button>)}</div> : <Empty message="No strategic combinations available in this scope." />}
                <button type="button" className="prescriptive-button secondary prescriptive-notable-view-all" onClick={showAllRecommendations}>View all recommendations in table <span aria-hidden="true">↓</span></button>
            </section>
        </div>

        {selected && <section className="prescriptive-evidence-section" id="why-this-province">
            <div className="rd-card prescriptive-evidence-card">
                <div className="prescriptive-decision-banner">
                    <div className="prescriptive-decision-badge">
                        <FaLightbulb aria-hidden="true" />
                        <span>Executive Rationale</span>
                    </div>
                    <div className="prescriptive-decision-summary">
                        <strong>
                            {selected.eligible
                                ? `Strategic Action: ${strategyMeta(selected.strategy).title} for ${selected.province} × ${selected.category} (Score: ${selected.opportunityScore == null ? 'N/A' : number(selected.opportunityScore)}/100).`
                                : `Preliminary Status: Insufficient sales history for ${selected.province} × ${selected.category}.`}
                        </strong>
                        <p>{recommendationText(selected)} {nextStepText(selected)}</p>
                    </div>
                </div>

                <div className="rd-card-head between">
                    <div>
                        <span className="prescriptive-section-kicker">STRATEGIC RATIONALE</span>
                        <h2>Why focus on {selected.province}? <span>({selected.category})</span></h2>
                        <p>The 4 key evaluation factors and operational data checks supporting this location's priority score.</p>
                    </div>
                    <span className={`prescriptive-eligibility ${selected.eligible ? 'eligible' : 'insufficient'}`}>{selected.eligible ? '✓ Qualified for Strategic Action' : '! Insufficient History'}</span>
                </div>
                <div className="prescriptive-eligibility-grid">
                    <EligibilityCheck pass={selected.orders >= data.minimumOrders} label={`Sufficient order volume (${number(selected.orders)} / ${data.minimumOrders} orders)`} />
                    <EligibilityCheck pass={selected.activeMonths >= data.minimumActiveMonths} label={`Sales continuity verified (${selected.activeMonths} / ${data.minimumActiveMonths} active months)`} />
                    <EligibilityCheck pass={selected.calendarMonths > 0} label={selected.calendarMonths ? `Historical tracking duration (${selected.calendarMonths} months)` : 'Historical data available'} />
                    <EligibilityCheck pass={selected.growthEvidenceAvailable} label={selected.growthEvidenceAvailable ? 'Positive growth signals confirmed (Yearly or Projected)' : 'Growth signals under evaluation'} />
                    <EligibilityCheck pass={selected.forecastAvailable} label={selected.forecastAvailable ? `Demand projection ready (${data.horizon}-month projection · ${reliabilityName(selected.forecastReliability)})` : `Demand projection unavailable: ${selected.forecastReason}`} neutral={!selected.forecastAvailable} />
                </div>
                {!selected.eligible && <div className="prescriptive-insufficient-message">Not enough transaction history is available to produce a standard strategy recommendation. {selected.insufficientReasons?.join(' ')} This combination will be evaluated as additional sales records are uploaded.</div>}
                <div className="prescriptive-evidence-layout">
                    <div className="prescriptive-factor-list">
                        <Factor label="Sales Volume" score={selected.factors.demandStrength} description={`Current baseline volume: ${metricValue(selected.demand, target)} / mo.`} tone="blue" />
                        <Factor label="Growth Momentum" score={selected.factors.growthMomentum} description={growthDescription(selected)} tone="green" />
                        <Factor label="Sales Consistency" score={selected.factors.demandConsistency} description={`Consistent orders recorded in ${selected.activeMonths} of ${selected.calendarMonths} months (${Math.round((selected.activeMonths / Math.max(1, selected.calendarMonths)) * 100)}% coverage).`} tone="purple" />
                        <Factor
                            label="Local Product Preference"
                            score={selected.factors.categoryAffinity}
                            description={selected.affinityRatio == null ? 'Local share comparison is unavailable.' : `${number(selected.affinityRatio)}× higher than company-wide average.`}
                            tone="amber"
                            action={<button type="button" className="prescriptive-inline-modal-link" onClick={() => setShowMixModal(true)}>Compare Sales Mix ⓘ</button>}
                        />
                    </div>
                    <div className="prescriptive-score-card">
                        <span>Priority Score</span>
                        <strong>{selected.opportunityScore == null ? '—' : number(selected.opportunityScore)}</strong>
                        <small>out of 100</small>
                        <button type="button" className="prescriptive-score-help-btn" onClick={() => setShowScoreModal(true)}>
                            How is score calculated? ⓘ
                        </button>
                        <StrategyBadge strategy={selected.strategy} />
                    </div>
                </div>
                <div className="prescriptive-evidence-collapsible">
                    <button
                        type="button"
                        className="prescriptive-evidence-details-toggle"
                        onClick={() => setShowEvidenceDetails(value => !value)}
                        aria-expanded={showEvidenceDetails}
                    >
                        <span>{showEvidenceDetails ? 'Hide Detailed Evaluation Metrics & Accuracy' : 'View Detailed Evaluation Metrics & Accuracy (6 indicators)'}</span>
                        {showEvidenceDetails ? <FaChevronUp aria-hidden="true" /> : <FaChevronDown aria-hidden="true" />}
                    </button>
                    {showEvidenceDetails && (
                        <div className="prescriptive-evidence-details-content">
                            <div className="prescriptive-evidence-details">
                                <Metric label="Share of Local Sales" value={selected.categoryShare == null ? 'N/A' : `${number(selected.categoryShare)}%`} />
                                <Metric label="Company-wide Share" value={selected.overallCategoryShare == null ? 'N/A' : `${number(selected.overallCategoryShare)}%`} />
                                <Metric label="Local Preference Index" value={selected.affinityRatio == null ? 'N/A' : `${number(selected.affinityRatio)}×`} />
                                <Metric label="Projected Trend" value={selected.forecastAvailable ? selected.forecastTrend : 'Unavailable'} />
                                <Metric label="Forecast Accuracy" value={selected.forecastMape == null ? 'Unavailable' : `${Math.max(0, Math.min(100, Math.round((100 - Number(selected.forecastMape)) * 10) / 10))}% accuracy (${number(selected.forecastMape)}% avg error · ${selected.forecastBacktestMonths} test mos)`} />
                                <Metric label="Active Order Months" value={`${selected.activeMonths} of ${selected.calendarMonths} months`} />
                            </div>
                            <p className="prescriptive-backtest-note">Forecast accuracy is verified through historical backtesting against recent sales records. Higher accuracy provides greater confidence in demand projections.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>}

        <section className="rd-card prescriptive-recommendations-card" id="prescriptive-recommendations">
            <div className="rd-card-head between">
                <div>
                    <h2>{isOverview ? (showAll ? 'All Province & Category Recommendations' : 'Prioritized Recommendations') : 'Province Recommendations'}</h2>
                    <p>{isOverview ? 'Strategic classifications for qualified province and category markets.' : `Strategic classifications for ${category} across the selected scope.`}</p>
                </div>
                <div className="prescriptive-recommendations-header-actions">
                    <button type="button" className="prescriptive-table-download-btn" onClick={handleExportCsv} title="Download recommended action plan as an Excel CSV">
                        <FaDownload aria-hidden="true" /> Download Action Plan (CSV)
                    </button>
                    <span className="rd-tag">{categoryRows.length} combinations</span>
                    {isOverview && showAll && <button type="button" className="prescriptive-button secondary" onClick={collapseRecommendations}>Collapse recommendations <span aria-hidden="true">↑</span></button>}
                </div>
            </div>
            {categoryRows.length ? <>
                <div className="rd-table-wrap prescriptive-table-scroll"><table className="rd-table prescriptive-table"><thead><tr><th>Province</th>{isOverview && <th>Category</th>}<th>Region</th><th>{target === 'revenue' ? 'Current Sales' : target === 'orders' ? 'Current Orders' : 'Current Demand'}</th><th>{target === 'revenue' ? 'Forecast Demand' : target === 'orders' ? 'Forecast Orders' : 'Forecast Demand'}</th><th>Projected Change</th><th>Past Year Growth</th><th>Projected Growth</th><th>Forecast Accuracy</th><th>Priority Score</th><th>Strategic Action</th><th>Action</th></tr></thead><tbody>
                    {pageRows.map(row => <tr key={row.key} className={selected?.key === row.key ? 'selected-row' : ''} onClick={() => selectPair(row)}>
                        <td><strong>{row.province}</strong>{!row.eligible && <small>{row.orders} orders · {row.activeMonths} active months</small>}</td>{isOverview && <td>{row.category}</td>}<td>{row.region}</td><td>{metricValue(row.demand, target)}</td><td>{row.forecastAvailable ? metricValue(row.forecastDemand, target) : 'Unavailable'}</td><td className={row.forecastAvailable ? growthTone(row.forecastDemand - row.demand) : ''}>{row.forecastAvailable ? metricChange(row.demand, row.forecastDemand, target) : 'Unavailable'}</td><td className={growthTone(row.yoyGrowth)}>{percent(row.yoyGrowth)}</td><td className={growthTone(row.forecastGrowth)}>{row.forecastAvailable ? percent(row.forecastGrowth) : 'Unavailable'}</td><td>{forecastReliability(row)}{!row.forecastAvailable && <small className="prescriptive-unavailable-reason">{row.forecastReason}</small>}</td><td>{row.opportunityScore == null ? '—' : number(row.opportunityScore)}</td><td><StrategyBadge strategy={row.strategy} /></td><td><button type="button" className="prescriptive-link-button" onClick={event => { event.stopPropagation(); selectPair(row); document.getElementById('why-this-province')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>View details</button></td>
                    </tr>)}
                </tbody></table></div>
                {(showAll || !isOverview) && <Pagination page={page} pageCount={pageCount} total={categoryRows.length} setPage={setPage} />}
            </> : <Empty message="No province and category combinations match this analysis scope." />}
        </section>

        {!isOverview && <section className="rd-card prescriptive-other-card">
            <div className="rd-card-head"><div><h2>Other strategic opportunities</h2><p>Opportunities outside {category}. Select one to evaluate its province and category evidence.</p></div></div>
            {otherOpportunities.length ? <div className="prescriptive-other-grid">{otherOpportunities.map(row => <button type="button" className="prescriptive-other-opportunity" key={row.key} onClick={() => { setCategory(row.category); setSelectedKey(row.key); setPage(1); setShowAll(false); }}><strong>{row.province} × {row.category}</strong><small>{row.region}</small><StrategyBadge strategy={row.strategy} /><span>{otherReason(row)} <b aria-hidden="true">→</b></span></button>)}</div> : <Empty message={`No eligible opportunities outside ${category} in this scope.`} />}
        </section>}

        {showScoreModal && (
            <div className="prescriptive-lightbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowScoreModal(false); }}>
                <section className="prescriptive-lightbox" role="dialog" aria-modal="true" aria-label="Opportunity Score Calculation Guide">
                    <div className="prescriptive-lightbox-head">
                        <div>
                            <span>METHODOLOGY & SCORING PILLARS</span>
                            <h2>How is the Opportunity Score calculated?</h2>
                        </div>
                        <button type="button" aria-label="Close guide" onClick={() => setShowScoreModal(false)}>×</button>
                    </div>
                    <p>
                        The Opportunity Score (0–100) measures strategic business potential across 4 key evaluation factors to help prioritize resources and capital:
                    </p>
                    <div className="prescriptive-lightbox-guide">
                        <article className="prescriptive-lightbox-guide-item maintain">
                            <strong>1. Sales Volume (35% weight)</strong>
                            <p>Evaluates current baseline sales demand in {selected.province} relative to other provinces. High baseline demand provides strong foundational volume.</p>
                        </article>
                        <article className="prescriptive-lightbox-guide-item promote">
                            <strong>2. Growth Momentum (30% weight)</strong>
                            <p>Combines recent historical year-over-year sales growth with projected forward-looking demand expansion to reward accelerating markets.</p>
                        </article>
                        <article className="prescriptive-lightbox-guide-item test">
                            <strong>3. Monthly Sales Consistency (20% weight)</strong>
                            <p>Measures continuity of purchasing activity ({selected.activeMonths} active months out of {selected.calendarMonths} tracked months). Higher consistency reflects stable year-round customer demand.</p>
                        </article>
                        <article className="prescriptive-lightbox-guide-item monitor">
                            <strong>4. Local Product Preference (15% weight)</strong>
                            <p>Measures local market affinity ({selected.affinityRatio == null ? 'N/A' : number(selected.affinityRatio)}× overall business average). Highlights areas where this product category outperforms national proportions.</p>
                        </article>
                    </div>
                    <div className="prescriptive-score-modal-footer">
                        <strong>Action Classification Logic:</strong>
                        <p>
                            • <b>Expand Selectively:</b> High volume + positive forward growth momentum.<br />
                            • <b>Sustain Core Demand:</b> Strong established volume with steady demand.<br />
                            • <b>Pilot and Validate:</b> Moderate sales volume with accelerating growth signals.<br />
                            • <b>Monitor / Lower Priority:</b> Lower demand or subdued growth trends.
                        </p>
                    </div>
                </section>
            </div>
        )}

        {showMixModal && (
            <div className="prescriptive-lightbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowMixModal(false); }}>
                <section className="prescriptive-lightbox" role="dialog" aria-modal="true" aria-label="Category Sales Mix Comparison">
                    <div className="prescriptive-lightbox-head">
                        <div>
                            <span>LOCAL VS. OVERALL SALES MIX</span>
                            <h2>Category Sales Mix Comparison</h2>
                        </div>
                        <button type="button" aria-label="Close guide" onClick={() => setShowMixModal(false)}>×</button>
                    </div>
                    <p>
                        Comparing <b>{selected.category}</b>'s proportion of total sales in <b>{selected.province}</b> against the company-wide category average.
                    </p>
                    <div className="prescriptive-lightbox-mix-metrics">
                        <div className="prescriptive-metric">
                            <span>Category share in {selected.province}</span>
                            <strong>{selected.categoryShare == null ? 'N/A' : `${number(selected.categoryShare)}%`}</strong>
                        </div>
                        <div className="prescriptive-metric">
                            <span>Overall business share</span>
                            <strong>{selected.overallCategoryShare == null ? 'N/A' : `${number(selected.overallCategoryShare)}%`}</strong>
                        </div>
                        <div className="prescriptive-metric">
                            <span>Local vs. overall ratio</span>
                            <strong>{selected.affinityRatio == null ? 'N/A' : `${number(selected.affinityRatio)}×`}</strong>
                        </div>
                    </div>
                    <p className="prescriptive-footnote">
                        <FaInfoCircle aria-hidden="true" /> Internal estimate derived from observed sales transaction patterns comparing local category mix against overall business sales. It represents customer product preference in this province, not total external market capacity.
                    </p>
                </section>
            </div>
        )}

        <button type="button" className="prescriptive-refresh" onClick={refresh} disabled={current.loading}><FaSyncAlt aria-hidden="true" /> {current.loading ? 'Refreshing…' : 'Refresh scoped evidence'}</button>
    </div>;
}

function PageHeader({ scope, data, onExportCsv, onExportPdf }) {
    return <header className="rd-header prescriptive-header">
        <div>
            <span className="rd-eyebrow">PRESCRIPTIVE ANALYTICS</span>
            <h1>Prescriptive Analytics</h1>
            <p>What should we focus on, where, and why?</p>
        </div>
        <div className="prescriptive-header-actions-group">
            <div className="prescriptive-header-facts">
                <div><span>Analysis period</span><strong>{data?.effectiveRange?.start && data?.effectiveRange?.end ? `${monthLabel(data.effectiveRange.start)} – ${monthLabel(data.effectiveRange.end)}` : scope.period || 'All available data'}</strong></div>
                <div><span>Scope</span><strong>{scope.region || 'All Regions'} · {scope.province || 'All Provinces'}</strong></div>
                <div><span>Returns</span><strong>{scope.returns || 'Include All'}</strong></div>
            </div>
            <div className="prescriptive-export-toolbar">
                <button type="button" className="prescriptive-action-export-btn primary" onClick={onExportCsv} title="Download recommended action plan as an Excel CSV">
                    <FaDownload aria-hidden="true" />
                    <span>Download Action Plan (CSV)</span>
                </button>
                <button type="button" className="prescriptive-action-export-btn" onClick={onExportPdf} title="Print or save an executive summary PDF report">
                    <FaPrint aria-hidden="true" />
                    <span>Print Executive Brief</span>
                </button>
            </div>
        </div>
    </header>;
}

function Metric({ label, value, tone = '', meaning }) {
    return <div className={`prescriptive-metric ${tone}`} title={meaning || `${label}: ${value}`}><span>{label}</span><strong>{value}</strong></div>;
}

function StrategyBadge({ strategy }) {
    const meta = strategyMeta(strategy);
    return (
        <span className="prescriptive-badge-container">
            <span className={`prescriptive-strategy-badge ${meta.tone}`}>
                <span className="prescriptive-badge-dot" />
                {meta.title}
            </span>
            <span className="prescriptive-badge-hover-card" role="tooltip">
                <span className="prescriptive-hover-card-head">
                    <span className={`prescriptive-hover-indicator ${meta.tone}`} />
                    <strong>{meta.title}</strong>
                </span>
                <span className="prescriptive-hover-card-meaning">
                    <b>Meaning:</b> {meta.description}
                </span>
                <span className="prescriptive-hover-card-action">
                    <b>Action:</b> {meta.action}
                </span>
            </span>
        </span>
    );
}

function EligibilityCheck({ pass, label, neutral = false }) {
    return <span className={`${pass ? 'pass' : neutral ? 'neutral' : 'fail'}`}><b aria-hidden="true">{pass ? '✓' : neutral ? 'i' : '!'}</b>{label}</span>;
}

function Factor({ label, score, description, tone, action }) {
    return <div className={`prescriptive-factor ${tone}`}>
        <div className="prescriptive-factor-head">
            <strong>{label}</strong>
            <div className="prescriptive-factor-head-right">
                {action}
                <b>{score == null ? 'N/A' : `${number(score)} / 100`}</b>
            </div>
        </div>
        <div className="prescriptive-progress"><span style={{ width: `${Math.max(0, Math.min(100, Number(score) || 0))}%` }} /></div>
        <small>{description}</small>
    </div>;
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
    if (!row) return '';
    const focus = {
        'EXPAND SELECTIVELY': `Prioritize commercial growth and inventory allocation for ${row.category} in ${row.province}.`,
        'SUSTAIN CORE DEMAND': `Protect baseline fulfillment and stock stability for ${row.category} in ${row.province}.`,
        'PILOT AND VALIDATE': `Launch targeted promotional trials and validate customer adoption for ${row.category} in ${row.province}.`,
        'MONITOR / LOWER PRIORITY': `Maintain standard operational availability for ${row.category} in ${row.province} while monitoring order trends.`
    };
    return row.eligible ? focus[row.strategy] || focus['MONITOR / LOWER PRIORITY'] : `Collect additional sales activity for ${row.category} in ${row.province} before committing strategic resources.`;
}

function nextStepText(row) {
    if (!row) return '';
    const nextSteps = {
        'EXPAND SELECTIVELY': 'Align inventory buffers, field sales support, and targeted marketing campaigns to capture projected demand surge.',
        'SUSTAIN CORE DEMAND': 'Ensure steady supplier reorder cycles and protect on-time fulfillment to safeguard core recurring revenue.',
        'PILOT AND VALIDATE': 'Deploy low-risk promotional tests over 30 to 60 days, measuring local customer conversion and repeat purchase velocity.',
        'MONITOR / LOWER PRIORITY': 'Keep inventory lean and re-evaluate should quarterly order frequency or customer inquiries accelerate.'
    };
    return row.eligible ? nextSteps[row.strategy] || nextSteps['MONITOR / LOWER PRIORITY'] : 'Monitor incoming transactions and upload subsequent monthly sales records to establish an actionable baseline.';
}

function evidenceSentence(row, target = 'revenue') {
    if (!row) return '';
    if (!row.eligible) {
        return row.insufficientReasons?.length
            ? `${row.province} currently has limited records: ${row.insufficientReasons.join(' ')}. Additional monthly transactions are required to confirm strategic viability.`
            : `${row.province} currently has limited transaction history (${row.orders || 0} orders recorded). Additional monthly sales data is needed before assigning a confident recommendation.`;
    }

    // 1. Demand volume narrative
    const demandScore = row.factors?.demandStrength ?? 0;
    let volumeText = '';
    if (demandScore >= 67) {
        volumeText = `${row.province} demonstrates strong market presence with substantial baseline demand (${metricValue(row.demand, target)}/mo)`;
    } else if (demandScore >= 34) {
        volumeText = `${row.province} maintains steady baseline demand (${metricValue(row.demand, target)}/mo)`;
    } else {
        volumeText = `${row.province} represents an emerging market segment (${metricValue(row.demand, target)}/mo)`;
    }

    // 2. Growth signals narrative
    let growthText = '';
    const hasYoy = row.yoyGrowth != null && Number.isFinite(Number(row.yoyGrowth));
    const hasForecast = row.forecastAvailable && row.forecastGrowth != null && Number.isFinite(Number(row.forecastGrowth));

    if (hasYoy && hasForecast) {
        if (row.yoyGrowth > 0 && row.forecastGrowth > 0) {
            growthText = `, backed by sustained positive momentum (+${number(row.yoyGrowth)}% past year, +${number(row.forecastGrowth)}% projected forward).`;
        } else if (row.yoyGrowth > 0 && row.forecastGrowth <= 0) {
            growthText = `, showing strong historical gains (+${number(row.yoyGrowth)}% past year) though forward projections indicate stabilization (${percent(row.forecastGrowth)}).`;
        } else if (row.yoyGrowth <= 0 && row.forecastGrowth > 0) {
            growthText = `, rebounding with positive forward projections (+${number(row.forecastGrowth)}%) following past stabilization (${percent(row.yoyGrowth)}).`;
        } else {
            growthText = `, with consolidating momentum (${percent(row.yoyGrowth)} past year, ${percent(row.forecastGrowth)} projected).`;
        }
    } else if (hasYoy) {
        growthText = `, reflecting ${percent(row.yoyGrowth)} growth over the past year.`;
    } else if (hasForecast) {
        growthText = `, with an expected ${percent(row.forecastGrowth)} demand trajectory.`;
    } else {
        growthText = '.';
    }

    // 3. Consistency narrative
    let consistencyText = '';
    if (row.calendarMonths > 0) {
        if (row.activeMonths >= row.calendarMonths) {
            consistencyText = ` Purchasing activity has been continuous throughout all ${row.activeMonths} tracked months.`;
        } else if (row.activeMonths / Math.max(1, row.calendarMonths) >= 0.7) {
            consistencyText = ` Purchasing activity remains highly consistent across ${row.activeMonths} of ${row.calendarMonths} recorded months.`;
        } else {
            consistencyText = ` Sales were recorded across ${row.activeMonths} of ${row.calendarMonths} active months.`;
        }
    }

    // 4. Local preference / affinity narrative
    let affinityText = '';
    if (row.affinityRatio != null && Number.isFinite(Number(row.affinityRatio)) && row.affinityRatio >= 1.2) {
        affinityText = ` In addition, local customer preference for this category exceeds the company benchmark by ${number(row.affinityRatio)}×.`;
    }

    return `${volumeText}${growthText}${consistencyText}${affinityText}`;
}

function growthDescription(row) {
    if (!row.growthEvidenceAvailable) {
        return 'Limited continuous sales history to calculate growth momentum.';
    }
    const parts = [];
    if (row.yoyGrowth != null && Number.isFinite(Number(row.yoyGrowth))) parts.push(`${percent(row.yoyGrowth)} past year`);
    if (row.forecastAvailable && row.forecastGrowth != null && Number.isFinite(Number(row.forecastGrowth))) parts.push(`${percent(row.forecastGrowth)} projected`);
    return parts.length ? parts.join(' · ') : 'Growth trend under evaluation.';
}

function otherReason(row) {
    if (row.strategy === 'EXPAND SELECTIVELY') return 'High sales volume with positive forward growth.';
    if (row.strategy === 'SUSTAIN CORE DEMAND') return 'Steady sales volume and consistent recurring orders.';
    if (row.strategy === 'PILOT AND VALIDATE') return 'Accelerating demand signals with room to grow.';
    return 'Monitor order velocity before expanding.';
}
