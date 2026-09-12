import { useMemo, useState } from "react";
import {
    FaArrowDown,
    FaArrowRight,
    FaArrowUp,
    FaCalendarAlt,
    FaChartLine,
    FaCheckCircle,
    FaDownload,
    FaInfoCircle,
    FaMapMarkerAlt,
    FaSyncAlt
} from "react-icons/fa";

import "../styles/predictive-analytics.css";

const forecastData = {
    Demand: { unit: "units", current: "1,248", next: "1,386", three: "4,251", six: "8,824", growth: "+11.1%", direction: "up" },
    Revenue: { unit: "revenue", current: "₱84,320", next: "₱93,760", three: "₱286,900", six: "₱595,400", growth: "+11.2%", direction: "up" },
    Orders: { unit: "orders", current: "312", next: "342", three: "1,058", six: "2,162", growth: "+9.6%", direction: "up" }
};

const provinces = [
    ["Cebu", "1,248", "1,386", "+11.1%", "up"],
    ["Laguna", "1,104", "1,207", "+9.3%", "up"],
    ["Cavite", "982", "978", "-0.4%", "flat"],
    ["Metro Manila", "1,560", "1,505", "-3.5%", "down"],
    ["Davao del Sur", "740", "802", "+8.4%", "up"]
];

function ForecastChart() {
    return (
        <div className="forecast-chart" role="img" aria-label="Demand forecast from January to December 2025">
            <div className="chart-y-labels"><span>1,600</span><span>1,200</span><span>800</span><span>400</span><span>0</span></div>
            <svg viewBox="0 0 760 280" preserveAspectRatio="none" aria-hidden="true">
                {[25, 80, 135, 190, 245].map(y => <line key={y} x1="0" y1={y} x2="760" y2={y} className="chart-grid-line" />)}
                <path d="M0,190 L70,174 L140,182 L210,148 L280,160 L350,126 L420,142 L455,116 L490,103 L525,88 L560,72 L595,62 L630,48 L665,36 L700,27 L735,18 L760,12 L760,245 L0,245 Z" className="forecast-area" />
                <path d="M0,190 L70,174 L140,182 L210,148 L280,160 L350,126 L420,142" className="historical-line" />
                <path d="M420,142 L455,116 L490,103 L525,88 L560,72 L595,62 L630,48 L665,36 L700,27 L735,18 L760,12" className="forecast-line" />
                <line x1="420" y1="0" x2="420" y2="250" className="forecast-divider" />
                <circle cx="420" cy="142" r="5" className="historical-point" />
            </svg>
            <div className="chart-x-labels"><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span></div>
        </div>
    );
}

export default function PredictiveAnalytics() {
    const [metric, setMetric] = useState("Demand");
    const [province, setProvince] = useState("Cebu");
    const [product, setProduct] = useState("All Products");
    const [period, setPeriod] = useState("6 Months");
    const [generated, setGenerated] = useState(false);
    const data = useMemo(() => forecastData[metric], [metric]);

    return (
        <div className="predictive-page">
            <header className="predictive-heading">
                <div>
                    <div className="eyebrow"><FaChartLine /> Analytics / Predictive</div>
                    <h1>Predictive Analytics</h1>
                    <p>Anticipate demand and identify geographic opportunities before they happen.</p>
                </div>
                <button className="export-button"><FaDownload /> Export forecast</button>
            </header>

            <section className="forecast-controls-card">
                <div className="controls-title"><div className="controls-icon"><FaSyncAlt /></div><div><h2>Forecast controls</h2><p>Set the scope of your demand forecast.</p></div></div>
                <div className="forecast-fields">
                    <label>Forecast metric<select value={metric} onChange={e => setMetric(e.target.value)}><option>Demand</option><option>Revenue</option><option>Orders</option></select></label>
                    <label>Province<select value={province} onChange={e => setProvince(e.target.value)}><option>Cebu</option><option>Laguna</option><option>Cavite</option><option>Metro Manila</option></select></label>
                    <label>Product<select value={product} onChange={e => setProduct(e.target.value)}><option>All Products</option><option>Product A</option><option>Product B</option><option>Product C</option></select></label>
                    <label>Forecast period<select value={period} onChange={e => setPeriod(e.target.value)}><option>3 Months</option><option>6 Months</option><option>12 Months</option></select></label>
                    <button className="generate-button" onClick={() => setGenerated(true)}><FaChartLine /> Generate forecast</button>
                </div>
                {generated && <div className="generated-note"><FaCheckCircle /> Forecast updated for {province} · {product} · {period}.</div>}
            </section>

            <section className="predictive-main-grid">
                <article className="forecast-visual-card">
                    <div className="card-heading"><div><h2>{metric} forecast</h2><p>{province} · {product} · Jan–Dec 2025</p></div><div className="chart-legend"><span><i className="legend historical" /> Historical</span><span><i className="legend forecast" /> Forecast</span></div></div>
                    <ForecastChart />
                    <div className="forecast-annotation"><FaCalendarAlt /><span>Forecast begins Jul 2025</span><strong>Confidence interval: 82–90%</strong></div>
                </article>

                <article className="forecast-summary-card">
                    <div className="card-heading"><div><h2>Forecast summary</h2><p>Selected forecast at a glance</p></div><FaInfoCircle className="muted-icon" /></div>
                    <div className="summary-location"><span><FaMapMarkerAlt /></span><div><small>Forecast for</small><strong>{province}</strong><em>{product}</em></div></div>
                    <div className="trend-panel"><span className={`trend-icon ${data.direction}`}><FaArrowUp /></span><div><small>Forecast trend</small><strong>Increasing</strong><p>{data.growth} vs. current period</p></div></div>
                    <div className="summary-values"><div><span>Next month</span><strong>{data.next}</strong><small>{data.unit}</small></div><div><span>Next 3 months</span><strong>{data.three}</strong><small>{data.unit}</small></div><div><span>Next 6 months</span><strong>{data.six}</strong><small>{data.unit}</small></div></div>
                </article>
            </section>

            <section className="ranking-card">
                <div className="card-heading"><div><h2>Forecast ranking by province</h2><p>Expected {metric.toLowerCase()} performance for the next period</p></div><button className="view-all-button">View geographic analysis <FaArrowRight /></button></div>
                <div className="ranking-table-wrap"><table className="forecast-ranking"><thead><tr><th>Rank</th><th>Province</th><th>Current demand</th><th>Forecast demand</th><th>Expected trend</th><th>Forecast confidence</th></tr></thead><tbody>{provinces.map(([name, current, forecast, change, trend], index) => <tr key={name}><td><span className={`rank rank-${index + 1}`}>{index + 1}</span></td><td><strong>{name}</strong></td><td>{current}</td><td><strong className="forecast-value">{forecast}</strong></td><td><span className={`trend-badge ${trend}`}>{trend === "up" ? <FaArrowUp /> : trend === "down" ? <FaArrowDown /> : <FaArrowRight />}{change}</span></td><td><div className="confidence"><i style={{ width: `${91 - index * 3}%` }} /><span>{91 - index * 3}%</span></div></td></tr>)}</tbody></table></div>
            </section>

            <section className="model-card"><div className="model-title"><span><FaCheckCircle /></span><div><h2>Model information</h2><p>Forecast quality and data coverage for this analysis.</p></div></div><div className="model-stats"><div><span>Model used</span><strong>Seasonal trend model</strong></div><div><span>Data points used</span><strong>36 monthly observations</strong></div><div><span>Error metric</span><strong>MAPE <b>8.4%</b></strong></div><div><span>Model status</span><strong className="model-ready"><FaCheckCircle /> Ready</strong></div></div></section>
        </div>
    );
}
