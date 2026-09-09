import { useEffect, useMemo, useState } from "react";

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
    return (
        <div className="prep-modal-backdrop" onMouseDown={onClose}>
            <div
                className={wide ? "prep-modal wide" : "prep-modal"}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="prep-modal-header">
                    <div>
                        <h3>{title}</h3>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    <button className="icon-button" onClick={onClose} aria-label="Close modal">
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
    const [geoMappings, setGeoMappings] = useState([]);
    const [statusReview, setStatusReview] = useState([]);
    const [returnReview, setReturnReview] = useState([]);
    const [duplicates, setDuplicates] = useState([]);
    const [timeFields, setTimeFields] = useState([]);
    const [preparationState, setPreparationState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const [modal, setModal] = useState(null);
    const [productPage, setProductPage] = useState(1);
    const [editedProduct, setEditedProduct] = useState(null);
    const [duplicateReviewed, setDuplicateReviewed] = useState(false);
    const [statusReviewed, setStatusReviewed] = useState(false);
    const [returnsReviewed, setReturnsReviewed] = useState(false);

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

        try {
            await getJson("/preparation/run", { method: "POST" });
            setDuplicateReviewed(false);
            setStatusReviewed(false);
            setReturnsReviewed(false);
            await loadPreparationData();
        } catch (err) {
            setError(err.message);
        } finally {
            setRunning(false);
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
        if (!term) return products;
        return products.filter(item =>
            item.rawProductName?.toLowerCase().includes(term)
        );
    }, [products, productSearch]);

    const productPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCT_PAGE_SIZE));
    const visibleProducts = filteredProducts.slice(
        (productPage - 1) * PRODUCT_PAGE_SIZE,
        productPage * PRODUCT_PAGE_SIZE
    );

    useEffect(() => {
        setProductPage(1);
    }, [productSearch]);

    const datePassed = (quality.invalidDateRecords || 0) === 0;
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
        setModal("products");
    }

    return (
        <div className="data-preparation">
            <div className="prep-page-header">
                <div>
                    <h1>Data Preparation</h1>
                    <p>Review and prepare your transaction data for analysis.</p>
                </div>
                <button className="primary-button" onClick={runPreparation} disabled={running || loading}>
                    <FaPlay />
                    {running ? "Preparing Dataset..." : "Run Data Preparation"}
                </button>
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
                                <h3>Geographic Mapping</h3>
                                <p>Standardize to the analytical hierarchy.</p>
                            </div>
                        </div>
                        <div className="mapping-flow">
                            <span>Source Province</span><b>→</b><strong>Region</strong>
                            <span>Source City</span><b>→</b><strong>Province</strong>
                        </div>
                        <div className="prepared-label"><FaCheckCircle /> Geographic fields prepared</div>
                        <button className="outline-button full" onClick={() => setModal("geography")}>View Mapping Rules</button>
                    </div>

                    <div className="transform-card product-transform">
                        <div className="transform-card-header">
                            <div className="transform-icon"><FaBoxOpen /></div>
                            <div>
                                <h3>Product Mapping</h3>
                                <p>Classify raw Shopee listings into the analytical hierarchy.</p>
                            </div>
                            <span className="mini-badge">{products.length} listings</span>
                        </div>
                        <div className="product-hierarchy-preview">
                            <span>Raw Product Name</span><b>→</b><span>Category</span><b>→</b><span>Subcategory</span>
                        </div>
                        <div className="mapping-note">
                            Preserve the original Product Name. Uncertain listings remain <strong>Other / Unclassified</strong>.
                        </div>
                        <button className="primary-button full" onClick={openProductModal}>
                            Review Product Mapping
                        </button>
                    </div>

                    <div className="transform-card">
                        <div className="transform-card-header">
                            <div className="transform-icon"><FaClock /></div>
                            <div>
                                <h3>Time Fields</h3>
                                <p>Derived from Order Creation Date for trends and forecasting.</p>
                            </div>
                        </div>
                        <div className="time-pills">
                            {timeFields.map(field => <span key={field.field}>{field.field}</span>)}
                        </div>
                        <div className="prepared-label"><FaCheckCircle /> Time fields prepared</div>
                        <button className="outline-button full" onClick={() => setModal("time")}>View Fields</button>
                    </div>

                    <div className="transform-card">
                        <div className="transform-card-header">
                            <div className="transform-icon"><FaCalculator /></div>
                            <div>
                                <h3>Analytical Measures</h3>
                                <p>Respect the transaction-line and order-level grain.</p>
                            </div>
                        </div>
                        <div className="measure-list">
                            <div><strong>Orders</strong><span>Distinct Order ID</span></div>
                            <div><strong>Quantity</strong><span>Sum at transaction-line level</span></div>
                            <div><strong>Financials</strong><span>Line vs. order-level handling</span></div>
                        </div>
                        <div className="warning-note">
                            <FaExclamationTriangle /> Do not sum repeated order-level fields across transaction lines.
                        </div>
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
                            Proceed to Analysis Controls <FaArrowRight />
                        </button>
                    </div>
                </div>
            </section>

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

            {modal === "geography" && (
                <Modal
                    title="Geographic Mapping Rules"
                    subtitle="The analytical hierarchy is Region → Province. City/Municipality is not used as an analytical level."
                    onClose={() => setModal(null)}
                >
                    <div className="table-wrap">
                        <table className="prep-table">
                            <thead><tr><th>Source Field</th><th>Analytical Level</th><th>Example</th></tr></thead>
                            <tbody>
                                <tr><td>Province (Shopee)</td><td><strong>Region</strong></td><td>South Luzon → Region</td></tr>
                                <tr><td>City (Shopee)</td><td><strong>Province</strong></td><td>Cavite → Province</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div className="mapping-rule-note">Known Aurora regional inconsistency is standardized to North Luzon.</div>
                    <div className="modal-actions"><button className="outline-button" onClick={() => setModal(null)}>Close</button></div>
                </Modal>
            )}

            {modal === "time" && (
                <Modal
                    title="Time Fields Generated"
                    subtitle="Derived from Order Creation Date for monthly analysis and forecasting."
                    onClose={() => setModal(null)}
                >
                    <div className="table-wrap">
                        <table className="prep-table">
                            <thead><tr><th>Generated Field</th><th>Format / Example</th></tr></thead>
                            <tbody>{timeFields.map(field => <tr key={field.field}><td>{field.field}</td><td>{field.format} — {field.example}</td></tr>)}</tbody>
                        </table>
                    </div>
                    <div className="modal-actions"><button className="outline-button" onClick={() => setModal(null)}>Close</button></div>
                </Modal>
            )}

            {modal === "products" && (
                <Modal
                    title="Product Mapping Configuration"
                    subtitle="Map each raw Shopee Product Name to Category → Subcategory. Uncertain listings may remain Other / Unclassified."
                    onClose={() => { setModal(null); setEditedProduct(null); }}
                    wide
                >
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
