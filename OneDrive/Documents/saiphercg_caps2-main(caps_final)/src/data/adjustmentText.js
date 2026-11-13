const PHRASES = {
    closure: "a shop closure",
    no_sales: "a period with no recorded sales",
    data_gap: "a period with missing data",
    anomaly: "an unusual period"
};

export function describeAdjustment(kinds = [], reason = "") {
    const unique = [...new Set((Array.isArray(kinds) ? kinds : []).filter(kind => Object.hasOwn(PHRASES, kind)))];
    const phrase = unique.length === 1 ? PHRASES[unique[0]] : unique.length > 1 ? "an adjusted period" : "an adjusted period";
    return reason ? `${phrase} (${reason})` : phrase;
}
