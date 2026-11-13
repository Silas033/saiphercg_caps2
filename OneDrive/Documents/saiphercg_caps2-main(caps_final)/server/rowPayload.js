export const exclusionReasonForStatus = status => `Order status is "${String(status ?? "").trim() || "unknown"}", not "Completed"`;

export function variantFields(row) {
    return {
        variation_name: row.variation_name ?? null,
        sku_reference_no: row.sku_reference_no ?? null
    };
}

export function sourceCounts(prepared, duplicateRows) {
    const duplicates = Number(duplicateRows) || 0;
    return {
        duplicate_rows: duplicates,
        source_row_count: prepared.length + duplicates,
        eligible_orders: new Set(prepared.filter(row => row.is_included_in_analysis && !row.is_exact_duplicate).map(row => row.order_id).filter(Boolean)).size
    };
}
