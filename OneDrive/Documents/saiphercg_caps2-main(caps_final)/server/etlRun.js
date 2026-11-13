export async function startEtlRun(client, runId) {
    const { error } = await client.from("etl_runs").insert({ run_id: runId, status: "running" });
    if (error) throw new Error(`Supabase could not start ETL run: ${error.message}`);
}

export async function completeEtlRun(client, runId, counts) {
    const { error } = await client.from("etl_runs").update({ ...counts, status: "completed" }).eq("run_id", runId);
    if (error) throw new Error(`ETL run completion logging failed: ${error.message}`);
    const { error: supersedeError } = await client.from("etl_runs").update({ status: "superseded" }).eq("status", "completed").neq("run_id", runId);
    if (supersedeError) throw new Error(`ETL run superseding failed: ${supersedeError.message}`);
    const { data, error: listError } = await client.from("etl_runs").select("run_id,status").neq("status", "running").order("created_at", { ascending: false });
    if (listError) throw new Error(`ETL run pruning could not list runs: ${listError.message}`);
    const ids = (data || []).slice(5).map(run => run.run_id);
    if (ids.length) {
        const { error: pruneError } = await client.from("etl_runs").delete().in("run_id", ids);
        if (pruneError) throw new Error(`ETL run pruning failed: ${pruneError.message}`);
    }
}

export async function failEtlRun(client, runId, error) {
    try {
        const { error: logError } = await client.from("etl_runs").update({ status: "failed", error_message: String(error?.message || error).slice(0, 500) }).eq("run_id", runId);
        if (logError) console.error("ETL failure status could not be recorded:", logError.message);
    } catch (logError) {
        console.error("ETL failure status could not be recorded:", logError);
    }
}
