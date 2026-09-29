# Predictive analytics

The page sends shared Analysis Controls filters, target (`quantity`, `orders`, or `revenue`), and horizon (6 or 12) to `GET /api/forecasts`. The server uses the existing Supabase `master_transactions` cache and sync guard. It does not write predictions or change database tables. Regenerate reloads the endpoint; the shared source cache expires after 30 seconds.

Aggregation uses the same eligibility, duplicate, date, return, and geography/category rules as descriptive analytics. Targets are monthly net units, distinct orders, or PHP revenue. Combined category selections produce a combined forecast.

At least 18 consecutive months with records are required. Months without scoped records are unknown, not confirmed zeros, and block predictions. Zero totals from existing records remain valid. Negative monthly totals and partial custom calendar-month ranges block predictions. Transaction dates cannot establish upload completeness; the page asks users to verify boundary months.

With 18–35 months, the historical mean is fitted to the first N−6 months and tested on the final six. With at least 36 months, seasonal naive predicts the previous year's same month, trained on N−12 months and tested on the final twelve. These are deliberately simple benchmark methods, not ARIMA or ETS. The method policy is fixed by history length, not selected using test results. The final model uses all observed history.

Validation reports MAE, MAPE excluding zero actuals (with exclusion count), actual/predicted monthly values, and a last-observation baseline MAE on the same holdout. Projected change compares the last prediction with the latest actual and is undefined when that actual is zero.

Approximate 95% prediction bounds use 1.96 times the model forecast standard deviation. For mean forecasts: sample standard deviation × sqrt(1+1/N). For seasonal naive within the next 12 months: RMS of annual differences. Lower bounds are clipped to zero; normal, independent errors are an assumption, and empirical coverage is not guaranteed. See [benchmark methods](https://otexts.com/fpp3/simple-methods.html) and [prediction intervals](https://otexts.com/fpp3/prediction-intervals.html).

Verification: `node --test server/analytics.test.js server/forecasting.test.js` and `npm.cmd run build`. Read-only live verification found 2,940 master records with three eligible monthly observations, January–March 2021; this correctly returns insufficient history. No forecast values are fabricated for that dataset.
