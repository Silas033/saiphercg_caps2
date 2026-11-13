# Supabase analytics and sync

Supabase is the single source of truth. The backend reads `master_transactions` through the server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; the browser never receives the secret. Reads are paginated and checked for a consistent total count. A shared in-memory snapshot is refreshed after a successful full sync.

Revenue is **Deal price x quantity; excludes shipping, vouchers, platform fees; net of returned units**. Quantity is net units and orders count distinct nonblank IDs. Analytics includes eligible, nonduplicate rows. Excluding approved returns nets out returned units and associated revenue; returned-only mode includes approved or positively returned lines.

`data_adjustments` explicitly records `no_sales`, `closure`, `data_gap`, or `anomaly` periods. It is the only source for adjusted-period behavior. `exclude_from_training = true` excludes every calendar month touched from forecast training and MoM/YoY comparisons. No threshold is applied, and adjustments never change KPI totals. Missing adjustment tables are treated as no adjustments. See [predictive-analytics.md](predictive-analytics.md) for model and comparison behavior.

The sync order is product and geography mapping upserts, creation of a `running` `etl_runs` row, replacement and insertion of master rows, completion of run counts, superseding previous completed runs, then pruning to the five newest nonrunning runs. Failures after run creation mark that run failed. The ETL log is created before deleting master data so a failed log insert cannot leave the table empty.

For local development, run `npm run server` and `npm run dev`. Vite proxies `/api` to port 4000. The upload and prepared-data paths are ignored by Git because source spreadsheets contain personal information.
