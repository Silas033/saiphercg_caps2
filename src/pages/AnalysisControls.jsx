import { useMemo, useState } from "react";
import {
    FaCalendarAlt,
    FaUndo,
    FaMapMarkerAlt,
    FaLayerGroup,
    FaBoxOpen,
    FaCheckCircle,
    FaInfoCircle,
    FaArrowRight,
    FaTimes
} from "react-icons/fa";

import "../styles/analytics-redesign.css";

const CATEGORIES = [
    "Shrink Wrap / Cap Seal",
    "Bottle / Container",
    "Tape / Adhesive",
    "Label / Sticker",
    "Mailer / Shipping Packaging",
    "Protective Packaging",
    "Plastic Bags",
    "Packaging Accessories",
    "Packaging / General Supplies",
    "Other / Unclassified"
];

const REGIONS = [
    "All Regions",
    "Metro Manila",
    "North Luzon",
    "South Luzon",
    "Visayas",
    "Mindanao"
];

export default function AnalysisControls({ setActivePage }) {
    const [period, setPeriod] = useState("All Available Data");
    const [returns, setReturns] = useState("Include All");
    const [region, setRegion] = useState("All Regions");
    const [province, setProvince] = useState("All Provinces");
    const [selectedCategories, setSelectedCategories] = useState(CATEGORIES);

    const provinces = useMemo(() => {
        if (region === "Metro Manila") return ["All Provinces", "Metro Manila"];
        if (region === "North Luzon") return ["All Provinces", "Aurora", "Bulacan", "Pampanga", "Pangasinan"];
        if (region === "South Luzon") return ["All Provinces", "Batangas", "Cavite", "Laguna", "Quezon", "Rizal"];
        if (region === "Visayas") return ["All Provinces", "Cebu", "Iloilo", "Leyte", "Negros Occidental"];
        if (region === "Mindanao") return ["All Provinces", "Davao del Sur", "Misamis Oriental", "Zamboanga del Sur"];
        return ["All Provinces", "Aurora", "Batangas", "Cavite", "Cebu", "Laguna", "Iloilo", "Pampanga", "Quezon", "Rizal"];
    }, [region]);

    function toggleCategory(category) {
        setSelectedCategories(current => {
            if (current.includes(category)) {
                return current.filter(item => item !== category);
            }
            return [...current, category];
        });
    }

    function clearSelections() {
        setSelectedCategories([]);
    }

    function selectAll() {
        setSelectedCategories(CATEGORIES);
    }

    function applyControls() {
        if (setActivePage) {
            setActivePage("descriptive-analytics");
        }
    }

    const periodText = period === "All Available Data"
        ? "Jan 2021 – Nov 2025"
        : period;

    return (
        <div className="rd-page">
            <div className="rd-header">
                <div>
                    <span className="rd-eyebrow">ANALYSIS SCOPE</span>
                    <h1>Analysis Controls</h1>
                    <p>Set the same analytical scope before reviewing historical performance, forecasts, and opportunity priorities.</p>
                </div>
                <div className="rd-header-note">
                    <span>Current dataset</span>
                    <strong>Jan 2021 – Nov 2025</strong>
                    <small>59 months of demand history</small>
                </div>
            </div>

            <div className="rd-control-layout">
                <div className="rd-stack">
                    <section className="rd-card">
                        <div className="rd-card-head">
                            <div className="rd-icon blue"><FaCalendarAlt /></div>
                            <div>
                                <h2>Analysis Period</h2>
                                <p>Choose the historical window used by descriptive and predictive views.</p>
                            </div>
                        </div>

                        <div className="rd-option-grid four">
                            {[
                                "All Available Data",
                                "Last 12 Months",
                                "Last 24 Months",
                                "Custom Range"
                            ].map(option => (
                                <button
                                    key={option}
                                    className={`rd-option ${period === option ? "active" : ""}`}
                                    onClick={() => setPeriod(option)}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>

                        <div className="rd-date-summary">
                            <span>Selected period</span>
                            <strong>{periodText}</strong>
                        </div>
                    </section>

                    <section className="rd-card">
                        <div className="rd-card-head">
                            <div className="rd-icon amber"><FaUndo /></div>
                            <div>
                                <h2>Returns / Refunds</h2>
                                <p>Choose whether returned quantities remain visible in the analytical scope.</p>
                            </div>
                        </div>

                        <div className="rd-choice-row">
                            {["Include All", "Exclude Approved Returns", "Returned / Refunded Only"].map(option => (
                                <button
                                    key={option}
                                    className={`rd-choice ${returns === option ? "active" : ""}`}
                                    onClick={() => setReturns(option)}
                                >
                                    <span>{option}</span>
                                    {returns === option && <FaCheckCircle />}
                                </button>
                            ))}
                        </div>

                        <div className="rd-note">
                            <FaInfoCircle />
                            <span>The control changes the quantity and return treatment used by downstream analytics. Order Status remains an ETL/data-quality attribute rather than a user-facing analysis filter.</span>
                        </div>
                    </section>

                    <section className="rd-card">
                        <div className="rd-card-head">
                            <div className="rd-icon purple"><FaMapMarkerAlt /></div>
                            <div>
                                <h2>Geographic Scope</h2>
                                <p>Use the project's analytical hierarchy: Region → Province.</p>
                            </div>
                        </div>

                        <div className="rd-field-grid two">
                            <label className="rd-field">
                                <span>Region</span>
                                <select value={region} onChange={event => { setRegion(event.target.value); setProvince("All Provinces"); }}>
                                    {REGIONS.map(item => <option key={item}>{item}</option>)}
                                </select>
                            </label>

                            <label className="rd-field">
                                <span>Province</span>
                                <select value={province} onChange={event => setProvince(event.target.value)}>
                                    {provinces.map(item => <option key={item}>{item}</option>)}
                                </select>
                            </label>
                        </div>

                        <div className="rd-scope-pill">
                            <FaMapMarkerAlt />
                            <span>{region}{province !== "All Provinces" ? ` • ${province}` : ""}</span>
                        </div>
                    </section>

                    <section className="rd-card">
                        <div className="rd-card-head">
                            <div className="rd-icon green"><FaBoxOpen /></div>
                            <div>
                                <h2>Product Scope</h2>
                                <p>Use controlled categories for cross-page analysis. Raw product titles remain source detail.</p>
                            </div>
                        </div>

                        <div className="rd-selection-tools">
                            <button onClick={selectAll}>Select all</button>
                            <button onClick={clearSelections}>Clear</button>
                            <span>{selectedCategories.length} of {CATEGORIES.length} selected</span>
                        </div>

                        <div className="rd-category-grid">
                            {CATEGORIES.map(category => (
                                <label key={category} className={`rd-check-card ${selectedCategories.includes(category) ? "selected" : ""}`}>
                                    <input
                                        type="checkbox"
                                        checked={selectedCategories.includes(category)}
                                        onChange={() => toggleCategory(category)}
                                    />
                                    <span>{category}</span>
                                </label>
                            ))}
                        </div>
                    </section>
                </div>

                <aside className="rd-side-stack">
                    <section className="rd-card rd-sticky-card">
                        <div className="rd-card-head compact">
                            <div className="rd-icon navy"><FaLayerGroup /></div>
                            <div>
                                <h2>Active Analysis Scope</h2>
                                <p>This scope is intended to flow through every analytics page.</p>
                            </div>
                        </div>

                        <div className="rd-summary-list">
                            <SummaryRow icon={<FaCalendarAlt />} label="Period" value={periodText} />
                            <SummaryRow icon={<FaUndo />} label="Returns" value={returns} />
                            <SummaryRow icon={<FaMapMarkerAlt />} label="Geography" value={province !== "All Provinces" ? province : region} />
                            <SummaryRow icon={<FaBoxOpen />} label="Categories" value={`${selectedCategories.length} selected`} />
                        </div>

                        <div className="rd-preview-box">
                            <span>Prepared transaction lines</span>
                            <strong>60,464</strong>
                            <small>before the selected scope is applied</small>
                        </div>

                        <button className="rd-primary-button" onClick={applyControls}>
                            Apply Scope <FaArrowRight />
                        </button>
                    </section>

                    <section className="rd-card">
                        <h3 className="rd-small-heading">Scope principles</h3>
                        <div className="rd-mini-list">
                            <div><span>01</span><p>Use order-level distinct counting for orders.</p></div>
                            <div><span>02</span><p>Use quantity and line revenue at transaction-line grain.</p></div>
                            <div><span>03</span><p>Forecast only levels with enough historical depth.</p></div>
                            <div><span>04</span><p>Use internal whitespace as an estimate, not external market size.</p></div>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}

function SummaryRow({ icon, label, value }) {
    return (
        <div className="rd-summary-row">
            <span className="rd-summary-icon">{icon}</span>
            <div>
                <small>{label}</small>
                <strong>{value}</strong>
            </div>
        </div>
    );
}
