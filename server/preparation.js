import fs from "fs";
import path from "path";
import XLSX from "xlsx";

const TAXONOMY = {
  "Shrink Wrap / Cap Seal": ["Cap Seal", "Shrink Film", "Cling Wrap / Food Wrap", "Shrink Sleeve"],
  "Bottle / Container": ["Bottle", "Container", "Jar"],
  "Tape / Adhesive": ["Packaging Tape", "Double-Sided Tape", "Adhesive Tape"],
  "Label / Sticker": ["Label", "Sticker"],
  "Mailer / Shipping Packaging": ["Poly Mailer", "Courier Bag", "Shipping Bag"],
  "Protective Packaging": ["Bubble Wrap", "Protective Film"],
  "Plastic Bags": ["Sando Bag", "Labo Bag", "Trash / Garbage Bag", "Ice Bag", "Sandwich Bag", "Counter Bag", "Printed Plastic Bag"],
  "Packaging Accessories": ["Rubber Band", "Gloves", "Silica Gel / Desiccant", "Packaging Tool", "Cutter / Cutting Tool"],
  "Packaging / General Supplies": ["Tissue / Cleaning Material", "Rags / Cloth", "Toothpick", "Naphthalene / Moth Balls", "Money Envelope"],
  "Other / Unclassified": ["Other / Unclassified"]
};

const PREPARED_FILE = "prepared_master_data.json";
const STATE_FILE = "preparation_state.json";
const OVERRIDES_FILE = "product_mapping_overrides.json";

const clean = v => String(v ?? "").replace(/\s+/g, " ").trim();
const lower = v => clean(v).toLowerCase();

function number(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  const parens = /^\(.*\)$/.test(s);
  s = s.replace(/PHP/gi, "").replace(/₱/g, "").replace(/,/g, "").replace(/[()\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (parens ? -n : n) : null;
}

function date(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function timeFields(v) {
  const d = date(v);
  if (!d) return { orderCreationDate: null, year: null, month: null, monthName: null, monthNumber: null, yearMonth: null, quarter: null };
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return {
    orderCreationDate: `${y}-${String(m).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    year: y,
    month: m,
    monthName: d.toLocaleString("en-US", { month: "long" }),
    monthNumber: m,
    yearMonth: `${y}-${String(m).padStart(2, "0")}`,
    quarter: `Q${Math.ceil(m / 3)}`
  };
}

function productClass(raw) {
  const s = lower(raw);
  const mapped = (category, subcategory) => ({ category, subcategory, status: "Mapped" });
  if (!s) return { category: "Other / Unclassified", subcategory: "Other / Unclassified", status: "Unmapped" };

  if (/cap\s*seal|pvc\s*seal|shrink\s*cap/.test(s)) return mapped("Shrink Wrap / Cap Seal", "Cap Seal");
  if (/shrink\s*(film|wrap)|plastic\s*shrink/.test(s)) return mapped("Shrink Wrap / Cap Seal", "Shrink Film");
  if (/cling\s*(wrap|film)|food\s*(wrap|film)/.test(s)) return mapped("Shrink Wrap / Cap Seal", "Cling Wrap / Food Wrap");
  if (/shrink\s*sleeve/.test(s)) return mapped("Shrink Wrap / Cap Seal", "Shrink Sleeve");

  if (/\bjar\b/.test(s)) return mapped("Bottle / Container", "Jar");
  if (/\bbottle\b/.test(s)) return mapped("Bottle / Container", "Bottle");
  if (/\bcontainer\b/.test(s)) return mapped("Bottle / Container", "Container");

  if (/double\s*sided|double\s*tape/.test(s)) return mapped("Tape / Adhesive", "Double-Sided Tape");
  if (/packaging\s*tape|packing\s*tape|carton\s*tape|brown\s*tape/.test(s)) return mapped("Tape / Adhesive", "Packaging Tape");
  if (/adhesive\s*tape|masking\s*tape|foam\s*tape/.test(s)) return mapped("Tape / Adhesive", "Adhesive Tape");

  if (/\bsticker\b/.test(s)) return mapped("Label / Sticker", "Sticker");
  if (/\blabel\b/.test(s)) return mapped("Label / Sticker", "Label");

  if (/poly\s*mailer|mailer\s*bag/.test(s)) return mapped("Mailer / Shipping Packaging", "Poly Mailer");
  if (/courier\s*bag/.test(s)) return mapped("Mailer / Shipping Packaging", "Courier Bag");
  if (/shipping\s*bag/.test(s)) return mapped("Mailer / Shipping Packaging", "Shipping Bag");

  if (/bubble\s*wrap|bubble\s*film|air\s*bubble/.test(s)) return mapped("Protective Packaging", "Bubble Wrap");
  if (/protective\s*film|protection\s*film|surface\s*film/.test(s)) return mapped("Protective Packaging", "Protective Film");

  if (/sando\s*bag/.test(s)) return mapped("Plastic Bags", "Sando Bag");
  if (/labo\s*bag/.test(s)) return mapped("Plastic Bags", "Labo Bag");
  if (/trash\s*bag|garbage\s*bag|basura\s*bag/.test(s)) return mapped("Plastic Bags", "Trash / Garbage Bag");
  if (/ice\s*bag/.test(s)) return mapped("Plastic Bags", "Ice Bag");
  if (/sandwich\s*bag/.test(s)) return mapped("Plastic Bags", "Sandwich Bag");
  if (/counter\s*bag/.test(s)) return mapped("Plastic Bags", "Counter Bag");
  if (/printed\s*(plastic\s*)?bag|custom\s*printed\s*bag/.test(s)) return mapped("Plastic Bags", "Printed Plastic Bag");

  if (/rubber\s*band|elastic\s*band/.test(s)) return mapped("Packaging Accessories", "Rubber Band");
  if (/\bgloves?\b/.test(s)) return mapped("Packaging Accessories", "Gloves");
  if (/silica\s*gel|desiccant/.test(s)) return mapped("Packaging Accessories", "Silica Gel / Desiccant");
  if (/cutter|cutting\s*tool|utility\s*knife|box\s*cutter/.test(s)) return mapped("Packaging Accessories", "Cutter / Cutting Tool");
  if (/packaging\s*tool|packing\s*tool|heat\s*gun/.test(s)) return mapped("Packaging Accessories", "Packaging Tool");

  if (/tissue|kitchen\s*towel|cleaning\s*material|cleaning\s*cloth/.test(s)) return mapped("Packaging / General Supplies", "Tissue / Cleaning Material");
  if (/\brags?\b|wiping\s*cloth/.test(s)) return mapped("Packaging / General Supplies", "Rags / Cloth");
  if (/toothpick/.test(s)) return mapped("Packaging / General Supplies", "Toothpick");
  if (/naphthalene|moth\s*ball/.test(s)) return mapped("Packaging / General Supplies", "Naphthalene / Moth Balls");
  if (/money\s*envelope|cash\s*envelope|ang\s*pao/.test(s)) return mapped("Packaging / General Supplies", "Money Envelope");

  return { category: "Other / Unclassified", subcategory: "Other / Unclassified", status: "Review" };
}

function geoClass(rawProvince, rawCity) {
  const sourceRegion = clean(rawProvince);
  const sourceProvince = clean(rawCity);
  let region = sourceRegion || "Unclassified";
  let province = sourceProvince || "Unclassified";
  if (province.toLowerCase() === "aurora") region = "North Luzon";
  return { region, province, status: sourceRegion && sourceProvince ? "Mapped" : "Review" };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}

function readRows(imports, uploadDir) {
  const rows = [];
  const columns = new Set();
  for (const item of imports) {
    const filePath = path.join(uploadDir, item.storedFileName);
    if (!fs.existsSync(filePath)) continue;
    const wb = XLSX.readFile(filePath, { cellDates: true });
    if (!wb.SheetNames.includes("orders")) continue;
    const data = XLSX.utils.sheet_to_json(wb.Sheets.orders, { defval: null, raw: false });
    data.forEach((row, i) => {
      Object.keys(row).forEach(c => columns.add(c));
      rows.push({ item, row, sourceRow: i + 2 });
    });
  }
  return { rows, columns: [...columns].sort() };
}

export function createPreparationService({ uploadDir, dataDir, databaseFile }) {
  const preparedFile = path.join(dataDir, PREPARED_FILE);
  const stateFile = path.join(dataDir, STATE_FILE);
  const overridesFile = path.join(dataDir, OVERRIDES_FILE);
  let cachedBuild = null;

  function imports() {
    const db = readJson(databaseFile);
    return (db.imports || []).filter(x => x.status === "Ready" && x.storedFileName);
  }

  function build() {
    if (cachedBuild) return cachedBuild;
    const ready = imports();
    if (!ready.length) throw new Error("No ready imported datasets are available for preparation.");
    const { rows, columns } = readRows(ready, uploadDir);
    const overrides = readJson(overridesFile);
    const hashes = new Set();
    const duplicateRows = [];
    const duplicateIndex = new Set();
    const products = new Map();
    const geography = new Map();
    const statusOrders = new Map();
    const returnOrders = new Map();
    const master = [];
    let invalidDates = 0, invalidQty = 0, invalidReturn = 0, excessiveReturn = 0;
    const hashOf = row => JSON.stringify(columns.map(c => row[c] ?? null));

    rows.forEach((x, i) => {
      const r = x.row;
      const h = hashOf(r);
      if (hashes.has(h)) {
        duplicateIndex.add(i);
        if (duplicateRows.length < 100) duplicateRows.push({ row: x.sourceRow, orderId: clean(r["Order ID"]), productName: clean(r["Product Name"]), date: clean(r["Order Creation Date"]), quantity: number(r["Quantity"]) });
      } else hashes.add(h);

      const orderId = clean(r["Order ID"]);
      const status = clean(r["Order Status"]);
      const rawProductName = clean(r["Product Name"]);
      const t = timeFields(r["Order Creation Date"]);
      const qty = number(r["Quantity"]);
      const returned = number(r["Returned quantity"]);
      if (!t.orderCreationDate) invalidDates++;
      if (qty === null || qty < 0) invalidQty++;
      if (returned !== null && returned < 0) invalidReturn++;
      if (qty !== null && returned !== null && returned > qty) excessiveReturn++;

      const override = overrides[rawProductName];
      const p = override || productClass(rawProductName);
      const g = geoClass(r["Province"], r["City"]);
      const productKey = rawProductName || "__EMPTY__";
      products.set(productKey, { rawProductName: rawProductName || "Other / Unclassified", category: p.category, subcategory: p.subcategory, status: p.status });
      const geoKey = `${clean(r["Province"])}|||${clean(r["City"])}`;
      geography.set(geoKey, { rawProvince: clean(r["Province"]), rawCity: clean(r["City"]), region: g.region, province: g.province, status: g.status });

      if (orderId) {
        if (!statusOrders.has(orderId)) statusOrders.set(orderId, new Set());
        if (status) statusOrders.get(orderId).add(status);
        if (clean(r["Return / Refund Status"]) || (returned ?? 0) > 0) {
          if (!returnOrders.has(orderId)) returnOrders.set(orderId, { statuses: new Set(), products: new Set(), returnedQuantity: 0 });
          const ri = returnOrders.get(orderId);
          const rs = clean(r["Return / Refund Status"]);
          if (rs) ri.statuses.add(rs);
          if (rawProductName) ri.products.add(rawProductName);
          if (returned !== null) ri.returnedQuantity += returned;
        }
      }

      if (duplicateIndex.has(i)) return;
      const included = status.toLowerCase() === "completed";
      const safeQty = qty !== null && qty >= 0 ? qty : 0;
      const safeReturned = returned !== null && returned >= 0 ? returned : 0;
      const pd = date(r["Order Paid Time"]), st = date(r["Ship Time"]), oc = date(r["Order Complete Time"]);
      master.push({
        etl_run_id: null,
        source_file_name: x.item.fileName,
        source_row_number: x.sourceRow,
        order_id: orderId,
        order_status: status || null,
        return_refund_status: clean(r["Return / Refund Status"]) || null,
        order_creation_date: t.orderCreationDate,
        order_paid_time: pd?.toISOString() ?? null,
        ship_time: st?.toISOString() ?? null,
        order_complete_time: oc?.toISOString() ?? null,
        year: t.year, month: t.month, month_name: t.monthName, month_number: t.monthNumber, year_month: t.yearMonth, quarter: t.quarter,
        raw_province: clean(r["Province"]) || null,
        raw_city: clean(r["City"]) || null,
        region: g.region, province: g.province,
        raw_product_name: rawProductName || "Other / Unclassified",
        category: p.category, subcategory: p.subcategory,
        quantity: safeQty,
        returned_quantity: returned,
        net_quantity: Math.max(0, safeQty - safeReturned),
        line_revenue: number(r["Total Buyer Payment"]) ?? 0,
        total_discount: number(r["Total Discount(PHP)"]) ?? 0,
        seller_price_discount: number(r["Price Discount(from Seller)(PHP)"]) ?? 0,
        shopee_rebate: number(r["Shopee Rebate(PHP)"]) ?? 0,
        service_fee: number(r["Service Fee"]) ?? 0,
        is_exact_duplicate: false,
        is_included_in_analysis: included,
        exclusion_reason: included ? null : "Non-Completed order status"
      });
    });

    const uniqueOrders = new Set(rows.map(x => clean(x.row["Order ID"])).filter(Boolean));
    const nonCompleted = [...statusOrders.entries()].filter(([, s]) => !([...s].length === 1 && [...s][0].toLowerCase() === "completed"));
    const dates = master.map(x => x.order_creation_date).filter(Boolean).sort();
    const quality = {
      duplicateRows: duplicateIndex.size,
      nonCompletedOrders: nonCompleted.length,
      returnRefundOrders: returnOrders.size,
      invalidDateRecords: invalidDates,
      invalidQuantityRecords: invalidQty,
      invalidReturnQuantityRecords: invalidReturn,
      excessiveReturnQuantityRecords: excessiveReturn
    };
    const state = {
      generatedAt: new Date().toISOString(),
      source: { filesImported: ready.length, transactionLines: rows.length, uniqueOrders: uniqueOrders.size, uniqueProducts: products.size, dateCoverage: { min: dates[0] || null, max: dates.at(-1) || null } },
      quality,
      validation: {
        geographicMappingPrepared: geography.size > 0,
        productClassificationPrepared: products.size > 0,
        duplicateHandlingReviewed: duplicateIndex.size === 0,
        timeFieldsGenerated: master.length > 0 && master.every(x => x.year_month),
        analyticalMeasuresPrepared: master.length > 0
      }
    };
    state.readyForAnalysis = Object.values(state.validation).every(Boolean);

    const statusReview = nonCompleted.slice(0, 100).map(([orderId, statuses]) => ({ orderId, statuses: [...statuses] }));
    const returnReview = [...returnOrders.entries()].slice(0, 100).map(([orderId, x]) => ({ orderId, returnStatuses: [...x.statuses], products: [...x.products].slice(0, 5), returnedQuantity: x.returnedQuantity }));

    cachedBuild = { master, state, products: [...products.values()], geography: [...geography.values()], duplicateRows, statusReview, returnReview, quality, taxonomy: TAXONOMY, timeFields: [
      { field: "Year", format: "YYYY", example: "2025" }, { field: "Month", format: "Month name", example: "November" }, { field: "Month Number", format: "1–12", example: "11" }, { field: "Year-Month", format: "YYYY-MM", example: "2025-11" }, { field: "Quarter", format: "Q1–Q4", example: "Q4" }
    ] };
    return cachedBuild;
  }

  function run() {
    cachedBuild = null;
    const result = build();
    const runId = `${Date.now()}-prep`;
    result.master.forEach(x => { x.etl_run_id = runId; });
    fs.writeFileSync(preparedFile, JSON.stringify(result.master, null, 2));
    result.state.runId = runId;
    result.state.validation.duplicateHandlingReviewed = result.quality.duplicateRows === 0;
    result.state.readyForAnalysis = Object.values(result.state.validation).every(Boolean);
    fs.writeFileSync(stateFile, JSON.stringify(result.state, null, 2));
    return result.state;
  }

  function current() {
    const state = fs.existsSync(stateFile) ? readJson(stateFile) : { prepared: false, readyForAnalysis: false };
    return { prepared: fs.existsSync(preparedFile), ...state };
  }

  function productList(search = "") {
    const result = build();
    const q = lower(search);
    return { records: result.products.filter(x => !q || lower(x.rawProductName).includes(q)), taxonomy: result.taxonomy };
  }

  function saveProductMapping({ rawProductName, category, subcategory }) {
    if (!TAXONOMY[category] || !TAXONOMY[category].includes(subcategory)) throw new Error("Invalid product category or subcategory.");
    const overrides = readJson(overridesFile);
    overrides[rawProductName] = { category, subcategory, status: category === "Other / Unclassified" ? "Review" : "Mapped" };
    fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2));
    cachedBuild = null;
    return overrides[rawProductName];
  }

  return {
    profile: () => { const x = build(); return { source: x.state.source, quality: x.quality }; },
    duplicates: () => { const x = build(); return { total: x.quality.duplicateRows, records: x.duplicateRows }; },
    statuses: () => { const x = build(); return { totalOrders: x.quality.nonCompletedOrders, records: x.statusReview }; },
    returns: () => { const x = build(); return { totalOrders: x.quality.returnRefundOrders, records: x.returnReview }; },
    geography: () => { const x = build(); return { total: x.geography.length, records: x.geography }; },
    products: productList,
    saveProductMapping,
    timeFields: () => build().timeFields,
    run,
    status: current,
    masterSummary: () => {
      if (!fs.existsSync(preparedFile)) return { prepared: false };
      const rows = readJson(preparedFile);
      return { prepared: true, records: rows.length, includedRecords: rows.filter(x => x.is_included_in_analysis).length, excludedRecords: rows.filter(x => !x.is_included_in_analysis).length };
    }
  };
}
