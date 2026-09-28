import { useMemo, useState } from "react";
import {
    FaChartBar,
    FaChartLine,
    FaBoxOpen,
    FaCrosshairs,
    FaLightbulb,
    FaCheckCircle,
    FaInfoCircle
} from "react-icons/fa";

import "../styles/analytics-redesign.css";

const baseRows = [
    { id: 1, province: "Cebu", region: "Visayas", category: "Plastic Bags", performance: 88, growth: 79, demand: 94, whitespace: 83, orders: 2481, quantity: 8421, forecast: 9210, nationalShare: 24.1, provinceShare: 15.7 },
    { id: 2, province: "Laguna", region: "South Luzon", category: "Shrink Wrap / Cap Seal", performance: 84, growth: 82, demand: 91, whitespace: 78, orders: 2290, quantity: 8142, forecast: 8930, nationalShare: 22.5, provinceShare: 16.8 },
    { id: 3, province: "Cavite", region: "South Luzon", category: "Bottle / Container", performance: 81, growth: 76, demand: 89, whitespace: 86, orders: 2182, quantity: 7524, forecast: 8105, nationalShare: 18.2, provinceShare: 11.6 },
    { id: 4, province: "Batangas", region: "South Luzon", category: "Plastic Bags", performance: 79, growth: 81, demand: 86, whitespace: 80, orders: 2058, quantity: 7315, forecast: 8012, nationalShare: 24.1, provinceShare: 17.1 },
    { id: 5, province: "Pampanga", region: "North Luzon", category: "Tape / Adhesive", performance: 75, growth: 73, demand: 82, whitespace: 88, orders: 1870, quantity: 6220, forecast: 6775, nationalShare: 13.7, provinceShare: 8.8 },
    { id: 6, province: "Iloilo", region: "Visayas", category: "Label / Sticker", performance: 72, growth: 77, demand: 78, whitespace: 90, orders: 1684, quantity: 5810, forecast: 6420, nationalShare: 10.2, provinceShare: 6.9 }
];

export default function PrescriptiveAnalytics() {
    const [weights, setWeights] = useState({ performance: 30, growth: 25, demand: 25, whitespace: 20 });
    const [threshold, setThreshold] = useState(20);
    const [selectedId, setSelectedId] = useState(1);
    const [view, setView] = useState("ranking");

    const scored = useMemo(() => {
        return baseRows
            .filter(item => item.orders >= threshold)
            .map(item => ({
                ...item,
                score: (
                    item.performance * weights.performance +
                    item.growth * weights.growth +
                    item.demand * weights.demand +
                    item.whitespace * weights.whitespace
                ) / 100
            }))
            .sort((a, b) => b.score - a.score);
    }, [weights, threshold]);

    const selected = scored.find(item => item.id === selectedId) || scored[0];

    function changeWeight(key, value) {
        const next = Number(value);
        const others = Object.keys(weights).filter(item => item !== key);
        const remainder = Math.max(0, 100 - next);
        const currentOthers = others.reduce((sum, item) => sum + weights[item], 0) || 1;
        const updated = { ...weights, [key]: next };
        let left = remainder;
        others.forEach((item, index) => {
            if (index === others.length - 1) {
                updated[item] = Math.max(0, left);
            } else {
                const allocation = Math.round((weights[item] / currentOthers) * remainder);
                updated[item] = allocation;
                left -= allocation;
            }
        });
        setWeights(updated);
    }

    return (
        <div className="rd-page">
            <div className="rd-header">
                <div>
                    <span className="rd-eyebrow">PRESCRIPTIVE ANALYTICS</span>
                    <h1>Prescriptive Analytics</h1>
                    <p>Prioritize province × category opportunities using weighted internal evidence.</p>
                </div>
                <div className="rd-header-note">
                    <span>Opportunity basis</span>
                    <strong>Internal transaction evidence</strong>
                    <small>Not an external market-size estimate</small>
                </div>
            </div>

            <div className="rd-tabbar">
                <button className={view === "ranking" ? "active" : ""} onClick={() => setView("ranking")}><FaChartBar /> Opportunity Ranking</button>
                <button className={view === "method" ? "active" : ""} onClick={() => setView("method")}><FaInfoCircle /> Method & Evidence</button>
            </div>

            {view === "method" ? (
                <MethodPanel weights={weights} />
            ) : (
                <>
                    <div className="rd-grid-two">
                        <section className="rd-card">
                            <div className="rd-card-head"><div className="rd-icon blue"><FaChartBar /></div><div><h2>Strategy Weights</h2><p>Normalize each factor to a 0–100 scale before combining them into the Regional Opportunity Score.</p></div></div>
                            <WeightRow label="Current Performance" sub="Historical performance in the province-category pair" value={weights.performance} tone="blue" onChange={value => changeWeight("performance", value)} />
                            <WeightRow label="Future Growth" sub="Projected demand growth" value={weights.growth} tone="green" onChange={value => changeWeight("growth", value)} />
                            <WeightRow label="Category Demand" sub="Demand strength for the category" value={weights.demand} tone="purple" onChange={value => changeWeight("demand", value)} />
                            <WeightRow label="Whitespace / Penetration Gap" sub="Under-representation versus national category share" value={weights.whitespace} tone="amber" onChange={value => changeWeight("whitespace", value)} />
                            <div className="rd-total-row"><span>Total</span><strong>{Object.values(weights).reduce((a, b) => a + b, 0)}%</strong></div>
                        </section>

                        <section className="rd-card">
                            <div className="rd-card-head"><div className="rd-icon amber"><FaCrosshairs /></div><div><h2>Scoring Guardrail</h2><p>Prevent small-volume provinces from being lifted by unusually high growth rates.</p></div></div>
                            <label className="rd-field"><span>Minimum historical orders</span><input type="number" min="0" step="1" value={threshold} onChange={event => setThreshold(Number(event.target.value) || 0)} /></label>
                            <div className="rd-note"><FaInfoCircle /><span>Rows below this threshold are excluded from the prototype ranking.</span></div>
                            <div className="rd-guardrail-box"><strong>{scored.length}</strong><span>province × category opportunities currently eligible for scoring</span></div>
                            <div className="rd-method-chip"><FaCheckCircle /> WSM / weighted-sum concept</div>
                        </section>
                    </div>

                    <section className="rd-card">
                        <div className="rd-card-head between">
                            <div><h2>Province × Category Opportunities</h2><p>Category-level opportunities reduce sparse raw product combinations and keep the prioritization interpretable.</p></div>
                            <span className="rd-tag">Internal estimate</span>
                        </div>
                        <div className="rd-table-wrap">
                            <table className="rd-table rd-opportunity-table">
                                <thead><tr><th>#</th><th>Province</th><th>Category</th><th>Orders</th><th>Score</th><th>Evidence</th></tr></thead>
                                <tbody>
                                    {scored.map((row, index) => (
                                        <tr key={row.id} className={selected?.id === row.id ? "selected-row" : ""} onClick={() => setSelectedId(row.id)}>
                                            <td>{index + 1}</td>
                                            <td><strong>{row.province}</strong><small>{row.region}</small></td>
                                            <td>{row.category}</td>
                                            <td>{row.orders.toLocaleString()}</td>
                                            <td><span className="score-badge">{row.score.toFixed(1)}</span></td>
                                            <td><button className="rd-link-button" onClick={event => { event.stopPropagation(); setSelectedId(row.id); }}>{selected?.id === row.id ? "Selected" : "View evidence"}</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {selected && <EvidencePanel row={selected} weights={weights} />}

                    <section className="rd-card rd-info-card">
                        <FaLightbulb />
                        <div>
                            <strong>How to interpret “whitespace”</strong>
                            <p>A province-category pair receives a higher whitespace value when its observed category share is weaker than the category's national share. It is an internal penetration-gap estimate, not measured market size, market share, or a statement about untapped external demand.</p>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

function WeightRow({ label, sub, value, tone, onChange }) {
    return <div className="rd-weight-row"><div className={`rd-weight-icon ${tone}`}><FaChartLine /></div><div className="rd-weight-label"><strong>{label}</strong><small>{sub}</small></div><input type="range" min="0" max="100" value={value} onChange={event => onChange(event.target.value)} /><span className="rd-weight-value">{value}%</span></div>;
}

function EvidencePanel({ row, weights }) {
    const parts = [
        ["Current Performance", row.performance, weights.performance],
        ["Future Growth", row.growth, weights.growth],
        ["Category Demand", row.demand, weights.demand],
        ["Whitespace / Gap", row.whitespace, weights.whitespace]
    ];

    return (
        <section className="rd-card">
            <div className="rd-card-head"><div className="rd-icon purple"><FaLightbulb /></div><div><h2>Why this opportunity is prioritized</h2><p>{row.province} × {row.category} is selected so every component can be traced to an input.</p></div></div>
            <div className="rd-evidence-grid">
                <div className="rd-score-hero"><span>Regional Opportunity Score</span><strong>{row.score.toFixed(1)}</strong><small>0–100 weighted index</small></div>
                <div className="rd-breakdown">{parts.map(([label, score, weight]) => <div className="rd-breakdown-row" key={label}><span>{label}</span><div className="rd-progress"><span style={{ width: `${score}%` }} /></div><strong>{score}</strong><small>{weight}% wt.</small></div>)}</div>
            </div>
            <div className="rd-evidence-bottom">
                <Metric label="Historical Orders" value={row.orders.toLocaleString()} />
                <Metric label="Historical Quantity" value={row.quantity.toLocaleString()} />
                <Metric label="Projected Demand" value={row.forecast.toLocaleString()} />
                <Metric label="National Category Share" value={`${row.nationalShare.toFixed(1)}%`} />
                <Metric label="Province Category Share" value={`${row.provinceShare.toFixed(1)}%`} />
            </div>
        </section>
    );
}

function Metric({ label, value }) {
    return <div className="rd-evidence-metric"><small>{label}</small><strong>{value}</strong></div>;
}

function MethodPanel({ weights }) {
    return <div className="rd-grid-two"><section className="rd-card"><div className="rd-card-head"><div className="rd-icon blue"><FaInfoCircle /></div><div><h2>Prescriptive Method</h2><p>The interface expresses the scoring logic without claiming unavailable external market data.</p></div></div><div className="rd-method-flow"><span>Normalize factors</span><b>→</b><span>Apply weights</span><b>→</b><span>Compute ROS</span><b>→</b><span>Explain evidence</span></div><div className="rd-note"><FaInfoCircle /><span>Current default weights: {weights.performance}% performance, {weights.growth}% growth, {weights.demand}% category demand, {weights.whitespace}% whitespace.</span></div></section><section className="rd-card"><div className="rd-card-head"><div className="rd-icon green"><FaCheckCircle /></div><div><h2>What the system does not claim</h2><p>These limitations are intentionally visible in the UI.</p></div></div><div className="rd-limit-list"><div>It does not estimate external market size.</div><div>It does not infer management's strategic priorities unless they are entered separately.</div><div>It does not rank sparse province-product combinations as if they were equally reliable.</div><div>It does not present a forecast for every product and province.</div></div></section></div>;
}