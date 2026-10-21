import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeRows, createAnalyticsCache, loadMasterRows, ANALYTICS_COLUMNS } from "./analytics.js";

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
    const rows = [row(1), row(2, { order_id: "order-1", category: "Pallets" }), row(3, { is_included_in_analysis: false }), row(4, { is_exact_duplicate: true }), row(5, { return_refund_status: "Request Approved", returned_quantity: 1, net_quantity: 1 }), row(6, { return_refund_status: "Request Cancelled" })];
    const all = analyzeRows(rows);
    assert.deepEqual(all.summary, { revenue: 40, orders: 3, quantity: 7, rows: 4 });
    assert.deepEqual(all.scope.categories, ["New Category", "Pallets"]);
    assert.deepEqual(all.scope.geography, [{ region: "New Region", provinces: ["New Province"] }]);
    assert.equal(analyzeRows(rows, { categories: [] }).summary.rows, 0);
    assert.equal(analyzeRows(rows, { categories: ["Pallets"] }).summary.rows, 1);
    assert.equal(analyzeRows(rows, { region: "Does not exist" }).summary.rows, 0);
    assert.equal(analyzeRows(rows, { returns: "Exclude Approved Returns" }).summary.rows, 3);
    assert.equal(analyzeRows(rows, { returns: "Returned / Refunded Only" }).summary.rows, 1);
    assert.equal(all.regions[0].provinces[0].categories.reduce((sum, item) => sum + item.share, 0), 100);
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

test("prepared dataset retains the reference totals from the PDF", () => {
    const rows = JSON.parse(fs.readFileSync(new URL("./data/prepared_master_data.json", import.meta.url), "utf8"));
    // Independent transaction-grain baseline so this check also works after a new import.
    const eligible = rows.filter(row => row.is_included_in_analysis && !row.is_exact_duplicate);
    const result = analyzeRows(rows);
    assert.equal(result.summary.revenue, Math.round(eligible.reduce((sum, row) => sum + Number(row.line_revenue), 0) * 100) / 100);
    assert.equal(result.summary.orders, new Set(eligible.map(row => row.order_id).filter(Boolean)).size);
});
