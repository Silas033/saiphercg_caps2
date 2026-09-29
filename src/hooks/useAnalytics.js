import { useEffect, useState } from "react";

export const DEFAULT_SCOPE = {
    period: "All Available Data", returns: "Include All",
    region: "All Regions", province: "All Provinces", categories: null, start: "", end: ""
};

export function useAnalytics(scope = DEFAULT_SCOPE) {
    const key = JSON.stringify(scope);
    const [state, setState] = useState({ data: null, error: "", loading: true, key: "" });
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        let running = false;
        async function load() {
            if (running || controller.signal.aborted) return;
            running = true;
            try {
                const response = await fetch(`/api/analytics?filters=${encodeURIComponent(key)}`, { signal: controller.signal });
                if (!response.headers.get("content-type")?.includes("application/json")) {
                    throw new Error("The analytics API is unavailable. Restart the backend and check the /api connection.");
                }
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Unable to load analytics.");
                setState({ data: result, error: "", loading: false, key });
            } catch (error) {
                if (error.name !== "AbortError") setState({ data: null, error: error.message, loading: false, key });
            } finally { running = false; }
        }
        load();
        const timer = setInterval(load, 30000);
        window.addEventListener("focus", load);
        return () => {
            controller.abort();
            clearInterval(timer);
            window.removeEventListener("focus", load);
        };
    }, [key, retry]);
    return { ...(state.key === key ? state : { data: null, error: "", loading: true }), refresh: () => setRetry(value => value + 1) };
}

export const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value || 0);
export const monthLabel = value => value ? new Date(`${value.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" }) : "No data";
export const dateRange = scope => scope?.dateMin ? `${monthLabel(scope.dateMin)} – ${monthLabel(scope.dateMax)}` : "No prepared data";
