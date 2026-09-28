import { useMemo, useState } from "react";
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

const months = [
    "Dec 24", "Jan 25", "Feb 25", "Mar 25", "Apr 25", "May 25",
    "Jun 25", "Jul 25", "Aug 25", "Sep 25", "Oct 25", "Nov 25"
];

const trendData = {
    Revenue: [8.7, 9.1, 9.4, 9.8, 10.1, 10.5, 10.3, 11.1, 11.4, 11.9, 12.2, 12.8],
    Orders: [712, 748, 781, 805, 832, 861, 846, 902, 935, 961, 989, 1016],
    Quantity: [2310, 2445, 2581, 2704, 2810, 2944, 2892, 3105, 3220, 3341, 3460, 3575]
};

const regionData = [
    {
        name: "South Luzon",
        share: 61.7,
        provinces: [
            { name: "Laguna", revenue: 13.96, orders: 4610, quantity: 17480 },
            { name: "Cavite", revenue: 12.84, orders: 4320, quantity: 16040 },
            { name: "Batangas", revenue: 10.95, orders: 3710, quantity: 13880 },
            { name: "Rizal", revenue: 8.31, orders: 2920, quantity: 10520 },
            { name: "Quezon", revenue: 5.42, orders: 2015, quantity: 7420 }
        ]
    },
    {
        name: "Visayas",
        share: 17.4,
        provinces: [
            { name: "Cebu", revenue: 14.82, orders: 4850, quantity: 18320 },
            { name: "Iloilo", revenue: 8.92, orders: 3190, quantity: 11740 },
            { name: "Negros Occidental", revenue: 5.18, orders: 1960, quantity: 7210 },
            { name: "Leyte", revenue: 3.71, orders: 1420, quantity: 5140 },
            { name: "Bohol", revenue: 3.28, orders: 1280, quantity: 4680 }
        ]
    },
    {
        name: "North Luzon",
        share: 11.8,
        provinces: [
            { name: "Pampanga", revenue: 9.86, orders: 3420, quantity: 12510 },
            { name: "Bulacan", revenue: 7.41, orders: 2715, quantity: 10020 },
            { name: "Pangasinan", revenue: 4.92, orders: 1840, quantity: 6920 },
            { name: "Nueva Ecija", revenue: 3.66, orders: 1395, quantity: 5170 },
            { name: "Tarlac", revenue: 3.12, orders: 1180, quantity: 4310 }
        ]
    },
    {
        name: "Mindanao",
        share: 7.4,
        provinces: [
            { name: "Davao del Sur", revenue: 8.58, orders: 3010, quantity: 10890 },
            { name: "Misamis Oriental", revenue: 4.14, orders: 1580, quantity: 5770 },
            { name: "Cagayan de Oro", revenue: 3.62, orders: 1385, quantity: 5050 },
            { name: "Davao del Norte", revenue: 3.21, orders: 1250, quantity: 4510 },
            { name: "Bukidnon", revenue: 2.64, orders: 1020, quantity: 3650 }
        ]
    },
    {
        name: "Metro Manila",
        share: 1.7,
        provinces: [
            { name: "Manila", revenue: 3.32, orders: 1290, quantity: 4620 },
            { name: "Quezon City", revenue: 2.96, orders: 1155, quantity: 4140 },
            { name: "Pasig", revenue: 2.21, orders: 865, quantity: 3120 },
            { name: "Makati", revenue: 1.94, orders: 742, quantity: 2690 },
            { name: "Taguig", revenue: 1.72, orders: 665, quantity: 2430 }
        ]
    }
];

const allProvinces = regionData.flatMap(region =>
    region.provinces.map(province => ({
        ...province,
        region: region.name
    }))
);

const baseCategories = [
    { name: "Shrink Wrap / Cap Seal", revenue: 11.3, quantity: 36200, share: 24.5 },
    { name: "Plastic Bags", revenue: 9.8, quantity: 41800, share: 22.1 },
    { name: "Bottle / Container", revenue: 7.7, quantity: 22300, share: 16.8 },
    { name: "Tape / Adhesive", revenue: 6.4, quantity: 19600, share: 13.7 },
    { name: "Label / Sticker", revenue: 4.7, quantity: 14100, share: 10.2 }
];

/* Frontend prototype scope data. This can be replaced later by API results. */
const categoryAdjustments = {
    Laguna: [1.06, 1.02, 0.96, 1.01, 0.98],
    Cavite: [0.98, 1.08, 1.02, 0.99, 1.03],
    Batangas: [1.01, 0.97, 1.07, 1.05, 0.96],
    Rizal: [0.95, 1.04, 1.08, 1.01, 1.06],
    Quezon: [0.91, 1.06, 1.00, 1.09, 0.94],
    Cebu: [1.03, 1.04, 1.06, 0.96, 1.01],
    Iloilo: [0.97, 1.06, 1.04, 0.98, 1.02],
    "Negros Occidental": [0.94, 1.01, 1.07, 1.03, 1.00],
    Leyte: [0.91, 1.02, 1.03, 1.05, 0.96],
    Bohol: [0.95, 1.05, 0.99, 1.01, 1.03],
    Pampanga: [1.05, 1.02, 0.99, 1.04, 1.01],
    Bulacan: [1.03, 1.06, 1.01, 1.00, 1.02],
    Pangasinan: [0.96, 1.01, 1.04, 1.05, 0.98],
    "Nueva Ecija": [0.94, 1.03, 1.02, 1.00, 1.05],
    Tarlac: [0.93, 1.04, 1.01, 1.03, 1.00],
    "Davao del Sur": [1.02, 1.05, 1.03, 0.97, 1.01],
    "Misamis Oriental": [0.96, 1.02, 1.05, 1.01, 0.98],
    "Cagayan de Oro": [1.00, 1.04, 1.06, 0.99, 1.02],
    "Davao del Norte": [0.95, 1.05, 1.00, 1.02, 1.03],
    Bukidnon: [0.93, 1.03, 1.02, 1.05, 0.97],
    Manila: [0.98, 1.02, 1.08, 1.04, 1.06],
    "Quezon City": [1.01, 1.03, 1.06, 1.02, 1.04],
    Pasig: [0.99, 1.04, 1.03, 1.02, 1.05],
    Makati: [1.04, 1.01, 1.08, 1.03, 1.06],
    Taguig: [1.02, 1.03, 1.05, 1.01, 1.04]
};

export default function DescriptiveAnalytics() {
    const [metric, setMetric] = useState("Revenue");
    const [geoTab, setGeoTab] = useState("Top Provinces");
    const [selectedRegion, setSelectedRegion] = useState("South Luzon");
    const [selectedProvince, setSelectedProvince] = useState("Laguna");

    const values = trendData[metric];
    const max = Math.max(...values);

    const latest = values[values.length - 1];
    const previous = values[values.length - 2];
    const change = ((latest - previous) / previous) * 100;

    const formattedLatest = useMemo(() => {
        if (metric === "Revenue") return `₱${latest.toFixed(1)}M`;
        return latest.toLocaleString();
    }, [latest, metric]);

    const activeRegion = regionData.find(item => item.name === selectedRegion) || regionData[0];
    const activeProvince = allProvinces.find(item => item.name === selectedProvince && item.region === selectedRegion)
        || activeRegion.provinces[0];

    const scopedCategories = useMemo(() => {
        const multipliers = categoryAdjustments[selectedProvince] || [1, 1, 1, 1, 1];
        return baseCategories.map((item, index) => ({
            ...item,
            revenue: item.revenue * multipliers[index],
            quantity: Math.round(item.quantity * multipliers[index]),
            share: item.share * multipliers[index]
        }));
    }, [selectedProvince]);

    const selectRegion = regionName => {
        const region = regionData.find(item => item.name === regionName);
        if (!region) return;
        setSelectedRegion(regionName);
        setSelectedProvince(region.provinces[0]?.name || "");
    };

    const selectProvince = (provinceName, regionName) => {
        setSelectedRegion(regionName);
        setSelectedProvince(provinceName);
    };

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
                    <strong>Jan 2021 – Nov 2025</strong>
                    <small>Current scope: all available data</small>
                </div>
            </div>

            <div className="rd-kpi-grid four">
                <Kpi icon={<FaMoneyBillWave />} label="Total Revenue" value="₱352.5M" detail="Across prepared transaction lines" tone="blue" />
                <Kpi icon={<FaShoppingCart />} label="Distinct Orders" value="40,014" detail="Order ID counted once" tone="purple" />
                <Kpi icon={<FaCubes />} label="Quantity Sold" value="1.25M" detail="Net quantity available for analysis" tone="green" />
                <Kpi icon={<FaChartLine />} label="Latest Month" value="Nov 2025" detail={`${formattedLatest} ${metric.toLowerCase()} in selected view`} tone="amber" />
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
                            <span>{metric === "Revenue" ? `₱${max.toFixed(0)}M` : Math.round(max).toLocaleString()}</span>
                            <span>{metric === "Revenue" ? "₱0M" : "0"}</span>
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
                                        const x = 10 + index * (580 / (values.length - 1));
                                        const y = 220 - ((value / max) * 190);
                                        return `${x},${y}`;
                                    }).join(" ")}
                                />
                                {values.map((value, index) => {
                                    const x = 10 + index * (580 / (values.length - 1));
                                    const y = 220 - ((value / max) * 190);
                                    return <circle key={index} cx={x} cy={y} r="4.5" fill="white" stroke="currentColor" strokeWidth="3" />;
                                })}
                            </svg>
                            <div className="rd-x-labels">
                                {months.map(item => <span key={item}>{item}</span>)}
                            </div>
                        </div>
                    </div>

                    <div className="rd-trend-foot">
                        <div>
                            <span>Latest</span>
                            <strong>{formattedLatest}</strong>
                        </div>
                        <div className={change >= 0 ? "positive" : "negative"}>
                            {change >= 0 ? <FaArrowUp /> : <FaArrowDown />}
                            {Math.abs(change).toFixed(1)}% vs previous month
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
                                        className={`rd-rank-row rd-rank-button ${selectedProvince === item.name ? "selected-row" : ""}`}
                                        key={item.name}
                                        onClick={() => selectProvince(item.name, item.region)}
                                    >
                                        <span className="rank-number">{index + 1}</span>
                                        <div className="rank-main">
                                            <strong>{item.name}</strong>
                                            <small>{item.region}</small>
                                        </div>
                                        <div className="rank-stat">
                                            <strong>₱{item.revenue.toFixed(2)}M</strong>
                                            <small>{item.orders.toLocaleString()} orders</small>
                                        </div>
                                    </button>
                                ))}
                        </div>
                    ) : (
                        <div className="rd-region-list">
                            {regionData.map((region, index) => {
                                const isOpen = selectedRegion === region.name;
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
                                                        className={`rd-breakout-row ${selectedProvince === province.name ? "selected-row" : ""}`}
                                                        onClick={() => selectProvince(province.name, region.name)}
                                                    >
                                                        <span className="rank-number small">{provinceIndex + 1}</span>
                                                        <div className="rank-main">
                                                            <strong>{province.name}</strong>
                                                            <small>{province.orders.toLocaleString()} orders · {province.quantity.toLocaleString()} units</small>
                                                        </div>
                                                        <div className="rank-stat">
                                                            <strong>₱{province.revenue.toFixed(2)}M</strong>
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
                        <strong>{selectedRegion}</strong>
                    </div>
                    <span className="rd-scope-arrow">→</span>
                    <div>
                        <span>Province</span>
                        <strong>{selectedProvince}</strong>
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
                                <tr key={item.name}>
                                    <td><strong>{item.name}</strong></td>
                                    <td>₱{item.revenue.toFixed(1)}M</td>
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
                        <Insight title="Latest month increased" text="The selected metric is higher than the previous month in the current display." />
                        <Insight title="Demand is geographically concentrated" text={`${activeRegion.name} contributes ${activeRegion.share.toFixed(1)}% of displayed revenue. The selected province is ${activeProvince.name}.`} />
                        <Insight title="Category results follow the selected scope" text={`The category table is currently showing performance within ${selectedRegion} → ${selectedProvince}.`} />
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
