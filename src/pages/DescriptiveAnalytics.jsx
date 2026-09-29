import { useState } from "react";
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
import { DEFAULT_SCOPE, useAnalytics, money, monthLabel } from "../hooks/useAnalytics";

export default function DescriptiveAnalytics({ scope = DEFAULT_SCOPE }) {
    const { data, error, loading, refresh } = useAnalytics(scope);
    const [metric, setMetric] = useState("Revenue");
    const [geoTab, setGeoTab] = useState("Top Provinces");
    const [selectedRegion, setSelectedRegion] = useState("");
    const [selectedProvince, setSelectedProvince] = useState("");
    if (loading || error || !data || !data.summary.rows) {
        return <div className="rd-page"><h1>Descriptive Analytics</h1><div className="rd-card" role={error ? "alert" : "status"}>
            {loading ? "Loading analytics…" : error || (data?.empty ? "Run Data Preparation first." : "No eligible transactions match this scope. Adjust Analysis Controls.")}
            {error && <button onClick={refresh}>Retry</button>}
        </div></div>;
    }
    const regionData = data.regions;
    const allProvinces = regionData.flatMap(region => region.provinces);
    const months = data.trend.map(item => monthLabel(item.name));
    const trendData = Object.fromEntries(["Revenue", "Orders", "Quantity"].map(name => [name, data.trend.map(item => item[name.toLowerCase()])]));
    const values = trendData[metric];
    const max = Math.max(1, ...values);
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

                    <div className="rd-trend-chart">
                        <div className="rd-y-labels">
                            <span>{metric === "Revenue" ? money(max) : Math.round(max).toLocaleString()}</span>
                            <span>{metric === "Revenue" ? "₱0" : "0"}</span>
                        </div>
                        <div className="rd-chart-area">
                            <div className="rd-gridline g1" />
                            <div className="rd-gridline g2" />
                            <div className="rd-gridline g3" />
                            <svg viewBox="0 0 600 240" preserveAspectRatio="none" className="rd-chart-svg">
                                <polyline
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    points={values.map((value, index) => {
                                        const x = 10 + index * (580 / Math.max(1, values.length - 1));
                                        const y = 220 - ((value / max) * 190);
                                        return `${x},${y}`;
                                    }).join(" ")}
                                />
                                {values.map((value, index) => {
                                    const x = 10 + index * (580 / Math.max(1, values.length - 1));
                                    const y = 220 - ((value / max) * 190);
                                    return <circle key={index} cx={x} cy={y} r="4.5" fill="white" stroke="currentColor" strokeWidth="3" />;
                                })}
                            </svg>
                            <div className="rd-x-labels">
                                {months.filter((_, index) => index % Math.max(1, Math.ceil(months.length / 6)) === 0 || index === months.length - 1).map(item => <span key={item}>{item}</span>)}
                            </div>
                        </div>
                    </div>

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

            <div className="rd-grid-two">
                <section className="rd-card">
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

                <section className="rd-card rd-info-card">
                    <FaMapMarkerAlt />
                    <div>
                        <strong>How the geographic drill-down works</strong>
                        <p>Use the Regions tab to open a region and reveal its top five provinces. Selecting a province updates the active scope shown in Category Performance.</p>
                    </div>
                </section>
            </div>
        </div>
    );
}

function Kpi({ icon, label, value, detail, tone }) {
    return <div className={`rd-kpi tone-${tone}`}><div className="rd-kpi-icon">{icon}</div><div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div></div>;
}

function Insight({ title, text }) {
    return <div className="rd-insight"><span><FaLightbulb /></span><div><strong>{title}</strong><p>{text}</p></div></div>;
}
