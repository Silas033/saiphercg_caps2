import { useState } from "react";

import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";

import DataManagement from "./pages/DataManagement";
import DataPreparation from "./pages/DataPreparation";
import AnalysisControls from "./pages/AnalysisControls";
import DescriptiveAnalytics from "./pages/DescriptiveAnalytics";
import PredictiveAnalytics from "./pages/PredictiveAnalytics";
import PrescriptiveAnalytics from "./pages/PrescriptiveAnalytics";

import { DEFAULT_SCOPE } from "./data/analyticsScope";

export default function App() {

    const [activePage, setActivePage] =
        useState("data-management");

    /*
      Shared analysis scope. Analysis Controls edits a local draft and
      only commits into this state when "Apply Scope" is clicked, so the
      rest of the app (Descriptive Analytics, for now) always renders the
      last APPLIED scope rather than whatever is mid-edit on the Controls
      page.
    */
    const [appliedScope, setAppliedScope] =
        useState(DEFAULT_SCOPE);

    function applyScope(nextScope) {
        setAppliedScope(nextScope);
        setActivePage("descriptive-analytics");
    }

    function renderPage() {

        switch (activePage) {

            case "data-management":
                return <DataManagement />;

            case "data-preparation":
                return <DataPreparation setActivePage={setActivePage} />;

            case "analysis-controls":
                return (
                    <AnalysisControls
                        appliedScope={appliedScope}
                        onApply={applyScope}
                    />
                );

            case "descriptive-analytics":
                return <DescriptiveAnalytics scope={appliedScope} />;

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