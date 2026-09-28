import { useState } from "react";

import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";

import DataManagement from "./pages/DataManagement";
import DataPreparation from "./pages/DataPreparation";
import AnalysisControls from "./pages/AnalysisControls";
import DescriptiveAnalytics from "./pages/DescriptiveAnalytics";
import PredictiveAnalytics from "./pages/PredictiveAnalytics";
import PrescriptiveAnalytics from "./pages/PrescriptiveAnalytics";

export default function App() {

    const [activePage, setActivePage] =
        useState("data-management");

    function renderPage() {

        switch (activePage) {

            case "data-management":
                return <DataManagement />;

            case "data-preparation":
                return <DataPreparation setActivePage={setActivePage} />;

            case "analysis-controls":
                return <AnalysisControls setActivePage={setActivePage} />;

            case "descriptive-analytics":
                return <DescriptiveAnalytics />;

            case "predictive-analytics":
                return <PredictiveAnalytics />;

            case "prescriptive-analytics":
                return <PrescriptiveAnalytics />;

            default:
                return <DataManagement />;

        }

    }

    return (

        <div className="app-shell">

            <Sidebar
                activePage={activePage}
                setActivePage={setActivePage}
            />

            <main className="dss-main">

                <Topbar />

                <section className="dss-content">

                    {renderPage()}

                </section>

            </main>

        </div>

    );

}