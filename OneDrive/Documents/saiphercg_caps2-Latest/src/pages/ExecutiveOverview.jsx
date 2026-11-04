import { useEffect, useMemo, useState } from "react";
import {
    FaArrowRight,
    FaArrowDown,
    FaArrowUp,
    FaCalendarAlt,
    FaCubes,
    FaDatabase,
    FaFileAlt,
    FaMapMarkerAlt,
    FaMapMarkedAlt,
    FaMoneyBillWave,
    FaShoppingCart,
    FaTrophy
} from "react-icons/fa";

import { fetchPredictive, fetchPrescriptive, getCachedPredictive, getCachedPrescriptive } from "../data/analyticsApi";
import { DEFAULT_FORECAST_SETTINGS } from "../data/forecastSettings";
import { API_BASE } from "../data/apiBase";
import { DEFAULT_SCOPE, monthLabel, money, monthOverMonth, useAnalytics } from "../hooks/useAnalytics";
import { DescriptiveTrendChart } from "./DescriptiveAnalytics";
import { evidenceSentence, metricValue, nextStepText, number as prescriptiveNumber, recommendationText, StrategyBadge } from "./PrescriptiveAnalytics";
import { ForecastChart } from "./PredictiveAnalytics";
import "../styles/executive-overview.css";

const number = value => value == null || !Number.isFinite(Number(value))
    ? "Unavailable"
    : new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(Number(value));
const percent = value => value == null || !Number.isFinite(Number(value))
    ? "Unavailable"
    : `${Number(value).toFixed(1)}%`;
const forecastValue = (value, target) => value == null || !Number.isFinite(Number(value))
    ? "N/A"
    : target === "revenue"
        ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(Number(value))
        : new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(Number(value));
const forecastPercent = value => value == null || !Number.isFinite(Number(value))
    ? "N/A"
    : `${Number(value) > 0 ? "+" : ""}${new Intl.NumberFormat("en-PH", { maximumFractionDigits: 1 }).format(Number(value))}%`;

export default function ExecutiveOverview({ scope = DEFAULT_SCOPE, forecastSettings = DEFAULT_FORECAST_SETTINGS, forecastSelection = { category: "", provinceKey: "" }, prescriptiveSelection = { category: "All Categories", pairKey: "" }, descriptiveMetric = "Revenue", onDescriptiveMetricChange = () => {}, onViewPredictive = () => {}, onNavigate = () => {} }) {
    const { data: analytics } = useAnalytics(scope, true);
    const [sourceProfile, setSourceProfile] = useState(null);
    const [geographicProfile, setGeographicProfile] = useState(null);
    const trendMetric = descriptiveMetric;
    const [forecastState, setForecastState] = useState(() => {
        const data = getCachedPredictive({ scope, ...forecastSettings, ...forecastSelection });
        return { data, error: "", loading: !data };
    });
    const [prescriptiveState, setPrescriptiveState] = useState(() => {
        const data = getCachedPrescriptive({ scope, ...forecastSettings });
        return { data, error: "", loading: !data };
    });
    const [showPrescriptiveDetails, setShowPrescriptiveDetails] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        fetchProfile(`${API_BASE}/dataset-profile`, controller.signal).then(profile => {
            // Counts that feed analytics (eligible lines/orders) so the cards reconcile with every KPI.
            setSourceProfile({
                filesImported: profile.filesImported,
                transactionLines: profile.eligibleLines,
                uniqueOrders: profile.eligibleOrders,
                uniqueProducts: profile.uniqueProducts,
                dateCoverage: profile.dateCoverage,
                loadedLines: profile.transactionLines,
                excludedLines: profile.excludedLines
            });
            setGeographicProfile({ regions: profile.regions, provinces: profile.provinces });
        }).catch(error => {
            if (error.name !== "AbortError") {
                setSourceProfile({ error: true, message: error.message });
                setGeographicProfile({ error: true });
            }
        });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const options = { scope, ...forecastSettings, ...forecastSelection };
        const cached = getCachedPredictive(options);
        let current = true;
        setForecastState({ data: cached, error: "", loading: !cached });
        fetchPredictive(options, controller.signal)
            .then(data => { if (current) setForecastState({ data, error: "", loading: false }); })
            .catch(error => {
                if (current && error.name !== "AbortError") {
                    setForecastState({ data: cached, error: error.message, loading: false });
                }
            });
        return () => { current = false; controller.abort(); };
    }, [JSON.stringify(scope), forecastSettings.target, forecastSettings.horizon, forecastSettings.model, forecastSelection.category, forecastSelection.provinceKey]);

    useEffect(() => {
        const controller = new AbortController();
        const options = { scope, ...forecastSettings };
        const cached = getCachedPrescriptive(options);
        let current = true;
        setPrescriptiveState({ data: cached, error: "", loading: !cached });
        fetchPrescriptive(options, controller.signal)
            .then(data => { if (current) setPrescriptiveState({ data, error: "", loading: false }); })
            .catch(error => {
                if (current && error.name !== "AbortError") {
                    setPrescriptiveState({ data: cached, error: error.message, loading: false });
                }
            });
        return () => { current = false; controller.abort(); };
    }, [JSON.stringify(scope), forecastSettings.target, forecastSettings.horizon, forecastSettings.model]);

    const provinces = useMemo(() => (analytics?.regions || [])
        .flatMap(region => region.provinces || [])
        .sort((a, b) => (b.revenue || 0) - (a.revenue || 0)), [analytics]);
    const summary = analytics?.summary;
    const categories = analytics?.categories || [];
    const peakMonth = (analytics?.trend || []).reduce(
        (peak, row) => !peak || Number(row.revenue) > Number(peak.revenue) ? row : peak,
        null
    );
    const topProvince = provinces[0];
    const topRevenueCategory = [...categories].sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0];
    const topVolumeCategory = [...categories].sort((a, b) => (b.quantity || 0) - (a.quantity || 0))[0];
    const averageOrderSpend = summary?.orders > 0 ? summary.revenue / summary.orders : null;
    const trendRows = analytics?.trend || [];
    const mom = monthOverMonth(trendRows, trendMetric.toLowerCase());
    const latestTrendRow = mom.latestMonth ? { name: mom.latestMonth } : null;
    const latestTrendValue = mom.latest;
    const trendChange = mom.change;
    const formattedLatestTrend = trendMetric === "Revenue"
        ? money(latestTrendValue)
        : latestTrendValue.toLocaleString("en-PH");
    const forecast = forecastState.data;
    const forecastSignals = forecast?.signals || [];
    const selectedForecastProvince = forecast?.options?.provinces?.find(item => item.key === forecastSelection.provinceKey);
    const forecastScopeLabel = [
        selectedForecastProvince?.name || "All Provinces",
        forecastSelection.category || "All Categories"
    ].join(" × ");
    const prescriptiveData = prescriptiveState.data;
    const prescriptiveCategory = prescriptiveSelection.category || "All Categories";
    const prescriptivePairs = (prescriptiveData?.pairs || []).filter(pair =>
        prescriptiveCategory === "All Categories" || pair.category === prescriptiveCategory
    );
    const eligiblePairs = prescriptivePairs.filter(pair => pair.eligible);
    const selectedPair = prescriptivePairs.find(pair => pair.key === prescriptiveSelection.pairKey)
        || eligiblePairs[0]
        || prescriptivePairs[0];
    const selectedPairRank = selectedPair?.eligible
        ? eligiblePairs.findIndex(pair => pair.key === selectedPair.key) + 1
        : null;
    const scoreFactors = selectedPair?.factors || {};

    return (
        <div className="executive-overview-page">
            <div className="overview-descriptive-layout">
                <div className="overview-analytics-row-label">Descriptive Analytics</div>
                <div className="overview-descriptive-left">
            <section className="overview-dataset-section" aria-labelledby="overview-dataset-title">
                <header className="overview-section-header">
                    <div>
                        <h1 id="overview-dataset-title">Dataset Overview</h1>
                    </div>
                </header>

                <div className="overview-dataset-grid">
                    <DatasetMetric icon={<FaDatabase />} label="Files Imported" value={formatSourceCount(sourceProfile, "filesImported")} />
                    <DatasetMetric icon={<FaFileAlt />} label="Transaction Lines" value={formatSourceCount(sourceProfile, "transactionLines")} hint={sourceProfile?.loadedLines != null ? `${number(sourceProfile.loadedLines)} lines loaded from Supabase; ${number(sourceProfile.excludedLines)} excluded (non-completed orders). Eligible lines are counted here.` : undefined} />
                    <DatasetMetric icon={<FaShoppingCart />} label="Unique Orders" value={formatSourceCount(sourceProfile, "uniqueOrders")} />
                    <DatasetMetric icon={<FaCalendarAlt />} label="Data Coverage" value={formatDateCoverage(sourceProfile?.dateCoverage)} />
                    <DatasetMetric icon={<FaCubes />} label="Product Listings" value={formatSourceCount(sourceProfile, "uniqueProducts")} />
                    <DatasetMetric
                        icon={<FaMapMarkedAlt />}
                        label="Geographic Coverage"
                        value={geographicProfile?.error
                            ? "Unavailable"
                            : geographicProfile
                                ? `${number(geographicProfile.regions)} Regions / ${number(geographicProfile.provinces)} Provinces`
                                : "Loading…"}
                    />
                </div>
            </section>

            <section className="overview-takeaways-section" aria-labelledby="overview-takeaways-title">
                <header className="overview-takeaways-header">
                    <div>
                        <h2 id="overview-takeaways-title">Key Business Takeaways</h2>
                        <p>Core commercial facts and sales benchmarks established from historical records.</p>
                    </div>
                    <span className="overview-benchmark-tag">Sales Benchmarks</span>
                </header>

                <div className="overview-takeaways-grid">
                    <Takeaway
                        tone="amber"
                        icon={<FaTrophy />}
                        label="Peak Sales Month"
                        value={peakMonth ? monthLabel(peakMonth.name) : "Unavailable"}
                        detail={peakMonth ? <><b>{money(peakMonth.revenue)}</b> in record monthly revenue</> : "No monthly sales data in this scope"}
                    />
                    <Takeaway
                        tone="blue"
                        icon={<FaShoppingCart />}
                        label="Average Order Spend"
                        value={averageOrderSpend == null ? "Unavailable" : money(averageOrderSpend)}
                        detail={summary ? <>Across <b>{number(summary.orders)}</b> distinct customer orders</> : "Waiting for descriptive analytics"}
                    />
                    <Takeaway
                        tone="green"
                        icon={<FaMapMarkerAlt />}
                        label="Top Buyer Province"
                        value={topProvince?.name || "Unavailable"}
                        detail={topProvince && summary?.revenue > 0
                            ? <>Drives <b>{percent(topProvince.revenue / summary.revenue * 100)}</b> of sales ({money(topProvince.revenue)})</>
                            : "No province sales in this scope"}
                    />
                    <Takeaway
                        tone="indigo"
                        icon={<FaMoneyBillWave />}
                        label="Top Revenue Product"
                        value={topRevenueCategory?.name || "Unavailable"}
                        detail={topRevenueCategory && summary?.revenue > 0
                            ? <>Generates <b>{percent(topRevenueCategory.revenue / summary.revenue * 100)}</b> of sales ({money(topRevenueCategory.revenue)})</>
                            : "No product sales in this scope"}
                    />
                    <Takeaway
                        tone="purple"
                        icon={<FaCubes />}
                        label="Top Volume Product"
                        value={topVolumeCategory?.name || "Unavailable"}
                        detail={topVolumeCategory && summary?.quantity > 0
                            ? <>Represents <b>{percent(topVolumeCategory.quantity / summary.quantity * 100)}</b> of units sold ({number(topVolumeCategory.quantity)} units)</>
                            : "No unit sales in this scope"}
                    />
                </div>
            </section>
                </div>

            <section className="rd-card overview-trend-section" id="ov-trend" aria-labelledby="overview-trend-title">
                <div className="rd-card-head between overview-trend-heading">
                    <div>
                        <h2 id="overview-trend-title">Historical Trend</h2>
                        <p>Track sales performance over time across monthly periods.</p>
                    </div>
                    <div className="overview-heading-actions">
                        <div className="rd-segmented" aria-label="Historical trend measure">
                            {["Revenue", "Orders", "Quantity"].map(metric => (
                                <button
                                    key={metric}
                                    type="button"
                                    className={trendMetric === metric ? "active" : ""}
                                    aria-pressed={trendMetric === metric}
                                    onClick={() => onDescriptiveMetricChange(metric)}
                                >
                                    {metric}
                                </button>
                            ))}
                        </div>
                        <button type="button" className="overview-analytics-link" aria-label="Open Descriptive Analytics" onClick={() => onNavigate("descriptive-analytics")}>
                            Descriptive analytics <FaArrowRight aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {trendRows.length ? (
                    <DescriptiveTrendChart rows={trendRows} metric={trendMetric} />
                ) : (
                    <div className="overview-trend-empty" role="status">
                        {analytics ? "No sales records match this scope." : "Loading historical analytics…"}
                    </div>
                )}

                <div className="rd-trend-foot overview-trend-foot">
                    <div>
                        <span>Latest complete month{latestTrendRow ? ` · ${monthLabel(latestTrendRow.name)}` : ""}</span>
                        <strong>{latestTrendRow ? formattedLatestTrend : "Unavailable"}</strong>
                    </div>
                    <div className={trendChange == null ? "" : trendChange >= 0 ? "positive" : "negative"}>
                        {trendChange !== null && (trendChange >= 0 ? <FaArrowUp aria-hidden="true" /> : <FaArrowDown aria-hidden="true" />)}
                        {trendChange == null
                            ? "No previous month for comparison"
                            : `${Math.abs(trendChange).toFixed(1)}% vs previous month`}
                    </div>
                </div>
                {mom.closureMonths.length > 0 && <p className="descriptive-chart-caption">{mom.closureMonths.map(monthLabel).join(", ")} include a declared shop closure and are excluded from this comparison.</p>}
                {mom.partialMonth && <p className="descriptive-chart-caption">{monthLabel(mom.partialMonth)} is incomplete (data runs through {analytics?.scope?.completeness?.dataThrough}) and is excluded from this comparison.</p>}
            </section>
            </div>

            <div className="overview-predictive-layout">
            <div className="overview-analytics-row-label">Predictive Analytics</div>
            <section className="rd-card predictive-signals overview-predictive-signals" id="ov-predictive-signals" aria-labelledby="overview-signals-title">
                <div className="rd-card-head between">
                    <div>
                        <h2 id="overview-signals-title">Notable Growth Opportunities</h2>
                        <p>Province and product combinations showing the strongest projected sales growth.</p>
                    </div>
                    <span className="rd-tag">{forecastSignals.length} growth signals</span>
                </div>
                {forecastSignals.length ? (
                    <div className="predictive-signal-grid">
                        {forecastSignals.map(row => {
                            const absoluteChange = row.currentDemand == null || row.forecastDemand == null
                                ? null
                                : row.forecastDemand - row.currentDemand;
                            return (
                                <article className="predictive-signal overview-predictive-signal" key={row.key}>
                                    <div className="predictive-signal-head">
                                        <strong>{row.province} × {row.category}</strong>
                                        <span>{forecastPercent(row.growth)} · {row.trend}</span>
                                    </div>
                                    <div className="predictive-signal-metrics">
                                        <span><b>Current / mo</b>{forecastValue(row.currentDemand, forecast.target)}</span>
                                        <span><b>Forecast / mo</b>{forecastValue(row.forecastDemand, forecast.target)}</span>
                                        <span className={absoluteChange != null && absoluteChange < 0 ? "negative" : "positive"}>
                                            <b>Change / mo</b>{absoluteChange == null ? "N/A" : `${absoluteChange > 0 ? "+" : ""}${forecastValue(absoluteChange, forecast.target)}`}
                                        </span>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="overview-predictive-empty" role={forecastState.error ? "alert" : "status"}>
                        {forecastState.loading
                            ? "Loading forecast growth signals…"
                            : forecastState.error || "Growth opportunities will appear when combinations have enough continuous history."}
                    </div>
                )}
            </section>

            <section className="rd-card predictive-chart-card overview-predictive-chart" id="ov-predictive-chart" aria-labelledby="overview-predictive-chart-title">
                <div className="rd-card-head between">
                    <div>
                        <h2 id="overview-predictive-chart-title">Historical Sales vs Projected Demand</h2>
                        <p>{forecastScopeLabel} · monthly {forecast?.unit || "sales"} · {forecast?.model || "Forecast model"}</p>
                    </div>
                    <div className="overview-heading-actions">
                        {forecast && <span className={`predictive-status-pill ${forecast.chart.status}`}>
                            {forecast.chart.status === "available" ? "Forecast ready" : "Insufficient sales history"}
                        </span>}
                        <button type="button" className="overview-analytics-link" aria-label="Open Predictive Analytics" onClick={() => onNavigate("predictive-analytics")}>
                            Predictive analytics <FaArrowRight aria-hidden="true" />
                        </button>
                    </div>
                </div>
                {forecastState.loading && !forecast ? (
                    <div className="overview-predictive-empty" role="status">Loading historical demand and forecast…</div>
                ) : forecastState.error && !forecast ? (
                    <div className="overview-predictive-empty" role="alert">{forecastState.error}</div>
                ) : forecast?.chart?.history?.length ? (
                    <ForecastChart result={forecast.chart} target={forecast.target} />
                ) : (
                    <div className="overview-predictive-empty" role="status">No matching transactions are available for this scope.</div>
                )}
            </section>
            </div>

            <section className="overview-prescriptive-section" aria-label="Prescriptive sales pattern review">
                <div className="overview-analytics-row-label">Prescriptive Analytics</div>
                {prescriptiveState.loading && !prescriptiveData ? (
                    <div className="rd-card overview-prescriptive-status" role="status">Loading prescriptive sales review…</div>
                ) : prescriptiveState.error && !prescriptiveData ? (
                    <div className="rd-card overview-prescriptive-status" role="alert">{prescriptiveState.error}</div>
                ) : selectedPair ? (
                    <>
                        <article className={`prescriptive-featured overview-prescriptive-featured ${selectedPair.eligible ? "" : "insufficient"}`}>
                            <div className="prescriptive-featured-kicker">
                                <span>{selectedPair.eligible ? "SALES PATTERN REVIEW" : "MORE RECORDS NEEDED"}</span>
                                <span>All categories</span>
                                {selectedPairRank && <span className="prescriptive-rank">Priority rank #{selectedPairRank}</span>}
                            </div>
                            <div className="prescriptive-featured-main">
                                <div className="prescriptive-featured-place">
                                    <span>{selectedPair.category}</span>
                                    <h2>{selectedPair.province}</h2>
                                    <small>{selectedPair.region}</small>
                                    <StrategyBadge strategy={selectedPair.strategy} />
                                </div>
                                <div className={`prescriptive-featured-metrics ${showPrescriptiveDetails ? "expanded" : ""}`}>
                                    <OverviewMetric
                                        label={prescriptiveData.target === "revenue" ? "Average Monthly Sales" : prescriptiveData.target === "orders" ? "Average Monthly Orders" : "Average Units Sold per Month"}
                                        value={metricValue(selectedPair.demand, prescriptiveData.target)}
                                    />
                                    <OverviewMetric
                                        label={prescriptiveData.target === "revenue" ? "Estimated Monthly Sales" : prescriptiveData.target === "orders" ? "Estimated Monthly Orders" : "Estimated Units Sold per Month"}
                                        value={selectedPair.forecastAvailable ? metricValue(selectedPair.forecastDemand, prescriptiveData.target) : "Unavailable"}
                                    />
                                    <OverviewMetric
                                        label="Estimated Monthly Change"
                                        value={selectedPair.forecastAvailable && selectedPair.forecastDemand != null && selectedPair.demand != null
                                            ? metricValue(Number(selectedPair.forecastDemand) - Number(selectedPair.demand), prescriptiveData.target)
                                            : "Unavailable"}
                                        tone={selectedPair.forecastAvailable && selectedPair.forecastDemand != null && selectedPair.demand != null
                                            ? selectedPair.forecastDemand - selectedPair.demand > 0 ? "positive" : selectedPair.forecastDemand - selectedPair.demand < 0 ? "negative" : ""
                                            : ""}
                                    />
                                    {showPrescriptiveDetails && <>
                                        <OverviewMetric label="Orders in Records" value={prescriptiveNumber(selectedPair.orders)} />
                                        <OverviewMetric label="Change Compared with Last Year" value={signedPercent(selectedPair.yoyGrowth)} />
                                        <OverviewMetric label="Forecast Growth" value={selectedPair.forecastAvailable ? signedPercent(selectedPair.forecastGrowth) : "Unavailable"} />
                                        <OverviewMetric label="Months with Sales Records" value={`${selectedPair.activeMonths} of ${selectedPair.calendarMonths} months`} />
                                        <OverviewMetric label="Past Estimate Check" value={selectedPair.forecastAvailable
                                            ? selectedPair.forecastMape == null ? "Not enough past sales to compare" : `About ${prescriptiveNumber(selectedPair.forecastMape)}% average error`
                                            : "No estimate available"} />
                                    </>}
                                    <button
                                        type="button"
                                        className="prescriptive-metrics-toggle-btn"
                                        aria-expanded={showPrescriptiveDetails}
                                        onClick={() => setShowPrescriptiveDetails(value => !value)}
                                    >
                                        {showPrescriptiveDetails ? "Hide extra details" : "Show extra details"}
                                    </button>
                                </div>
                            </div>
                            <div className="prescriptive-recommendation">
                                <div>
                                    <span>SALES PATTERN · WHAT THE RECORDS SHOW</span>
                                    <strong>{recommendationText(selectedPair)}</strong>
                                    <p>{evidenceSentence(selectedPair, prescriptiveData.target, prescriptiveData.horizon)}</p>
                                    <p className="prescriptive-next-step">{nextStepText(selectedPair)}</p>
                                    <button
                                        type="button"
                                        className="prescriptive-link-button"
                                        disabled={!selectedPair.category || !selectedPair.province}
                                        onClick={() => onViewPredictive({
                                            category: selectedPair.category,
                                            provinceKey: JSON.stringify([selectedPair.region, selectedPair.province]),
                                            pairKey: selectedPair.key,
                                            region: selectedPair.region,
                                            province: selectedPair.province
                                        })}
                                    >
                                        View {selectedPair.province} Sales Estimates and Trends →
                                    </button>
                                </div>
                            </div>
                        </article>

                        <section className="rd-card prescriptive-evidence-card overview-prescriptive-evidence">
                            <div className="rd-card-head between">
                                <div>
                                    <span className="prescriptive-section-kicker">SCORING EVIDENCE</span>
                                    <h2>Sales evidence for {selectedPair.province} <span>({selectedPair.category})</span></h2>
                                    <p>These four comparisons explain how this area’s sales result compares with other areas.</p>
                                </div>
                                <div className="overview-heading-actions">
                                    <span className={`prescriptive-eligibility ${selectedPair.eligible ? "eligible" : "insufficient"}`}>
                                        {selectedPair.eligible ? "✓ Minimum record requirements met" : "! More records needed"}
                                    </span>
                                    <button type="button" className="overview-analytics-link" aria-label="Open Prescriptive Analytics" onClick={() => onNavigate("prescriptive-analytics")}>
                                        Prescriptive analytics <FaArrowRight aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                            <div className="prescriptive-eligibility-grid">
                                <EvidenceCheck pass={selectedPair.orders >= prescriptiveData.minimumOrders} label={`At least ${prescriptiveData.minimumOrders} orders recorded (${prescriptiveNumber(selectedPair.orders)} found)`} />
                                <EvidenceCheck pass={selectedPair.activeMonths >= prescriptiveData.minimumActiveMonths} label={`Sales recorded in at least ${prescriptiveData.minimumActiveMonths} different months (${selectedPair.activeMonths} found)`} />
                                <EvidenceCheck pass={selectedPair.calendarMonths > 0} label={selectedPair.calendarMonths ? `${selectedPair.calendarMonths} months of records reviewed` : "No dated sales records found"} />
                                <EvidenceCheck pass={selectedPair.growthEvidenceAvailable} label={selectedPair.growthEvidenceAvailable ? "A change from last year or an estimate is available" : "Not enough history to show a change"} />
                                <EvidenceCheck pass={selectedPair.forecastAvailable} neutral={!selectedPair.forecastAvailable} label={selectedPair.forecastAvailable
                                    ? `${prescriptiveData.horizon}-month sales estimate is available`
                                    : "No sales estimate is available"} />
                            </div>
                            <div className="prescriptive-evidence-layout">
                                <div className="prescriptive-factor-list">
                                    <EvidenceFactor label="Sales Compared with Other Areas" score={scoreFactors.demandStrength} description={`Average monthly ${prescriptiveMetricName(prescriptiveData.target)}: ${metricValue(selectedPair.demand, prescriptiveData.target)}.`} tone="blue" />
                                    <EvidenceFactor label="Change in Sales" score={scoreFactors.growthMomentum} description={prescriptiveGrowthDescription(selectedPair)} tone="green" />
                                    <EvidenceFactor label="Months with Sales" score={scoreFactors.demandConsistency} description={`Sales were recorded in ${selectedPair.activeMonths} of ${selectedPair.calendarMonths} months reviewed.`} tone="purple" />
                                    <EvidenceFactor label="Share of Local Sales" score={scoreFactors.categoryAffinity} description={selectedPair.categoryShare == null || selectedPair.overallCategoryShare == null
                                        ? "Sales share comparison is unavailable."
                                        : `${prescriptiveNumber(selectedPair.categoryShare)}% of revenue here, compared with ${prescriptiveNumber(selectedPair.overallCategoryShare)}% across the areas in this report.`} tone="amber" />
                                </div>
                                <div className="prescriptive-score-card">
                                    <span>Sales Comparison Score</span>
                                    <strong>{selectedPair.opportunityScore == null ? "N/A" : prescriptiveNumber(selectedPair.opportunityScore)}</strong>
                                    <small>out of 100</small>
                                    <StrategyBadge strategy={selectedPair.strategy} />
                                </div>
                            </div>
                            <p className="overview-prescriptive-note">This relative sales score summarizes demand, growth, sales consistency, and category share. It does not include inventory, costs, capacity, or marketing spend.</p>
                        </section>
                    </>
                ) : (
                    <div className="rd-card overview-prescriptive-status" role="status">No sales records match the current scope.</div>
                )}
            </section>
        </div>
    );
}

function DatasetMetric({ icon, label, value, hint }) {
    return (
        <article className="overview-dataset-card" title={hint}>
            <span className="overview-dataset-icon" aria-hidden="true">{icon}</span>
            <span className="overview-dataset-label">{label}</span>
            <strong className="overview-dataset-value">{value}</strong>
        </article>
    );
}

function Takeaway({ tone, icon, label, value, detail }) {
    return (
        <article className={`overview-takeaway-card ${tone}`}>
            <div className="overview-takeaway-kicker">
                <span aria-hidden="true">{icon}</span>
                <span>{label}</span>
            </div>
            <strong className="overview-takeaway-value" title={value}>{value}</strong>
            <span className="overview-takeaway-detail">{detail}</span>
        </article>
    );
}

function OverviewMetric({ label, value, tone = "" }) {
    return <div className={`prescriptive-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function EvidenceCheck({ pass, label, neutral = false }) {
    return <span className={pass ? "pass" : neutral ? "neutral" : "fail"}><b aria-hidden="true">{pass ? "✓" : neutral ? "i" : "!"}</b>{label}</span>;
}

function EvidenceFactor({ label, score, description, tone }) {
    const value = score == null || !Number.isFinite(Number(score)) ? null : Math.max(0, Math.min(100, Number(score)));
    return (
        <div className={`prescriptive-factor ${tone}`}>
            <div className="prescriptive-factor-head"><strong>{label}</strong><b>{value == null ? "N/A" : `${prescriptiveNumber(value)} / 100`}</b></div>
            <div className="prescriptive-progress"><span style={{ width: `${value || 0}%` }} /></div>
            <small>{description}</small>
        </div>
    );
}

function signedPercent(value) {
    return value == null || !Number.isFinite(Number(value))
        ? "Unavailable"
        : `${Number(value) > 0 ? "+" : ""}${prescriptiveNumber(value)}%`;
}

function prescriptiveMetricName(target) {
    return target === "revenue" ? "sales" : target === "orders" ? "orders" : "units sold";
}

function prescriptiveGrowthDescription(row) {
    const details = [];
    if (row.yoyGrowth != null) details.push(`${signedPercent(row.yoyGrowth)} compared with the previous year`);
    if (row.forecastAvailable && row.forecastGrowth != null) details.push(`forecast change of ${signedPercent(row.forecastGrowth)} vs recent average`);
    return details.length ? details.join("; ") : "There is not enough history to show a change.";
}

function formatSourceCount(profile, key) {
    if (profile?.error) return "Unavailable";
    return profile ? number(profile[key]) : "Loading…";
}

function formatDateCoverage(coverage) {
    if (!coverage?.min || !coverage?.max) return coverage ? "Unavailable" : "Loading…";
    return `${monthLabel(coverage.min)} – ${monthLabel(coverage.max)}`;
}

async function fetchProfile(path, signal) {
    const response = await fetch(path, { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load the dataset profile.");
    return data;
}
