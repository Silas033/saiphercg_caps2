import {
    FaCompass,
    FaDatabase,
    FaFileAlt,
    FaSlidersH,
    FaChartBar,
    FaChartLine,
    FaBullseye,
    FaCloudUploadAlt,
    FaLayerGroup,
    FaTable,
    FaClipboardCheck,
    FaCogs,
    FaCheckCircle,
    FaCalendarAlt,
    FaUndo,
    FaMapMarkerAlt,
    FaBoxOpen,
    FaLightbulb,
    FaChartPie,
    FaCrosshairs
} from "react-icons/fa";

export const NAVIGATION_STRUCTURE = [
    {
        id: "overview",
        label: "Executive Overview",
        category: "EXECUTIVE SUITE",
        icon: FaCompass,
        description: "Visual executive dashboard synthesizing sales performance, demand forecasts, and business action plans",
        subSections: [
            { id: "ov-answers", label: "Key Business Answers", icon: FaLightbulb, description: "Direct answers to how sales are doing, future demand, and actions" },
            { id: "ov-kpis", label: "Sales & Growth Numbers", icon: FaChartBar, description: "Revenue, monthly demand, priority score, and accuracy" },
            { id: "ov-insights", label: "Market Findings", icon: FaChartLine, description: "Monthly sales momentum, top products, and regional demand" },
            { id: "ov-health", label: "Data & Store Status", icon: FaDatabase, description: "Cleaned transaction records, date coverage, and store health" }
        ]
    },
    {
        id: "data-management",
        label: "Data Management",
        category: "DATA PIPELINE",
        icon: FaDatabase,
        description: "Upload and organize monthly Shopee sales spreadsheets",
        subSections: [
            { id: "dm-upload", label: "Upload Sales Data", icon: FaCloudUploadAlt, description: "Upload .xlsx monthly transaction files" },
            { id: "dm-coverage", label: "Coverage Overview", icon: FaDatabase, description: "Date range, total orders, and geographic coverage" },
            { id: "dm-files", label: "Uploaded Files", icon: FaTable, description: "Review and inspect uploaded transaction spreadsheets" }
        ]
    },
    {
        id: "data-preparation",
        label: "Data Preparation",
        category: "DATA PIPELINE",
        icon: FaFileAlt,
        description: "Review, clean, and standardize sales records for analysis",
        subSections: [
            { id: "dp-profiling", label: "01 Dataset Overview", icon: FaDatabase, description: "Initial summary of raw transaction data" },
            { id: "dp-quality", label: "02 Data Quality Checks", icon: FaClipboardCheck, description: "Verify dates, duplicates, and completed orders" },
            { id: "dp-transform", label: "03 Data Standardization", icon: FaCogs, description: "Map products into categories and clean locations" },
            { id: "dp-validation", label: "04 Readiness Check", icon: FaCheckCircle, description: "Verify clean data is ready for reporting and forecasting" }
        ]
    },
    {
        id: "analysis-controls",
        label: "Analytics Scope",
        category: "ANALYTICS ENGINE",
        icon: FaSlidersH,
        description: "Set the date range, locations, and products to analyze",
        subSections: [
            { id: "as-period", label: "Date Range", icon: FaCalendarAlt, description: "Choose historical period or custom date range" },
            { id: "as-returns", label: "Returns & Refunds", icon: FaUndo, description: "Choose to include or exclude returned orders" },
            { id: "as-geography", label: "Geographic Filter", icon: FaMapMarkerAlt, description: "Focus on specific regions, provinces, or nationwide" },
            { id: "as-categories", label: "Product Categories", icon: FaBoxOpen, description: "Select specific product categories to analyze" }
        ]
    },
    {
        id: "descriptive-analytics",
        label: "Descriptive Analytics",
        category: "ANALYTICS ENGINE",
        icon: FaChartBar,
        description: "Track past sales revenue, order volumes, and regional trends",
        subSections: [
            { id: "da-kpis", label: "Key Sales Metrics", icon: FaChartBar, description: "Total revenue, distinct orders, and units sold" },
            { id: "da-insights", label: "Key Business Takeaways", icon: FaLightbulb, description: "Automated highlights and notable business observations" },
            { id: "da-trend", label: "Sales Trend Over Time", icon: FaChartLine, description: "Monthly revenue and order patterns over time" },
            { id: "da-geography", label: "Regional Sales", icon: FaMapMarkerAlt, description: "Sales distribution across regions and provinces" },
            { id: "da-categories", label: "Category Sales", icon: FaBoxOpen, description: "Revenue and unit volume by product category" }
        ]
    },
    {
        id: "predictive-analytics",
        label: "Predictive Analytics",
        category: "ANALYTICS ENGINE",
        icon: FaChartLine,
        description: "Project future monthly demand and revenue by product and province",
        subSections: [
            { id: "pa-parameters", label: "Forecast Controls", icon: FaSlidersH, description: "Forecast duration, metric, and prediction model" },
            { id: "pa-signals", label: "Top Growth Opportunities", icon: FaLightbulb, description: "Fastest-growing product and province combinations" },
            { id: "pa-overview", label: "All Projected Opportunities", icon: FaLayerGroup, description: "Ranked list of all projected sales opportunities" },
            { id: "pa-chart", label: "Sales vs Forecast", icon: FaChartLine, description: "Compare past sales against projected demand" },
            { id: "pa-breakdown", label: "Category & Province Forecasts", icon: FaTable, description: "Projections broken down by category and province" }
        ]
    },
    {
        id: "prescriptive-analytics",
        label: "Prescriptive Analytics",
        category: "ANALYTICS ENGINE",
        icon: FaBullseye,
        description: "Actionable strategic recommendations backed by sales evidence",
        subSections: [
            { id: "pra-priorities", label: "Strategic Priorities", icon: FaCrosshairs, description: "Primary recommended strategy and top 5 strategic opportunities" },
            { id: "why-this-province", label: "Decision Evidence", icon: FaClipboardCheck, description: "Sales consistency, growth momentum, and supporting pillars" },
            { id: "prescriptive-recommendations", label: "Province Recommendations", icon: FaTable, description: "Complete strategic actions for all provinces" }
        ]
    }
];

export function getPageMeta(pageId) {
    return NAVIGATION_STRUCTURE.find(item => item.id === pageId) || NAVIGATION_STRUCTURE[0];
}

export function scrollToSection(sectionId, retries = 4) {
    if (!sectionId) return;
    if (typeof window !== "undefined") {
        window.__dssScrollLockUntil = Date.now() + 800;
    }
    const element = document.getElementById(sectionId);
    if (element) {
        if (element.tagName === "DETAILS" && !element.open) {
            element.open = true;
        }
        element.scrollIntoView({ behavior: "smooth", block: "start" });
        element.classList.add("section-highlight-active");
        setTimeout(() => {
            element.classList.remove("section-highlight-active");
        }, 1800);
    } else if (retries > 0) {
        requestAnimationFrame(() => scrollToSection(sectionId, retries - 1));
    }
}
