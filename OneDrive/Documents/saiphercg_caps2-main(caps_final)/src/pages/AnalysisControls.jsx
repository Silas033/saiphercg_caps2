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
import { DEFAULT_SCOPE, useAnalytics, dateRange } from "../hooks/useAnalytics";

export default function AnalysisControls({ setActivePage, scope = DEFAULT_SCOPE, onApply }) {
    const { data, error, loading, refresh } = useAnalytics();
    const CATEGORIES = data?.scope.categories || [];
    const REGIONS = ["All Regions", ...(data?.scope.regions || [])];
    const [period, setPeriod] = useState(scope.period);
    const [returns, setReturns] = useState(scope.returns);
    const [regionChoice, setRegion] = useState(scope.region);
    const region = REGIONS.includes(regionChoice) ? regionChoice : "All Regions";
    const [provinceChoice, setProvince] = useState(scope.province);
    const [categoryChoice, setSelectedCategories] = useState(scope.categories);
    const selectedCategories = categoryChoice === null ? CATEGORIES : categoryChoice.filter(category => CATEGORIES.includes(category));
    const [start, setStart] = useState(scope.start);
    const [end, setEnd] = useState(scope.end);

    const provinces = useMemo(() => {
        const geography = data?.scope.geography || [];
        return ["All Provinces", ...new Set(geography.filter(item => region === "All Regions" || item.region === region).flatMap(item => item.provinces).sort())];
    }, [region, data]);
    const province = provinces.includes(provinceChoice) ? provinceChoice : "All Provinces";

    function toggleCategory(category) {
        setSelectedCategories(current => {
            current = current === null ? CATEGORIES : current;
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
        setSelectedCategories(null);
    }

    function applyControls() {
        onApply?.({ period, returns, region, province, categories: categoryChoice === null ? null : selectedCategories, start, end });
        if (setActivePage) {
            setActivePage("descriptive-analytics");
        }
    }

    const periodText = period === "All Available Data"
        ? dateRange(data?.scope)
        : period === "Custom Range" ? `${start || "Start date"} – ${end || "End date"}` : period;
    const validDates = period !== "Custom Range" || (start && end && start <= end);

    return (
        <div className="rd-page">
            <div className="rd-header">
                <div>
                    <span className="rd-eyebrow">ANALYSIS SCOPE</span>
                    <h1>Analysis Scope</h1>
                    <p>Set your date range, return treatment, geographic area, and product categories to filter all analytics reports.</p>
                </div>
                <div className="rd-header-note">
                    <span>Available sales records</span>
                    <strong>{dateRange(data?.scope)}</strong>
                    <small>Prepared sales dataset</small>
                </div>
            </div>

            {loading && <div className="rd-card" role="status">Loading analysis scope…</div>}
            {error && <div className="rd-card" role="alert">{error} <button onClick={refresh}>Retry</button></div>}
            {data?.empty && <div className="rd-card" role="status">Please upload and prepare sales data first.</div>}
            {data && !data.empty && !data.scope.eligibleRecords && <div className="rd-card" role="status">No sales records are eligible for analysis. Review Data Preparation.</div>}
            <div className="rd-control-layout" aria-busy={loading}>
                <div className="rd-stack">
                    <section className="rd-card" id="as-period">
                        <div className="rd-card-head">
                            <div className="rd-icon blue"><FaCalendarAlt /></div>
                            <div>
                                <h2>Analysis Period</h2>
                                <p>Choose the historical date window applied across all reports and forecasts.</p>
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

                        {period === "Custom Range" && <div className="rd-field-grid two">
                            <label className="rd-field"><span>Start date</span><input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
                            <label className="rd-field"><span>End date</span><input type="date" value={end} min={start} onChange={event => setEnd(event.target.value)} /></label>
                        </div>}
                        {!validDates && <p role="alert">Choose a start date and an end date on or after it.</p>}
                        <div className="rd-date-summary">
                            <span>Selected period</span>
                            <strong>{periodText}</strong>
                        </div>
                    </section>

                    <section className="rd-card" id="as-returns">
                        <div className="rd-card-head">
                            <div className="rd-icon amber"><FaUndo /></div>
                            <div>
                                <h2>Returns & Refunds</h2>
                                <p>Choose whether returned items and refunded orders are included in sales totals.</p>
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
                            <span>Revenue is calculated from net sales values; item quantities reflect units sold. Excluding approved returns removes refunded items. Selecting 'Returned / Refunded Only' focuses exclusively on return activity.</span>
                        </div>
                    </section>

                    <section className="rd-card" id="as-geography">
                        <div className="rd-card-head">
                            <div className="rd-icon purple"><FaMapMarkerAlt /></div>
                            <div>
                                <h2>Geographic Scope</h2>
                                <p>Filter insights by specific geographic regions or individual provinces.</p>
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

                    <section className="rd-card" id="as-categories">
                        <div className="rd-card-head">
                            <div className="rd-icon green"><FaBoxOpen /></div>
                            <div>
                                <h2>Product Scope</h2>
                                <p>Filter by standardized product categories to focus on specific lines of business.</p>
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
                    <section className="rd-card rd-sticky-card" id="as-summary">
                        <div className="rd-card-head compact">
                            <div className="rd-icon navy"><FaLayerGroup /></div>
                            <div>
                                <h2>Selected Scope Summary</h2>
                                <p>Review your active filters before applying them to reports.</p>
                            </div>
                        </div>

                        <div className="rd-summary-list">
                            <SummaryRow icon={<FaCalendarAlt />} label="Period" value={periodText} />
                            <SummaryRow icon={<FaUndo />} label="Returns" value={returns} />
                            <SummaryRow icon={<FaMapMarkerAlt />} label="Geography" value={province !== "All Provinces" ? province : region} />
                            <SummaryRow icon={<FaBoxOpen />} label="Categories" value={`${selectedCategories.length} selected`} />
                        </div>

                        <div className="rd-preview-box">
                            <span>Total sales records</span>
                            <strong>{data ? data.scope.preparedRecords.toLocaleString() : "—"}</strong>
                            <small>available in the current dataset</small>
                        </div>

                        <button className="rd-primary-button" disabled={loading || !!error || !data?.scope.eligibleRecords || !validDates} onClick={applyControls}>
                            Apply Scope <FaArrowRight />
                        </button>
                    </section>

                </aside>
            </div>
            <section className="rd-handoff">
                <div>
                    <strong>Continue to Descriptive Analytics</strong>
                    <small>Apply your selected filters and review historical sales performance.</small>
                </div>
                <button type="button" disabled={loading || !!error || !data?.scope.eligibleRecords || !validDates} onClick={applyControls}>
                    View Descriptive Analytics <span aria-hidden="true">→</span>
                </button>
            </section>
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
