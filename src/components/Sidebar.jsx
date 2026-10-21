import {
    FaDatabase,
    FaFileAlt,
    FaSlidersH,
    FaChartBar,
    FaChartLine,
    FaBullseye
} from "react-icons/fa";

import "../styles/sidebar.css";

const navigation = [
    {
        id: "data-management",
        label: "Data Management",
        icon: <FaDatabase />
    },
    {
        id: "data-preparation",
        label: "Data Preparation",
        icon: <FaFileAlt />
    },
    {
        id: "analysis-controls",
        label: "Analytics Scope",
        icon: <FaSlidersH />
    },
    {
        id: "descriptive-analytics",
        label: "Descriptive Analytics",
        icon: <FaChartBar />
    },
    {
        id: "predictive-analytics",
        label: "Predictive Analytics",
        icon: <FaChartLine />
    },
    {
        id: "prescriptive-analytics",
        label: "Prescriptive Analytics",
        icon: <FaBullseye />
    }
];

export default function Sidebar({
    activePage,
    setActivePage
}) {

    return (

        <aside className="dss-sidebar">

            <div className="dss-brand">

                <h1>SAIPHER CG</h1>

                <p>
                    Geographic Market
                    <br />
                    Decision Support System
                </p>

            </div>

            <nav className="dss-nav">

                {navigation.map(item => (

                    <button
                        key={item.id}
                        className={
                            activePage === item.id
                                ? "dss-nav-item active"
                                : "dss-nav-item"
                        }
                        onClick={() =>
                            setActivePage(item.id)
                        }
                    >

                        <span className="dss-nav-icon">
                            {item.icon}
                        </span>

                        <span>
                            {item.label}
                        </span>

                    </button>

                ))}

            </nav>

            <div className="dss-sidebar-footer">

                <div className="mountain-mark">
                    ◢▲◣
                </div>

                <div>
                    From data
                    <br />
                    to opportunities.
                </div>

                <br />

                SAIPHER CG DSS
                <br />
                v1.0.0

            </div>

        </aside>

    );

}
