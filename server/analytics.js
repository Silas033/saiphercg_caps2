npm/* ======================================================
   ANALYTICS SERVICE
   ------------------------------------------------------
   Reads the prepared Master Data produced by Data
   Preparation and answers the two analytics endpoints:

     options()          -> values for Analysis Controls
     descriptive(scope) -> everything Descriptive Analytics
                           renders for a given scope

   Business rules (mirrored in the UI copy):
     - Only rows with is_included_in_analysis = true are used.
     - Orders   = distinct Order IDs.
     - Revenue  = sum of prepared line_revenue.
     - Quantity = sum of prepared net_quantity.
     - AOV      = Revenue / distinct Orders.
     - categories: null = every category, [] = none.
====================================================== */

import fs from "fs";
import path from "path";

const PREPARED_FILE = "prepared_master_data.json";

const PERIOD_PRESETS = [
    "All Available Data",
    "Last 12 Months",
    "Last 24 Months",
    "Custom Range"
];

const RETURNS_OPTIONS = [
    "Include All",
    "Exclude Approved Returns",
    "Returned / Refunded Only"
];

const ALL_REGIONS = "All Regions";
const ALL_PROVINCES = "All Provinces";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/* A return/refund request that was cancelled, rejected or
   withdrawn did not result in a return, so it is not an
   "actual" return signal. */
const NOT_A_RETURN = /cancel|reject|declin|withdraw/i;

/* ---------- helpers ---------- */

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const round2 = value => Math.round(value * 100) / 100;

const monthLabel = ym => {
    if (!ym) return "—";
    const [y, m] = ym.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
};

const peso = value =>
    `₱${Math.round(value).toLocaleString("en-PH")}`;

const percent = value =>
    `${(value * 100).toFixed(1)}%`;

const byRevenueThenName = (a, b) =>
    b.revenue - a.revenue || a.name.localeCompare(b.name);

function hasActualReturn(row) {
    if (num(row.returned_quantity) > 0) return true;
    const status = String(row.return_refund_status ?? "").trim();
    return status !== "" && !NOT_A_RETURN.test(status);
}

function hasAnyReturnFlag(row) {
    return (
        num(row.returned_quantity) > 0 ||
        String(row.return_refund_status ?? "").trim() !== ""
    );
}

/* ---------- service ---------- */

export function createAnalyticsService({ dataDir }) {

    const preparedPath = path.join(dataDir, PREPARED_FILE);

    let cache = null;

    function clearCache() {
        cache = null;
    }

    /* Load + normalise the prepared file once. The cache key
       is the file's mtime + size, so re-running Data
       Preparation invalidates it automatically even if
       clearCache() is never called. */
    function load() {

        if (!fs.existsSync(preparedPath)) {
            throw httpError(
                503,
                "Prepared Master Data was not found. Run Data Preparation first."
            );
        }

        const stat = fs.statSync(preparedPath);
        const key = `${stat.mtimeMs}:${stat.size}`;

        if (cache && cache.key === key) return cache;

        let raw;

        try {
            raw = JSON.parse(fs.readFileSync(preparedPath, "utf8"));
        } catch {
            throw httpError(
                503,
                "Prepared Master Data could not be read. Run Data Preparation again."
            );
        }

        if (!Array.isArray(raw) || raw.length === 0) {
            throw httpError(
                503,
                "Prepared Master Data is empty. Run Data Preparation first."
            );
        }

        const rows = [];
        const monthSet = new Set();
        const categorySet = new Set();
        const regionSet = new Set();
        const provinceMap = new Map();

        let dateMin = null;
        let dateMax = null;

        for (const r of raw) {

            if (!r || !r.is_included_in_analysis || !r.year_month) continue;

            const row = {
                month: r.year_month,
                date: r.order_creation_date || null,
                orderId: String(r.order_id),
                region: r.region || "Unknown",
                province: r.province || "Unknown",
                category: r.category || "Other / Unclassified",
                revenue: num(r.line_revenue),
                quantity: num(r.net_quantity ?? r.quantity),
                actualReturn: hasActualReturn(r),
                anyFlag: hasAnyReturnFlag(r)
            };

            rows.push(row);
            monthSet.add(row.month);
            categorySet.add(row.category);
            regionSet.add(row.region);

            if (!provinceMap.has(row.province)) {
                provinceMap.set(row.province, row.region);
            }

            if (row.date) {
                if (!dateMin || row.date < dateMin) dateMin = row.date;
                if (!dateMax || row.date > dateMax) dateMax = row.date;
            }
        }

        cache = {
            key,
            rows,
            rowCount: raw.length,
            includedRowCount: rows.length,
            months: [...monthSet].sort(),
            categories: [...categorySet].sort((a, b) => a.localeCompare(b)),
            regions: [...regionSet].sort((a, b) => a.localeCompare(b)),
            provinces: [...provinceMap]
                .map(([name, region]) => ({ name, region }))
                .sort((a, b) => a.name.localeCompare(b.name)),
            dateMin,
            dateMax,
            generatedAt: stat.mtime.toISOString()
        };

        return cache;
    }

    /* ---------- options ---------- */

    function options() {

        const data = load();

        return {
            success: true,
            source: PREPARED_FILE,
            rowCount: data.rowCount,
            includedRowCount: data.includedRowCount,
            dateMin: data.dateMin,
            dateMax: data.dateMax,
            months: data.months,
            regions: data.regions,
            provinces: data.provinces,
            categories: data.categories
        };
    }

    /* ---------- scope handling ---------- */

    function normalizeScope(input) {

        const s = input && typeof input === "object" ? input : {};

        const period = s.period ?? "All Available Data";

        if (!PERIOD_PRESETS.includes(period)) {
            throw httpError(400, `Unknown analysis period "${period}".`);
        }

        const returns = s.returns ?? "Include All";

        if (!RETURNS_OPTIONS.includes(returns)) {
            throw httpError(400, `Unknown returns option "${returns}".`);
        }

        let customStart = null;
        let customEnd = null;

        if (period === "Custom Range") {

            customStart = s.customStart;
            customEnd = s.customEnd;

            if (!MONTH_RE.test(customStart || "") || !MONTH_RE.test(customEnd || "")) {
                throw httpError(
                    400,
                    "Custom Range needs a valid start and end month."
                );
            }

            if (customStart > customEnd) {
                throw httpError(
                    400,
                    "End month must be on or after start month."
                );
            }
        }

        return {
            period,
            customStart,
            customEnd,
            returns,
            region: s.region || ALL_REGIONS,
            province: s.province || ALL_PROVINCES,
            categories: Array.isArray(s.categories)
                ? [...new Set(s.categories.map(String))]
                : null
        };
    }

    function resolveMonths(scope, allMonths) {
        switch (scope.period) {
            case "Last 12 Months":
                return allMonths.slice(-12);
            case "Last 24 Months":
                return allMonths.slice(-24);
            case "Custom Range":
                return allMonths.filter(
                    m => m >= scope.customStart && m <= scope.customEnd
                );
            default:
                return allMonths;
        }
    }

    function periodLabel(months) {
        if (!months.length) return "No data in selected period";
        if (months.length === 1) return monthLabel(months[0]);
        return `${monthLabel(months[0])} – ${monthLabel(months.at(-1))}`;
    }

    /* Everything except the Returns setting. */
    function filterBase(rows, scope, months) {

        const monthSet = new Set(months);
        const categorySet = scope.categories ? new Set(scope.categories) : null;

        return rows.filter(row =>
            monthSet.has(row.month) &&
            (scope.region === ALL_REGIONS || row.region === scope.region) &&
            (scope.province === ALL_PROVINCES || row.province === scope.province) &&
            (!categorySet || categorySet.has(row.category))
        );
    }

    function applyReturns(rows, returns) {
        if (returns === "Exclude Approved Returns") {
            return rows.filter(row => !row.actualReturn);
        }
        if (returns === "Returned / Refunded Only") {
            return rows.filter(row => row.actualReturn);
        }
        return rows;
    }

    /* ---------- aggregation ---------- */

    function totalsOf(rows) {

        const orders = new Set();
        let revenue = 0;
        let quantity = 0;

        for (const row of rows) {
            orders.add(row.orderId);
            revenue += row.revenue;
            quantity += row.quantity;
        }

        return {
            revenue: round2(revenue),
            orders: orders.size,
            quantity,
            aov: orders.size ? round2(revenue / orders.size) : 0,
            lineCount: rows.length
        };
    }

    /* Group rows by a key and return revenue/orders/quantity/lines
       per group, sorted by revenue. */
    function groupRows(rows, keyOf, extraOf) {

        const groups = new Map();

        for (const row of rows) {

            const key = keyOf(row);

            if (!groups.has(key)) {
                groups.set(key, {
                    name: key,
                    ...(extraOf ? extraOf(row) : {}),
                    revenue: 0,
                    quantity: 0,
                    lineCount: 0,
                    orderIds: new Set()
                });
            }

            const g = groups.get(key);
            g.revenue += row.revenue;
            g.quantity += row.quantity;
            g.lineCount += 1;
            g.orderIds.add(row.orderId);
        }

        return [...groups.values()]
            .map(({ orderIds, ...g }) => ({
                ...g,
                revenue: round2(g.revenue),
                orders: orderIds.size
            }))
            .sort(byRevenueThenName);
    }

    function withShare(list, totalRevenue) {
        return list.map(item => ({
            ...item,
            share: totalRevenue > 0 ? item.revenue / totalRevenue : 0
        }));
    }

    function changeVersusPrevious(current, previous) {
        const delta = (a, b) => (b > 0 ? a / b - 1 : null);
        return {
            revenue: delta(current.revenue, previous.revenue),
            orders: delta(current.orders, previous.orders),
            quantity: delta(current.quantity, previous.quantity)
        };
    }

    function buildInsights({
        scope, totals, trend, regionRows, provinceRows, categoryRows, returns
    }) {

        if (!totals.lineCount) {
            return [{
                type: "empty",
                title: "No matching data",
                text:
                    "No eligible transaction lines match this scope. " +
                    "Widen the period, geography, categories or returns setting."
            }];
        }

        const insights = [];

        if (scope.region === ALL_REGIONS && regionRows.length) {
            const r = regionRows[0];
            insights.push({
                type: "region",
                title: `${r.name} leads regional revenue`,
                text:
                    `${r.name} generated ${peso(r.revenue)} ` +
                    `(${percent(r.share)} of scope revenue) from ` +
                    `${r.orders.toLocaleString()} orders.`
            });
        }

        if (scope.province === ALL_PROVINCES && provinceRows.length) {
            const p = provinceRows[0];
            insights.push({
                type: "province",
                title: `${p.name} is the top province`,
                text:
                    `${p.name} (${p.region}) contributed ${peso(p.revenue)}, ` +
                    `${percent(p.share)} of scope revenue.`
            });

            if (provinceRows.length > 5) {
                const topFive = provinceRows
                    .slice(0, 5)
                    .reduce((sum, item) => sum + item.revenue, 0);

                insights.push({
                    type: "concentration",
                    title: "Revenue is concentrated in a few provinces",
                    text:
                        `The top 5 of ${provinceRows.length} provinces account for ` +
                        `${percent(totals.revenue > 0 ? topFive / totals.revenue : 0)} ` +
                        `of scope revenue.`
                });
            }
        }

        if (categoryRows.length) {
            const c = categoryRows[0];
            insights.push({
                type: "category",
                title: `${c.name} is the leading category`,
                text:
                    `${c.name} contributed ${peso(c.revenue)} ` +
                    `(${percent(c.share)} of scope revenue) across ` +
                    `${c.quantity.toLocaleString()} units.`
            });
        }

        if (trend.length > 1) {

            const peak = trend.reduce(
                (best, item) => (item.revenue > best.revenue ? item : best),
                trend[0]
            );

            insights.push({
                type: "peak",
                title: `${peak.label} was the strongest month`,
                text:
                    `Revenue peaked at ${peso(peak.revenue)} from ` +
                    `${peak.orders.toLocaleString()} orders.`
            });

            const last = trend.at(-1);
            const prev = trend.at(-2);

            if (prev.revenue > 0) {
                const change = last.revenue / prev.revenue - 1;
                insights.push({
                    type: "momentum",
                    title: `Revenue ${change >= 0 ? "grew" : "declined"} in ${last.label}`,
                    text:
                        `${last.label} revenue was ${peso(last.revenue)}, ` +
                        `${percent(Math.abs(change))} ${change >= 0 ? "above" : "below"} ` +
                        `${prev.label}.`
                });
            }
        }

        if (returns.returnedLines > 0) {
            insights.push({
                type: "returns",
                title: "Returns / refunds detected",
                text:
                    `${returns.returnedLines.toLocaleString()} lines across ` +
                    `${returns.returnedOrders.toLocaleString()} orders carry an actual ` +
                    `return/refund signal in this period, geography and category scope.`
            });
        }

        return insights;
    }

    /* ---------- descriptive ---------- */

    function descriptive(input) {

        const data = load();
        const scope = normalizeScope(input);

        const months = resolveMonths(scope, data.months);

        const baseRows = filterBase(data.rows, scope, months);
        const rows = applyReturns(baseRows, scope.returns);

        const totals = totalsOf(rows);

        /* Previous period: the same number of months immediately
           before the current one. Only comparable when a full
           period of history exists; otherwise null (UI shows the
           detail text instead of a % change). */
        let changeVsPrevious = null;

        if (months.length) {

            const start = data.months.indexOf(months[0]);
            const previousMonths = data.months.slice(
                Math.max(0, start - months.length),
                start
            );

            if (previousMonths.length === months.length) {
                const previousRows = applyReturns(
                    filterBase(data.rows, scope, previousMonths),
                    scope.returns
                );
                changeVsPrevious = changeVersusPrevious(
                    totals,
                    totalsOf(previousRows)
                );
            }
        }

        const trend = months.map(month => {
            const t = totalsOf(rows.filter(row => row.month === month));
            return {
                month,
                label: monthLabel(month),
                revenue: t.revenue,
                orders: t.orders,
                quantity: t.quantity
            };
        });

        const regionRows = withShare(
            groupRows(rows, row => row.region),
            totals.revenue
        ).map(({ lineCount, ...item }) => item);

        const provinceRows = withShare(
            groupRows(rows, row => row.province, row => ({ region: row.region })),
            totals.revenue
        ).map(({ lineCount, ...item }) => item);

        const categoryRows = withShare(
            groupRows(rows, row => row.category),
            totals.revenue
        );

        /* Return stats describe the period/geo/category scope
           BEFORE the Returns setting, so "Exclude Approved
           Returns" still shows how many lines it removed. */
        const returnedRows = baseRows.filter(row => row.actualReturn);
        const flaggedRows = baseRows.filter(row => row.anyFlag);

        const returns = {
            returnedLines: returnedRows.length,
            returnedOrders: new Set(returnedRows.map(row => row.orderId)).size,
            flaggedLines: flaggedRows.length,
            flaggedOrders: new Set(flaggedRows.map(row => row.orderId)).size
        };

        return {
            success: true,
            generatedAt: data.generatedAt,
            source: PREPARED_FILE,
            scope,
            period: {
                label: periodLabel(months),
                months,
                start: months[0] || null,
                end: months.at(-1) || null
            },
            totals,
            changeVsPrevious,
            trend,
            regionRows,
            provinceRows,
            categoryRows,
            returns,
            insights: buildInsights({
                scope, totals, trend, regionRows, provinceRows, categoryRows, returns
            })
        };
    }

    return {
        options,
        descriptive,
        clearCache
    };
}
