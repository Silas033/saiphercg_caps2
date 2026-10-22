import { useState } from "react";

import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";

import DataManagement from "./pages/DataManagement";
import DataPreparation from "./pages/DataPreparation";
import AnalysisControls from "./pages/AnalysisControls";
import DescriptiveAnalytics from "./pages/DescriptiveAnalytics";
import PredictiveAnalytics from "./pages/PredictiveAnalytics";
import PrescriptiveAnalytics from "./pages/PrescriptiveAnalytics";
import { DEFAULT_SCOPE } from "./hooks/useAnalytics";
import { DEFAULT_FORECAST_SETTINGS } from "./data/forecastSettings";

export default function App() {
    const [analysisScope, setAnalysisScope] = useState(DEFAULT_SCOPE);
    const [forecastSettings, setForecastSettings] = useState(DEFAULT_FORECAST_SETTINGS);
    const [predictiveSelectionRequest, setPredictiveSelectionRequest] = useState(null);
    const [prescriptiveReturn, setPrescriptiveReturn] = useState(null);
    const [prescriptiveReturnRequest, setPrescriptiveReturnRequest] = useState(null);
    const [activePage, setActivePage] =
        useState("data-management");
    const [visitedAnalyticsPages, setVisitedAnalyticsPages] = useState(() => new Set());
    const analyticsPages = ["descriptive-analytics", "predictive-analytics", "prescriptive-analytics"];

    function navigateToPage(page) {
        if (analyticsPages.includes(page)) {
            setVisitedAnalyticsPages(previous => {
                if (previous.has(page)) return previous;
                return new Set([...previous, page]);
            });
        }
        setActivePage(page);
    }

    function openPredictiveForecast({ category, provinceKey, pairKey, region, province }) {
        const requestId = Date.now();
        setPredictiveSelectionRequest({ category, provinceKey, requestId });
        setPrescriptiveReturn({ category, pairKey, region, province });
        navigateToPage("predictive-analytics");
    }

    function returnToPrescriptiveStrategy() {
        if (!prescriptiveReturn) return;
        setPrescriptiveReturnRequest({ ...prescriptiveReturn, requestId: Date.now() });
        navigateToPage("prescriptive-analytics");
    }

    function exitPrescriptivePairForecast() {
        setPredictiveSelectionRequest(null);
        setPrescriptiveReturn(null);
    }

    function renderPage(page = activePage) {

        switch (page) {

            case "data-management":
                return <DataManagement setActivePage={navigateToPage} />;

            case "data-preparation":
                return <DataPreparation setActivePage={navigateToPage} />;

            case "analysis-controls":
                return <AnalysisControls setActivePage={navigateToPage} scope={analysisScope} onApply={setAnalysisScope} />;

            case "descriptive-analytics":
                return <DescriptiveAnalytics scope={analysisScope} active={page === activePage} onViewPredictive={() => navigateToPage("predictive-analytics")} />;

            case "predictive-analytics":
                return <PredictiveAnalytics scope={analysisScope} active={page === activePage} forecastSettings={forecastSettings} onForecastSettingsChange={setForecastSettings} selectionRequest={predictiveSelectionRequest} prescriptiveReturn={prescriptiveReturn} onReturnToStrategy={returnToPrescriptiveStrategy} onExitPairForecast={exitPrescriptivePairForecast} onViewPrescriptive={() => navigateToPage("prescriptive-analytics")} />;

            case "prescriptive-analytics":
                return <PrescriptiveAnalytics scope={analysisScope} active={page === activePage} forecastSettings={forecastSettings} returnRequest={prescriptiveReturnRequest} onViewPredictive={openPredictiveForecast} />;

            default:
                return <DataManagement />;

        }

    }

    return (

        <div className="app-shell">

            <Sidebar
                activePage={activePage}
                setActivePage={navigateToPage}
            />

            <main className="dss-main">

                <Topbar />

                <section className="dss-content">
                    {analyticsPages.map(page => visitedAnalyticsPages.has(page) && (
                        <div key={page} hidden={activePage !== page}>
                            {renderPage(page)}
                        </div>
                    ))}
                    {!analyticsPages.includes(activePage) && renderPage()}

                </section>

            </main>

        </div>

    );

}
