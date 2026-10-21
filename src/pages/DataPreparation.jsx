import { useEffect, useMemo, useRef, useState } from "react";
import { clearAnalyticsMemoryCache, fetchScopedAnalytics } from "../data/analyticsApi";

import {
    FaCheckCircle,
    FaExclamationTriangle,
    FaDatabase,
    FaCalendarAlt,
    FaCopy,
    FaClipboardCheck,
    FaUndo,
    FaMapMarkedAlt,
    FaBoxOpen,
    FaClock,
    FaCalculator,
    FaSearch,
    FaTimes,
    FaChevronLeft,
    FaChevronRight,
    FaPlay,
    FaSyncAlt,
    FaArrowRight
} from "react-icons/fa";

import "../styles/data-preparation.css";

const API_URL = "http://localhost:4000/api";
const PRODUCT_PAGE_SIZE = 10;

const CATEGORY_OPTIONS = [
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

const SUBCATEGORY_OPTIONS = {
    "Shrink Wrap / Cap Seal": [
        "Cap Seal",
        "Shrink Film",
        "Cling Wrap / Food Wrap",
        "Shrink Sleeve"
    ],
    "Bottle / Container": ["Bottle", "Container", "Jar"],
    "Tape / Adhesive": [
        "Packaging Tape",
        "Double-Sided Tape",
        "Adhesive Tape"
    ],
    "Label / Sticker": ["Label", "Sticker"],
    "Mailer / Shipping Packaging": [
        "Poly Mailer",
        "Courier Bag",
        "Shipping Bag"
    ],
    "Protective Packaging": ["Bubble Wrap", "Protective Film"],
    "Plastic Bags": [
        "Sando Bag",
        "Labo Bag",
        "Trash / Garbage Bag",
        "Ice Bag",
        "Sandwich Bag",
        "Counter Bag",
        "Printed Plastic Bag"
    ],
    "Packaging Accessories": [
        "Rubber Band",
        "Gloves",
        "Silica Gel / Desiccant",
        "Packaging Tool",
        "Cutter / Cutting Tool"
    ],
    "Packaging / General Supplies": [
        "Tissue / Cleaning Material",
        "Rags / Cloth",
        "Toothpick",
        "Naphthalene / Moth Balls",
        "Money Envelope"
    ],
    "Other / Unclassified": ["Other / Unclassified"]
};

const dataProfileDefaults = {
    filesImported: 0,
    transactionLines: 0,
    uniqueOrders: 0,
    coverage: "—",
    productListings: 0,
    regions: 0,
    provinces: 0
};

function formatNumber(value) {
    return Number(value || 0).toLocaleString("en-US");
}

function formatCoverage(source) {
    if (!source?.dateCoverage?.min || !source?.dateCoverage?.max) {
        return "—";
    }

    const min = new Date(`${source.dateCoverage.min}T00:00:00`);
    const max = new Date(`${source.dateCoverage.max}T00:00:00`);

    const formatter = new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric"
    });

    return `${formatter.format(min)} – ${formatter.format(max)}`;
}

function Modal({ title, subtitle, children, onClose, wide = false }) {
    const modalRef = useRef(null);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const closeButton = modalRef.current?.querySelector(".icon-button");
        closeButton?.focus();
        return () => previousFocus?.focus?.();
    }, []);

    return (
        <div className="prep-modal-backdrop" onMouseDown={onClose}>
            <div
                ref={modalRef}
                className={wide ? "prep-modal wide" : "prep-modal"}
                role="dialog"
                aria-modal="true"
                aria-labelledby="prep-modal-title"
                tabIndex={-1}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                    if (event.key === "Escape") {
                        event.stopPropagation();
                        onClose();
                        return;
                    }
                    if (event.key === "Tab") {
                        const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
                        if (!focusable.length) return;
                        const first = focusable[0];
                        const last = focusable[focusable.length - 1];
                        if (event.shiftKey && document.activeElement === first) {
                            event.preventDefault();
                            last.focus();
                        } else if (!event.shiftKey && document.activeElement === last) {
                            event.preventDefault();
                            first.focus();
                        }
                    }
                }}
            >
                <div className="prep-modal-header">
                    <div>
                        <h3 id="prep-modal-title">{title}</h3>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    <button className="icon-button" onClick={onClose} aria-label="Close modal" autoFocus>
                        <FaTimes />
                    </button>
                </div>
                <div className="prep-modal-body">{children}</div>
            </div>
        </div>
    );
}

function QualityRow({ icon, title, description, status, action, onAction }) {
    const passed = status === "Passed";
    const prepared = status === "Prepared";

    return (
        <div className="quality-row">
            <div className={`quality-icon ${passed || prepared ? "success" : "warning"}`}>
                {passed || prepared ? <FaCheckCircle /> : <FaExclamationTriangle />}
            </div>
            <div className="quality-copy">
                <strong>{title}</strong>
                <span>{description}</span>
            </div>
            <span className={`status-badge ${passed || prepared ? "passed" : "review"}`}>
                {status}
            </span>
            {action && (
                <button className="outline-button small" onClick={onAction}>
                    {action}
                </button>
            )}
        </div>
    );
}

export default function DataPreparation({ setActivePage }) {
    const [profile, setProfile] = useState(dataProfileDefaults);
    const [quality, setQuality] = useState({});
    const [products, setProducts] = useState([]);
    const [productSearch, setProductSearch] = useState("");
    const [productFilter, setProductFilter] = useState("all");
    const [geoMappings, setGeoMappings] = useState([]);
    const [statusReview, setStatusReview] = useState([]);
    const [returnReview, setReturnReview] = useState([]);
    const [duplicates, setDuplicates] = useState([]);
    const [timeFields, setTimeFields] = useState([]);
    const [timeSummary, setTimeSummary] = useState({ preparedRecords: 0, sourceRecords: 0, needsReview: 0, periods: [] });
    const [preparationState, setPreparationState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState("");
    const [error, setError] = useState("");
    const [modal, setModal] = useState(null);
    const [productPage, setProductPage] = useState(1);
    const [editedProduct, setEditedProduct] = useState(null);
    const [duplicateReviewed, setDuplicateReviewed] = useState(false);
    const [statusReviewed, setStatusReviewed] = useState(false);
    const [returnsReviewed, setReturnsReviewed] = useState(false);

    const [geoFilter, setGeoFilter] = useState("all");

    const productSummary = useMemo(() => {
        const mapped = products.filter(item => item.status === "Mapped");
        const review = products.filter(item => item.status !== "Mapped");
        return { mapped, review };
    }, [products]);

    const geoSummary = useMemo(() => {
        const mapped = geoMappings.filter(item => item.status === "Mapped");
        const review = geoMappings.filter(item => item.status !== "Mapped");
        return { mapped, review };
    }, [geoMappings]);

    const visibleGeoRows = useMemo(() => {
        const rows =
            geoFilter === "mapped" ? geoSummary.mapped :
            geoFilter === "review" ? geoSummary.review :
            geoMappings;
        return [...rows].sort((a, b) =>
            (a.status === "Mapped") - (b.status === "Mapped") ||
            String(a.region).localeCompare(String(b.region)) ||
            String(a.province).localeCompare(String(b.province))
        );
    }, [geoMappings, geoSummary, geoFilter]);

    async function getJson(endpoint, options = {}) {
        const response = await fetch(`${API_URL}${endpoint}`, options);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Request failed.");
        return result;
    }

    async function loadPreparationData() {
        setLoading(true);
        setError("");

        try {
            const [profileData, productData, geoData, statusData, returnData, duplicateData, timeData, stateData] =
                await Promise.all([
                    getJson("/preparation/profile"),
                    getJson("/preparation/products"),
                    getJson("/preparation/geography"),
                    getJson("/preparation/status-review"),
                    getJson("/preparation/returns"),
                    getJson("/preparation/duplicates"),
                    getJson("/preparation/time-fields"),
                    getJson("/preparation/status")
                ]);

            const source = profileData.source || {};
            const q = profileData.quality || {};

            const geographyRegions = new Set(
                (geoData.records || []).map(item => item.region).filter(Boolean)
            );
            const geographyProvinces = new Set(
                (geoData.records || []).map(item => item.province).filter(Boolean)
            );

            setProfile({
                filesImported: source.filesImported || 0,
                transactionLines: source.transactionLines || 0,
                uniqueOrders: source.uniqueOrders || 0,
                coverage: formatCoverage(source),
                productListings: source.uniqueProducts || 0,
                regions: geographyRegions.size,
                provinces: geographyProvinces.size
            });

            setQuality(q);
            setProducts(productData.records || []);
            setGeoMappings(geoData.records || []);
            setStatusReview(statusData.records || []);
            setReturnReview(returnData.records || []);
            setDuplicates(duplicateData.records || []);
            setTimeFields(timeData.fields || []);
            setTimeSummary(timeData.summary || {
                preparedRecords: 0,
                sourceRecords: source.transactionLines || 0,
                needsReview: q.invalidDateRecords || 0,
                periods: []
            });
            setPreparationState(stateData);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadPreparationData();
    }, []);

    async function runPreparation() {
        setRunning(true);
        setError("");
        setSyncMessage("");

        try {
            const result = await getJson("/preparation/run", { method: "POST" });
            if (result?.supabaseSync?.success) clearAnalyticsMemoryCache();
            setDuplicateReviewed(false);
            setStatusReviewed(false);
            setReturnsReviewed(false);
            await loadPreparationData();

            if (result?.supabaseSync?.success === false) {
                setError(`Data prepared locally, but Supabase sync failed: ${result.supabaseSync.error}`);
            } else if (result?.supabaseSync?.warning) {
                setError(result.supabaseSync.warning);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setRunning(false);
        }
    }

    async function syncDatabase() {
        setSyncing(true);
        setError("");
        setSyncMessage("");

        try {
            const result = await fetchScopedAnalytics({}, undefined, true);
            setSyncMessage(
                `Synced ${formatNumber(result.scope?.preparedRecords)} records from Supabase. No data preparation was run.`
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setSyncing(false);
        }
    }

    async function saveProductMapping() {
        if (!editedProduct) return;

        try {
            await getJson("/preparation/products", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rawProductName: editedProduct.rawProductName,
                    category: editedProduct.category,
                    subcategory: editedProduct.subcategory
                })
            });

            setEditedProduct(null);
            await runPreparation();
        } catch (err) {
            setError(err.message);
        }
    }

    const filteredProducts = useMemo(() => {
        const term = productSearch.trim().toLowerCase();
        const rows =
            productFilter === "mapped" ? productSummary.mapped :
            productFilter === "review" ? productSummary.review :
            products;
        if (!term) return rows;
        return rows.filter(item => item.rawProductName?.toLowerCase().includes(term));
    }, [products, productSearch, productFilter, productSummary]);

    const productPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCT_PAGE_SIZE));
    const visibleProducts = filteredProducts.slice(
        (productPage - 1) * PRODUCT_PAGE_SIZE,
        productPage * PRODUCT_PAGE_SIZE
    );

    useEffect(() => {
        setProductPage(1);
    }, [productSearch, productFilter]);

    const datePassed = (quality.invalidDateRecords || 0) === 0;
    const invalidDateRecords = Number(timeSummary.needsReview ?? quality.invalidDateRecords) || 0;
    const numericPassed =
        (quality.invalidQuantityRecords || 0) === 0 &&
        (quality.invalidReturnQuantityRecords || 0) === 0 &&
        (quality.excessiveReturnQuantityRecords || 0) === 0;

    const validation = {
        geography: (preparationState?.validation?.geographicMappingPrepared ?? geoMappings.length > 0),
        product: products.length > 0,
        duplicates: duplicates.length === 0 || duplicateReviewed,
        time: preparationState?.validation?.timeFieldsGenerated ?? profile.transactionLines > 0,
        measures: preparationState?.validation?.analyticalMeasuresPrepared ?? profile.transactionLines > 0
    };

    const readyForAnalysis = Object.values(validation).every(Boolean);

    function openDuplicateModal() {
        setDuplicateReviewed(true);
        setModal("duplicates");
    }

    function openStatusModal() {
        setStatusReviewed(true);
        setModal("status");
    }

    function openReturnsModal() {
        setReturnsReviewed(true);
        setModal("returns");
    }

    function openProductModal() {
        setProductFilter("all");
        setModal("products");
    }

    return (
        <div className="data-preparation">
            <div className="prep-page-header">
                <div>
                    <h1>Data Preparation</h1>
                    <p>Review and prepare your transaction data for analysis.</p>
                </div>
                <div className="prep-header-actions">
                    <button className="outline-button" type="button" onClick={syncDatabase} disabled={syncing || running || loading} title="Read the current records from Supabase without running data preparation.">
                        <FaSyncAlt />
                        {syncing ? "Syncing Database..." : "Sync Database"}
                    </button>
                    <button className="primary-button" type="button" onClick={() => setModal("confirm-preparation")} disabled={running || syncing || loading}>
                        <FaPlay />
                        {running ? "Preparing Dataset..." : "Run Data Preparation"}
                    </button>
                </div>
            </div>

            <div className="prep-workflow">
                {[
                    ["Profile", FaDatabase],
                    ["Review Issues", FaClipboardCheck],
                    ["Standardize", FaMapMarkedAlt],
                    ["Transform", FaCalculator],
                    ["Validate", FaCheckCircle],
                    ["Proceed", FaArrowRight]
                ].map(([label, Icon], index) => (
                    <div className="workflow-step" key={label}>
                        <span className="workflow-number">{index + 1}</span>
                        <span>{label}</span>
                        {index < 5 && <span className="workflow-line" />}
                    </div>
                ))}
            </div>

            {error && (
                <div className="prep-alert error-alert">
                    <FaExclamationTriangle />
                    <span>{error}</span>
                    <button onClick={() => setError("")}>Dismiss</button>
                </div>
            )}

            {syncMessage && (
                <div className="prep-alert success-alert" role="status">
                    <FaCheckCircle />
                    <span>{syncMessage}</span>
                    <button onClick={() => setSyncMessage("")}>Dismiss</button>
                </div>
            )}

            <section className="prep-section">
                <div className="section-heading">
                    <div>
                        <span className="section-kicker">01</span>
                        <h2>Data Profile</h2>
                        <p>What the imported transaction files actually contain.</p>
                    </div>
                </div>

                <div className="profile-grid">
                    <div className="profile-card">
                        <FaDatabase />
                        <span>Files Imported</span>
                        <strong>{formatNumber(profile.filesImported)}</strong>
                    </div>
                    <div className="profile-card">
                        <FaClipboardCheck />
                        <span>Transaction Lines</span>
                        <strong>{formatNumber(profile.transactionLines)}</strong>
                    </div>
                    <div className="profile-card">
                        <FaBoxOpen />
                        <span>Unique Orders</span>
                        <strong>{formatNumber(profile.uniqueOrders)}</strong>
                    </div>
                    <div className="profile-card">
                        <FaCalendarAlt />
                        <span>Data Coverage</span>
                        <strong className="compact-value">{profile.coverage}</strong>
                    </div>
                    <div className="profile-card">
                        <FaBoxOpen />
                        <span>Product Listings</span>
                        <strong>{formatNumber(profile.productListings)}</strong>
                    </div>
                    <div className="profile-card">
                        <FaMapMarkedAlt />
                        <span>Geographic Coverage</span>
                        <strong className="compact-value">
                            {formatNumber(profile.regions)} Regions / {formatNumber(profile.provinces)} Provinces
                        </strong>
                    </div>
                </div>
            </section>

            <section className="prep-section">
                <div className="section-heading">
                    <div>
                        <span className="section-kicker">02</span>
                        <h2>Data Quality</h2>
                        <p>Issues are identified before transformations are applied.</p>
                    </div>
                </div>

                <div className="quality-card">
                    <QualityRow
                        icon={FaCalendarAlt}
                        title="Date Fields"
                        description={datePassed ? "No major date-format issues detected." : `${formatNumber(quality.invalidDateRecords)} records have invalid or missing creation dates.`}
                        status={datePassed ? "Passed" : "Review"}
                    />
                    <QualityRow
                        icon={FaCopy}
                        title="Exact Duplicates"
                        description={`${formatNumber(quality.duplicateRows || 0)} exact duplicate rows detected. Repeated Order IDs remain valid.`}
                        status={(quality.duplicateRows || 0) > 0 ? "Review" : "Passed"}
                        action={(quality.duplicateRows || 0) > 0 ? "Review" : null}
                        onAction={openDuplicateModal}
                    />
                    <QualityRow
                        icon={FaClipboardCheck}
                        title="Order Status"
                        description={`${formatNumber(quality.nonCompletedOrders || 0)} orders are not marked Completed.`}
                        status={(quality.nonCompletedOrders || 0) > 0 ? "Review" : "Passed"}
                        action={(quality.nonCompletedOrders || 0) > 0 ? "Review" : null}
                        onAction={openStatusModal}
                    />
                    <QualityRow
                        icon={FaUndo}
                        title="Returns / Refunds"
                        description={`${formatNumber(quality.returnRefundOrders || 0)} orders contain return/refund information.`}
                        status={(quality.returnRefundOrders || 0) > 0 ? "Review" : "Passed"}
                        action={(quality.returnRefundOrders || 0) > 0 ? "Review" : null}
                        onAction={openReturnsModal}
                    />
                    <QualityRow
                        icon={FaCalculator}
                        title="Numeric Fields"
                        description={numericPassed ? "No major invalid-value pattern detected." : "Some numeric records require review."}
                        status={numericPassed ? "Passed" : "Review"}
                    />
                </div>
            </section>

            <section className="prep-section">
                <div className="section-heading">
                    <div>
                        <span className="section-kicker">03</span>
                        <h2>Standardization &amp; Transformation</h2>
                        <p>Convert raw Shopee fields into consistent analytical fields.</p>
                    </div>
                </div>

                <div className="transform-grid">
                    <div className="transform-card">
                        <div className="transform-card-header">
                            <div className="transform-icon"><FaMapMarkedAlt /></div>
                            <div>
                                <div className="transform-title-row">
                                    <h3>Geographic Mapping</h3>
                                    <button
                                        type="button"
                                        className="geo-help-button"
                                        aria-label="Help for Geographic Mapping"
                                        aria-haspopup="dialog"
                                        onClick={() => setModal("geography-help")}
                                    >
                                        ?
                                    </button>
                                </div>
                                <p>Standardize to the analytical hierarchy.</p>
                            </div>
                        </div>
                        <div className="geo-stats">
                            <div className="geo-stat"><strong>{formatNumber(geoMappings.length)}</strong><span>Values detected</span></div>
                            <div className="geo-stat ok"><strong>{formatNumber(geoSummary.mapped.length)}</strong><span>Mapped</span></div>
                            <div className={`geo-stat ${geoSummary.review.length ? "warn" : "ok"}`}>
                                <strong>{formatNumber(geoSummary.review.length)}</strong><span>Unmapped / needs review</span>
                            </div>
                        </div>
                        <button
                            className="outline-button full geo-review-btn"
                            onClick={() => { setGeoFilter("all"); setModal("geography"); }}
                        >
                            Review Geographic Mapping
                        </button>
                    </div>

                    <div className="transform-card product-transform">
                        <div className="transform-card-header">
                            <div className="transform-icon"><FaBoxOpen /></div>
                            <div>
                                <div className="transform-title-row">
                                    <h3>Product Mapping</h3>
                                    <button
                                        type="button"
                                        className="geo-help-button"
                                        aria-label="Help for Product Mapping"
                                        aria-haspopup="dialog"
                                        onClick={() => setModal("product-help")}
                                    >
                                        ?
                                    </button>
                                </div>
                                <p>Classify raw Shopee listings into the analytical hierarchy.</p>
                            </div>
                        </div>
                        <div className="geo-stats">
                            <div className="geo-stat"><strong>{formatNumber(products.length)}</strong><span>Values detected</span></div>
                            <div className="geo-stat ok"><strong>{formatNumber(productSummary.mapped.length)}</strong><span>Mapped</span></div>
                            <div className={`geo-stat ${productSummary.review.length ? "warn" : "ok"}`}>
                                <strong>{formatNumber(productSummary.review.length)}</strong><span>Unmapped / needs review</span>
                            </div>
                        </div>
                        <button className="outline-button full geo-review-btn" onClick={openProductModal}>
                            Review Product Mapping
                        </button>
                    </div>

                    <div className="transform-card">
                        <div className="transform-card-header">
                            <div className="transform-icon"><FaClock /></div>
                            <div>
                                <div className="transform-title-row">
                                    <h3>Time Fields</h3>
                                    <button
                                        type="button"
                                        className="geo-help-button"
                                        aria-label="Help for Time Fields"
                                        aria-haspopup="dialog"
                                        onClick={() => setModal("time-help")}
                                    >
                                        ?
                                    </button>
                                </div>
                                <p>Derived from Order Creation Date for trends and forecasting.</p>
                            </div>
                        </div>
                        <div className="geo-stats">
                            <div className="geo-stat">
                                <strong>{loading ? "—" : formatNumber(timeSummary.preparedRecords)}</strong>
                                <span>Records with time fields</span>
                            </div>
                            <div className="geo-stat ok">
                                <strong>{loading ? "—" : formatNumber(timeSummary.periods.length)}</strong>
                                <span>Detected months mapped</span>
                            </div>
                            <div className={`geo-stat ${invalidDateRecords > 0 ? "warn" : "ok"}`}>
                                <strong>{loading ? "—" : formatNumber(invalidDateRecords)}</strong>
                                <span>Missing / invalid dates</span>
                            </div>
                        </div>
                        <button className="outline-button full geo-review-btn" onClick={() => setModal("time")} disabled={loading}>
                            Review Time Mapping
                        </button>
                    </div>

                </div>
            </section>

            <section className="prep-section validation-section">
                <div className="section-heading">
                    <div>
                        <span className="section-kicker">04</span>
                        <h2>Preparation Validation</h2>
                        <p>Confirm that the prepared dataset is ready for downstream analysis.</p>
                    </div>
                </div>

                <div className="validation-layout">
                    <div className="validation-checklist">
                        {[
                            ["Geographic mapping prepared", validation.geography],
                            ["Product classification prepared", validation.product],
                            ["Duplicate handling reviewed", validation.duplicates],
                            ["Time fields generated", validation.time],
                            ["Analytical measures prepared", validation.measures]
                        ].map(([label, ok]) => (
                            <div className={ok ? "validation-item complete" : "validation-item"} key={label}>
                                <FaCheckCircle />
                                <span>{label}</span>
                            </div>
                        ))}
                    </div>

                    <div className={readyForAnalysis ? "ready-card" : "ready-card not-ready"}>
                        <div className="ready-icon">
                            {readyForAnalysis ? <FaCheckCircle /> : <FaExclamationTriangle />}
                        </div>
                        <div>
                            <span className="ready-kicker">DATASET STATUS</span>
                            <h3>{readyForAnalysis ? "DATASET READY FOR ANALYSIS" : "REVIEW REQUIRED"}</h3>
                            <p>
                                {readyForAnalysis
                                    ? "The prepared dataset can now be used by the analysis modules."
                                    : "Review the outstanding preparation items before proceeding."}
                            </p>
                        </div>
                        <button
                            className="primary-button"
                            disabled={!readyForAnalysis}
                            onClick={() => setActivePage?.("analysis-controls")}
                        >
                            Proceed to Analytics Scope <FaArrowRight />
                        </button>
                    </div>
                </div>
            </section>

            {modal === "confirm-preparation" && (
                <Modal
                    title="Confirm Data Preparation"
                    subtitle="Review this action before the preparation process starts."
                    onClose={() => setModal(null)}
                >
                    <div className="modal-summary info-summary">
                        <FaDatabase aria-hidden="true" />
                        This will reprocess the imported transaction files using the current preparation mappings and refresh the prepared dataset used by analytics.
                    </div>
                    <div className="modal-actions">
                        <button className="outline-button" type="button" onClick={() => setModal(null)}>Cancel</button>
                        <button className="primary-button" type="button" onClick={() => { setModal(null); runPreparation(); }}>
                            <FaPlay /> Confirm &amp; Run
                        </button>
                    </div>
                </Modal>
            )}

            {modal === "duplicates" && (
                <Modal
                    title="Review Exact Duplicates"
                    subtitle="Exact duplicate rows were detected across the imported files. Repeated Order IDs are not treated as duplicates."
                    onClose={() => setModal(null)}
                    wide
                >
                    {duplicates.length === 0 ? (
                        <div className="empty-state">No exact duplicate rows detected.</div>
                    ) : (
                        <>
                            <div className="modal-summary warning-summary">
                                <FaExclamationTriangle /> {quality.duplicateRows} exact duplicate rows will be excluded from the prepared Master Data.
                            </div>
                            <div className="table-wrap">
                                <table className="prep-table">
                                    <thead><tr><th>Source Row</th><th>Order ID</th><th>Product Name</th><th>Date</th><th>Qty</th></tr></thead>
                                    <tbody>
                                        {duplicates.map((row, index) => (
                                            <tr key={`${row.row}-${index}`}>
                                                <td>{row.row}</td><td>{row.orderId || "—"}</td><td>{row.productName || "—"}</td><td>{row.date || "—"}</td><td>{row.quantity ?? "—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="modal-actions"><button className="primary-button" onClick={() => setModal(null)}>Acknowledge &amp; Keep Excluded</button></div>
                        </>
                    )}
                </Modal>
            )}

            {modal === "status" && (
                <Modal
                    title="Review Order Status"
                    subtitle="The core analytical dataset uses Completed orders. Other statuses remain traceable in the raw imported data."
                    onClose={() => setModal(null)}
                    wide
                >
                    <div className="modal-summary warning-summary"><FaExclamationTriangle /> {quality.nonCompletedOrders || 0} affected orders are excluded from the core analytical dataset.</div>
                    <div className="table-wrap">
                        <table className="prep-table">
                            <thead><tr><th>Order ID</th><th>Status</th><th>Products</th><th>Date</th></tr></thead>
                            <tbody>
                                {statusReview.map((row, index) => (
                                    <tr key={`${row.orderId}-${index}`}><td>{row.orderId}</td><td>{row.statuses?.join(", ") || "—"}</td><td>{row.products?.join(", ") || "—"}</td><td>{row.dates?.join(", ") || "—"}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="modal-actions"><button className="primary-button" onClick={() => setModal(null)}>Acknowledge Review</button></div>
                </Modal>
            )}

            {modal === "returns" && (
                <Modal
                    title="Review Returns & Refunds"
                    subtitle="Return/refund information is preserved. Returned quantity is used to derive Net Quantity without deleting the original transaction quantity."
                    onClose={() => setModal(null)}
                    wide
                >
                    <div className="modal-summary info-summary"><FaUndo /> {quality.returnRefundOrders || 0} orders contain return/refund information.</div>
                    <div className="table-wrap">
                        <table className="prep-table">
                            <thead><tr><th>Order ID</th><th>Return / Refund Status</th><th>Product</th><th>Returned Qty</th></tr></thead>
                            <tbody>
                                {returnReview.map((row, index) => (
                                    <tr key={`${row.orderId}-${index}`}><td>{row.orderId}</td><td>{row.returnStatuses?.join(", ") || "—"}</td><td>{row.products?.join(", ") || "—"}</td><td>{row.returnedQuantity || 0}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="modal-actions"><button className="primary-button" onClick={() => setModal(null)}>Acknowledge Review</button></div>
                </Modal>
            )}

            {modal === "geography-help" && (
                <Modal
                    title="Geographic Mapping Guide"
                    subtitle="How location fields from imported transactions are organized for analytics."
                    onClose={() => setModal(null)}
                    wide
                >
                    <div className="geo-help-flow">
                        <div><span>Source Province</span><b aria-hidden="true">→</b><strong>Region</strong></div>
                        <div><span>Source City</span><b aria-hidden="true">→</b><strong>Province</strong></div>
                    </div>
                    <div className="modal-summary info-summary">
                        <FaMapMarkedAlt aria-hidden="true" />
                        Imported province and city values are standardized into the Region → Province hierarchy used in geographic reporting and analysis.
                    </div>
                </Modal>
            )}

            {modal === "geography" && (
                <Modal
                    title="Review Geographic Mapping"
                    subtitle="Overview of the geographic values detected and mapped by the system. Hierarchy: Source Province → Region, Source City → Province."
                    onClose={() => setModal(null)}
                    wide
                >
                    <div className="geo-stats">
                        <div className="geo-stat"><strong>{geoMappings.length}</strong><span>Values detected</span></div>
                        <div className="geo-stat ok"><strong>{geoSummary.mapped.length}</strong><span>Mapped</span></div>
                        <div className={`geo-stat ${geoSummary.review.length ? "warn" : ""}`}>
                            <strong>{geoSummary.review.length}</strong><span>Unmapped / needs review</span>
                        </div>
                    </div>

                    {geoSummary.review.length > 0 ? (
                        <div className="modal-summary warning-summary">
                            <FaExclamationTriangle /> {geoSummary.review.length} value(s) have a missing source province or city and are held as “Unclassified”.
                        </div>
                    ) : (
                        <div className="modal-summary info-summary">
                            <FaCheckCircle /> All detected geographic values are mapped.
                        </div>
                    )}

                    <div className="geo-filter">
                        {[["all", "All"], ["mapped", "Mapped"], ["review", "Needs review"]].map(([key, label]) => (
                            <button
                                key={key}
                                className={`outline-button tiny ${geoFilter === key ? "active" : ""}`}
                                onClick={() => setGeoFilter(key)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="table-wrap geo-table-wrap">
                        <table className="prep-table">
                            <thead>
                                <tr>
                                    <th>Source Province</th>
                                    <th>Source City</th>
                                    <th>Mapped Region</th>
                                    <th>Mapped Province</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleGeoRows.length === 0 && (
                                    <tr><td colSpan="5">No values in this view.</td></tr>
                                )}
                                {visibleGeoRows.map(row => (
                                    <tr key={`${row.rawProvince}|${row.rawCity}`}>
                                        <td>{row.rawProvince || "—"}</td>
                                        <td>{row.rawCity || "—"}</td>
                                        <td><strong>{row.region}</strong></td>
                                        <td><strong>{row.province}</strong></td>
                                        <td>
                                            <span className={`mini-badge ${row.status === "Mapped" ? "geo-ok" : "geo-warn"}`}>
                                                {row.status === "Mapped" ? "Mapped" : "Needs review"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mapping-rule-note">Known Aurora regional inconsistency is standardized to North Luzon.</div>
                    <div className="modal-actions"><button className="outline-button" onClick={() => setModal(null)}>Close</button></div>
                </Modal>
            )}

            {modal === "time-help" && (
                <Modal
                    title="Time Fields Guide"
                    subtitle="Source date, standardized format, and generated calendar fields."
                    onClose={() => setModal(null)}
                    wide
                >
                    <div className="time-help-content">
                        <div className="time-help-source">
                            <span>Source</span>
                            <strong>Order Creation Date</strong>
                        </div>
                        <div className="time-help-source">
                            <span>Standardized format</span>
                            <strong>YYYY-MM-DD</strong>
                        </div>
                        <h4>Generated fields</h4>
                        <div className="time-help-fields">
                            {["Year", "Month", "Month Number", "Year-Month", "Quarter"].map(field => <span key={field}>{field}</span>)}
                        </div>
                    </div>
                </Modal>
            )}

            {modal === "time" && (
                <Modal
                    title="Review Time Mapping"
                    subtitle="Order Creation Date is standardized and mapped to calendar fields for every valid prepared record."
                    onClose={() => setModal(null)}
                    wide
                >
                    <div className="geo-stats">
                        <div className="geo-stat ok">
                            <strong>{formatNumber(timeSummary.preparedRecords)}</strong>
                            <span>Prepared records with time fields</span>
                        </div>
                        <div className="geo-stat ok">
                            <strong>{formatNumber(timeSummary.periods.length)}</strong>
                            <span>Detected months mapped</span>
                        </div>
                        <div className={`geo-stat ${invalidDateRecords ? "warn" : "ok"}`}>
                            <strong>{formatNumber(invalidDateRecords)}</strong>
                            <span>Source records needing date review</span>
                        </div>
                    </div>

                    {invalidDateRecords > 0 ? (
                        <div className="modal-summary warning-summary">
                            <FaExclamationTriangle /> {formatNumber(invalidDateRecords)} source record(s) have a missing or invalid Order Creation Date. They cannot be assigned generated time fields.
                        </div>
                    ) : (
                        <div className="modal-summary info-summary">
                            <FaCheckCircle /> All source records with dates were standardized successfully.
                        </div>
                    )}

                    <h4 className="time-modal-heading">Generated field mapping</h4>
                    <div className="table-wrap">
                        <table className="prep-table">
                            <thead><tr><th>Source</th><th>Generated Field</th><th>Format</th><th>Example</th></tr></thead>
                            <tbody>{timeFields.map(field => <tr key={field.field}><td>{field.source}</td><td>{field.field}</td><td>{field.format}</td><td>{field.example}</td></tr>)}</tbody>
                        </table>
                    </div>

                    <h4 className="time-modal-heading">Detected months already mapped</h4>
                    <div className="table-wrap geo-table-wrap">
                        <table className="prep-table">
                            <thead>
                                <tr><th>Year-Month</th><th>Month</th><th>Quarter</th><th>Prepared Records</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {timeSummary.periods.length === 0 && (
                                    <tr><td colSpan="5">No valid dated records are available.</td></tr>
                                )}
                                {timeSummary.periods.map(period => (
                                    <tr key={period.yearMonth}>
                                        <td>{period.yearMonth}</td>
                                        <td>{period.monthName}</td>
                                        <td>{period.quarter}</td>
                                        <td>{formatNumber(period.records)}</td>
                                        <td><span className="mini-badge geo-ok">Mapped</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="modal-actions"><button className="outline-button" onClick={() => setModal(null)}>Close</button></div>
                </Modal>
            )}

            {modal === "product-help" && (
                <Modal
                    title="Product Mapping Guide"
                    subtitle="How raw Shopee product listings are organized for category analysis."
                    onClose={() => setModal(null)}
                    wide
                >
                    <div className="product-help-hierarchy">
                        <div><span>Raw Product Name</span><b aria-hidden="true">→</b><strong>Category</strong><b aria-hidden="true">→</b><strong>Subcategory</strong></div>
                    </div>
                    <div className="modal-summary info-summary">
                        <FaBoxOpen aria-hidden="true" />
                        Preserve the original Product Name. Uncertain listings can remain <strong>Other / Unclassified</strong>.
                    </div>
                </Modal>
            )}

            {modal === "products" && (
                <Modal
                    title="Review Product Mapping"
                    subtitle="Map each raw Shopee Product Name to Category → Subcategory. Uncertain listings may remain Other / Unclassified."
                    onClose={() => { setModal(null); setEditedProduct(null); }}
                    wide
                >
                    <div className="geo-stats">
                        <div className="geo-stat"><strong>{formatNumber(products.length)}</strong><span>Values detected</span></div>
                        <div className="geo-stat ok"><strong>{formatNumber(productSummary.mapped.length)}</strong><span>Mapped</span></div>
                        <div className={`geo-stat ${productSummary.review.length ? "warn" : ""}`}>
                            <strong>{formatNumber(productSummary.review.length)}</strong><span>Unmapped / needs review</span>
                        </div>
                    </div>

                    {productSummary.review.length > 0 ? (
                        <div className="modal-summary warning-summary">
                            <FaExclamationTriangle /> {formatNumber(productSummary.review.length)} product listing(s) need category or subcategory review.
                        </div>
                    ) : (
                        <div className="modal-summary info-summary">
                            <FaCheckCircle /> All detected product listings are mapped.
                        </div>
                    )}

                    <div className="geo-filter">
                        {[["all", "All"], ["mapped", "Mapped"], ["review", "Needs review"]].map(([key, label]) => (
                            <button
                                key={key}
                                className={`outline-button tiny ${productFilter === key ? "active" : ""}`}
                                onClick={() => setProductFilter(key)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="product-modal-toolbar">
                        <div className="search-box">
                            <FaSearch />
                            <input value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Search raw product names..." />
                        </div>
                        <span>{formatNumber(filteredProducts.length)} matching listings</span>
                    </div>

                    <div className="table-wrap">
                        <table className="prep-table product-table">
                            <thead><tr><th>Raw Product Name (Source)</th><th>Category</th><th>Subcategory</th><th>Status</th><th></th></tr></thead>
                            <tbody>
                                {visibleProducts.length === 0 && (
                                    <tr><td colSpan="5">No product listings in this view.</td></tr>
                                )}
                                {visibleProducts.map((product, index) => (
                                    <tr key={`${product.rawProductName}-${index}`}>
                                        <td className="raw-product-cell">{product.rawProductName || "Other / Unclassified"}</td>
                                        <td>{product.category}</td>
                                        <td>{product.subcategory}</td>
                                        <td><span className={`status-badge ${product.status === "Mapped" ? "passed" : "review"}`}>{product.status}</span></td>
                                        <td><button className="outline-button tiny" onClick={() => setEditedProduct({ ...product })}>Review / Edit</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="pagination-row">
                        <span>Page {productPage} of {productPages}</span>
                        <div>
                            <button disabled={productPage === 1} onClick={() => setProductPage(page => Math.max(1, page - 1))}><FaChevronLeft /></button>
                            <button disabled={productPage === productPages} onClick={() => setProductPage(page => Math.min(productPages, page + 1))}><FaChevronRight /></button>
                        </div>
                    </div>

                    {editedProduct && (
                        <div className="mapping-editor">
                            <div>
                                <span>Editing Raw Product Name</span>
                                <strong>{editedProduct.rawProductName}</strong>
                            </div>
                            <div className="editor-fields">
                                <label>
                                    Category
                                    <select value={editedProduct.category} onChange={event => setEditedProduct(current => ({ ...current, category: event.target.value, subcategory: SUBCATEGORY_OPTIONS[event.target.value][0] }))}>
                                        {CATEGORY_OPTIONS.map(category => <option key={category}>{category}</option>)}
                                    </select>
                                </label>
                                <label>
                                    Subcategory
                                    <select value={editedProduct.subcategory} onChange={event => setEditedProduct(current => ({ ...current, subcategory: event.target.value }))}>
                                        {(SUBCATEGORY_OPTIONS[editedProduct.category] || []).map(subcategory => <option key={subcategory}>{subcategory}</option>)}
                                    </select>
                                </label>
                            </div>
                            <div className="editor-actions">
                                <button className="outline-button" onClick={() => setEditedProduct(null)}>Cancel</button>
                                <button className="primary-button" onClick={saveProductMapping}>Save Mapping</button>
                            </div>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
}
