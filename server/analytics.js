// Only the server holds the Supabase secret. Analytics never falls back to local ETL files.
export const ANALYTICS_COLUMNS = "id,etl_run_id,order_id,order_creation_date,year_month,region,province,category,line_revenue,quantity,net_quantity,returned_quantity,return_refund_status,is_included_in_analysis,is_exact_duplicate";

export async function loadMasterRows(client) {
    if (!client) throw new Error("Supabase is not configured on the server.");
    const pageSize = 1000;
    const concurrentPages = 6;
    const readPage = async (from, expectedCount = null) => {
        const { data, error, count } = await client.from("master_transactions")
            .select(ANALYTICS_COLUMNS, { count: "exact" })
            .order("id", { ascending: true }).range(from, from + pageSize - 1)
            .abortSignal(AbortSignal.timeout(15000));
        if (error) throw new Error(`Unable to load Supabase analytics: ${error.message}`);
        if (!Array.isArray(data) || count === null) throw new Error("Supabase returned an incomplete analytics response.");
        if (expectedCount !== null && expectedCount !== count) throw new Error("The dataset changed while loading. Please retry.");
        return { data, count };
    };

    const first = await readPage(0);
    const expected = first.count;
    const rows = [...first.data];
    for (let offset = pageSize; offset < expected; offset += pageSize * concurrentPages) {
        const offsets = Array.from(
            { length: Math.min(concurrentPages, Math.ceil((expected - offset) / pageSize)) },
            (_, index) => offset + index * pageSize
        );
        const pages = await Promise.all(offsets.map(pageOffset => readPage(pageOffset, expected)));
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
        pending = loadMasterRows(client).then(rows => {
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
        scope = { dateMax: needsDateMax ? rows.reduce((max, row) => {
            const day = clean(row.order_creation_date).slice(0, 10);
            return day && (!max || day > max) ? day : max;
        }, null) : null };
    } else {
        const dates = sorted(rows.map(row => clean(row.order_creation_date).slice(0, 10)).filter(Boolean));
        scope = {
            regions: sorted(rows.map(regionName)),
            geography: group(rows, regionName).map(region => ({ region: region.name, provinces: sorted(region.items.map(provinceName)) })),
            categories: sorted(rows.map(categoryName)),
            dateMin: dates[0] || null, dateMax: dates.at(-1) || null,
            preparedRecords: masterRows.length, eligibleRecords: rows.length
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
            && (!Array.isArray(filters.categories) || filters.categories.includes(categoryName(row)))
            && (filters.returns !== "Exclude Approved Returns" || !approvedReturn(row))
            && (filters.returns !== "Returned / Refunded Only" || hasReturn(row));
    });
    return { rows, selected, scope };
}

export function analyzeRows(masterRows, filters = {}, { summaryOnly = false } = {}) {
    const { rows, selected, scope } = selectAnalyticsRows(masterRows, filters, { summaryOnly });
    const summary = totals(selected);
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
                    quantity: month.quantity
                } : { name, revenue: 0, orders: 0, quantity: 0, rows: 0 });
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
            trend.push(monthly.get(name) || { name, revenue: 0, orders: 0, quantity: 0, rows: 0 });
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
    }
    return { scope, summary, regions, categories: categories(selected), trend, empty: masterRows.length === 0 };
}
