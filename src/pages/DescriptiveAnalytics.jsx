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
    FaMapMarkerAlt
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
            {loading ? "Loading analytics…" : error || (data?.empty ? "Run Data Preparation first." : "No eligible transactions match this scope. Adjust Analytics Scope.")}
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

    return (
        <div className="rd-page">
            <div className="rd-header">
                <div>
                    <span className="rd-eyebrow">DESCRIPTIVE ANALYTICS</span>
                    <h1>Descriptive Analytics</h1>
                    <p>Understand historical demand, revenue, order activity, and geographic concentration.</p>
                </div>
                <div className="rd-header-note">
                    <span>Active period</span>
                    <strong>{months[0]} – {months.at(-1)}</strong>
                    <small>{scope.region} · {scope.province} · {scope.returns} · {scope.categories === null ? "All categories" : `${scope.categories.length} categories`}</small>
                </div>
            </div>

            <div className="rd-kpi-grid four">
                <Kpi icon={<FaMoneyBillWave />} label="Total Revenue" value={money(data.summary.revenue)} detail="Across prepared transaction lines" tone="blue" />
                <Kpi icon={<FaShoppingCart />} label="Distinct Orders" value={data.summary.orders.toLocaleString()} detail="Order ID counted once" tone="purple" />
                <Kpi icon={<FaCubes />} label="Quantity Sold" value={data.summary.quantity.toLocaleString()} detail="Net quantity available for analysis" tone="green" />
                <Kpi icon={<FaChartLine />} label="Latest Month" value={months.at(-1) || "No dated rows"} detail={`${formattedLatest} ${metric.toLowerCase()} in selected view`} tone="amber" />
            </div>

            <div className="rd-grid-two">
                <section className="rd-card">
                    <div className="rd-card-head between">
                        <div>
                            <h2>Historical Trend</h2>
                            <p>Use one metric at a time to keep the trend readable.</p>
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
                            {change === null ? "No previous nonzero month for comparison" : `${Math.abs(change).toFixed(1)}% vs previous month`}
                        </div>
                    </div>
                </section>

                <section className="rd-card">
                    <div className="rd-card-head between">
                        <div>
                            <h2>Geographic Performance</h2>
                            <p>Concentration by the analytical Region → Province hierarchy.</p>
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
                                                <small>{region.share.toFixed(1)}% of displayed revenue</small>
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
                                                        <small>Click a province to use it as the active descriptive scope.</small>
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

            <section className="rd-card">
                <div className="rd-card-head between">
                    <div className="rd-card-title-with-icon">
                        <div className="rd-icon green"><FaBoxOpen /></div>
                        <div>
                            <h2>Category Performance</h2>
                            <p>Controlled categories make long product listings easier to interpret.</p>
                        </div>
                    </div>

                    <div className="rd-scope-summary">
                        <span className="rd-scope-label"><FaMapMarkerAlt /> Current geographic scope</span>
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
                    <span className="rd-scope-note">Category results below are shown within this selected scope.</span>
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

            <section className="rd-card descriptive-insights-card">
                    <div className="rd-card-head">
                        <div className="rd-icon amber"><FaLightbulb /></div>
                        <div>
                            <h2>Computed Insights</h2>
                            <p>Rule-based observations from the current descriptive view.</p>
                        </div>
                    </div>
                    <div className="rd-insights">
                        <Insight title={change === null ? "Monthly comparison unavailable" : change > 0 ? "Latest month increased" : change < 0 ? "Latest month decreased" : "Latest month unchanged"} text={change === null ? "A previous nonzero month is required to calculate percentage change." : `The selected metric changed by ${change.toFixed(1)}% versus the previous month.`} />
                        <Insight title="Demand is geographically concentrated" text={`${activeRegion.name} contributes ${activeRegion.share.toFixed(1)}% of displayed revenue. The selected province is ${activeProvince.name}.`} />
                        <Insight title="Category results follow the selected scope" text={`The category table is currently showing performance within ${activeRegion.name} → ${activeProvince.name}.`} />
                        <Insight title="Use category drill-down for sparse products" text="Long product titles and thin product-province combinations are better examined after category-level analysis." />
                    </div>
            </section>

            <section className="descriptive-handoff">
                <div>
                    <strong>Continue to Predictive Analytics</strong>
                    <small>Predictive Analytics uses historical patterns to estimate future demand.</small>
                </div>
                <button type="button" onClick={onViewPredictive}>View Predictive Analytics <span aria-hidden="true">→</span></button>
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
