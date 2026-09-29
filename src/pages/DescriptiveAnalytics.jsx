import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaMoneyBillWave, FaShoppingCart, FaCubes, FaChartLine, FaBoxOpen,
  FaLightbulb, FaArrowUp, FaArrowDown, FaMapMarkerAlt, FaUndo,
  FaSyncAlt, FaExclamationTriangle, FaChevronDown, FaChevronRight, FaTimes
} from "react-icons/fa";
import "../styles/analytics-functional.css";
import { DEFAULT_SCOPE } from "../data/analyticsScope";
import { fetchDescriptive } from "../data/analyticsApi";

const money = value => `₱${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
const shortMoney = value => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1e6) return `₱${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `₱${(n / 1e3).toFixed(1)}K`;
  return money(n);
};
const pct = value => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
const clone = scope => ({
  period: scope?.period || "All Available Data",
  customStart: scope?.customStart || null,
  customEnd: scope?.customEnd || null,
  returns: scope?.returns || "Include All",
  region: scope?.region || "All Regions",
  province: scope?.province || "All Provinces",
  categories: scope?.categories == null ? null : [...scope.categories]
});

export default function DescriptiveAnalytics({ scope = DEFAULT_SCOPE }) {
  const applied = useMemo(() => clone(scope), [scope]);
  const [data, setData] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drillLoading, setDrillLoading] = useState(false);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState("revenue");
  const [geoTab, setGeoTab] = useState("regions");
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedProvince, setSelectedProvince] = useState(null);

  const drillToken = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    drillToken.current += 1;
    setLoading(true); setError(""); setSelectedRegion(null); setSelectedProvince(null); setDrillLoading(false);
    fetchDescriptive(applied, controller.signal)
      .then(result => { setData(result); setViewData(result); })
      .catch(err => { if (err.name !== "AbortError") { setData(null); setError(err.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied]);

  const openGeo = async (region, province = "All Provinces") => {
    const token = ++drillToken.current;
    setSelectedRegion(region || null);
    setSelectedProvince(province !== "All Provinces" ? province : null);
    setDrillLoading(true);
    try {
      const result = await fetchDescriptive({ ...applied, region: region || "All Regions", province });
      if (token === drillToken.current) setViewData(result);
    } catch (err) {
      if (token === drillToken.current) {
        setError(err.message);
        setSelectedRegion(null); setSelectedProvince(null); setViewData(data);
      }
    } finally {
      if (token === drillToken.current) setDrillLoading(false);
    }
  };

  const clearGeo = () => {
    drillToken.current += 1;
    setSelectedRegion(null); setSelectedProvince(null); setViewData(data); setDrillLoading(false);
  };

  if (loading) return <div className="df-page"><div className="df-loading-panel"><FaSyncAlt className="af-spin" /><strong>Loading Descriptive Analytics…</strong><span>Calculating historical performance from the prepared Master Data.</span></div></div>;
  if (!data) return <div className="df-page"><div className="df-error-panel"><FaExclamationTriangle /><h2>Descriptive Analytics is not available</h2><p>{error || "Run Data Preparation first."}</p></div></div>;

  const active = viewData || data;
  const trend = data.trend || [];
  const values = trend.map(item => Number(item[metric] || 0));
  const max = Math.max(1, ...values);
  const latest = trend.at(-1)?.[metric] || 0;
  const previous = trend.at(-2)?.[metric] || 0;
  const mom = previous > 0 ? latest / previous - 1 : null;
  const regions = data.regionRows || [];
  const provinces = data.provinceRows || [];
  const categories = active.categoryRows || [];

  const regionProvinceMap = new Map();
  provinces.forEach(item => {
    if (!regionProvinceMap.has(item.region)) regionProvinceMap.set(item.region, []);
    regionProvinceMap.get(item.region).push(item);
  });

  return (
    <div className="df-page">
      <header className="df-header"><div><span className="df-eyebrow">DESCRIPTIVE ANALYTICS</span><h1>Descriptive Analytics</h1><p>Understand what sold, where demand was concentrated, and how historical performance changed within the applied scope.</p></div><div className="df-header-scope"><small>Applied scope</small><strong>{data.period.label}</strong><span>{data.scope.region} → {data.scope.province}</span></div></header>

      {error && <div className="df-alert"><FaExclamationTriangle /><span>{error}</span><button type="button" onClick={() => setError("")}><FaTimes /></button></div>}

      <div className="df-scope-bar"><div><small>Period</small><strong>{data.period.label}</strong></div><div><small>Returns</small><strong>{data.scope.returns}</strong></div><div><small>Geography</small><strong>{data.scope.region} → {data.scope.province}</strong></div><div><small>Categories</small><strong>{data.scope.categories == null ? "All categories" : `${data.scope.categories.length} selected`}</strong></div><span className="df-source">Source: prepared Master Data</span></div>

      <section className="df-kpis">
        <KpiCard icon={<FaMoneyBillWave />} label="Total Revenue" value={money(data.totals.revenue)} change={data.changeVsPrevious?.revenue} tone="blue" />
        <KpiCard icon={<FaShoppingCart />} label="Total Orders" value={data.totals.orders.toLocaleString()} change={data.changeVsPrevious?.orders} tone="purple" />
        <KpiCard icon={<FaCubes />} label="Quantity Sold" value={data.totals.quantity.toLocaleString()} change={data.changeVsPrevious?.quantity} tone="green" />
        <KpiCard icon={<FaChartLine />} label="Average Order Value" value={money(data.totals.aov)} detail="Revenue ÷ distinct orders" tone="amber" />
      </section>

      <div className="df-grid-two">
        <section className="df-card"><div className="df-card-head between"><div><h2>Historical Trend</h2><p>{data.period.months.length} month{data.period.months.length === 1 ? "" : "s"} in the applied period.</p></div><div className="df-segmented">{[["revenue", "Revenue"], ["orders", "Orders"], ["quantity", "Quantity"]].map(([key, label]) => <button type="button" key={key} className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{label}</button>)}</div></div>
          <div className="df-chart"><div className="df-chart-y"><span>{metric === "revenue" ? shortMoney(max) : max.toLocaleString()}</span><span>0</span></div><div className="df-chart-main"><div className="df-gridline" style={{ top: "8%" }} /><div className="df-gridline" style={{ top: "35%" }} /><div className="df-gridline" style={{ top: "62%" }} /><div className="df-gridline" style={{ top: "89%" }} /><svg viewBox="0 0 720 260" preserveAspectRatio="none"><polyline className="df-line" points={values.map((v, i) => `${values.length <= 1 ? 360 : 12 + i * (696 / (values.length - 1))},${224 - (v / max) * 190}`).join(" ")} />{values.map((v, i) => <circle key={i} cx={values.length <= 1 ? 360 : 12 + i * (696 / (values.length - 1))} cy={224 - (v / max) * 190} r="4" className="df-point" />)}</svg><div className="df-chart-labels">{trend.filter((_, i) => trend.length <= 8 || i === 0 || i === trend.length - 1 || i % Math.ceil(trend.length / 6) === 0).map(item => <span key={item.month}>{item.label}</span>)}</div></div></div>
          <div className="df-trend-summary"><div><small>Latest month</small><strong>{metric === "revenue" ? shortMoney(latest) : latest.toLocaleString()}</strong></div><div className={mom == null || mom >= 0 ? "positive" : "negative"}>{mom == null ? "No prior month" : <>{mom >= 0 ? <FaArrowUp /> : <FaArrowDown />}{Math.abs(mom * 100).toFixed(1)}% vs previous month</>}</div></div>
        </section>

        <section className="df-card"><div className="df-card-head"><div className="df-card-icon purple"><FaMapMarkerAlt /></div><div><h2>Geographic Performance</h2><p>Click a region to reveal its top 5 provinces.</p></div></div><div className="df-tabs"><button type="button" className={geoTab === "regions" ? "active" : ""} onClick={() => setGeoTab("regions")}>Regions</button><button type="button" className={geoTab === "provinces" ? "active" : ""} onClick={() => setGeoTab("provinces")}>Top Provinces</button></div>
          {geoTab === "regions" ? <div className="df-region-list">{regions.map((region, index) => {
            const expanded = selectedRegion === region.name;
            const regionSelected = expanded && !selectedProvince;
            const list = (regionProvinceMap.get(region.name) || []).slice(0, 5);
            return <div key={region.name} className="df-region-block"><button type="button" className={`df-region-row ${regionSelected ? "selected" : ""}`} onClick={() => (regionSelected ? clearGeo() : openGeo(region.name))}><span className="df-chevron">{expanded ? <FaChevronDown /> : <FaChevronRight />}</span><span className="df-rank">{index + 1}</span><div className="df-rank-main"><strong>{region.name}</strong><small>{region.orders.toLocaleString()} orders · {region.quantity.toLocaleString()} units</small></div><div className="df-rank-stat"><strong>{shortMoney(region.revenue)}</strong><small>{pct(region.share)} of scope</small></div><div className="df-progress"><span style={{ width: `${Math.min(100, region.share * 100)}%` }} /></div></button>
              {expanded && <div className="df-breakout"><div className="df-breakout-head"><div><strong>Top 5 provinces in {region.name}</strong><small>Click a province to view its category performance.</small></div></div>{list.map((province, i) => <button type="button" key={province.name} className={`df-breakout-row ${selectedProvince === province.name ? "selected" : ""}`} onClick={() => openGeo(region.name, province.name)}><span>{i + 1}</span><strong>{province.name}</strong><small>{shortMoney(province.revenue)} · {region.revenue > 0 ? pct(province.revenue / region.revenue) : "—"} of region</small></button>)}</div>}</div>;
          })}</div> : <div className="df-region-list">{provinces.slice(0, 5).map((province, index) => <button type="button" key={province.name} className={`df-region-row ${selectedProvince === province.name ? "selected" : ""}`} onClick={() => openGeo(province.region, province.name)}><span className="df-chevron"><FaMapMarkerAlt /></span><span className="df-rank">{index + 1}</span><div className="df-rank-main"><strong>{province.name}</strong><small>{province.region} · {province.orders.toLocaleString()} orders</small></div><div className="df-rank-stat"><strong>{shortMoney(province.revenue)}</strong><small>{pct(province.share)} of scope</small></div><div className="df-progress"><span style={{ width: `${Math.min(100, province.share * 100)}%` }} /></div></button>)}</div>}
        </section>
      </div>

      <section className="df-card"><div className="df-card-head between"><div><div className="df-card-icon green"><FaBoxOpen /></div><div className="df-title-block"><h2>Category Performance</h2><p>Category results update for the selected geographic view.</p></div></div><div className="df-scope-context"><small>Current geographic view</small><strong>{active.scope.region} → {active.scope.province}</strong>{(selectedRegion || selectedProvince) && <button type="button" onClick={clearGeo}>Clear drill-down</button>}</div></div>{drillLoading && <div className="df-drill-loading"><FaSyncAlt className="af-spin" /> Updating category performance…</div>}<div className="df-table-wrap"><table className="df-table"><thead><tr><th>Category</th><th>Revenue</th><th>Quantity</th><th>Share of selected scope</th><th>Active lines</th></tr></thead><tbody>{categories.map(item => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{shortMoney(item.revenue)}</td><td>{item.quantity.toLocaleString()}</td><td><span className="df-tag">{pct(item.share)}</span></td><td>{item.lineCount.toLocaleString()}</td></tr>)}{!categories.length && <tr><td colSpan="5" className="df-empty">No categories match the applied scope.</td></tr>}</tbody></table></div></section>

      <div className="df-grid-two"><section className="df-card"><div className="df-card-head"><div className="df-card-icon amber"><FaLightbulb /></div><div><h2>Computed Insights</h2><p>Deterministic observations from the applied scope.</p></div></div><div className="df-insights">{data.insights.map(item => <div className="df-insight" key={`${item.type}-${item.title}`}><span><FaLightbulb /></span><div><strong>{item.title}</strong><p>{item.text}</p></div></div>)}</div></section><section className="df-card df-method-card"><div className="df-card-head"><div className="df-card-icon blue"><FaUndo /></div><div><h2>Data Treatment</h2><p>How this view interprets the current scope.</p></div></div><div className="df-method-list"><div><small>Returns</small><strong>{data.scope.returns}</strong></div><div><small>Eligible lines</small><strong>{data.totals.lineCount.toLocaleString()}</strong></div><div><small>Return/refund lines</small><strong>{data.returns.returnedLines.toLocaleString()}</strong></div><div><small>Return/refund orders</small><strong>{data.returns.returnedOrders.toLocaleString()}</strong></div></div><p className="df-method-note">Orders are distinct Order IDs. Revenue uses prepared transaction-line revenue. Quantity uses prepared net quantity.</p></section></div>
    </div>
  );
}

function KpiCard({ icon, label, value, change, detail, tone }) { return <div className={`df-kpi-card ${tone}`}><span className="df-kpi-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong>{change != null ? <span className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? <FaArrowUp /> : <FaArrowDown />} {Math.abs(change * 100).toFixed(1)}% vs previous period</span> : <span>{detail}</span>}</div></div>; }
