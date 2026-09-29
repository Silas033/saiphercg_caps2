# Supabase-backed analysis

Analysis Controls and Descriptive Analytics read `/api/analytics`. The backend reads `master_transactions` using `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from the ignored root `.env`; the browser never receives the secret.

- Startup loads every page, ordered by primary key, in requests of up to 1,000 rows. The loader checks the total count and rejects incomplete loads.
- A shared in-memory snapshot lasts 30 seconds. Pages refresh every 30 seconds and when the window regains focus. New eligible locations/categories in Supabase appear without code changes or a restart.
- The existing preparation auto-sync and manual sync refresh the snapshot after upload and count verification. Analytics reads are blocked during the sync and after a failed upload, so partial uploads are not reported as complete results. Rerun preparation after a failed sync.
- An empty master table shows “Run Data Preparation first.” Connection errors are surfaced; local JSON is never used as an analytics fallback.
- Scope options come from eligible, nonduplicate master rows. Classification rules in `preparation.js` remain unchanged. Adding new classification rules or an editable taxonomy is separate work; any new category already stored on eligible master rows is selectable.

Apply Scope carries region, province, category selection, dates, and return treatment into Descriptive and Predictive Analytics, and retains the selection when navigating back. Predictive Analytics reads `/api/forecasts`; see `predictive-analytics.md` for methods and sufficiency rules. Prescriptive Analytics remains a prototype view.

Revenue sums `line_revenue`; quantity sums `net_quantity`; orders count distinct nonblank `order_id`. Both require `is_included_in_analysis = true` and exclude exact duplicates. Exclude Approved Returns removes approved return lines; Returned / Refunded Only selects approved return statuses or positive returned quantities. Cancelled requests alone do not count as returns. Last 12/24 Months uses the latest dataset date, not today's date. Missing months between observed months display zero.

For local development, run `npm run server` and `npm run dev`. Vite proxies `/api` to port 4000. Hosted frontend deployments must route `/api` to the backend on the same origin. Restart the backend after server-code changes.

Validation: `node --test server/analytics.test.js` and `npm run build`. The connected dataset at implementation time had 2,940 master rows, 2,934 eligible rows, PHP 569,845 revenue, 1,873 distinct orders, and 5,368 net units; live Supabase and local prepared aggregates matched exactly. Live verification was read-only; upload/cache behavior is tested with an in-memory database double.

The existing upload process replaces rows in batches rather than a database transaction. The cache guard protects this server during that operation; multi-instance atomic replacement would require a database-side transaction or versioned dataset publication.
