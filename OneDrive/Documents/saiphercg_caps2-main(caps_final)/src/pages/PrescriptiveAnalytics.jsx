import { useEffect, useRef, useState } from 'react';
import { FaChevronDown, FaChevronUp, FaDownload, FaFilter, FaInfoCircle } from 'react-icons/fa';
import { fetchPrescriptive, getCachedPrescriptive } from '../data/analyticsApi';
import { DEFAULT_FORECAST_SETTINGS } from '../data/forecastSettings';
import { DEFAULT_SCOPE, monthLabel } from '../hooks/useAnalytics';
import '../styles/analytics-redesign.css';
import '../styles/prescriptive.css';

const PAGE_SIZE = 30;
const EMPTY_SELECTION = Object.freeze({ category: 'All Categories', pairKey: '' });
const REVIEW_METRICS = [
    { value: 'forecastChange', label: 'Forecast change' },
    { value: 'yearOverYear', label: 'Same months last year' },
    { value: 'salesScore', label: 'Sales Score' }
];
const STRATEGIES = [
    { key: 'EXPAND SELECTIVELY', title: 'Growth', description: 'Recent sales are higher than in many other areas and have been increasing.', action: 'Check these sales figures and the estimate against what is happening locally before making a business decision.', tone: 'promote' },
    { key: 'SUSTAIN CORE DEMAND', title: 'Stable', description: 'Recent sales are higher than in many other areas and have stayed about the same.', action: 'Compare each new month of sales with the recent average to see whether this pattern continues.', tone: 'maintain' },
    { key: 'PILOT AND VALIDATE', title: 'Emerging', description: 'Sales may be increasing, but recent sales are closer to the middle compared with other areas.', action: 'Check upcoming actual sales against the estimate before relying on the increase.', tone: 'test' },
    { key: 'MONITOR / LOWER PRIORITY', title: 'Monitor', description: 'Recent sales are lower than in many other areas, or have changed very little.', action: 'Review again when more monthly sales records are available.', tone: 'monitor' }
];
const INSUFFICIENT_STATUS = { key: 'INSUFFICIENT EVIDENCE', title: 'Insufficient', description: 'There are not enough monthly sales records to tell whether sales are increasing or staying about the same.', action: 'Review again when more complete monthly sales records are available.', tone: 'insufficient' };

export const number = value => value == null || !Number.isFinite(Number(value)) ? 'N/A' : new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 }).format(value);
export const metricValue = (value, target) => value == null || !Number.isFinite(Number(value)) ? 'N/A' : target === 'revenue'
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: Math.abs(Number(value)) >= 1_000_000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(Number(value)) >= 1_000_000 ? 2 : 0 }).format(value)
    : number(value);
const metricChange = (current, forecast, target) => current == null || forecast == null ? 'Unavailable' : metricValue(Number(forecast) - Number(current), target);
const forecastChangeValue = row => row.forecastAvailable && row.forecastDemand != null && row.demand != null && Number.isFinite(Number(row.forecastDemand)) && Number.isFinite(Number(row.demand))
    ? Number(row.forecastDemand) - Number(row.demand)
    : null;
const percent = value => value == null || !Number.isFinite(Number(value)) ? 'N/A' : `${value > 0 ? '+' : ''}${number(value)}%`;
const signedMetricValue = (value, target) => value == null || !Number.isFinite(Number(value))
    ? 'N/A'
    : `${Number(value) > 0 ? '+' : ''}${metricValue(Number(value), target)}`;
const FORECAST_ACCURACY_GUIDE = 'Average forecast error across past test months with nonzero actual sales; this is not a percent-correct score, and lower is better. Rough guide: below 10% very close; 10% to under 20% good; 20% to under 50% reasonable; 50% or more high error. These are general guidelines, not universal cutoffs.';
const reviewMetricLabel = key => REVIEW_METRICS.find(metric => metric.value === key)?.label || REVIEW_METRICS[0].label;
const reviewMetricValue = (row, key) => {
    const value = key === 'forecastChange' ? forecastChangeValue(row)
        : key === 'yearOverYear' ? row.yoyGrowth : row.opportunityScore;
    return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
};
const sortByReviewMetric = (rows, key) => [...rows].sort((left, right) => {
    const leftValue = reviewMetricValue(left, key);
    const rightValue = reviewMetricValue(right, key);
    if (leftValue == null && rightValue != null) return 1;
    if (rightValue == null && leftValue != null) return -1;
    return (rightValue ?? -1) - (leftValue ?? -1) || (right.opportunityScore ?? -1) - (left.opportunityScore ?? -1);
});
const reviewMetricDisplay = (row, key, target) => {
    if (key === 'forecastChange') return row.forecastAvailable ? `${signedMetricValue(Number(row.forecastDemand) - Number(row.demand), target)} (${percent(row.forecastGrowth)})` : 'Unavailable';
    if (key === 'yearOverYear') return row.yoyGrowth == null ? 'Unavailable' : `${percent(row.yoyGrowth)} · ${signedMetricValue(row.yoyChange, target)} (${row.yoyMonthsCompared} months)`;
    return row.opportunityScore == null ? 'Unavailable' : `${number(row.opportunityScore)} / 100`;
};
export const strategyMeta = value => STRATEGIES.find(item => item.key === value) || INSUFFICIENT_STATUS;
const forecastReliability = row => {
    if (!row.forecastAvailable) return 'No forecast is available for this selection.';
    if (row.forecastMape == null) return row.forecastReliability === 'backtested' || row.forecastReliability === 'backtested_weak'
        ? 'Past forecasts were checked, but there is not enough information to calculate the average error.'
        : 'There is not enough past sales data to check forecast accuracy.';
    const comparison = row.forecastBeatsBenchmark === false
        ? 'Using last month’s sales as the next month’s estimate was as accurate or more accurate.'
        : row.forecastBeatsBenchmark === true
            ? 'The forecast was more accurate than using last month’s sales as the estimate.'
            : 'There is not enough information to compare with last month’s sales.';
    return `Past forecasts differed from actual sales by an average of ${number(row.forecastMape)}%. ${comparison}`;
};

export default function PrescriptiveAnalytics({ scope = DEFAULT_SCOPE, active = true, forecastSettings = DEFAULT_FORECAST_SETTINGS, selectedSelection = EMPTY_SELECTION, onSelectionChange = () => {}, onViewPredictive = () => {}, returnRequest = null }) {
    const { horizon, target, model } = forecastSettings;
    const [category, setCategory] = useState(selectedSelection.category || 'All Categories');
    const [selectedKey, setSelectedKey] = useState(selectedSelection.pairKey || '');
    const [showSummaryLightbox, setShowSummaryLightbox] = useState(false);
    const [showScoreModal, setShowScoreModal] = useState(false);
    const [showMixModal, setShowMixModal] = useState(false);
    const [showExtraMetrics, setShowExtraMetrics] = useState(false);
    const [showEligibilityChecks, setShowEligibilityChecks] = useState(false);
    const [showEvidenceDetails, setShowEvidenceDetails] = useState(false);
    const [reviewMetric, setReviewMetric] = useState('forecastChange');
    const [page, setPage] = useState(1);
    const [showAll, setShowAll] = useState(false);
    const [revision, setRevision] = useState(0);
    const forceRefresh = useRef(false);
    const scoreModalTriggerRef = useRef(null);
    const scoreModalCloseRef = useRef(null);
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
        setCategory(selectedSelection.category || 'All Categories');
        setSelectedKey(selectedSelection.pairKey || '');
    }, [selectedSelection.category, selectedSelection.pairKey]);

    useEffect(() => {
        if (!returnRequest) return;
        setCategory(returnRequest.category);
        setSelectedKey(returnRequest.pairKey);
        onSelectionChange({ category: returnRequest.category, pairKey: returnRequest.pairKey });
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

    useEffect(() => {
        if (showScoreModal) scoreModalCloseRef.current?.focus();
        else scoreModalTriggerRef.current?.focus();
    }, [showScoreModal]);

    const openScoreGuide = event => {
        scoreModalTriggerRef.current = event.currentTarget;
        setShowScoreModal(true);
    };

    const current = state.key === requestKey ? state : (() => {
        const data = getCachedPrescriptive({ scope, horizon, target, model });
        return data ? { data, loading: false } : { loading: true };
    })();
    const data = current.data;
    const isOverview = category === 'All Categories';
    const categoryRows = sortByReviewMetric(data?.pairs.filter(row => isOverview || row.category === category) || [], reviewMetric);
    const eligibleRows = categoryRows.filter(row => row.eligible);
    const selected = categoryRows.find(row => row.key === selectedKey) || eligibleRows[0] || categoryRows[0];
    const pageCount = Math.max(1, Math.ceil(categoryRows.length / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;
    const pageRows = isOverview && !showAll ? categoryRows.slice(0, 5) : categoryRows.slice(start, start + PAGE_SIZE);
    const summary = Object.fromEntries(STRATEGIES.slice(0, 4).map(item => [item.key, eligibleRows.filter(row => row.strategy === item.key).length]));
    const allScopePairs = data?.pairs || [];
    const allEligiblePairs = allScopePairs.filter(row => row.eligible);
    const topEligible = sortByReviewMetric(allEligiblePairs, reviewMetric);
    const selectedRank = selected?.eligible ? topEligible.findIndex(row => row.key === selected.key) + 1 : null;
    const fallbackPairs = sortByReviewMetric(allScopePairs.filter(row => !row.eligible), reviewMetric);
    const notable = [...topEligible, ...fallbackPairs].slice(0, 5);
    const otherOpportunities = selected && !isOverview
        ? data?.pairs.filter(row => row.eligible && row.category !== category).slice(0, 4) || []
        : [];

    function refresh() {
        forceRefresh.current = true;
        setRevision(value => value + 1);
    }

    function changeReviewMetric(value) {
        setReviewMetric(value);
        setPage(1);
    }

    function selectPair(row) {
        const nextCategory = row.category && category !== 'All Categories' && row.category !== category
            ? 'All Categories'
            : category;
        setCategory(nextCategory);
        setSelectedKey(row.key);
        onSelectionChange({ category: nextCategory, pairKey: row.key });
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
            `Recent Monthly Average [${metricLabel}]`,
            `Estimated Monthly Average [${metricLabel}]`,
            `Expected Monthly Change [${metricLabel}]`,
            `Change Compared with Last Year [${metricLabel}]`,
            "Expected Change vs Recent Average (%)",
            "Months with Sales Records",
            "Sales Comparison Score (0-100)",
            "Sales Pattern",
            "What to Check"
        ];

        const rows = categoryRows.map(row => {
            const currentDemandVal = row.demand != null ? Number(row.demand).toFixed(1) : "N/A";
            const forecastDemandVal = row.forecastAvailable && row.forecastDemand != null ? Number(row.forecastDemand).toFixed(1) : "N/A";
            const changeVal = row.forecastAvailable && row.forecastDemand != null && row.demand != null ? (Number(row.forecastDemand) - Number(row.demand)).toFixed(1) : "N/A";
            const yoyVal = row.yoyChange != null ? Number(row.yoyChange).toFixed(1) : "N/A";
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
        link.setAttribute("download", `saipher_cg_sales_pattern_review_${category.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    if (current.loading && !data) return <div className="rd-page prescriptive-page"><PageHeader scope={scope} /><div className="rd-card prescriptive-loading" role="status">Loading sales details…</div></div>;
    if (current.error && !data) return <div className="rd-page prescriptive-page"><PageHeader scope={scope} /><div className="rd-card prescriptive-error" role="alert"><strong>The sales review is unavailable.</strong><p>{current.error}</p><button type="button" className="prescriptive-button" onClick={refresh}>Retry</button></div></div>;
    if (!data) return null;

    return <div className="rd-page prescriptive-page">
        <PageHeader scope={scope} data={data} />

        <div className="rd-card prescriptive-toolbar" id="pra-summary">
            <div className="prescriptive-toolbar-category">
                <label htmlFor="prescriptive-category">
                    <span className="prescriptive-toolbar-step"><FaFilter aria-hidden="true" /></span>
                    <span className="prescriptive-toolbar-label">
                        <strong>Filter Product Category</strong>
                    </span>
                </label>
                <div className="prescriptive-select-wrap">
                    <select
                        id="prescriptive-category"
                        value={category}
                        onChange={event => {
                            const nextCategory = event.target.value;
                            setCategory(nextCategory);
                            setSelectedKey('');
                            onSelectionChange({ category: nextCategory, pairKey: '' });
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
                    <span className="prescriptive-toolbar-summary-title">Sales Pattern Summary</span>
                    <button
                        type="button"
                        className="prescriptive-summary-help"
                        aria-label="Open notes about sales patterns"
                        title="Open notes"
                        onClick={() => setShowSummaryLightbox(true)}
                    >
                        ?
                    </button>
                </div>
                <div className="prescriptive-summary-strip" aria-label="Sales pattern summary">
                    {STRATEGIES.slice(0, 4).map(item => (
                        <article className={`prescriptive-summary-card ${item.tone}`} key={item.key} title={`${summary[item.key]} province and product groups: ${item.description}`}>
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
            <section className="prescriptive-lightbox" role="dialog" aria-modal="true" aria-label="Sales pattern guide">
                <div className="prescriptive-lightbox-head"><div><span>SALES PATTERN GUIDE</span><h2>What These Results Mean</h2></div><button type="button" aria-label="Close guide" onClick={() => setShowSummaryLightbox(false)}>×</button></div>
                <p>Each label gives a simple summary of recent sales compared with other areas and how sales have changed over time. Counts show how many province and product groups have enough records to summarize. {categoryRows.filter(row => !row.eligible).length > 0 ? `${categoryRows.filter(row => !row.eligible).length} groups need more monthly sales records.` : ''} This review looks at {metricName(target)} over the next {horizon} months.</p>
                <div className="prescriptive-lightbox-guide">{[...STRATEGIES, INSUFFICIENT_STATUS].map(item => <article className={`prescriptive-lightbox-guide-item ${item.tone}`} key={item.key}><strong>{item.title}</strong><p>{item.description}</p></article>)}</div>
            </section>
        </div>}

        <div className="prescriptive-top-row" id="pra-priorities">
            {selected ? <section id="prescriptive-selected-strategy" className={`prescriptive-featured ${selected.eligible ? '' : 'insufficient'}`} aria-label={selected.eligible ? 'Sales pattern review' : 'More records needed'}>
                <div className="prescriptive-featured-kicker">
                            <span>{selected.eligible ? 'SALES PATTERN REVIEW' : 'MORE RECORDS NEEDED'}</span>
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
                            label={target === 'revenue' ? 'Average Monthly Sales' : target === 'orders' ? 'Average Monthly Orders' : 'Average Units Sold per Month'}
                            value={metricValue(selected.demand, target)}
                            meaning={`Average ${metricName(target)} per month in ${selected.province} over the most recent 12 months reviewed.`}
                        />
                        <Metric
                            label={target === 'revenue' ? 'Estimated Monthly Sales' : target === 'orders' ? 'Estimated Monthly Orders' : 'Estimated Units Sold per Month'}
                            value={selected.forecastAvailable ? metricValue(selected.forecastDemand, target) : 'Unavailable'}
                            meaning={`Estimated average ${metricName(target)} per month for ${selected.category} in ${selected.province} over the next ${data.horizon} months.`}
                        />
                        <Metric
                            label="Estimated Monthly Change"
                            value={selected.forecastAvailable ? metricChange(selected.demand, selected.forecastDemand, target) : 'Unavailable'}
                            tone={selected.forecastAvailable && selected.forecastDemand != null && selected.demand != null ? growthTone(selected.forecastDemand - selected.demand) : ''}
                            meaning={`Difference between recent average monthly ${metricName(target)} and the estimated average for the next ${data.horizon} months.`}
                        />
                        {showExtraMetrics && (
                            <>
                                <Metric
                                    label="Orders in Records"
                                    value={number(selected.orders)}
                                    meaning={`Number of distinct orders recorded for ${selected.category} in ${selected.province}.`}
                                />
                                <Metric
                                    label="Change Compared with Last Year"
                                    value={percent(selected.yoyGrowth)}
                                    tone={growthTone(selected.yoyGrowth)}
                                    meaning="Compares the latest 12 months with the 12 months before them."
                                />
                                <Metric
                                    label="Expected Change"
                                    value={selected.forecastAvailable ? percent(selected.forecastGrowth) : 'Unavailable'}
                                    tone={growthTone(selected.forecastGrowth)}
                                    meaning={`Compares the estimate for the next ${data.horizon} months with the recent average.`}
                                />
                                <div className="prescriptive-metric-wide">
                                    <Metric
                                        label="Past Estimate Check"
                                        value={forecastReliability(selected)}
                                        meaning="Shows how close earlier estimates were to actual sales. Future sales may differ."
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
                            <span>{showExtraMetrics ? 'Hide extra details' : 'Show extra details'}</span>
                            {showExtraMetrics ? <FaChevronUp aria-hidden="true" /> : <FaChevronDown aria-hidden="true" />}
                        </button>
                    </div>
                </div>
                <div className="prescriptive-recommendation">
                    <div>
                        <span>SALES PATTERN · WHAT THE RECORDS SHOW</span>
                        <strong>{recommendationText(selected)}</strong>
                        <p>{evidenceSentence(selected, target, horizon)}</p>
                        <p className="prescriptive-next-step">{nextStepText(selected)}</p>
                        <button type="button" className="prescriptive-link-button" onClick={() => onViewPredictive({ category: selected.category, provinceKey: JSON.stringify([selected.region, selected.province]), pairKey: selected.key, region: selected.region, province: selected.province })}>View {selected.province} Sales Estimates and Trends →</button>
                    </div>
                </div>
            </section> : <section className="rd-card prescriptive-empty" id="prescriptive-selected-strategy"><h2>No sales records match this selection</h2><p>Choose another province or product, or add more sales records.</p></section>}

            <section className="rd-card prescriptive-notable-card" id="prescriptive-notable-opportunities">
                <div className="rd-card-head between">
                    <div>
                        <h2>Top opportunities across all categories</h2>
                        <p>{reviewMetricDescription(reviewMetric, target)}</p>
                    </div>
                    <div className="prescriptive-review-controls">
                        <ReviewMetricFilter id="areas-review-metric" value={reviewMetric} onChange={changeReviewMetric} />
                        <span className="rd-tag">{allEligiblePairs.length ? `Top 5 of ${allEligiblePairs.length} areas with enough records` : 'Top 5 Areas to Review'}</span>
                    </div>
                </div>
                {notable.length ? <div className="prescriptive-notable-list">{notable.map((row, index) => <button type="button" key={row.key} className={`prescriptive-notable ${selected?.key === row.key ? 'selected' : ''}`} onClick={() => selectPair(row)}>
                    <span className="prescriptive-notable-rank">{index + 1}</span>
                    <span className="prescriptive-notable-copy">
                        <strong>{row.province} <i>×</i> {row.category}</strong>
                        <small>{row.region} · Recent average: {monthlyDescription(row.demand, target)}</small>
                        <small title={reviewMetricDescription(reviewMetric, target, row)}>{reviewMetricLabel(reviewMetric)}: {reviewMetricDisplay(row, reviewMetric, target)}</small>
                    </span>
                    <StrategyBadge strategy={row.strategy} />
                    <span className="prescriptive-arrow" aria-hidden="true">→</span>
                </button>)}</div> : <Empty message="No sales records match the current province and product selections." />}
                <button type="button" className="prescriptive-button secondary prescriptive-notable-view-all" onClick={showAllRecommendations}>View all results in Areas to Review <span aria-hidden="true">↓</span></button>
            </section>
        </div>

        {selected && <section className="prescriptive-evidence-section" id="why-this-province">
            <div className="rd-card prescriptive-evidence-card">
                <div className="rd-card-head between">
                    <div>
                        <span className="prescriptive-section-kicker">SCORING EVIDENCE</span>
                        <h2>Sales evidence for {selected.province} <span>({selected.category})</span> <button type="button" className="prescriptive-evidence-help-btn" onClick={openScoreGuide} aria-label="Help with sales evidence and scoring" aria-haspopup="dialog" aria-controls="prescriptive-score-guide">?</button></h2>
                        <p>These four comparisons explain how this area’s sales result compares with other areas.</p>
                    </div>
                    <span className={`prescriptive-eligibility ${selected.eligible ? 'eligible' : 'insufficient'}`}>{selected.eligible ? '✓ Minimum record requirements met' : '! More records needed'}</span>
                </div>
                {!selected.eligible && <div className="prescriptive-insufficient-message">There is not enough history to summarize this sales pattern yet. {plainInsufficientReasons(selected.insufficientReasons)} We can review it again when more monthly records are available.</div>}
                <div className="prescriptive-evidence-layout">
                    <div className="prescriptive-factor-list">
                        <Factor label="Sales Compared with Other Areas" score={selected.factors.demandStrength} description={`Average monthly ${metricName(target)}: ${monthlyValue(selected.demand, target)}.`} tone="blue" />
                        <Factor label="Change in Sales" score={selected.factors.growthMomentum} description={growthDescription(selected)} tone="green" />
                        <Factor label="Months with Sales" score={selected.factors.demandConsistency} description={`Sales were recorded in ${selected.activeMonths} of ${selected.calendarMonths} months reviewed.`} tone="purple" />
                        <Factor
                            label="Share of Local Sales"
                            score={selected.factors.categoryAffinity}
                            description={selected.categoryShare == null || selected.overallCategoryShare == null ? 'Sales share comparison is unavailable.' : `${number(selected.categoryShare)}% of revenue here, compared with ${number(selected.overallCategoryShare)}% across the areas in this report.`}
                            tone="amber"
                            action={<button type="button" className="prescriptive-inline-modal-link" onClick={() => setShowMixModal(true)}>Compare Category Share of Sales ⓘ</button>}
                        />
                    </div>
                    <div className="prescriptive-score-card">
                        <span>Sales Comparison Score</span>
                        <strong>{selected.opportunityScore == null ? '—' : number(selected.opportunityScore)}</strong>
                        <small>out of 100</small>
                        <StrategyBadge strategy={selected.strategy} />
                    </div>
                </div>
                <div className="prescriptive-evidence-collapsible">
                    <div className={`prescriptive-eligibility-details ${showEligibilityChecks ? 'expanded' : ''}`}>
                        <button
                            type="button"
                            className="prescriptive-evidence-details-toggle"
                            onClick={() => setShowEligibilityChecks(value => !value)}
                            aria-expanded={showEligibilityChecks}
                        >
                            <span>Record Eligibility Checks</span>
                            {showEligibilityChecks ? <FaChevronUp aria-hidden="true" /> : <FaChevronDown aria-hidden="true" />}
                        </button>
                        {showEligibilityChecks && <div className="prescriptive-eligibility-grid">
                            <EligibilityCheck pass={selected.orders >= data.minimumOrders} label={`At least ${data.minimumOrders} orders recorded (${number(selected.orders)} found)`} />
                            <EligibilityCheck pass={selected.activeMonths >= data.minimumActiveMonths} label={`Sales recorded in at least ${data.minimumActiveMonths} different months (${selected.activeMonths} found)`} />
                            <EligibilityCheck pass={selected.calendarMonths > 0} label={selected.calendarMonths ? `${selected.calendarMonths} months of records reviewed` : 'No dated sales records found'} />
                            <EligibilityCheck pass={selected.growthEvidenceAvailable} label={selected.growthEvidenceAvailable ? 'A change from last year or an estimate is available' : 'Not enough history to show a change'} />
                            <EligibilityCheck pass={selected.forecastAvailable} label={selected.forecastAvailable ? `${data.horizon}-month sales estimate is available (${forecastReliability(selected)})` : `No sales estimate: ${plainForecastReason(selected.forecastReason)}`} neutral={!selected.forecastAvailable} />
                        </div>}
                    </div>
                    <button
                        type="button"
                        className="prescriptive-evidence-details-toggle"
                        onClick={() => setShowEvidenceDetails(value => !value)}
                        aria-expanded={showEvidenceDetails}
                    >
                        <span>Sales Evidence Breakdown</span>
                        {showEvidenceDetails ? <FaChevronUp aria-hidden="true" /> : <FaChevronDown aria-hidden="true" />}
                    </button>
                    {showEvidenceDetails && (
                        <div className="prescriptive-evidence-details-content">
                            <div className="prescriptive-evidence-details">
                                <Metric label={`Share of revenue in ${selected.province}`} value={selected.categoryShare == null ? 'Not available' : `${number(selected.categoryShare)}%`} />
                                <Metric label="Share of revenue across report" value={selected.overallCategoryShare == null ? 'Not available' : `${number(selected.overallCategoryShare)}%`} />
                                <Metric label="Expected change" value={selected.forecastAvailable ? selected.forecastTrend : 'No estimate available'} />
                                <Metric label="Past estimate check" value={forecastReliability(selected)} />
                                <Metric label="Months with sales records" value={`${selected.activeMonths} of ${selected.calendarMonths} months`} />
                            </div>
                            <p className="prescriptive-backtest-note">The past estimate check compares earlier estimates with actual sales. It shows how close those estimates were; future sales may differ.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>}

        <section className="rd-card prescriptive-recommendations-card" id="prescriptive-recommendations">
            <div className="rd-card-head between">
                <div>
                    <h2>Areas to Review</h2>
                    <p>{isOverview ? 'Sales patterns for each province and product category.' : `Sales patterns across provinces for ${category}.`}</p>
                </div>
                <div className="prescriptive-recommendations-header-actions">
                    <ReviewMetricFilter id="province-results-metric" value={reviewMetric} onChange={changeReviewMetric} />
                    <button type="button" className="prescriptive-table-download-btn" onClick={handleExportCsv} title="Download sales pattern review as a CSV">
                        <FaDownload aria-hidden="true" /> Download Sales Pattern Review (CSV)
                    </button>
                    <span className="rd-tag">{categoryRows.length} {isOverview ? 'province and product groups' : 'provinces'}</span>
                    {isOverview && showAll && <button type="button" className="prescriptive-button secondary" onClick={collapseRecommendations}>Show fewer rows <span aria-hidden="true">↑</span></button>}
                </div>
            </div>
            {categoryRows.length ? <>
                <div className="rd-table-wrap prescriptive-table-scroll prescriptive-compact-table-wrap"><table className="rd-table prescriptive-table prescriptive-compact-table"><thead><tr>
                    <th>Province</th>{isOverview && <th>Category</th>}<th>Region</th>
                    <th title={target === 'revenue' ? 'Recent monthly sales' : target === 'orders' ? 'Recent monthly orders' : 'Recent units sold per month'}>Recent {target === 'revenue' ? 'sales' : target === 'orders' ? 'orders' : 'units'}<br />per month</th>
                    <th title={target === 'revenue' ? 'Estimated monthly sales' : target === 'orders' ? 'Estimated monthly orders' : 'Estimated units sold per month'}>Forecast {target === 'revenue' ? 'sales' : target === 'orders' ? 'orders' : 'units'}<br />per month</th>
                    <th title="Expected monthly change">Monthly<br />change</th>
                    <th title={`Difference in ${metricName(target)} over the latest 12 months versus the previous 12 months`}>Change vs<br />last year</th>
                    <th title="Expected change vs recent average">Forecast vs<br />average</th>
                    <th>Forecast<br />accuracy <button type="button" className="prescriptive-table-help" aria-label="Forecast accuracy guide" title={FORECAST_ACCURACY_GUIDE}>?</button></th>
                    <th title="Sales comparison score">Sales<br />score</th>
                    <th>Pattern</th><th>Details</th>
                </tr></thead><tbody>
                    {pageRows.map(row => <tr key={row.key} className={selected?.key === row.key ? 'selected-row' : ''} onClick={() => selectPair(row)}>
                        <td><strong>{row.province}</strong>{!row.eligible && <small>{row.orders} orders · sales in {row.activeMonths} months</small>}</td>{isOverview && <td>{row.category}</td>}<td>{row.region}</td><td>{metricValue(row.demand, target)}</td><td>{row.forecastAvailable ? metricValue(row.forecastDemand, target) : 'No estimate'}</td><td className={row.forecastAvailable ? growthTone(row.forecastDemand - row.demand) : ''}>{row.forecastAvailable ? metricChange(row.demand, row.forecastDemand, target) : 'Not available'}</td><td className={growthTone(row.yoyChange)}>{signedMetricValue(row.yoyChange, target)}</td><td className={growthTone(row.forecastGrowth)}>{row.forecastAvailable ? percent(row.forecastGrowth) : 'Not available'}</td><td className="prescriptive-estimate-check">{row.forecastAvailable && row.forecastMape != null ? <strong>{number(row.forecastMape)}%</strong> : <span>{row.forecastAvailable ? 'N/A' : 'No forecast'}</span>}{!row.forecastAvailable && <small className="prescriptive-unavailable-reason">{plainForecastReason(row.forecastReason)}</small>}</td><td>{row.opportunityScore == null ? '—' : number(row.opportunityScore)}</td><td><StrategyBadge strategy={row.strategy} /></td><td><button type="button" className="prescriptive-link-button" onClick={event => { event.stopPropagation(); selectPair(row); document.getElementById('why-this-province')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>View details</button></td>
                    </tr>)}
                </tbody></table></div>
                {(showAll || !isOverview) && <Pagination page={page} pageCount={pageCount} total={categoryRows.length} setPage={setPage} />}
            </> : <Empty message="No sales records match these province and product selections." />}
        </section>

        {!isOverview && <section className="rd-card prescriptive-other-card">
            <div className="rd-card-head"><div><h2>Other product categories</h2><p>Review sales patterns outside {category}.</p></div></div>
            {otherOpportunities.length ? <div className="prescriptive-other-grid">{otherOpportunities.map(row => <button type="button" className="prescriptive-other-opportunity" key={row.key} onClick={() => { setCategory(row.category); setSelectedKey(row.key); onSelectionChange({ category: row.category, pairKey: row.key }); setPage(1); setShowAll(false); }}><strong>{row.province} × {row.category}</strong><small>{row.region}</small><StrategyBadge strategy={row.strategy} /><span>{otherReason(row)} <b aria-hidden="true">→</b></span></button>)}</div> : <Empty message={`No other categories have enough records to compare with ${category}.`} />}
        </section>}

        {showScoreModal && (
            <div className="prescriptive-lightbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowScoreModal(false); }}>
                <section className="prescriptive-lightbox prescriptive-score-lightbox" id="prescriptive-score-guide" role="dialog" aria-modal="true" aria-labelledby="prescriptive-score-guide-title" onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); scoreModalCloseRef.current?.focus(); } }}>
                    <div className="prescriptive-lightbox-head">
                        <div>
                            <span>HOW THE SCORE IS MADE</span>
                            <h2 id="prescriptive-score-guide-title">What does the Sales Comparison Score mean?</h2>
                        </div>
                        <button ref={scoreModalCloseRef} type="button" aria-label="Close guide" onClick={() => setShowScoreModal(false)}>×</button>
                    </div>
                    <p>
                        The Sales Comparison Score ranges from 0 to 100. It compares recent sales, changes over time, months with sales records, and each category’s share of revenue across the areas in this report. It does not include stock, costs, or budgets. The score and the labels are relative ranking heuristics, not calibrated predictions: weights are 35% recent sales level, 30% change in sales, 20% months with sales, 15% category mix, and growth of +5% or more counts as growing.
                    </p>
                    <div className="prescriptive-lightbox-guide">
                        <article className="prescriptive-lightbox-guide-item maintain">
                            <strong>1. Sales Compared with Other Areas (35%)</strong>
                            <p>Compares the recent average for the selected measure in {selected.province} with other areas. A higher score means this area’s average is higher compared with the others in the report.</p>
                        </article>
                        <article className="prescriptive-lightbox-guide-item promote">
                            <strong>2. Change in Sales (30%)</strong>
                            <p>Looks at how the selected measure changed from last year and how it is estimated to change over the next {horizon} months. A higher score means the changes point to a larger increase.</p>
                        </article>
                        <article className="prescriptive-lightbox-guide-item test">
                            <strong>3. Months with Sales (20%)</strong>
                            <p>Shows how many months had recorded sales: {selected.activeMonths} of {selected.calendarMonths} months reviewed. A higher score means records were present in more of those months.</p>
                        </article>
                        <article className="prescriptive-lightbox-guide-item monitor">
                            <strong>4. Share of Local Sales (15%)</strong>
                            <p>Compares how much of {selected.province}’s recorded revenue came from {selected.category} with its share across all areas. A higher score means this category makes up a larger share here than it does overall.</p>
                        </article>
                    </div>
                </section>
            </div>
        )}

        {showMixModal && (
            <div className="prescriptive-lightbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowMixModal(false); }}>
                <section className="prescriptive-lightbox" role="dialog" aria-modal="true" aria-label="Category Share of Sales">
                    <div className="prescriptive-lightbox-head">
                        <div>
                            <span>SALES SHARE COMPARISON</span>
                            <h2>Category Share of Sales</h2>
                        </div>
                        <button type="button" aria-label="Close guide" onClick={() => setShowMixModal(false)}>×</button>
                    </div>
                    <p>
                        These percentages show how much of the revenue came from <b>{selected.category}</b> in <b>{selected.province}</b> and across all areas in this report.
                    </p>
                    <div className="prescriptive-lightbox-mix-metrics">
                        <div className="prescriptive-metric">
                            <span>Share of revenue in {selected.province}</span>
                            <strong>{selected.categoryShare == null ? 'N/A' : `${number(selected.categoryShare)}%`}</strong>
                        </div>
                        <div className="prescriptive-metric">
                            <span>Share of revenue across report</span>
                            <strong>{selected.overallCategoryShare == null ? 'N/A' : `${number(selected.overallCategoryShare)}%`}</strong>
                        </div>
                        <div className="prescriptive-metric">
                            <span>Difference between the shares</span>
                            <strong>{selected.categoryShare == null || selected.overallCategoryShare == null ? 'Not available' : `${number(Number(selected.categoryShare) - Number(selected.overallCategoryShare))} percentage points`}</strong>
                        </div>
                    </div>
                    <p className="prescriptive-footnote">
                        <FaInfoCircle aria-hidden="true" /> This reflects sales in our records. It does not tell us why customers chose this product or how large the full market is.
                    </p>
                </section>
            </div>
        )}

        <button type="button" className="prescriptive-refresh" onClick={refresh} disabled={current.loading}>{current.loading ? 'Refreshing…' : 'Refresh data'}</button>
    </div>;
}

function PageHeader({ scope, data }) {
    return <header className="rd-header prescriptive-header">
        <div>
            <span className="rd-eyebrow">PRESCRIPTIVE ANALYTICS</span>
            <h1>Prescriptive Analytics</h1>
            <p>Review sales by province and product, how sales have changed, and how often sales were recorded. Stock, costs, capacity, and budgets are not included.</p>
            {data?.dataCompleteness?.partialMonths?.length > 0 && <p>Complete months only: {data.dataCompleteness.partialMonths.join(', ')} excluded (data runs through {data.dataCompleteness.dataThrough}).</p>}
            {data?.dataCompleteness?.adjustedMonths?.length > 0 && <p>Adjusted months ({data.dataCompleteness.adjustedMonths.join(', ')}) are left out of the scoring.</p>}
            {data?.notes?.map(note => <p key={note}>{note}</p>)}
        </div>
        <div className="prescriptive-header-actions-group">
            <div className="prescriptive-header-facts">
                <div><span>Analysis period</span><strong>{data?.effectiveRange?.start && data?.effectiveRange?.end ? `${monthLabel(data.effectiveRange.start)} – ${monthLabel(data.effectiveRange.end)}` : scope.period || 'All available data'}</strong></div>
        <div><span>Area</span><strong>{scope.region || 'All Regions'} · {scope.province || 'All Provinces'}</strong></div>
                <div><span>Returns</span><strong>{scope.returns || 'Include All'}</strong></div>
            </div>
        </div>
    </header>;
}

function Metric({ label, value, tone = '', meaning }) {
    return <div className={`prescriptive-metric ${tone}`} title={meaning || `${label}: ${value}`}><span>{label}</span><strong>{value}</strong></div>;
}

export function StrategyBadge({ strategy }) {
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
                    {meta.description}
                </span>
                <span className="prescriptive-hover-card-action">
                    <b>Review guidance:</b> {meta.action}
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

function metricName(target) {
    return target === 'revenue' ? 'sales' : target === 'orders' ? 'orders' : 'units sold';
}

function reviewMetricDescription(key, target, row = null) {
    if (key === 'yearOverYear') return row?.yoyMonths?.length ? `Calendar-aligned months: ${row.yoyMonths.join(', ')}.` : `Ranks areas by change in ${metricName(target)} for the same months last year.`;
    if (key === 'salesScore') return 'Ranks areas by their sales comparison score across all products.';
    return `Ranks areas by the forecast monthly average compared with its trailing baseline, shown as an amount and percentage.`;
}

function ReviewMetricFilter({ id, value, onChange }) {
    return <label className="prescriptive-review-filter" htmlFor={id}>
        <span>Rank both sections by</span>
        <select id={id} value={value} onChange={event => onChange(event.target.value)}>
            {REVIEW_METRICS.map(metric => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
        </select>
    </label>;
}

function monthlyValue(value, target) {
    return target === 'revenue' ? metricValue(value, target) : number(value);
}

function monthlyDescription(value, target) {
    if (target === 'revenue') return `${monthlyValue(value, target)} in sales per month`;
    if (target === 'orders') return `${monthlyValue(value, target)} orders per month`;
    return `${monthlyValue(value, target)} units sold per month`;
}

function changeInPlainWords(value) {
    return `${number(Math.abs(Number(value)))}% ${Number(value) >= 0 ? 'higher' : 'lower'}`;
}

function plainInsufficientReasons(reasons = []) {
    return reasons.map(reason => {
        if (/Fewer than \d+ distinct orders/i.test(reason)) return 'Fewer than 20 orders were found in the records.';
        if (/Fewer than \d+ active months/i.test(reason)) return 'Sales were recorded in fewer than 6 different months.';
        if (/No valid year-over-year growth or usable forecast growth/i.test(reason)) return 'There is not enough history to compare sales with last year or make a forecast.';
        return 'More complete monthly sales records are needed.';
    }).join(' ');
}

function plainForecastReason(reason = '') {
    if (/No matching transaction history/i.test(reason)) return 'No sales records were found for this selection.';
    if (/complete calendar months/i.test(reason)) return 'Choose dates that include full calendar months.';
    const missing = reason.match(/has (\d+) months? with no records/i);
    if (missing) return `Sales records are missing for ${missing[1]} month${missing[1] === '1' ? '' : 's'}, so a forecast is not available.`;
    if (/Negative monthly demand totals/i.test(reason)) return 'Refunds or adjustments make one or more monthly totals negative, so a forecast is not available.';
    const short = reason.match(/has (\d+)\./i);
    if (/At least \d+ consecutive observed months/i.test(reason) && short) return `At least 3 months of sales records in a row are needed. This selection has ${short[1]}.`;
    return 'There is not enough complete monthly sales history to make a forecast.';
}

export function recommendationText(row) {
    if (!row) return '';
    const focus = {
        'EXPAND SELECTIVELY': `Sales for ${row.category} in ${row.province} are higher than in many other areas and have been increasing.`,
        'SUSTAIN CORE DEMAND': `Sales for ${row.category} in ${row.province} are higher than in many other areas and have stayed steady.`,
        'PILOT AND VALIDATE': `Sales for ${row.category} in ${row.province} may be increasing, although the current average is moderate.`,
        'MONITOR / LOWER PRIORITY': `Sales for ${row.category} in ${row.province} are lower than in many other areas or have changed little.`
    };
    return row.eligible ? focus[row.strategy] || focus['MONITOR / LOWER PRIORITY'] : `There is not enough sales history for ${row.category} in ${row.province} to draw a reliable conclusion.`;
}

export function nextStepText(row) {
    if (!row) return '';
    if (!row.eligible) return 'Review this again after more complete monthly sales records have been added.';
    return 'Compare actual sales with the estimate each month to see whether this pattern continues.';
}

export function evidenceSentence(row, target = 'revenue', horizon = 6) {
    if (!row) return '';
    const measure = metricName(target);
    if (!row.eligible) {
        const reasons = plainInsufficientReasons(row.insufficientReasons || []);
        return `${reasons || 'More monthly sales records are needed.'} The current information is not enough to label this sales pattern.`;
    }

    const averageLine = target === 'revenue'
        ? `Over the most recent 12 months, ${row.province} averaged ${monthlyValue(row.demand, target)} in sales per month.`
        : target === 'orders'
            ? `Over the most recent 12 months, ${row.province} averaged ${monthlyValue(row.demand, target)} orders per month.`
            : `Over the most recent 12 months, ${row.province} averaged ${monthlyValue(row.demand, target)} units sold per month.`;
    const sentences = [averageLine];
    if (row.yoyGrowth != null && Number.isFinite(Number(row.yoyGrowth))) {
        sentences.push(`Compared with the 12 months before that, ${measure} were ${changeInPlainWords(row.yoyGrowth)}.`);
    }
    if (row.forecastAvailable && row.forecastGrowth != null && Number.isFinite(Number(row.forecastGrowth))) {
        sentences.push(`The estimate for the next ${horizon} months suggests average monthly ${measure} may be ${changeInPlainWords(row.forecastGrowth)} than the recent average.`);
    }
    if (row.calendarMonths > 0) {
        sentences.push(row.activeMonths === row.calendarMonths
            ? `Sales were recorded in all ${row.calendarMonths} months reviewed.`
            : `Sales were recorded in ${row.activeMonths} of the ${row.calendarMonths} months reviewed.`);
    }
    return sentences.join(' ');
}

function growthDescription(row) {
    if (!row.growthEvidenceAvailable) return 'There is not enough history to compare sales with last year or make an estimate.';
    const parts = [];
    if (row.yoyGrowth != null && Number.isFinite(Number(row.yoyGrowth))) parts.push(`${changeInPlainWords(row.yoyGrowth)} compared with the previous year`);
    if (row.forecastAvailable && row.forecastGrowth != null && Number.isFinite(Number(row.forecastGrowth))) parts.push(`the estimate is ${changeInPlainWords(row.forecastGrowth)} than the recent average`);
    return parts.join('; ') || 'More sales records are needed to show a clear change.';
}

function otherReason(row) {
    if (row.strategy === 'EXPAND SELECTIVELY') return 'Sales are relatively high and rising.';
    if (row.strategy === 'SUSTAIN CORE DEMAND') return 'Sales are relatively high and steady.';
    if (row.strategy === 'PILOT AND VALIDATE') return 'Sales may be rising, but the sales level is moderate.';
    return 'Sales are lower than in many other areas or have changed little.';
}
