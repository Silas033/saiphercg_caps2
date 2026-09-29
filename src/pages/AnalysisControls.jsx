
import {
  FaCalendarAlt, FaUndo, FaMapMarkerAlt, FaLayerGroup, FaBoxOpen,
  FaCheckCircle, FaInfoCircle, FaArrowRight, FaSyncAlt, FaExclamationTriangle
} from "react-icons/fa";
import "../styles/analytics-functional.css";
import { PERIOD_PRESETS, RETURNS_OPTIONS } from "../data/analyticsScope";
import { fetchAnalyticsOptions, fetchDescriptive } from "../data/analyticsApi";

const clone = scope => ({
  period: scope?.period || "All Available Data",
  customStart: scope?.customStart || null,
  customEnd: scope?.customEnd || null,
  returns: scope?.returns || "Include All",
  region: scope?.region || "All Regions",
  province: scope?.province || "All Provinces",
  categories: Array.isArray(scope?.categories) ? [...scope.categories] : null
});

const monthLabel = value => {
  if (!value) return "—";
  const [y, m] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};

export default function AnalysisControls({ appliedScope, onApply }) {
  const [options, setOptions] = useState(null);
  const [draft, setDraft] = useState(() => clone(appliedScope));
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchAnalyticsOptions(controller.signal)
      .then(result => {
        setOptions(result);
        setDraft(current => {
          const next = clone(current);
          next.customStart ||= result.months[0] || null;
          next.customEnd ||= result.months.at(-1) || null;
          next.categories ??= [...result.categories];
          return next;
        });
      })
      .catch(err => err.name !== "AbortError" && setError(err.message))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!options) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      fetchDescriptive(draft, controller.signal)
        .then(setPreview)
        .catch(err => err.name !== "AbortError" && setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draft, options]);

  const selectedCategories = draft.categories || [];
  const provinces = useMemo(() => {
    if (!options) return [];
    return draft.region === "All Regions"
      ? options.provinces
      : options.provinces.filter(item => item.region === draft.region);
  }, [options, draft.region]);

  const periodLabel = draft.period === "Custom Range"
    ? `${monthLabel(draft.customStart)} – ${monthLabel(draft.customEnd)}`
    : draft.period === "Last 12 Months"
      ? `${monthLabel(options?.months?.slice(-12)[0])} – ${monthLabel(options?.months?.at(-1))}`
      : draft.period === "Last 24 Months"
        ? `${monthLabel(options?.months?.slice(-24)[0])} – ${monthLabel(options?.months?.at(-1))}`
        : `${monthLabel(options?.months?.[0])} – ${monthLabel(options?.months?.at(-1))}`;

  const validRange = draft.period !== "Custom Range" || Boolean(
    draft.customStart && draft.customEnd && draft.customStart <= draft.customEnd
  );

  const isDirty = JSON.stringify(clone(draft)) !== JSON.stringify(clone(appliedScope));

  const setField = (field, value) => setDraft(current => ({ ...current, [field]: value }));

  const setRegion = region => setDraft(current => ({ ...current, region, province: "All Provinces" }));

  const setProvince = province => setDraft(current => {
    if (province === "All Provinces") return { ...current, province };
    const match = options.provinces.find(item => item.name === province);
    return { ...current, province, region: match?.region || current.region };
  });

  const toggleCategory = category => setDraft(current => {
    const currentCategories = current.categories ?? [...options.categories];
    return {
      ...current,
      categories: currentCategories.includes(category)
        ? currentCategories.filter(item => item !== category)
        : [...currentCategories, category]
    };
  });

  const selectAll = () => setField("categories", [...options.categories]);
  const clearAll = () => setField("categories", []);

  if (loading) return (
    <div className="af-page"><div className="af-loading-panel">
      <FaSyncAlt className="af-spin" /><strong>Loading analysis controls…</strong>
      <span>Reading options from the prepared Master Data.</span>
    </div></div>
  );

  return (
    <div className="af-page">
      <header className="af-header">
        <div><span className="af-eyebrow">ANALYSIS SCOPE</span><h1>Analysis Controls</h1>
          <p>Set the scope used by Descriptive Analytics. Changes stay in draft until you apply them.</p></div>
        <div className="af-applied-card"><small>Currently applied</small>
          <strong>{clone(appliedScope).period === "Custom Range" ? `${monthLabel(appliedScope.customStart)} – ${monthLabel(appliedScope.customEnd)}` : periodLabel}</strong>
          <span>{appliedScope.region || "All Regions"} → {appliedScope.province || "All Provinces"}</span></div>
      </header>

      {error && <div className="af-alert error"><FaExclamationTriangle /><span>{error}</span></div>}

      <div className="af-layout">
        <main className="af-main">
          <section className="af-card">
            <SectionHeader icon={<FaCalendarAlt />} tone="blue" title="Analysis Period"
              text={`Available coverage: ${monthLabel(options.dateMin)} – ${monthLabel(options.dateMax)}.`} />
            <div className="af-choice-grid four">
              {PERIOD_PRESETS.map(item => <button type="button" key={item} className={draft.period === item ? "active" : ""} onClick={() => setField("period", item)}>{item}</button>)}
            </div>
            {draft.period === "Custom Range" && <div className="af-field-grid two">
              <label><span>From</span><select value={draft.customStart || ""} onChange={e => setField("customStart", e.target.value)}>{options.months.map(m => <option key={m}>{m}</option>)}</select></label>
              <label><span>To</span><select value={draft.customEnd || ""} onChange={e => setField("customEnd", e.target.value)}>{options.months.map(m => <option key={m}>{m}</option>)}</select></label>
            </div>}
            <div className={`af-period-summary ${validRange ? "" : "invalid"}`}><span>Selected period</span><strong>{periodLabel}</strong>{!validRange && <small>End month must be on or after start month.</small>}</div>
          </section>

          <section className="af-card">
            <SectionHeader icon={<FaUndo />} tone="amber" title="Returns / Refunds"
              text="Choose how actual return/refund signals are handled in the descriptive scope." />
            <div className="af-return-grid">
              {RETURNS_OPTIONS.map(item => <button type="button" key={item} className={draft.returns === item ? "active" : ""} onClick={() => setField("returns", item)}><span>{item}</span>{draft.returns === item && <FaCheckCircle />}</button>)}
            </div>
            <div className="af-info"><FaInfoCircle /><span>Only rows marked eligible by ETL are analyzed. Order Status is not a user-facing control. Return/refund treatment uses actual Return / Refund Status and Returned quantity values.</span></div>
          </section>

          <section className="af-card">
            <SectionHeader icon={<FaMapMarkerAlt />} tone="purple" title="Geographic Scope"
              text="Use the prepared Region → Province hierarchy." />
            <div className="af-field-grid two">
              <label><span>Region</span><select value={draft.region} onChange={e => setRegion(e.target.value)}><option>All Regions</option>{options.regions.map(region => <option key={region}>{region}</option>)}</select></label>
              <label><span>Province</span><select value={draft.province} onChange={e => setProvince(e.target.value)}><option>All Provinces</option>{provinces.map(item => <option key={`${item.region}-${item.name}`}>{item.name}</option>)}</select></label>
            </div>
            <div className="af-hierarchy-pill"><FaMapMarkerAlt /><strong>{draft.region}</strong><span>→</span><strong>{draft.province}</strong></div>
          </section>

          <section className="af-card">
            <SectionHeader icon={<FaBoxOpen />} tone="green" title="Product Scope"
              text="Use the controlled product categories for analysis." />
            <div className="af-selection-bar"><div><strong>{selectedCategories.length}</strong> of <strong>{options.categories.length}</strong> categories selected</div><div className="af-selection-actions"><button type="button" onClick={selectAll}>Select all</button><button type="button" onClick={clearAll}>Clear</button></div></div>
            <div className="af-category-grid">
              {options.categories.map(category => <label key={category} className={selectedCategories.includes(category) ? "selected" : ""}><input type="checkbox" checked={selectedCategories.includes(category)} onChange={() => toggleCategory(category)} /><span>{category}</span></label>)}
            </div>
            {!selectedCategories.length && <div className="af-alert warning"><FaExclamationTriangle /><span>Select at least one category before applying the scope.</span></div>}
          </section>
        </main>

        <aside className="af-side">
          <section className="af-card af-sticky">
            <SectionHeader icon={<FaLayerGroup />} tone="navy" title="Scope Summary" text="What Descriptive Analytics will use after Apply Scope." />
            <div className="af-summary-list"><SummaryRow label="Period" value={periodLabel} /><SummaryRow label="Returns" value={draft.returns} /><SummaryRow label="Region" value={draft.region} /><SummaryRow label="Province" value={draft.province} /><SummaryRow label="Categories" value={`${selectedCategories.length} selected`} /></div>
            <div className="af-preview-box"><div className="af-preview-head"><span>Live preview</span>{previewLoading && <FaSyncAlt className="af-spin" />}</div>{preview ? <><strong>{preview.totals.lineCount.toLocaleString()}</strong><small>eligible transaction lines</small><div className="af-preview-stats"><span>₱{preview.totals.revenue.toLocaleString("en-PH", { maximumFractionDigits: 0 })}</span><span>{preview.totals.orders.toLocaleString()} orders</span></div></> : <small>Preview unavailable until prepared data is ready.</small>}</div>
            <button type="button" className="af-apply" disabled={!validRange || !selectedCategories.length} onClick={() => onApply(clone(draft))}>Apply Scope <FaArrowRight /></button>
            {isDirty ? <button type="button" className="af-reset" onClick={() => setDraft(clone(appliedScope))}>Reset to applied scope</button> : <div className="af-applied-status"><FaCheckCircle /> Matches current scope</div>}
          </section>

          <section className="af-card"><h3 className="af-side-title">Scope rules</h3><div className="af-principles"><div><span>01</span><p>Orders = distinct Order IDs.</p></div><div><span>02</span><p>Revenue = prepared transaction-line revenue.</p></div><div><span>03</span><p>Quantity = prepared net quantity.</p></div><div><span>04</span><p>Applied scope drives the descriptive results.</p></div></div></section>
        </aside>
      </div>
    </div>
  );
}

function SectionHeader({ icon, tone, title, text }) { return <div className="af-section-head"><span className={`af-icon ${tone}`}>{icon}</span><div><h2>{title}</h2><p>{text}</p></div></div>; }
function SummaryRow({ label, value }) { return <div className="af-summary-row"><small>{label}</small><strong>{value}</strong></div>; }
