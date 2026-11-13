import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeRows, createAnalyticsCache, loadMasterRows, datasetBounds, attachAdjustments, loadAdjustments, normalizeAdjustments, ANALYTICS_COLUMNS, ORDER_COUNT_NOTE } from "./analytics.js";
import { describeAdjustment } from "../src/data/adjustmentText.js";
import { startEtlRun, completeEtlRun, failEtlRun } from "./etlRun.js";
import { exclusionReasonForStatus, sourceCounts, variantFields } from "./rowPayload.js";

const row = (id, overrides = {}) => ({ id: String(id), order_id: `order-${id}`, order_creation_date: "2025-01-15", year_month: "2025-01", region: "New Region", province: "New Province", category: "New Category", line_revenue: 10, net_quantity: 2, returned_quantity: 0, is_included_in_analysis: true, is_exact_duplicate: false, ...overrides });
function database(rows, cap = 1000) {
    return {
        rows, calls: 0, failAt: null,
        from(table) {
            if (table === "data_adjustments") return { select: () => ({ order: async () => ({ data: [], error: null }) }) };
            assert.equal(table, "master_transactions"); return this;
        },
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
    const expectedRevenue = eligible.reduce((sum, row) => {
        const returned = Number(row.returned_quantity) || 0;
        const quantity = Number(row.quantity) || (Number(row.net_quantity) || 0) + returned;
        return sum + Number(row.line_revenue) * (1 - Math.min(1, quantity > 0 ? returned / quantity : 0));
    }, 0);
    assert.equal(result.summary.revenue, Math.round(expectedRevenue * 100) / 100);
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

test("explicit no-sales adjustment completes coverage while an unadjusted cutoff stays partial", () => {
    const rows = throughNov16();
    assert.deepEqual([...datasetBounds(rows).partialMonths], ["2025-11"]);
    assert.equal(datasetBounds(rows).adjustedMonths.size, 0);
    attachAdjustments(rows, [{ id: 1, start_date: "2025-11-17", end_date: "2025-12-31", kind: "no_sales", reason: "", exclude_from_training: true }]);
    const bounds = datasetBounds(rows);
    assert.equal(bounds.partialMonths.size, 0);
    assert.equal(bounds.dateMax, "2025-11-16");
    assert.equal(bounds.coverageEnd, "2025-12-31");
    assert.equal(bounds.lastCompleteMonth, "2025-12");
    assert.deepEqual([...bounds.adjustedMonths].sort(), ["2025-11", "2025-12"]);
    const nov = analyzeRows(rows).trend.find(item => item.name === "2025-11");
    assert.equal(nov.partial, false);
    assert.equal(nov.adjusted, true);
    assert.equal(nov.adjustedDays, 14);
});

test("noncontiguous adjustments do not extend coverage", () => {
    const rows = throughNov16();
    attachAdjustments(rows, [{ id: 1, start_date: "2025-11-20", end_date: "2025-12-31", kind: "no_sales", exclude_from_training: true }]);
    assert.deepEqual([...datasetBounds(rows).partialMonths], ["2025-11"]);
    assert.equal(datasetBounds(rows).coverageEnd, "2025-11-16");
});

test("all adjusted days exclude their calendar month and known-zero adjustments chain", () => {
    const rows = throughNov16();
    attachAdjustments(rows, [{ id: 1, start_date: "2025-11-17", end_date: "2025-11-20", kind: "no_sales", exclude_from_training: true }, { id: 2, start_date: "2025-11-21", end_date: "2025-11-30", kind: "no_sales", exclude_from_training: true }]);
    assert.equal(datasetBounds(rows).coverageEnd, "2025-11-30");
    assert.equal(datasetBounds(rows).partialMonths.size, 0);
    const short = [dated(1, "2025-10-01"), dated(2, "2025-12-31")];
    attachAdjustments(short, [{ id: 3, start_date: "2025-12-29", end_date: "2025-12-31", kind: "anomaly", exclude_from_training: true }]);
    assert.deepEqual([...datasetBounds(short).adjustedMonths], ["2025-12"]);
});

test("adjustments validate and missing table errors degrade gracefully", async () => {
    const normalized = normalizeAdjustments([{ id: 1, start_date: "2025-12-31", end_date: "2025-12-01", kind: "no_sales", exclude_from_training: true }, { id: 2, start_date: "2025-01-02", end_date: "2025-01-03", kind: "data_gap", reason: " x ", exclude_from_training: true }]);
    assert.deepEqual(normalized, [{ id: 2, start: "2025-01-02", end: "2025-01-03", kind: "data_gap", reason: "x", exclude_from_training: true }]);
    assert.deepEqual(normalized.warnings, [{ type: "invalid_row", id: 1 }]);
    const ok = { from: () => ({ select: () => ({ order: async () => ({ data: [{ id: 4, start_date: "2025-11-17", end_date: "2025-12-31", kind: "no_sales", reason: "n", exclude_from_training: true }], error: null }) }) }) };
    assert.equal((await loadAdjustments(ok)).length, 1);
    const missingTable = { from: () => ({ select: () => ({ order: async () => ({ data: null, error: { message: 'relation "public.data_adjustments" does not exist' } }) }) }) };
    assert.deepEqual(await loadAdjustments(missingTable), []);
    assert.deepEqual(await loadAdjustments({ from() { throw new Error("boom"); } }), []);
    assert.deepEqual(await loadAdjustments(null), []);
});

test("only known-zero adjustments extend coverage and an explicit nonexcluded closure stays in training", () => {
    for (const kind of ["data_gap", "anomaly"]) {
        const rows = throughNov16();
        attachAdjustments(rows, [{ id: 7, start_date: "2025-11-17", end_date: "2025-12-31", kind, exclude_from_training: true }]);
        assert.equal(datasetBounds(rows).coverageEnd, "2025-11-16");
    }
    for (const kind of ["no_sales", "closure"]) {
        const rows = throughNov16();
        attachAdjustments(rows, [{ id: 8, start_date: "2025-11-17", end_date: "2025-11-30", kind, exclude_from_training: false }]);
        assert.equal(datasetBounds(rows).coverageEnd, "2025-11-30");
        assert.equal(datasetBounds(rows).adjustedMonths.size, 0);
    }
});

test("adjustments never change totals and sales inside a declared no-sales period are warned", () => {
    const rows = [...throughNov16(), dated(5, "2025-11-20", { line_revenue: 17, year_month: "2025-11" })];
    const plain = analyzeRows(rows);
    attachAdjustments(rows, [{ id: 9, start_date: "2025-11-17", end_date: "2025-11-30", kind: "no_sales", exclude_from_training: true }]);
    const changed = analyzeRows(rows);
    assert.deepEqual(changed.summary, plain.summary);
    assert.deepEqual(changed.regions, plain.regions);
    assert.deepEqual(changed.categories, plain.categories);
    assert.deepEqual(changed.trend.map(({ name, revenue, orders, quantity, rows: count }) => ({ name, revenue, orders, quantity, rows: count })), plain.trend.map(({ name, revenue, orders, quantity, rows: count }) => ({ name, revenue, orders, quantity, rows: count })));
    assert.ok(datasetBounds(rows).warnings.some(warning => warning.type === "sales_inside" && warning.id === 9 && warning.lines === 1));
    assert.ok(datasetBounds(rows).adjustedMonths.has("2025-11"));
});

test("a short explicit adjustment excludes its whole calendar month and future coverage is capped at today", () => {
    const rows = throughNov16();
    attachAdjustments(rows, [{ id: 10, start_date: "2025-11-20", end_date: "2025-11-22", kind: "anomaly", exclude_from_training: true }, { id: 11, start_date: "2025-11-17", end_date: "2025-12-31", kind: "no_sales", exclude_from_training: true }]);
    const bounds = datasetBounds(rows, { now: new Date("2025-11-30T12:00:00Z") });
    assert.equal(bounds.coverageEnd, "2025-11-30");
    assert.ok(bounds.adjustedMonths.has("2025-11"));
    assert.ok(bounds.warnings.some(warning => warning.type === "ends_in_future" && warning.id === 11));
});

test("neutral wording matches the cause-specific adjustment kind", () => {
    const kinds = ["closure", "no_sales", "data_gap", "anomaly"];
    for (let mask = 1; mask < 1 << kinds.length; mask += 1) {
        const combination = kinds.filter((_, index) => mask & (1 << index));
        const phrase = describeAdjustment(combination);
        assert.equal(/closure/i.test(phrase), combination.length === 1 && combination[0] === "closure");
    }
});

test("prepared status wording, source counts, and variant fields are factual and retained", () => {
    assert.equal(exclusionReasonForStatus("Order Received"), 'Order status is "Order Received", not "Completed"');
    const prepared = [
        { order_id: "a", is_included_in_analysis: true, is_exact_duplicate: false },
        { order_id: "a", is_included_in_analysis: true, is_exact_duplicate: false },
        { order_id: "b", is_included_in_analysis: false, is_exact_duplicate: false }
    ];
    assert.deepEqual(sourceCounts(prepared, 2), { duplicate_rows: 2, source_row_count: 5, eligible_orders: 1 });
    assert.deepEqual(variantFields({ variation_name: "Blue", sku_reference_no: "SKU-2" }), { variation_name: "Blue", sku_reference_no: "SKU-2" });
});

test("ETL run logging starts before replacement, completes, supersedes older runs, and prunes to five", async () => {
    const calls = [];
    const olderRuns = Array.from({ length: 7 }, (_, index) => ({ run_id: `run-${index}`, status: index < 2 ? "failed" : "superseded" }));
    const client = { from(table) {
        const builder = {
            insert(value) { calls.push([table, "insert", value]); return builder; },
            update(value) { calls.push([table, "update", value]); return builder; },
            select(value) { calls.push([table, "select", value]); return builder; },
            delete() { calls.push([table, "delete"]); return builder; },
            eq(column, value) { calls.push([table, "eq", column, value]); return builder; },
            neq(column, value) { calls.push([table, "neq", column, value]); return builder; },
            order(column, options) { calls.push([table, "order", column, options]); return builder; },
            in(column, value) { calls.push([table, "in", column, value]); return builder; },
            then(resolve, reject) { return Promise.resolve({ data: olderRuns, error: null }).then(resolve, reject); }
        };
        return builder;
    } };
    await startEtlRun(client, "run-new");
    calls.push(["master_transactions", "delete"]);
    calls.push(["master_transactions", "insert"]);
    await completeEtlRun(client, "run-new", { source_row_count: 12, duplicate_rows: 2, eligible_orders: 4 });
    assert.ok(calls.findIndex(call => call[0] === "etl_runs" && call[1] === "insert") < calls.findIndex(call => call[0] === "master_transactions" && call[1] === "delete"));
    assert.ok(calls.some(call => call[0] === "etl_runs" && call[1] === "update" && call[2].status === "completed"));
    assert.ok(calls.some(call => call[0] === "etl_runs" && call[1] === "update" && call[2].status === "superseded"));
    assert.deepEqual(calls.find(call => call[0] === "etl_runs" && call[1] === "in")?.[3], ["run-5", "run-6"]);
});

test("failed ETL start prevents replacement, and insert failures are recorded as failed", async () => {
    const calls = [];
    let failInsert = true;
    const client = { from(table) {
        const builder = {
            insert(value) { calls.push([table, "insert", value]); return builder; },
            update(value) { calls.push([table, "update", value]); return builder; },
            eq() { return builder; },
            then(resolve, reject) { return Promise.resolve({ error: table === "etl_runs" && failInsert ? { message: "log unavailable" } : null }).then(resolve, reject); }
        };
        return builder;
    } };
    await assert.rejects(startEtlRun(client, "run-start-fails"), /log unavailable/);
    assert.equal(calls.some(call => call[0] === "master_transactions"), false);
    failInsert = false;
    await startEtlRun(client, "run-fails-later");
    const failure = new Error("master insert failed");
    await failEtlRun(client, "run-fails-later", failure);
    assert.ok(calls.some(call => call[0] === "etl_runs" && call[1] === "update" && call[2].status === "failed" && call[2].error_message === "master insert failed"));
});
