import { useEffect, useState } from "react";
import {
    FaMoneyBillWave,
    FaShoppingCart,
    FaCubes,
    FaChartLine,
    FaBoxOpen,
    FaLightbulb,
    FaArrowUp,
    FaArrowDown,
    FaChevronDown,
    FaChevronUp,
    FaMapMarkerAlt,
    FaTrophy
} from "react-icons/fa";

import "../styles/analytics-redesign.css";
import "../styles/descriptive-chart.css";
import { DEFAULT_SCOPE, useAnalytics, money, monthLabel } from "../hooks/useAnalytics";

export default function DescriptiveAnalytics({ scope = DEFAULT_SCOPE, active = true, onViewPredictive = () => {} }) {
    const { data, error, loading, refresh } = useAnalytics(scope, active);
    const [metric, setMetric] = useState("Revenue");
    const [geoTab, setGeoTab] = useState("Top Provinces");
    const [selectedRegion, setSelectedRegion] = useState("");
    const [selectedProvince, setSelectedProvince] = useState("");
    if (loading || error || !data || !data.summary.rows) {
        return <div className="rd-page"><h1>Descriptive Analytics</h1><div className="rd-card" role={error ? "alert" : "status"}>
            {loading ? "Loading analytics…" : error || (data?.empty ? "Please upload and prepare sales data first." : "No sales records match this scope. Adjust your date range or filters.")}
            {error && <button onClick={refresh}>Retry</button>}
        </div></div>;
    }
    const regionData = data.regions;
    const allProvinces = regionData.flatMap(region => region.provinces);
    const months = data.trend.map(item => monthLabel(item.name));
    const trendData = Object.fromEntries(["Revenue", "Orders", "Quantity"].map(name => [name, data.trend.map(item => item[name.toLowerCase()])]));
    const values = trendData[metric];
    const latest = values.at(-1) || 0;
    const previous = values.at(-2);
    const change = previous ? (latest - previous) / previous * 100 : null;
    const formattedLatest = metric === "Revenue" ? money(latest) : latest.toLocaleString();
    const activeRegion = regionData.find(item => item.name === selectedRegion) || regionData[0];
    const activeProvince = activeRegion.provinces.find(item => item.name === selectedProvince) || activeRegion.provinces[0];
    const scopedCategories = activeProvince.categories;
    const selectRegion = name => { setSelectedRegion(name); setSelectedProvince(""); };
    const selectProvince = (name, region) => { setSelectedRegion(region); setSelectedProvince(name); };

    // 1. Peak Sales Month on record
    const peakMonth = data.trend?.length
        ? data.trend.reduce((max, cur) => ((cur.revenue || 0) > (max.revenue || 0) ? cur : max), data.trend[0])
        : null;

    // 2. Average Order Spend (AOV)
    const avgOrderValue = (data.summary.orders > 0 && data.summary.revenue > 0)
        ? (data.summary.revenue / data.summary.orders)
        : 0;

    // 3. Top Buyer Province across entire scope
    const topProvinceOverall = allProvinces.slice().sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0];
    const topProvinceShare = (data.summary.revenue > 0 && topProvinceOverall?.revenue)
        ? ((topProvinceOverall.revenue / data.summary.revenue) * 100).toFixed(1)
        : "0.0";

    // 4. Top Volume Product Category
    const topCategoryOverall = (data.categories || []).slice().sort((a, b) => (b.quantity || 0) - (a.quantity || 0))[0];
    const topCategoryShare = (data.summary.quantity > 0 && topCategoryOverall?.quantity)
        ? ((topCategoryOverall.quantity / data.summary.quantity) * 100).toFixed(1)
        : "0.0";

    // 5. Top Revenue Product Category
    const topRevenueCategoryOverall = (data.categories || []).slice().sort((a, b) => (b.revenue || 0) - (a.revenue || 0))[0];
    const topRevenueCategoryShare = (data.summary.revenue > 0 && topRevenueCategoryOverall?.revenue)
        ? ((topRevenueCategoryOverall.revenue / data.summary.revenue) * 100).toFixed(1)
        : "0.0";

    return (
        <div className="rd-page">
            <div className="rd-header">
                <div>
                    <span className="rd-eyebrow">DESCRIPTIVE ANALYTICS</span>
                    <h1>Descriptive Analytics</h1>
                    <p>Review historical sales revenue, distinct order volumes, and regional distribution.</p>
                </div>
                <div className="rd-header-note">
                    <span>Date Range</span>
                    <strong>{months[0]} – {months.at(-1)}</strong>
                    <small>{scope.region} · {scope.province} · {scope.returns} · {scope.categories === null ? "All categories" : `${scope.categories.length} categories`}</small>
                </div>
            </div>

            <div className="rd-kpi-grid four" id="da-kpis">
                <Kpi icon={<FaMoneyBillWave />} label="Total Revenue" value={money(data.summary.revenue)} detail="Net sales across prepared records" tone="blue" />
                <Kpi icon={<FaShoppingCart />} label="Distinct Orders" value={data.summary.orders.toLocaleString()} detail="Count of unique customer orders" tone="purple" />
                <Kpi icon={<FaCubes />} label="Units Sold" value={data.summary.quantity.toLocaleString()} detail="Total quantity of items sold" tone="green" />
                <Kpi icon={<FaChartLine />} label="Latest Month Sales" value={months.at(-1) || "No dated rows"} detail={`${formattedLatest} in ${metric.toLowerCase()} for the most recent month`} tone="amber" />
            </div>

            <section className="rd-card descriptive-insights-card" id="da-insights" style={{ marginBottom: 18 }}>
                <div className="rd-card-head between">
                    <div className="rd-card-title-with-icon">
                        <div className="rd-icon amber"><FaLightbulb /></div>
                        <div>
                            <h2>Key Business Takeaways</h2>
                            <p>Core commercial facts and sales benchmarks established from historical records.</p>
                        </div>
                    </div>
                    <span className="rd-tag">Sales Benchmarks</span>
                </div>

                <div className="descriptive-facts-grid">
                    {/* FACT 1: PEAK MONTH */}
                    <div className="descriptive-fact-card amber">
                        <div className="descriptive-fact-kicker">
                            <span className="descriptive-fact-icon"><FaTrophy /></span>
                            <span>Peak Sales Month</span>
                        </div>
                        <div className="descriptive-fact-value">
                            {peakMonth ? monthLabel(peakMonth.name) : "N/A"}
                        </div>
                        <div className="descriptive-fact-detail">
                            <strong>{peakMonth ? money(peakMonth.revenue) : "₱0"}</strong> in record monthly revenue
                        </div>
                    </div>

                    {/* FACT 2: AVERAGE ORDER VALUE */}
                    <div className="descriptive-fact-card blue">
                        <div className="descriptive-fact-kicker">
                            <span className="descriptive-fact-icon"><FaShoppingCart /></span>
                            <span>Average Order Spend</span>
                        </div>
                        <div className="descriptive-fact-value">
                            {money(avgOrderValue)}
                        </div>
                        <div className="descriptive-fact-detail">
                            Across <strong>{data.summary.orders.toLocaleString()}</strong> completed customer orders
                        </div>
                    </div>

                    {/* FACT 3: TOP PROVINCE */}
                    <div className="descriptive-fact-card green">
                        <div className="descriptive-fact-kicker">
                            <span className="descriptive-fact-icon"><FaMapMarkerAlt /></span>
                            <span>Top Buyer Province</span>
                        </div>
                        <div className="descriptive-fact-value">
                            {topProvinceOverall?.name || "Metro Manila"}
                        </div>
                        <div className="descriptive-fact-detail">
                            Drives <strong>{topProvinceShare}%</strong> of total sales ({money(topProvinceOverall?.revenue || 0)})
                        </div>
                    </div>

                    {/* FACT 4: TOP REVENUE PRODUCT */}
                    <div className="descriptive-fact-card indigo">
                        <div className="descriptive-fact-kicker">
                            <span className="descriptive-fact-icon"><FaMoneyBillWave /></span>
                            <span>Top Revenue Product</span>
                        </div>
                        <div className="descriptive-fact-value">
                            {topRevenueCategoryOverall?.name || "Shrink Wrap / Cap Seal"}
                        </div>
                        <div className="descriptive-fact-detail">
                            Generates <strong>{topRevenueCategoryShare}%</strong> of sales ({money(topRevenueCategoryOverall?.revenue || 0)})
                        </div>
                    </div>

                    {/* FACT 5: TOP VOLUME PRODUCT */}
                    <div className="descriptive-fact-card purple">
                        <div className="descriptive-fact-kicker">
                            <span className="descriptive-fact-icon"><FaCubes /></span>
                            <span>Top Volume Product</span>
                        </div>
                        <div className="descriptive-fact-value">
                            {topCategoryOverall?.name || "Shrink Wrap"}
                        </div>
                        <div className="descriptive-fact-detail">
                            Represents <strong>{topCategoryShare}%</strong> of units sold ({topCategoryOverall?.quantity?.toLocaleString() || 0} units)
                        </div>
                    </div>
                </div>
            </section>

            <div className="rd-grid-two">
                <section className="rd-card" id="da-trend">
                    <div className="rd-card-head between">
                        <div>
                            <h2>Historical Trend</h2>
                            <p>Track sales performance over time across monthly periods.</p>
                        </div>
                        <div className="rd-segmented">
                            {Object.keys(trendData).map(item => (
                                <button key={item} className={metric === item ? "active" : ""} onClick={() => setMetric(item)}>{item}</button>
                            ))}
                        </div>
                    </div>

                    <DescriptiveTrendChart rows={data.trend} metric={metric} />

                    <div className="rd-trend-foot">
                        <div>
                            <span>Latest</span>
                            <strong>{formattedLatest}</strong>
                        </div>
                        <div className={change === null ? "" : change >= 0 ? "positive" : "negative"}>
                            {change !== null && (change >= 0 ? <FaArrowUp /> : <FaArrowDown />)}
                            {change === null ? "No previous month for comparison" : `${Math.abs(change).toFixed(1)}% vs previous month`}
                        </div>
                    </div>
                </section>

                <section className="rd-card" id="da-geography">
                    <div className="rd-card-head between">
                        <div>
                            <h2>Geographic Performance</h2>
                            <p>Sales distribution across regions and top-performing provinces.</p>
                        </div>
                        <div className="rd-segmented">
                            {['Top Provinces', 'Regions'].map(item => (
                                <button
                                    key={item}
                                    className={geoTab === item ? "active" : ""}
                                    onClick={() => setGeoTab(item)}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>

                    {geoTab === "Top Provinces" ? (
                        <div className="rd-ranking-list">
                            {allProvinces
                                .sort((a, b) => b.revenue - a.revenue)
                                .slice(0, 5)
                                .map((item, index) => (
                                    <button
                                        type="button"
                                        className={`rd-rank-row rd-rank-button ${activeProvince.name === item.name && activeRegion.name === item.region ? "selected-row" : ""}`}
                                        key={`${item.region || ""}/${item.name}`}
                                        onClick={() => selectProvince(item.name, item.region)}
                                    >
                                        <span className="rank-number">{index + 1}</span>
                                        <div className="rank-main">
                                            <strong>{item.name}</strong>
                                            <small>{item.region}</small>
                                        </div>
                                        <div className="rank-stat">
                                            <strong>{money(item.revenue)}</strong>
                                            <small>{item.orders.toLocaleString()} orders</small>
                                        </div>
                                    </button>
                                ))}
                        </div>
                    ) : (
                        <div className="rd-region-list">
                            {regionData.map((region, index) => {
                                const isOpen = activeRegion.name === region.name;
                                return (
                                    <div className="rd-region-block" key={region.name}>
                                        <button
                                            type="button"
                                            className={`rd-rank-row rd-rank-button ${isOpen ? "selected-row" : ""}`}
                                            onClick={() => selectRegion(region.name)}
                                        >
                                            <span className="rank-number">{index + 1}</span>
                                             <div className="rank-main">
                                                <strong>{region.name}</strong>
                                                <small>{region.share.toFixed(1)}% of total sales revenue</small>
                                            </div>
                                            <div className="rd-region-row-end">
                                                <div className="rd-progress">
                                                    <span style={{ width: `${region.share}%` }} />
                                                </div>
                                                <span className="rd-expand-icon">{isOpen ? <FaChevronUp /> : <FaChevronDown />}</span>
                                            </div>
                                        </button>

                                        {isOpen && (
                                            <div className="rd-region-breakout">
                                                <div className="rd-breakout-head">
                                                    <div>
                                                        <strong>Top 5 Provinces in {region.name}</strong>
                                                        <small>Click a province to view its product category breakdown below.</small>
                                                    </div>
                                                    <span className="rd-tag">Province breakdown</span>
                                                </div>
                                                {region.provinces.slice(0, 5).map((province, provinceIndex) => (
                                                    <button
                                                        type="button"
                                                        key={province.name}
                                                        className={`rd-breakout-row ${activeProvince.name === province.name ? "selected-row" : ""}`}
                                                        onClick={() => selectProvince(province.name, region.name)}
                                                    >
                                                        <span className="rank-number small">{provinceIndex + 1}</span>
                                                        <div className="rank-main">
                                                            <strong>{province.name}</strong>
                                                            <small>{province.orders.toLocaleString()} orders · {province.quantity.toLocaleString()} units</small>
                                                        </div>
                                                        <div className="rank-stat">
                                                            <strong>{money(province.revenue)}</strong>
                                                            <small>Revenue</small>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>

            <section className="rd-card" id="da-categories">
                <div className="rd-card-head between">
                    <div className="rd-card-title-with-icon">
                        <div className="rd-icon green"><FaBoxOpen /></div>
                        <div>
                            <h2>Category Performance</h2>
                            <p>Sales breakdown across standardized product categories.</p>
                        </div>
                    </div>

                    <div className="rd-scope-summary">
                        <span className="rd-scope-label"><FaMapMarkerAlt /> Selected Province Scope</span>
                        <strong>{activeRegion.name} <span>→</span> {activeProvince.name}</strong>
                    </div>
                </div>

                <div className="rd-scope-bar">
                    <div>
                        <span>Region</span>
                        <strong>{activeRegion.name}</strong>
                    </div>
                    <span className="rd-scope-arrow">→</span>
                    <div>
                        <span>Province</span>
                        <strong>{activeProvince.name}</strong>
                    </div>
                    <span className="rd-scope-note">Category results below reflect sales within this province.</span>
                </div>

                <div className="rd-table-wrap">
                    <table className="rd-table">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Revenue</th>
                                <th>Quantity</th>
                                <th>Share</th>
                            </tr>
                        </thead>
                        <tbody>
                            {scopedCategories.map(item => (
                                <tr key={`${item.region || ""}/${item.name}`}>
                                    <td><strong>{item.name}</strong></td>
                                    <td>{money(item.revenue)}</td>
                                    <td>{item.quantity.toLocaleString()}</td>
                                    <td><span className="rd-tag">{item.share.toFixed(1)}%</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="descriptive-handoff">
                <div>
                    <strong>Continue to Demand Forecasts (Predictive Analytics)</strong>
                    <small>Forecast future sales trends and expected product demand by province.</small>
                </div>
                <button type="button" onClick={onViewPredictive}>View Demand Forecasts <span aria-hidden="true">→</span></button>
            </section>
            <footer className="descriptive-footer">
                <button type="button" className="rd-link-button" onClick={refresh}>Refresh data</button>
            </footer>
        </div>
    );
}

function DescriptiveTrendChart({ rows, metric }) {
    const [xInterval, setXInterval] = useState('monthly');
    const [yInterval, setYInterval] = useState('auto');
    const [zoom, setZoom] = useState(1);
    const [expanded, setExpanded] = useState(false);
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const points = rows.map(row => ({ month: row.name, value: Number(row[metric.toLowerCase()]) || 0 }));
    const values = points.map(point => point.value);
    const rawMinimum = Math.min(0, ...values);
    const rawMaximum = Math.max(1, ...values);
    const rawSpan = rawMaximum - rawMinimum || 1;
    const autoInterval = descriptiveNiceInterval(rawSpan / 4);
    const numericYInterval = Number(yInterval);
    const validManualInterval = yInterval !== 'auto' && Number.isFinite(numericYInterval) && numericYInterval > 0;
    const requestedInterval = validManualInterval ? numericYInterval : autoInterval;
    const intervalTooSmall = yInterval !== 'auto' && (!validManualInterval || rawSpan / requestedInterval > 12);
    const axisInterval = intervalTooSmall ? autoInterval : requestedInterval;
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
    const xTicks = thinDescriptiveAxisTicks([...xTickIndices], points.length, xPosition, 60).map(index => ({
        index,
        label: xInterval === 'yearly' ? points[index].month.slice(0, 4) : monthLabel(points[index].month)
    }));
    const yTicks = Array.from({ length: Math.floor((maximum - minimum) / axisInterval) + 1 }, (_, index) => minimum + index * axisInterval);
    const formatValue = value => metric === 'Revenue' ? money(value) : Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 });
    const formatPeriod = month => {
        const date = new Date(`${month}-01T00:00:00Z`);
        return `${new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)} (${month})`;
    };
    const linePoints = points.map((point, index) => `${xPosition(index)},${yPosition(point.value)}`).join(' ');

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

    return <div className={`descriptive-chart-shell ${expanded ? 'expanded' : ''}`}>
        <div className="descriptive-chart-toolbar" aria-label="Chart controls">
            <label><span>X-axis labels</span><select value={xInterval} onChange={event => setXInterval(event.target.value)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
            <label><span>Y-axis interval</span><input type="number" min="0" step="any" value={yInterval === 'auto' ? '' : yInterval} placeholder="Auto" aria-label="Y-axis value interval" onChange={event => setYInterval(event.target.value || 'auto')} /></label>
            <button type="button" className="descriptive-chart-control" onClick={() => setYInterval('auto')} disabled={yInterval === 'auto'}>Auto scale</button>
            <div className="descriptive-chart-zoom" aria-label="Chart zoom controls"><button type="button" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(1, value - 0.5))} disabled={zoom <= 1}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(3, value + 0.5))} disabled={zoom >= 3}>+</button></div>
            {!expanded && <button type="button" className="descriptive-chart-control expand" onClick={() => setExpanded(true)}>Expand chart</button>}
            {expanded && <button type="button" className="descriptive-chart-control expand" onClick={() => setExpanded(false)}>Close expanded chart ×</button>}
        </div>
        {intervalTooSmall && <p className="descriptive-chart-hint" role="status">That interval is too small for this value range, so the axis uses an automatic interval to keep labels readable.</p>}
        <div className="descriptive-chart-scroll"><div className="descriptive-chart-plot">
            {hoveredPoint && <div className="descriptive-chart-tooltip" role="status"><strong>Actual</strong><span>{formatPeriod(hoveredPoint.month)}</span><b>{formatValue(hoveredPoint.value)}</b></div>}
            <svg className="descriptive-chart-svg" style={{ width: zoom > 1 ? `${plotWidth}px` : '100%', height: expanded ? 'min(62vh, 560px)' : undefined }} viewBox={`0 0 ${plotWidth} ${plotHeight}`} role="img" aria-label={`Monthly actual ${metric.toLowerCase()} trend`}>
                {yTicks.map(value => <g key={`y-${value}`}><line x1="64" x2={plotWidth - 26} y1={yPosition(value)} y2={yPosition(value)} className="descriptive-chart-grid" /><text x="56" y={yPosition(value) + 4} textAnchor="end">{formatValue(value)}</text></g>)}
                {points.length > 1 && <polyline points={linePoints} className="descriptive-chart-line" />}
                {points.map((point, index) => <circle key={point.month} cx={xPosition(index)} cy={yPosition(point.value)} r="4.5" tabIndex="0" aria-label={`Actual, ${formatPeriod(point.month)}, ${formatValue(point.value)}`} onPointerEnter={() => setHoveredPoint(point)} onPointerLeave={() => setHoveredPoint(null)} onFocus={() => setHoveredPoint(point)} onBlur={() => setHoveredPoint(null)} className="descriptive-chart-point"><title>{`${formatPeriod(point.month)} · Actual · ${formatValue(point.value)}`}</title></circle>)}
                {xTicks.map(({ index, label }) => <text key={`x-${index}`} x={xPosition(index)} y={plotHeight - 15} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{label}</text>)}
            </svg>
        </div></div>
        <p className="descriptive-chart-caption">Monthly actual {metric.toLowerCase()}. Hover or focus a point to see its month, year, and value. X-axis labels do not change the underlying monthly data.</p>
    </div>;
}

function descriptiveNiceInterval(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const fraction = value / magnitude;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
}

function thinDescriptiveAxisTicks(indices, pointCount, xPosition, minSpacing) {
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

function Kpi({ icon, label, value, detail, tone }) {
    return <div className={`rd-kpi tone-${tone}`}><div className="rd-kpi-icon">{icon}</div><div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div></div>;
}

function Insight({ title, text }) {
    return <div className="rd-insight"><span><FaLightbulb /></span><div><strong>{title}</strong><p>{text}</p></div></div>;
}
