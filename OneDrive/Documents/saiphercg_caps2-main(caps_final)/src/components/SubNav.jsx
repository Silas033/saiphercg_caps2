import { useEffect, useRef } from "react";
import {
    FaChevronRight,
    FaArrowUp,
    FaMapMarkerAlt,
    FaSlidersH,
    FaLayerGroup
} from "react-icons/fa";
import { getPageMeta, scrollToSection } from "../data/navigationStructure";
import "../styles/subnav.css";

export default function SubNav({
    activePage,
    setActivePage,
    activeSection,
    setActiveSection,
    scope
}) {
    const pageMeta = getPageMeta(activePage);
    const subSections = pageMeta?.subSections || [];
    const navRef = useRef(null);

    // Track active section accurately as user scrolls through .dss-content
    useEffect(() => {
        const container = document.querySelector(".dss-content");
        if (!container || !subSections.length) return;

        let rafId = null;

        function updateActiveSection() {
            // If user recently clicked a nav item, don't let scroll spy overwrite it during the animation
            if (typeof window !== "undefined" && window.__dssScrollLockUntil && Date.now() < window.__dssScrollLockUntil) {
                return;
            }

            const containerRect = container.getBoundingClientRect();
            const containerTop = containerRect.top;
            const containerHeight = container.clientHeight;
            const scrollTop = container.scrollTop;
            const scrollHeight = container.scrollHeight;

            // 1. If at the very top of the container, highlight the first sub-section
            if (scrollTop <= 45) {
                if (subSections[0]?.id && activeSection !== subSections[0].id) {
                    setActiveSection(subSections[0].id);
                }
                return;
            }

            // 2. If scrolled to the bottom of the container, highlight the last sub-section
            if (scrollHeight - scrollTop - containerHeight <= 45) {
                const lastSub = subSections[subSections.length - 1];
                if (lastSub?.id && activeSection !== lastSub.id) {
                    setActiveSection(lastSub.id);
                }
                return;
            }

            // 3. Focal line: 110px below container top (where the reader's eye sits)
            const viewingLine = containerTop + 110;
            let currentSection = subSections[0]?.id;

            for (const sub of subSections) {
                const el = document.getElementById(sub.id);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    // If the section's top is at or above the viewing line, it is active
                    // until the next section reaches the viewing line.
                    if (rect.top <= viewingLine) {
                        currentSection = sub.id;
                    }
                }
            }

            if (currentSection && currentSection !== activeSection) {
                setActiveSection(currentSection);
            }
        }

        function handleScroll() {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(updateActiveSection);
        }

        container.addEventListener("scroll", handleScroll, { passive: true });
        // Initial sync on mount
        updateActiveSection();

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            container.removeEventListener("scroll", handleScroll);
        };
    }, [activePage, subSections, activeSection, setActiveSection]);

    // When page changes, ensure activeSection is valid for this page
    useEffect(() => {
        if (subSections.length > 0 && (!activeSection || !subSections.some(s => s.id === activeSection))) {
            setActiveSection(subSections[0].id);
        }
    }, [activePage, subSections, activeSection, setActiveSection]);

    function handleSubSectionClick(sectionId) {
        setActiveSection(sectionId);
        scrollToSection(sectionId);
    }

    function scrollToTop() {
        const container = document.querySelector(".dss-content");
        if (container) {
            container.scrollTo({ top: 0, behavior: "smooth" });
        }
    }

    if (!subSections.length) return null;

    const scopeText = [
        scope?.region && scope.region !== "All Regions" ? scope.region : "All Regions",
        scope?.province && scope.province !== "All Provinces" ? scope.province : null,
        scope?.period && scope.period !== "All Available Data" ? scope.period : null
    ].filter(Boolean).join(" · ");

    return (
        <nav className="corporate-subnav" aria-label="Sub-navigation">
            <div className="subnav-container">
                <div className="subnav-header-info">
                    <span className="subnav-badge">
                        <FaLayerGroup aria-hidden="true" />
                        <span>SECTIONS ({subSections.length})</span>
                    </span>
                    <span className="subnav-divider">/</span>
                </div>

                <div className="subnav-tabs" ref={navRef}>
                    {subSections.map((sub, index) => {
                        const Icon = sub.icon;
                        const isActive = activeSection === sub.id;
                        return (
                            <button
                                key={sub.id}
                                type="button"
                                className={`subnav-tab ${isActive ? "active" : ""}`}
                                onClick={() => handleSubSectionClick(sub.id)}
                                title={sub.description}
                                aria-current={isActive ? "true" : undefined}
                            >
                                <span className="subnav-tab-index">{index + 1}</span>
                                {Icon && <Icon className="subnav-tab-icon" aria-hidden="true" />}
                                <span className="subnav-tab-text">{sub.label}</span>
                                {isActive && <span className="subnav-active-pip" />}
                            </button>
                        );
                    })}
                </div>

                <div className="subnav-actions">
                    {scopeText && (
                        <div className="subnav-scope-chip" title="Current Analytics Scope">
                            <FaMapMarkerAlt aria-hidden="true" />
                            <span>{scopeText}</span>
                        </div>
                    )}
                    <button
                        type="button"
                        className="subnav-top-btn"
                        onClick={scrollToTop}
                        title="Scroll to top of view"
                        aria-label="Scroll to top"
                    >
                        <FaArrowUp aria-hidden="true" />
                        <span>Top</span>
                    </button>
                </div>
            </div>
        </nav>
    );
}
