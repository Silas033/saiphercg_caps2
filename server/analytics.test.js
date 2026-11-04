import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeRows, createAnalyticsCache, loadMasterRows, datasetBounds, attachClosures, loadClosures, normalizeClosures, ANALYTICS_COLUMNS, ORDER_COUNT_NOTE } from "./analytics.js";

const row = (id, overrides = {}) => ({ id: String(id), order_id: `order-${id}`, order_creation_date: "2025-01-15", year_month: "2025-01", region: "New Region", province: "New Province", category: "New Category", line_revenue: 10, net_quantity: 2, returned_quantity: 0, is_included_in_analysis: true, is_exact_duplicate: false, ...overrides });
function database(rows, cap = 1000) {
    return {
        rows, calls: 0, failAt: null,
        from(table) { assert.equal(table, "master_transactions"); return this; },
        select(columns) { assert.equal(columns, ANALYTICS_COLUMNS); return this; },
        order(column) { assert.equal(column, "id"); return this; },
        range(start, end) {
            this.calls++;
            return { abortSignal: async () => this.failAt === start
                ? { error: { message: "Connection interrupted" } }
                : { data: this.rows.slice(start, Math.min(end + 1, start + cap)), count: this.rows.length, error: null } };
        }
    };
}

test("pagination loads all rows, including when the server cap is below 1000", async () => {
    for (const cap of [1000, 300]) {
        const client = database(Array.from({ length: 2934 }, (_, index) => row(index)), cap);
        const rows = await loadMasterRows(client);
        assert.equal(rows.length, 2934);
        assert.equal(client.calls, Math.ceil(2934 / cap));
        assert.equal(analyzeRows(rows).summary.revenue, 29340);
    }
});

test("cache refreshes after sync and TTL; failed pages are never served as complete data", async () => {
    let time = 1000;
    const client = database([row(1)]);
    const cache = createAnalyticsCache(client, { ttl: 30, now: () => time });
    await cache.get();
    await cache.get();
    assert.equal(client.calls, 1);
    client.rows.push(row(2, { category: "Pallets", region: "Another Region" }));
    time += 31;
    assert.ok(analyzeRows((await cache.get()).rows).scope.categories.includes("Pallets"));
    await cache.sync(async () => { client.rows = [row(3)]; });
    assert.equal((await cache.get()).rows[0].id, "3");
    client.rows = Array.from({ length: 1100 }, (_, index) => row(index));
    client.failAt = 1000;
    time += 31;
    await assert.rejects(cache.get(), /Connection interrupted/);
    client.failAt = null;
    assert.equal((await cache.get()).rows.length, 1100);
});

test("sync blocks reads of partial data and remains unavailable after failed writes", async () => {
    const client = database([row(1)]);
    const cache = createAnalyticsCache(client);
    await cache.get();
    let finish;
    const sync = cache.sync(() => new Promise(resolve => { finish = resolve; }));
    await assert.rejects(cache.get(), /syncing/);
    await assert.rejects(cache.sync(async () => {}), /already in progress/);
    finish();
    await sync;
    await assert.rejects(cache.sync(async () => { throw new Error("Upload failed"); }), /Upload failed/);
    await assert.rejects(cache.get(), /sync or verification failed/);
    await cache.sync(async () => {});
    assert.equal((await cache.get()).rows.length, 1);
});

test("filters preserve distinct orders, net quantity, return semantics and dynamic geography", () => {
    const rows = [row(1), row(2, { order_id: "order-1", category: "Pallets" }), row(3, { is_included_in_analysis: false }), row(4, { is_exact_duplicate: true }), row(5, { return_refund_status: "Request Approved", quantity: 2, returned_quantity: 2, net_quantity: 0 }), row(6, { return_refund_status: "Request Cancelled" })];
    const all = analyzeRows(rows);
    // Row 5 is fully returned: its revenue and units are netted to zero, but the line is still present.
    assert.deepEqual(all.summary, { revenue: 30, orders: 3, quantity: 6, rows: 4 });
    assert.deepEqual(all.scope.categories, ["New Category", "Pallets"]);
    assert.deepEqual(all.scope.geography, [{ region: "New Region", provinces: ["New Province"] }]);
    assert.equal(analyzeRows(rows, { categories: [] }).summary.rows, 0);
    assert.equal(analyzeRows(rows, { categories: ["Pallets"] }).summary.rows, 1);
    assert.equal(analyzeRows(rows, { region: "Does not exist" }).summary.rows, 0);
    assert.equal(analyzeRows(rows, { returns: "Exclude Approved Returns" }).summary.rows, 3);
    assert.equal(analyzeRows(rows, { returns: "Returned / Refunded Only" }).summary.rows, 1);
    assert.ok(Math.abs(all.regions[0].provinces[0].categories.reduce((sum, item) => sum + item.share, 0) - 100) < 1e-9);
});

test("monthly trends fill gaps and period filters are anchored to dataset dates", () => {
    const rows = [row(1, { year_month: "2023-01", order_creation_date: "2023-01-15" }), row(2, { year_month: "2025-03", order_creation_date: "2025-03-15" }), row(3)];
    const recent = analyzeRows(rows, { period: "Last 12 Months" });
    assert.equal(recent.summary.rows, 2);
    assert.equal(recent.trend.length, 3);
    assert.equal(recent.trend[1].revenue, 0);
    assert.equal(analyzeRows(rows, { period: "Custom Range", start: "2025-03-15", end: "2025-03-15" }).summary.rows, 1);
    assert.throws(() => analyzeRows(rows, { period: "Custom Range", start: "2025-03-15", end: "2025-01-01" }), /valid start/);
});

test("empty Supabase data stays empty and missing configuration fails clearly", async () => {
    const cache = createAnalyticsCache(database([]));
    const result = analyzeRows((await cache.get()).rows);
    assert.equal(result.empty, true);
    assert.deepEqual(result.scope.categories, []);
    assert.equal(result.summary.revenue, 0);
    await assert.rejects(loadMasterRows(null), /not configured/);
});

test("prepared dataset retains the reference totals from the PDF", { skip: !fs.existsSync(new URL("./data/prepared_master_data.json", import.meta.url)) && "local prepared file is not present (Supabase is the data source)" }, () => {
    const rows = JSON.parse(fs.readFileSync(new URL("./data/prepared_master_data.json", import.meta.url), "utf8"));
    // Independent transaction-grain baseline so this check also works after a new import.
    const eligible = rows.filter(row => row.is_included_in_analysis && !row.is_exact_duplicate);
    const result = analyzeRows(rows);
    assert.equal(result.summary.revenue, Math.round(eligible.reduce((sum, row) => sum + Number(row.line_revenue), 0) * 100) / 100);
    assert.equal(result.summary.orders, new Set(eligible.map(row => row.order_id).filter(Boolean)).size);
});

const dated = (id, date, overrides = {}) => row(id, { order_creation_date: date, year_month: date.slice(0, 7), ...overrides });

test("a month that ends before its calendar month-end is flagged as partial and never compared as a full month", () => {
    const complete = [dated(1, "2025-09-01"), dated(2, "2025-09-30"), dated(3, "2025-10-01"), dated(4, "2025-10-31")];
    assert.equal(datasetBounds(complete).partialMonths.size, 0);
    assert.equal(datasetBounds(complete).lastCompleteMonth, "2025-10");
    assert.equal(analyzeRows(complete).trend.at(-1).partial, false);

    const partial = [...complete, dated(5, "2025-11-01"), dated(6, "2025-11-16")];
    const bounds = datasetBounds(partial);
    assert.deepEqual([...bounds.partialMonths], ["2025-11"]);
    assert.equal(bounds.lastCompleteMonth, "2025-10");
    assert.equal(bounds.latestMonthComplete, false);
    const result = analyzeRows(partial);
    assert.deepEqual(result.trend.map(item => item.partial), [false, false, true]);
    assert.equal(result.scope.completeness.dataThrough, "2025-11-16");
    assert.deepEqual(result.scope.completeness.partialMonths, ["2025-11"]);
});

test("returns are put on one net basis for revenue and units", () => {
    const rows = [
        dated(1, "2025-01-10", { quantity: 10, returned_quantity: 2, net_quantity: 8, line_revenue: 100, return_refund_status: "Request Approved" }),
        dated(2, "2025-01-11", { quantity: 5, returned_quantity: 5, net_quantity: 0, line_revenue: 50, return_refund_status: "Request Approved" }),
        dated(3, "2025-01-12", { quantity: 4, returned_quantity: 0, net_quantity: 4, line_revenue: 40 }),
        dated(4, "2025-01-13", { quantity: 3, returned_quantity: 1, net_quantity: 2, line_revenue: 30, return_refund_status: "Dispute Resolved" })
    ];
    // Include All: returned share of revenue is removed so revenue matches the net units.
    assert.deepEqual(analyzeRows(rows).summary, { revenue: 80 + 0 + 40 + 20, orders: 4, quantity: 8 + 0 + 4 + 2, rows: 4 });
    // Exclude: only fully returned lines drop out; partly returned lines keep their kept share.
    const excluded = analyzeRows(rows, { returns: "Exclude Approved Returns" }).summary;
    assert.deepEqual(excluded, { revenue: 80 + 40 + 20, orders: 3, quantity: 8 + 4 + 2, rows: 3 });
    // Returned only: refunded value and returned units (a Dispute Resolved line with returned units counts).
    const returned = analyzeRows(rows, { returns: "Returned / Refunded Only" }).summary;
    assert.deepEqual(returned, { revenue: 20 + 50 + 10, orders: 3, quantity: 2 + 5 + 1, rows: 3 });
    // Original rows are not mutated.
    assert.equal(rows[0].line_revenue, 100);
});

test("category order counts are not additive and the definition says so", () => {
    const rows = [dated(1, "2025-01-10", { order_id: "A", category: "X" }), dated(2, "2025-01-10", { order_id: "A", category: "Y" }), dated(3, "2025-01-11", { order_id: "B", category: "X" })];
    const result = analyzeRows(rows);
    assert.equal(result.summary.orders, 2);
    assert.equal(result.categories.reduce((sum, item) => sum + item.orders, 0), 3);
    assert.equal(result.regions.reduce((sum, item) => sum + item.orders, 0), 2);
    assert.equal(result.definitions.orders, ORDER_COUNT_NOTE);
});

const throughNov16 = () => [dated(1, "2025-10-01"), dated(2, "2025-10-31"), dated(3, "2025-11-01"), dated(4, "2025-11-16")];

test("a declared closure that starts right after the last sale makes the month complete and extends coverage", () => {
    const rows = throughNov16();
    assert.deepEqual([...datasetBounds(rows).partialMonths], ["2025-11"]);          // no closure declared: part-month
    attachClosures(rows, [{ start_date: "2025-11-17", end_date: "2025-12-31", note: "closed" }]);
    const bounds = datasetBounds(rows);
    assert.equal(bounds.partialMonths.size, 0);
    assert.equal(bounds.dateMax, "2025-11-16");
    assert.equal(bounds.coverageEnd, "2025-12-31");
    assert.equal(bounds.lastCompleteMonth, "2025-12");
    assert.deepEqual([...bounds.closureMonths].sort(), ["2025-11", "2025-12"]);
    const nov = analyzeRows(rows).trend.find(item => item.name === "2025-11");
    assert.equal(nov.partial, false);
    assert.equal(nov.closure, true);
    assert.equal(nov.closedDays, 14);
});

test("closures that do not touch the end of the data change nothing about a part-month", () => {
    const rows = throughNov16();
    attachClosures(rows, [{ start_date: "2025-11-20", end_date: "2025-12-31" }]);    // gap 11-17..11-19 is not covered
    assert.deepEqual([...datasetBounds(rows).partialMonths], ["2025-11"]);
    assert.equal(datasetBounds(rows).coverageEnd, "2025-11-16");
});

test("a short break is not a closure month, and a closure may chain from one entry to the next", () => {
    const rows = throughNov16();
    attachClosures(rows, [{ start_date: "2025-11-17", end_date: "2025-11-20" }, { start_date: "2025-11-21", end_date: "2025-11-30" }]);
    assert.equal(datasetBounds(rows).coverageEnd, "2025-11-30");
    assert.equal(datasetBounds(rows).partialMonths.size, 0);
    const short = [dated(1, "2025-10-01"), dated(2, "2025-12-31")];
    attachClosures(short, [{ start_date: "2025-12-29", end_date: "2025-12-31" }]);    // 3 of 31 days is under the 20% threshold
    assert.equal(datasetBounds(short).closureMonths.size, 0);
});

test("closures are validated and loading them never breaks analytics", async () => {
    assert.deepEqual(normalizeClosures([{ start_date: "2025-12-31", end_date: "2025-12-01" }, { start_date: "bad", end_date: "2025-01-01" }, { start_date: "2025-01-02", end_date: "2025-01-03", note: " x " }]), [{ start: "2025-01-02", end: "2025-01-03", note: "x" }]);
    const ok = { from: () => ({ select: () => ({ order: async () => ({ data: [{ start_date: "2025-11-17", end_date: "2025-12-31", note: "n" }], error: null }) }) }) };
    assert.equal((await loadClosures(ok)).length, 1);
    const missingTable = { from: () => ({ select: () => ({ order: async () => ({ data: null, error: { message: 'relation "public.shop_closures" does not exist' } }) }) }) };
    assert.deepEqual(await loadClosures(missingTable), []);
    assert.deepEqual(await loadClosures({ from() { throw new Error("boom"); } }), []);
    assert.deepEqual(await loadClosures(null), []);
});
