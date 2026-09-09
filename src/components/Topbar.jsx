import {
    FaSearch,
    FaCalendarAlt,
    FaBell,
    FaChevronDown
} from "react-icons/fa";

import "../styles/topbar.css";

export default function Topbar() {

    return (

        <header className="dss-topbar">

            <div className="topbar-search">

                <FaSearch />

                <input
                    placeholder="Search files, products, provinces, or insights..."
                />

            </div>

            <button className="topbar-period">

                <FaCalendarAlt />

                <span>
                    Jan 2021 – Nov 2025
                </span>

                <FaChevronDown />

            </button>

            <div className="topbar-actions">

                <button className="notification-button">

                    <FaBell />

                    <span className="notification-badge">
                        3
                    </span>

                </button>

                <div className="user-profile">

                    <span className="user-avatar">
                        CG
                    </span>

                    <span>
                        Client User
                    </span>

                    <FaChevronDown />

                </div>

            </div>

        </header>

    );

}