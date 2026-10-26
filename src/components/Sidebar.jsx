import { useState, useEffect } from "react";
import {
    FaChevronDown,
    FaChevronRight,
    FaCircle,
    FaCheckCircle,
    FaServer
} from "react-icons/fa";
import { NAVIGATION_STRUCTURE, scrollToSection } from "../data/navigationStructure";
import saipherLogo from "../assets/saiphercg.jpg";
import "../styles/sidebar.css";

export default function Sidebar({
    activePage,
    setActivePage,
    activeSection,
    setActiveSection
}) {
    // Accordion state: only one section's sub-sections are expanded at a time.
    // By default, the active page is expanded.
    const [expandedPages, setExpandedPages] = useState(() => ({
        [activePage]: true
    }));

    // Whenever the active page changes, collapse all previously opened sub-sections
    // and expand only the current active page.
    useEffect(() => {
        setExpandedPages({ [activePage]: true });
    }, [activePage]);

    function toggleExpand(pageId, event) {
        event.stopPropagation();
        const isCurrentlyExpanded = Boolean(expandedPages[pageId]);

        if (isCurrentlyExpanded) {
            // Collapse this section
            setExpandedPages({});
        } else {
            // Collapse all previous opened sub-sections and expand only this one
            setExpandedPages({ [pageId]: true });
        }
    }

    function handleParentClick(item) {
        if (activePage === item.id) return;
        if (typeof window !== "undefined") {
            window.__dssScrollLockUntil = Date.now() + 500;
        }
        setActivePage(item.id);
        // Collapse all previous opened sub-sections and expand only the newly clicked section
        setExpandedPages({ [item.id]: true });

        // Reset scroll position to top instantly when switching pages
        const container = document.querySelector(".dss-content");
        if (container) {
            container.scrollTo({ top: 0, behavior: "instant" });
        }

        // Select first subsection by default
        if (item.subSections?.length) {
            setActiveSection?.(item.subSections[0].id);
        }
    }

    function handleSubSectionClick(pageId, subId, event) {
        event.stopPropagation();
        if (typeof window !== "undefined") {
            window.__dssScrollLockUntil = Date.now() + 800;
        }
        setActiveSection?.(subId);

        if (activePage !== pageId) {
            setActivePage(pageId);
            // Collapse all previous opened sub-sections and expand only this one
            setExpandedPages({ [pageId]: true });
            // Double rAF ensures the target page's DOM has rendered before scrolling
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    scrollToSection(subId);
                });
            });
        } else {
            scrollToSection(subId);
        }
    }

    // Group items by category
    const categories = ["EXECUTIVE SUITE", "ANALYTICS ENGINE", "DATA PIPELINE"];

    return (
        <aside className="dss-sidebar" aria-label="Main sidebar navigation">
            {/* BRAND HEADER */}
            <div className="dss-brand">
                <div className="brand-lockup">
                    <img className="brand-logo-symbol" src={saipherLogo} alt="Saipher CG logo" />
                    <div>
                        <div className="brand-title-row">
                            <h1>SAIPHER CG</h1>
                            <span className="brand-enterprise-tag">DSS</span>
                        </div>
                        <p>Geographic Market Decision Support System</p>
                    </div>
                </div>
            </div>

            {/* NAVIGATION BY CATEGORY */}
            <nav className="dss-nav">
                {categories.map(categoryName => {
                    const categoryItems = NAVIGATION_STRUCTURE.filter(
                        item => item.category === categoryName
                    );

                    return (
                        <div key={categoryName} className="dss-nav-category-group">
                            <span className="dss-category-label">{categoryName}</span>

                            <div className="dss-category-items">
                                {categoryItems.map(item => {
                                    const Icon = item.icon;
                                    const isActive = activePage === item.id;
                                    const isExpanded = Boolean(expandedPages[item.id]);
                                    const hasSubs = Boolean(item.subSections?.length);

                                    return (
                                        <div
                                            key={item.id}
                                            className={`dss-nav-item-wrapper ${isActive ? "active-parent" : ""}`}
                                        >
                                            <div
                                                className={`dss-nav-item ${isActive ? "active" : ""}`}
                                                onClick={() => handleParentClick(item)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={e => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        handleParentClick(item);
                                                    }
                                                }}
                                            >
                                                <span className="dss-nav-icon">
                                                    <Icon />
                                                </span>

                                                <span className="dss-nav-label">
                                                    {item.label}
                                                </span>

                                                {hasSubs && (
                                                    <button
                                                        type="button"
                                                        className="dss-nav-expand-btn"
                                                        onClick={e => toggleExpand(item.id, e)}
                                                        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label} sub-sections`}
                                                        title={`${isExpanded ? "Collapse" : "Expand"} sections`}
                                                    >
                                                        {isExpanded ? (
                                                            <FaChevronDown />
                                                        ) : (
                                                            <FaChevronRight />
                                                        )}
                                                    </button>
                                                )}
                                            </div>

                                            {/* SUB-NAVIGATION LEVEL */}
                                            {hasSubs && isExpanded && (
                                                <div className="dss-sub-nav">
                                                    <div className="dss-sub-rail" />
                                                    {item.subSections.map((sub, idx) => {
                                                        const isSubActive =
                                                            isActive && activeSection === sub.id;

                                                        return (
                                                            <button
                                                                key={sub.id}
                                                                type="button"
                                                                className={`dss-sub-nav-item ${isSubActive ? "active-sub" : ""}`}
                                                                onClick={e =>
                                                                    handleSubSectionClick(item.id, sub.id, e)
                                                                }
                                                                title={sub.description}
                                                            >
                                                                <span className="sub-dot">
                                                                    <FaCircle />
                                                                </span>
                                                                <span className="sub-label">
                                                                    {sub.label}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>

            {/* SIDEBAR FOOTER */}
            <div className="dss-sidebar-footer">
                <div className="footer-status-pill">
                    <span className="status-live-indicator" />
                    <span>Supabase Live</span>
                </div>

                <div className="mountain-mark" aria-hidden="true">
                    ◢▲◣
                </div>

                <div className="footer-motto">
                    From data to opportunities.
                </div>

                <div className="footer-version">
                    SAIPHER CG DSS · v1.0.0
                </div>
            </div>
        </aside>
    );
}
