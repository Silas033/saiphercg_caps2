import { useMemo, useState } from "react";
import {
    FaChartLine,
    FaCalendarAlt,
    FaCheckCircle,
    FaInfoCircle,
    FaMapMarkerAlt,
    FaBoxOpen,
    FaExclamationCircle
} from "react-icons/fa";

import "../styles/analytics-redesign.css";

const forecastMonths = [
    "Dec 25", "Jan 26", "Feb 26", "Mar 26", "Apr 26", "May 26",
    "Jun 26", "Jul 26", "Aug 26", "Sep 26", "Oct 26", "Nov 26"
];

const history = [
    42, 44, 46, 47, 50, 51, 50, 54, 56, 58, 60, 63,
    61, 64, 68, 70, 73, 72, 76, 78, 81, 84, 86, 89
];

const forecast = [64, 67, 69, 72, 74, 77, 80, 82, 85, 88, 91, 94];
const low = [58, 60, 61, 63, 64, 66, 68, 69, 71, 73, 75, 77];
const high = [70, 74, 77, 81, 84, 88, 92, 95, 99, 103, 107, 111];

const provinceForecasts = [
    ["Cebu", 142800, 151900, 6.4],
    ["Laguna", 134500, 142700, 6.1],
    ["Cavite", 126400, 133700, 5.8],
    ["Batangas", 114900, 121100, 5.4],
    ["Pampanga", 102500, 107800, 5.2]
];

const categoryForecasts = [
    ["Plastic Bags", 278400, 294900, 5.9],
    ["Shrink Wrap / Cap Seal", 248200, 265800, 7.1],
    ["Bottle / Container", 183700, 194900, 6.1],
    ["Tape / Adhesive", 151900, 160200, 5.5],
    ["Label / Sticker", 112400, 118300, 5.2]
];

export default function PredictiveAnalytics() {
    const [tab, setTab] = useState("results");
    const [horizon, setHorizon] = useState(12);
    const [level, setLevel] = useState("Total Demand");
    const [model, setModel] = useState("Seasonal ARIMA");

    const horizonMonths = horizon === 6 ? forecastMonths.slice(0, 6) : forecastMonths;
    const visibleForecast = horizon === 6 ? forecast.slice(0, 6) : forecast;
    const latest = history[history.length - 1];
    const projectedEnd = visibleForecast[visibleForecast.length - 1];
    const projectedGrowth = ((projectedEnd - latest) / latest) * 100;

    const chart = useMemo(() => {
        const all = [...history, ...visibleForecast];
        const max = Math.max(...all);
        const min = Math.min(...all);
        const range = max - min || 1;
        const points = all.map((value, index) => {
            const x = 8 + index * (584 / (all.length - 1));
            const y = 215 - ((value - min) / range) * 180;
            return { x, y, value };
        });
        return { points, split: history.length - 1, max, min };
    }, [visibleForecast]);

    return (
        <div className="rd-page">
            <div className="rd-header">
                <div>
                    <span className="rd-eyebrow">PREDICTIVE ANALYTICS</span>
                    <h1>Predictive Analytics</h1>
                    <p>Project future demand from the available historical series and report forecast uncertainty honestly.</p>
                </div>
                <div className="rd-header-note">
                    <span>Forecast starts after</span>
                    <strong>Nov 2025</strong>
                    <small>Dynamic horizon — not a fixed 2026–2027 window</small>
                </div>
            </div>

            <div className="rd-tabbar">
                <button className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}><FaCalendarAlt /> Forecast Setup</button>
                <button className={tab === "results" ? "active" : ""} onClick={() => setTab("results")}><FaChartLine /> Forecast Results</button>
            </div>

            {tab === "setup" ? (
                <Setup
                    horizon={horizon}
                    setHorizon={setHorizon}
                    level={level}
                    setLevel={setLevel}
                    model={model}
                    setModel={setModel}
                    onGenerate={() => setTab("results")}
                />
            ) : (
                <>
                    <div className="rd-kpi-grid four">
                        <Kpi label="Forecast Period" value={`Next ${horizon} months`} sub={`Starts Dec 2025`} />
                        <Kpi label="Backtest MAPE" value="8.7%" sub="Prototype validation result" />
                        <Kpi label="Projected End Value" value={projectedEnd.toFixed(0)} sub={`${level.toLowerCase()} index`} />
                        <Kpi label="Projected Change" value={`+${projectedGrowth.toFixed(1)}%`} sub="Latest actual → horizon end" />
                    </div>

                    <section className="rd-card">
                        <div className="rd-card-head between">
                            <div>
                                <h2>Historical vs Forecast</h2>
                                <p>Historical observations are separated from projected values. Shading represents an illustrative confidence band.</p>
                            </div>
                            <div className="rd-inline-badges"><span className="rd-tag">{model}</span><span className="rd-tag muted">Prototype values</span></div>
                        </div>

                        <div className="rd-forecast-chart">
                            <svg viewBox="0 0 600 260" preserveAspectRatio="none">
                                <line x1="8" y1="220" x2="592" y2="220" className="axis" />
                                <line x1="8" y1="35" x2="592" y2="35" className="grid" />
                                <line x1="8" y1="97" x2="592" y2="97" className="grid" />
                                <line x1="8" y1="158" x2="592" y2="158" className="grid" />
                                <polygon
                                    className="forecast-band"
                                    points={visibleForecast.map((_, i) => {
                                        const x = 8 + (history.length - 1 + i) * (584 / (history.length + visibleForecast.length - 1));
                                        const y = 215 - ((high[i] - chart.min) / (chart.max - chart.min || 1)) * 180;
                                        return `${x},${y}`;
                                    }).concat(
                                        visibleForecast.map((_, i) => {
                                            const idx = visibleForecast.length - 1 - i;
                                            const x = 8 + (history.length - 1 + idx) * (584 / (history.length + visibleForecast.length - 1));
                                            const y = 215 - ((low[idx] - chart.min) / (chart.max - chart.min || 1)) * 180;
                                            return `${x},${y}`;
                                        })
                                    ).join(" ")}
                                />
                                <polyline
                                    className="historical-line"
                                    points={history.map((value, i) => `${chart.points[i].x},${chart.points[i].y}`).join(" ")}
                                />
                                <polyline
                                    className="forecast-line"
                                    points={visibleForecast.map((value, i) => `${chart.points[history.length - 1 + i].x},${chart.points[history.length - 1 + i].y}`).join(" ")}
                                />
                                <line
                                    x1={chart.points[history.length - 1].x}
                                    y1="35"
                                    x2={chart.points[history.length - 1].x}
                                    y2="220"
                                    className="split-line"
                                />
                                <text x={chart.points[history.length - 1].x + 8} y="50" className="split-label">LAST ACTUAL</text>
                            </svg>
                            <div className="rd-forecast-legend"><span><i className="history-dot" /> Historical</span><span><i className="forecast-dot" /> Forecast</span><span><i className="band-dot" /> Confidence band</span></div>
                        </div>
                    </section>

                    <div className="rd-grid-two">
                        <ForecastTable title="Top Provinces by Forecasted Demand" icon={<FaMapMarkerAlt />} rows={provinceForecasts} />
                        <ForecastTable title="Top Categories by Forecasted Demand" icon={<FaBoxOpen />} rows={categoryForecasts} />
                    </div>

                    <section className="rd-card rd-warning-card">
                        <FaInfoCircle />
                        <div>
                            <strong>Forecast scope rule</strong>
                            <p>Only total demand, category demand, regions, and top-N provinces should be forecast reliably. Thin province/product combinations should display “Insufficient history” rather than an unsupported numerical forecast.</p>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

function Setup({ horizon, setHorizon, level, setLevel, model, setModel, onGenerate }) {
    return (
        <div className="rd-grid-two">
            <section className="rd-card">
                <div className="rd-card-head"><div className="rd-icon blue"><FaCalendarAlt /></div><div><h2>Forecast Setup</h2><p>Set the forecasting scope while keeping the end date tied to the latest loaded month.</p></div></div>
                <label className="rd-field"><span>Forecast horizon</span><select value={horizon} onChange={event => setHorizon(Number(event.target.value))}><option value={6}>Next 6 months</option><option value={12}>Next 12 months</option></select></label>
                <label className="rd-field"><span>Forecast level</span><select value={level} onChange={event => setLevel(event.target.value)}><option>Total Demand</option><option>Category</option><option>Region</option><option>Top Provinces</option></select></label>
                <label className="rd-field"><span>Model</span><select value={model} onChange={event => setModel(event.target.value)}><option>Seasonal ARIMA</option><option>Holt-Winters / ETS</option></select></label>
                <div className="rd-note"><FaCheckCircle /><span>Historical depth is sufficient for multi-year seasonality in the full dataset prototype.</span></div>
                <button className="rd-primary-button" onClick={onGenerate}>Generate Forecast <FaChartLine /></button>
            </section>

            <section className="rd-card">
                <div className="rd-card-head"><div className="rd-icon purple"><FaInfoCircle /></div><div><h2>Validation Rules</h2><p>These labels explain what makes a forecast usable.</p></div></div>
                <div className="rd-rule-list">
                    <Rule title="Backtesting" text="Reserve a recent historical window to calculate forecast error such as MAPE or MAE." />
                    <Rule title="Dynamic horizon" text="Forecast from the month after the latest available record instead of hard-coding a calendar year." />
                    <Rule title="Top-N coverage" text="Use top provinces/categories for detailed outputs and show insufficient history for sparse series." />
                    <Rule title="Uncertainty" text="Display a confidence band so the chart does not imply exact future values." />
                </div>
            </section>
        </div>
    );
}

function Rule({ title, text }) {
    return <div className="rd-rule"><span><FaCheckCircle /></span><div><strong>{title}</strong><p>{text}</p></div></div>;
}

function Kpi({ label, value, sub }) {
    return <div className="rd-kpi tone-blue"><div className="rd-kpi-icon"><FaChartLine /></div><div><small>{label}</small><strong>{value}</strong><span>{sub}</span></div></div>;
}

function ForecastTable({ title, icon, rows }) {
    return <section className="rd-card"><div className="rd-card-head"><div className="rd-icon green">{icon}</div><div><h2>{title}</h2><p>Top-N only; thin series can be marked insufficient.</p></div></div><div className="rd-table-wrap"><table className="rd-table"><thead><tr><th>#</th><th>Area</th><th>Trailing actual</th><th>Forecast</th><th>Growth</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row[0]}><td>{index + 1}</td><td><strong>{row[0]}</strong></td><td>{row[1].toLocaleString()}</td><td>{row[2].toLocaleString()}</td><td><span className="positive">+{row[3].toFixed(1)}%</span></td></tr>)}</tbody></table></div></section>;
}
