// Only the server holds the Supabase secret. Analytics never falls back to local ETL files.
export const ANALYTICS_COLUMNS = "id,etl_run_id,order_id,order_creation_date,year_month,region,province,category,line_revenue,quantity,net_quantity,returned_quantity,return_refund_status,is_included_in_analysis,is_exact_duplicate";

export async function loadMasterRows(client) {
    if (!client) throw new Error("Supabase is not configured on the server.");
    const maximumPageSize = 1000;
    const concurrentPages = 6;
    const readPage = async (from, limit = maximumPageSize, expectedCount = null) => {
        const { data, error, count } = await client.from("master_transactions")
            .select(ANALYTICS_COLUMNS, { count: "exact" })
            .order("id", { ascending: true }).range(from, from + limit - 1)
            .abortSignal(AbortSignal.timeout(15000));
        if (error) throw new Error(`Unable to load Supabase analytics: ${error.message}`);
        if (!Array.isArray(data) || count === null) throw new Error("Supabase returned an incomplete analytics response.");
        if (expectedCount !== null && expectedCount !== count) throw new Error("The dataset changed while loading. Please retry.");
        return { data, count };
    };

    const first = await readPage(0);
    const expected = first.count;
    // Supabase can enforce a project-level row cap below the requested range.
    // Use the first response's size as the page stride so later ranges do not skip rows.
    const pageSize = first.data.length < maximumPageSize ? first.data.length : maximumPageSize;
    if (expected > 0 && pageSize === 0) throw new Error("Supabase analytics row count does not match.");
    const rows = [...first.data];
    for (let offset = pageSize; offset < expected; offset += pageSize * concurrentPages) {
        const offsets = Array.from(
            { length: Math.min(concurrentPages, Math.ceil((expected - offset) / pageSize)) },
            (_, index) => offset + index * pageSize
        );
        const pages = await Promise.all(offsets.map(pageOffset => readPage(pageOffset, pageSize, expected)));
        pages.forEach(({ data }, index) => {
            const pageOffset = offsets[index];
            const expectedLength = Math.min(pageSize, expected - pageOffset);
            if (data.length !== expectedLength) throw new Error("Supabase analytics row count does not match.");
            rows.push(...data);
        });
    }
    if (rows.length !== expected) throw new Error("Supabase analytics row count does not match.");
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("The dataset changed while paging. Please retry.");
    return rows;
}

export function createAnalyticsCache(client, { ttl = 30000, now = Date.now } = {}) {
    let snapshot = null;
    let loadedAt = 0;
    let pending = null;
    let writing = false;
    let writeError = null;
    async function get(force = false) {
        if (writing) throw new Error("Data Preparation is syncing. Please try again shortly.");
        if (writeError) throw writeError;
        if (pending) return pending;
        if (!force && snapshot && now() - loadedAt < ttl) return snapshot;
        pending = loadMasterRows(client).then(async rows => {
            attachAdjustments(rows, await loadAdjustments(client));
            loadedAt = now();
            snapshot = { rows, loadedAt: new Date(loadedAt).toISOString() };
            return snapshot;
        }).finally(() => { pending = null; });
        return pending;
    }
    async function sync(write) {
        if (writing) throw new Error("A Supabase sync is already in progress.");
        writing = true;
        try {
            // Drain an earlier read before replacing the remote dataset.
            if (pending) await pending.catch(() => {});
            const result = await write();
            writeError = null;
            snapshot = null;
            writing = false;
            await get(true);
            return result;
        } catch (error) {
            snapshot = null;
            writeError = new Error("Supabase sync or verification failed. Run Data Preparation again before using analytics.");
            throw error;
        } finally {
            writing = false;
        }
    }
    return { get, sync };
}

const clean = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const eligible = row => row.is_included_in_analysis === true && row.is_exact_duplicate !== true;
const regionName = row => clean(row.region) || "Unknown Region";
const provinceName = row => clean(row.province) || "Unknown Province";
const categoryName = row => clean(row.category) || "Other / Unclassified";
const monthOf = row => clean(row.year_month) || clean(row.order_creation_date).slice(0, 7);
const approvedReturn = row => /^(request approved|approved|refunded|returned)$/i.test(clean(row.return_refund_status));
const hasReturn = row => approvedReturn(row) || number(row.returned_quantity) > 0;
const sorted = values => [...new Set(values)].sort((a, b) => a.localeCompare(b));

// ---------------------------------------------------------------------------
// Dataset completeness. Transaction dates do not prove a boundary month is fully
// uploaded, but a month whose last record is before the calendar month-end is
// demonstrably incomplete. Such months are flagged so that trends, growth
// comparisons and forecasts never treat a part-month as a full month.
// ---------------------------------------------------------------------------
const lastDayOfMonth = month => {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
    return date.toISOString().slice(0, 10);
};
export const shiftMonth = (month, offset) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    return date.toISOString().slice(0, 7);
};
const addDays = (day, count) => {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ADJUSTMENT_KINDS = new Set(["no_sales", "closure", "data_gap", "anomaly"]);
const adjustmentRegistry = new WeakMap();
const adjustmentWarningRegistry = new WeakMap();
const boundsCache = new WeakMap();
const isIsoDay = value => {
    if (!DAY_PATTERN.test(value || "")) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export function normalizeAdjustments(list) {
    const invalid = [];
    const normalized = [];
    for (const item of Array.isArray(list) ? list : []) {
        const start = clean(item?.start_date).slice(0, 10);
        const end = clean(item?.end_date).slice(0, 10);
        if (!isIsoDay(start) || !isIsoDay(end) || end < start || !ADJUSTMENT_KINDS.has(item?.kind) || typeof item?.exclude_from_training !== "boolean") {
            invalid.push({ type: "invalid_row", id: item?.id ?? null });
            continue;
        }
        normalized.push({ id: item.id ?? null, start, end, kind: item.kind, reason: clean(item.reason), exclude_from_training: item.exclude_from_training });
    }
    normalized.sort((a, b) => a.start.localeCompare(b.start));
    Object.defineProperty(normalized, "warnings", { value: invalid, enumerable: false });
    return normalized;
}
export function attachAdjustments(masterRows, adjustments) {
    const normalized = normalizeAdjustments(adjustments);
    adjustmentRegistry.set(masterRows, normalized);
    adjustmentWarningRegistry.set(masterRows, normalized.warnings || []);
    boundsCache.delete(masterRows);
    return masterRows;
}
export async function loadAdjustments(client) {
    try {
        const { data, error } = await client.from("data_adjustments").select("id,start_date,end_date,kind,reason,exclude_from_training").order("start_date");
        if (error) {
            if (!/does not exist|schema cache/i.test(error.message || "")) console.warn("Data adjustments could not be loaded:", error.message);
            return [];
        }
        return data || [];
    } catch (error) {
        if (!/does not exist|schema cache/i.test(error?.message || "")) console.warn("Data adjustments could not be loaded:", error?.message || error);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Dataset completeness. Transaction dates do not prove a boundary month is fully
// uploaded, but a month whose coverage ends before the calendar month-end is
// demonstrably incomplete. Coverage ends at the last transaction, extended through
// any explicit known-zero period that starts right after it. Part-months are flagged so that
// trends, growth comparisons and forecasts never treat them as full months.
// ---------------------------------------------------------------------------
export function datasetBounds(masterRows, { now = new Date() } = {}) {
    const today = new Date(now).toISOString().slice(0, 10);
    const cacheMap = Array.isArray(masterRows) ? boundsCache.get(masterRows) : null;
    if (cacheMap?.has(today)) return cacheMap.get(today);
    const adjustments = (Array.isArray(masterRows) && adjustmentRegistry.get(masterRows)) || [];
    const warnings = [...((Array.isArray(masterRows) && adjustmentWarningRegistry.get(masterRows)) || [])];
    let dateMin = null;
    let dateMax = null;
    for (const row of masterRows || []) {
        if (!eligible(row)) continue;
        const day = clean(row.order_creation_date).slice(0, 10);
        if (!day) continue;
        if (!dateMin || day < dateMin) dateMin = day;
        if (!dateMax || day > dateMax) dateMax = day;
    }
    let coverageEnd = dateMax && dateMax > today ? today : dateMax;
    const knownZero = adjustments.filter(item => item.kind === "no_sales" || item.kind === "closure");
    for (let changed = !!coverageEnd; changed;) {
        changed = false;
        for (const adjustment of knownZero) {
            const boundedEnd = adjustment.end > today ? today : adjustment.end;
            if (adjustment.start <= addDays(coverageEnd, 1) && boundedEnd > coverageEnd) { coverageEnd = boundedEnd; changed = true; }
        }
    }
    for (const adjustment of knownZero) {
        if (dateMax && adjustment.start > addDays(coverageEnd || dateMax, 1)) warnings.push({ type: "not_contiguous", id: adjustment.id });
        const hits = (masterRows || []).filter(row => eligible(row) && clean(row.order_creation_date).slice(0, 10) >= adjustment.start && clean(row.order_creation_date).slice(0, 10) <= adjustment.end);
        if (hits.length) warnings.push({ type: "sales_inside", id: adjustment.id, kind: adjustment.kind, lines: hits.length, firstSale: hits.map(row => clean(row.order_creation_date).slice(0, 10)).sort()[0], lastSale: hits.map(row => clean(row.order_creation_date).slice(0, 10)).sort().at(-1) });
    }
    for (const adjustment of adjustments) if (adjustment.end > today) warnings.push({ type: "ends_in_future", id: adjustment.id, end: adjustment.end });
    const adjustedDays = new Map();
    const adjustmentKinds = new Map();
    const adjustmentReasons = new Map();
    for (const adjustment of adjustments) {
        if (!adjustment.exclude_from_training) continue;
        for (let day = adjustment.start; day <= adjustment.end && day <= (coverageEnd || "0000-00-00"); day = addDays(day, 1)) {
            const month = day.slice(0, 7);
            if (!adjustedDays.has(month)) adjustedDays.set(month, new Set());
            adjustedDays.get(month).add(day);
            if (!adjustmentKinds.has(month)) adjustmentKinds.set(month, new Set());
            adjustmentKinds.get(month).add(adjustment.kind);
            if (!adjustmentReasons.has(month) && adjustment.reason) adjustmentReasons.set(month, adjustment.reason);
        }
    }
    const adjustedMonths = new Set(adjustedDays.keys());
    for (const [month, days] of adjustedDays) adjustedDays.set(month, days.size);
    const partialMonths = new Set();
    if (coverageEnd && coverageEnd < lastDayOfMonth(coverageEnd.slice(0, 7))) partialMonths.add(coverageEnd.slice(0, 7));
    if (dateMin && dateMin.slice(8, 10) !== "01") partialMonths.add(dateMin.slice(0, 7));
    const firstMonth = dateMin?.slice(0, 7) ?? null;
    const lastMonth = coverageEnd?.slice(0, 7) ?? null;
    let lastCompleteMonth = lastMonth;
    while (lastCompleteMonth && partialMonths.has(lastCompleteMonth)) lastCompleteMonth = shiftMonth(lastCompleteMonth, -1);
    if (lastCompleteMonth && firstMonth && lastCompleteMonth < firstMonth) lastCompleteMonth = null;
    const bounds = {
        dateMin, dateMax, coverageEnd, partialMonths, lastCompleteMonth, adjustments, adjustedMonths, adjustedDays,
        adjustmentKinds: new Map([...adjustmentKinds].map(([month, kinds]) => [month, [...kinds].sort()])), adjustmentReasons, warnings,
        latestMonthComplete: !!lastMonth && !partialMonths.has(lastMonth)
    };
    if (Array.isArray(masterRows)) {
        const entries = cacheMap || new Map();
        entries.set(today, bounds);
        boundsCache.set(masterRows, entries);
    }
    return bounds;
}
export const completenessNote = bounds => ({
    dataThrough: bounds.dateMax,
    coverageEnd: bounds.coverageEnd,
    partialMonths: [...bounds.partialMonths].sort(),
    adjustedMonths: [...bounds.adjustedMonths].sort(),
    adjustments: bounds.adjustments,
    adjustmentWarnings: bounds.warnings,
    lastCompleteMonth: bounds.lastCompleteMonth,
    latestMonthComplete: bounds.latestMonthComplete
});

// ---------------------------------------------------------------------------
// Return treatment. Revenue and units are put on the same net basis: a line that
// had 2 of 10 units returned keeps 80% of its revenue and 8 units.
// ---------------------------------------------------------------------------
const returnShare = row => {
    const returned = number(row.returned_quantity);
    // quantity = net + returned in the prepared data; derive it if the column is absent.
    const quantity = number(row.quantity) || number(row.net_quantity) + returned;
    return quantity > 0 && returned > 0 ? Math.min(1, returned / quantity) : 0;
};
const fullyReturned = row => returnShare(row) >= 1 || (approvedReturn(row) && number(row.returned_quantity) <= 0);
const netView = row => {
    const share = returnShare(row);
    return share > 0 ? { ...row, line_revenue: number(row.line_revenue) * (1 - share) } : row;
};
const returnedView = row => ({ ...row, line_revenue: number(row.line_revenue) * returnShare(row), net_quantity: number(row.returned_quantity) });
function applyReturnTreatment(rows, treatment) {
    if (treatment === "Returned / Refunded Only") return rows.filter(hasReturn).map(returnedView);
    if (treatment === "Exclude Approved Returns") return rows.filter(row => !fullyReturned(row)).map(netView);
    return rows.map(netView);
}

export const ORDER_COUNT_NOTE = "Orders are distinct order IDs. An order that contains several categories is counted once in each of them, so category-level order counts add up to more than the distinct-order total (provinces and months are additive).";

function totals(rows) {
    return {
        revenue: Math.round(rows.reduce((sum, row) => sum + number(row.line_revenue), 0) * 100) / 100,
        orders: new Set(rows.map(row => clean(row.order_id)).filter(Boolean)).size,
        quantity: rows.reduce((sum, row) => sum + number(row.net_quantity), 0),
        rows: rows.length
    };
}

function group(rows, key) {
    const groups = new Map();
    for (const row of rows) {
        const name = key(row);
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(row);
    }
    return [...groups].map(([name, items]) => ({ name, ...totals(items), items }));
}

export function selectAnalyticsRows(masterRows, filters = {}, { summaryOnly = false } = {}) {
    const rows = masterRows.filter(eligible);
    let scope;
    if (summaryOnly) {
        const needsDateMax = filters.period === "Last 12 Months" || filters.period === "Last 24 Months";
        scope = { dateMax: needsDateMax ? datasetBounds(masterRows).dateMax : null };
    } else {
        const dates = sorted(rows.map(row => clean(row.order_creation_date).slice(0, 10)).filter(Boolean));
        scope = {
            regions: sorted(rows.map(regionName)),
            geography: group(rows, regionName).map(region => ({ region: region.name, provinces: sorted(region.items.map(provinceName)) })),
            categories: sorted(rows.map(categoryName)),
            dateMin: dates[0] || null, dateMax: dates.at(-1) || null,
            preparedRecords: masterRows.length, eligibleRecords: rows.length,
            completeness: completenessNote(datasetBounds(masterRows))
        };
    }
    let start = filters.start || "";
    let end = filters.end || "";
    if (filters.period === "Last 12 Months" || filters.period === "Last 24 Months") {
        if (scope.dateMax) {
            const date = new Date(`${scope.dateMax}T00:00:00Z`);
            date.setUTCDate(1);
            date.setUTCMonth(date.getUTCMonth() - (filters.period === "Last 12 Months" ? 11 : 23));
            start = date.toISOString().slice(0, 10);
            end = scope.dateMax;
        }
    } else if (filters.period !== "Custom Range") {
        start = "";
        end = "";
    }
    if (filters.period === "Custom Range" && (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end)) {
        throw new Error("Choose a valid start and end date for the custom range.");
    }
    const selected = rows.filter(row => {
        const day = clean(row.order_creation_date).slice(0, 10);
        return (!start || day >= start) && (!end || day <= end)
            && (!filters.region || filters.region === "All Regions" || regionName(row) === filters.region)
            && (!filters.province || filters.province === "All Provinces" || provinceName(row) === filters.province)
            && (!Array.isArray(filters.categories) || filters.categories.includes(categoryName(row)));
    });
    return { rows, selected: applyReturnTreatment(selected, filters.returns), scope };
}

export function analyzeRows(masterRows, filters = {}, { summaryOnly = false } = {}) {
    const { rows, selected, scope } = selectAnalyticsRows(masterRows, filters, { summaryOnly });
    const summary = totals(selected);
    const { partialMonths, adjustedMonths, adjustedDays, adjustmentKinds, adjustmentReasons } = datasetBounds(masterRows);
    const adjustmentFlags = name => ({ partial: partialMonths.has(name), adjusted: adjustedMonths.has(name), adjustedDays: adjustedDays.get(name) || 0, adjustmentKinds: adjustmentKinds.get(name) || [], adjustmentReason: adjustmentReasons.get(name) || "" });
    if (summaryOnly) {
        const monthly = new Map();
        for (const row of selected) {
            const name = monthOf(row);
            if (!/^\d{4}-\d{2}$/.test(name)) continue;
            if (!monthly.has(name)) monthly.set(name, { name, revenue: 0, orders: new Set(), quantity: 0, rows: 0 });
            const month = monthly.get(name);
            month.revenue += number(row.line_revenue);
            const orderId = clean(row.order_id);
            if (orderId) month.orders.add(orderId);
            month.quantity += number(row.net_quantity);
            month.rows += 1;
        }
        const names = [...monthly.keys()].sort();
        const trend = [];
        if (names.length) {
            const cursor = new Date(`${names[0]}-01T00:00:00Z`);
            while (cursor.toISOString().slice(0, 7) <= names.at(-1)) {
                const name = cursor.toISOString().slice(0, 7);
                const month = monthly.get(name);
                trend.push(month ? {
                    ...month,
                    revenue: Math.round(month.revenue * 100) / 100,
                    orders: month.orders.size,
                    quantity: month.quantity,
                    ...adjustmentFlags(name)
                } : { name, revenue: 0, orders: 0, quantity: 0, rows: 0, ...adjustmentFlags(name) });
                cursor.setUTCMonth(cursor.getUTCMonth() + 1);
            }
        }
        return { scope, summary, trend };
    }
    const share = value => summary.revenue ? value / summary.revenue * 100 : 0;
    const categories = items => {
        const revenue = totals(items).revenue;
        return group(items, categoryName).map(({ items: ignored, ...category }) => ({ ...category, share: revenue ? category.revenue / revenue * 100 : 0 })).sort((a, b) => b.revenue - a.revenue);
    };
    const regions = group(selected, regionName).map(({ items, ...region }) => ({
        ...region, share: share(region.revenue),
        provinces: group(items, provinceName).map(({ items: provinceRows, ...province }) => ({ ...province, region: region.name, categories: categories(provinceRows) })).sort((a, b) => b.revenue - a.revenue)
    })).sort((a, b) => b.revenue - a.revenue);
    const monthly = new Map(group(selected, monthOf).filter(item => /^\d{4}-\d{2}$/.test(item.name)).map(({ items, ...month }) => [month.name, month]));
    const months = [...monthly.keys()].sort();
    const trend = [];
    if (months.length) {
        const cursor = new Date(`${months[0]}-01T00:00:00Z`);
        while (cursor.toISOString().slice(0, 7) <= months.at(-1)) {
            const name = cursor.toISOString().slice(0, 7);
            trend.push({ ...(monthly.get(name) || { name, revenue: 0, orders: 0, quantity: 0, rows: 0 }), ...adjustmentFlags(name) });
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
    }
    return { scope, summary, regions, categories: categories(selected), trend, empty: masterRows.length === 0, definitions: { orders: ORDER_COUNT_NOTE } };
}
