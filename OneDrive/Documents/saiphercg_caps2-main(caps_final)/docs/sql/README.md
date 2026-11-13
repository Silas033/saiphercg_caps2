# Database change order

1. Apply `01_apply_now.sql` in the Supabase SQL Editor.
2. Deploy the updated application and run one full **Sync to Supabase**.
3. Apply `02_apply_after_system_update.sql` only after that sync succeeds.

`99_undo_all.sql` undoes both SQL changes. These files are maintained separately from the application code; do not run their DDL from the app.
