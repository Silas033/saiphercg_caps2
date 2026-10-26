import { useState, useRef, useEffect } from "react";
import {
    FaChevronDown,
    FaChevronRight,
    FaCheckCircle,
    FaShieldAlt,
    FaUserCheck,
    FaBuilding,
    FaSignOutAlt
} from "react-icons/fa";
import { getPageMeta } from "../data/navigationStructure";
import "../styles/topbar.css";

export default function Topbar({
    activePage = "overview",
    activeSection = null,
    scope = null
}) {
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef(null);

    const pageMeta = getPageMeta(activePage);
    const subSectionMeta = pageMeta?.subSections?.find(s => s.id === activeSection);

    // Close profile dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event) {
            if (profileRef.current && !profileRef.current.contains(event.target)) {
                setProfileOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <header className="dss-topbar">
            {/* CORPORATE BREADCRUMB TRAIL */}
            <div className="topbar-breadcrumbs" aria-label="Breadcrumb">
                <span className="breadcrumb-root">SAIPHER CG DSS</span>
                <FaChevronRight className="breadcrumb-separator" aria-hidden="true" />
                
                <span className="breadcrumb-category">
                    {pageMeta.category}
                </span>
                <FaChevronRight className="breadcrumb-separator" aria-hidden="true" />

                <span className={`breadcrumb-page ${!subSectionMeta ? "current" : ""}`}>
                    {pageMeta.label}
                </span>

                {subSectionMeta && (
                    <>
                        <FaChevronRight className="breadcrumb-separator" aria-hidden="true" />
                        <span className="breadcrumb-sub current">
                            {subSectionMeta.label}
                        </span>
                    </>
                )}
            </div>

            {/* TOPBAR ACTIONS */}
            <div className="topbar-actions">
                {/* SYSTEM STATUS PILL */}
                <div className="topbar-status-chip" title="DSS Analytics Engine is operating normally">
                    <span className="status-dot-pulse" />
                    <span>System Online</span>
                </div>

                {/* USER PROFILE WITH CORPORATE DROPDOWN */}
                <div className="profile-container" ref={profileRef}>
                    <button
                        type="button"
                        className={`user-profile ${profileOpen ? "open" : ""}`}
                        onClick={() => setProfileOpen(!profileOpen)}
                        aria-expanded={profileOpen}
                        aria-haspopup="dialog"
                    >
                        <span className="user-avatar">
                            CG
                        </span>

                        <div className="user-info-text">
                            <span className="user-name">Client User</span>
                            <span className="user-role">Decision Maker</span>
                        </div>

                        <FaChevronDown className="user-chevron" aria-hidden="true" />
                    </button>

                    {profileOpen && (
                        <div className="profile-dropdown-card" role="dialog" aria-label="User Account Details">
                            <div className="dropdown-header">
                                <div className="dropdown-avatar-large">CG</div>
                                <div>
                                    <strong>Client User</strong>
                                    <small>Decision Maker</small>
                                </div>
                            </div>

                            <div className="dropdown-details">
                                <div className="detail-row">
                                    <FaBuilding className="detail-icon" />
                                    <div>
                                        <span>Organization</span>
                                        <strong>SAIPHER CG Commercial</strong>
                                    </div>
                                </div>

                                <div className="detail-row">
                                    <FaShieldAlt className="detail-icon" />
                                    <div>
                                        <span>Access Level</span>
                                        <strong>Enterprise Decision Support</strong>
                                    </div>
                                </div>

                                <div className="detail-row">
                                    <FaCheckCircle className="detail-icon verified" />
                                    <div>
                                        <span>Data Engine</span>
                                        <strong>Supabase Production</strong>
                                    </div>
                                </div>
                            </div>

                            <div className="dropdown-footer">
                                <span className="dropdown-system-label">SAIPHER CG DSS v1.0.0</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
