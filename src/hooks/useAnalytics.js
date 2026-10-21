import { useEffect, useState } from "react";
import { fetchScopedAnalytics, getCachedScopedAnalytics } from "../data/analyticsApi";

export const DEFAULT_SCOPE = {
    period: "All Available Data", returns: "Include All",
    region: "All Regions", province: "All Provinces", categories: null, start: "", end: ""
};

export function useAnalytics(scope = DEFAULT_SCOPE, active = true) {
    const key = JSON.stringify(scope);
    const [state, setState] = useState(() => {
        const data = getCachedScopedAnalytics(scope);
        return { data, error: "", loading: !data, key };
    });
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        if (!active) return undefined;
        const controller = new AbortController();
        let refreshRequested = retry > 0;
        let running = false;
        async function load() {
            if (running || controller.signal.aborted) return;
            running = true;
            try {
                const result = await fetchScopedAnalytics(scope, controller.signal, refreshRequested);
                refreshRequested = false;
                setState({ data: result, error: "", loading: false, key });
            } catch (error) {
                if (error.name !== "AbortError") setState({ data: null, error: error.message, loading: false, key });
            } finally { running = false; }
        }
        load();
        window.addEventListener("focus", load);
        return () => {
            controller.abort();
            window.removeEventListener("focus", load);
        };
    }, [key, retry, active]);
    const current = state.key === key ? state : (() => {
        const data = getCachedScopedAnalytics(scope);
        return { data, error: "", loading: !data, key };
    })();
    return { ...current, refresh: () => setRetry(value => value + 1) };
}

export const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value || 0);
export const monthLabel = value => value ? new Date(`${value.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" }) : "No data";
export const dateRange = scope => scope?.dateMin ? `${monthLabel(scope.dateMin)} – ${monthLabel(scope.dateMax)}` : "No prepared data";
