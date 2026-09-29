import fs from "fs";
import path from "path";
import XLSX from "xlsx";

/*
==========================================================
SAIPHER CG DSS
DATA PREPARATION / ETL ENGINE
==========================================================

RAW DATA
    ↓
Profile
    ↓
Quality Checks
    ↓
Geographic Standardization
    ↓
Product Classification
    ↓
Time Feature Engineering
    ↓
Analytical Measures
    ↓
Validation
    ↓
Prepared Master Dataset

IMPORTANT PRODUCT HIERARCHY:

Raw Product Name
        ↓
Category
        ↓
Subcategory

There is NO product variant level.
==========================================================
*/

const TAXONOMY = {
    "Shrink Wrap / Cap Seal": [
        "Cap Seal",
        "Shrink Film",
        "Cling Wrap / Food Wrap",
        "Shrink Sleeve"
    ],

    "Bottle / Container": [
        "Bottle",
        "Container",
        "Jar"
    ],

    "Tape / Adhesive": [
        "Packaging Tape",
        "Double-Sided Tape",
        "Adhesive Tape"
    ],

    "Label / Sticker": [
        "Label",
        "Sticker"
    ],

    "Mailer / Shipping Packaging": [
        "Poly Mailer",
        "Courier Bag",
        "Shipping Bag"
    ],

    "Protective Packaging": [
        "Bubble Wrap",
        "Protective Film"
    ],

    "Plastic Bags": [
        "Sando Bag",
        "Labo Bag",
        "Trash / Garbage Bag",
        "Ice Bag",
        "Sandwich Bag",
        "Counter Bag",
        "Printed Plastic Bag"
    ],

    "Packaging Accessories": [
        "Rubber Band",
        "Gloves",
        "Silica Gel / Desiccant",
        "Packaging Tool",
        "Cutter / Cutting Tool"
    ],

    "Packaging / General Supplies": [
        "Tissue / Cleaning Material",
        "Rags / Cloth",
        "Toothpick",
        "Naphthalene / Moth Balls",
        "Money Envelope"
    ],

    "Other / Unclassified": [
        "Other / Unclassified"
    ]
};

const PREPARED_FILE = "prepared_master_data.json";
const STATE_FILE = "preparation_state.json";
const OVERRIDES_FILE = "product_mapping_overrides.json";

const REQUIRED_COLUMNS = [
    "Order ID",
    "Order Status",
    "Product Name",
    "Quantity",
    "Total Buyer Payment",
    "Order Creation Date",
    "Return / Refund Status",
    "Returned quantity",
    "Province",
    "City"
];

/* ======================================================
   BASIC HELPERS
====================================================== */

function clean(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function lower(value) {
    return clean(value).toLowerCase();
}

function number(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    if (typeof value === "number") {
        return Number.isFinite(value)
            ? value
            : null;
    }

    let text = String(value).trim();

    const negativeParentheses =
        /^\(.*\)$/.test(text);

    text = text
        .replace(/PHP/gi, "")
        .replace(/₱/g, "")
        .replace(/,/g, "")
        .replace(/[()\s]/g, "");

    const parsed = Number(text);

    if (!Number.isFinite(parsed)) {
        return null;
    }

    return negativeParentheses
        ? -parsed
        : parsed;
}

function parseDate(value) {
    if (!value) {
        return null;
    }

    if (
        value instanceof Date &&
        !Number.isNaN(value.getTime())
    ) {
        return value;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
}

function dateFields(value) {

    const date = parseDate(value);

    if (!date) {
        return {
            orderCreationDate: null,
            year: null,
            month: null,
            monthName: null,
            monthNumber: null,
            yearMonth: null,
            quarter: null
        };
    }

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return {
        orderCreationDate:
            `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,

        year,

        month,

        monthName:
            date.toLocaleString("en-US", {
                month: "long"
            }),

        monthNumber: month,

        yearMonth:
            `${year}-${String(month).padStart(2, "0")}`,

        quarter:
            `Q${Math.ceil(month / 3)}`
    };
}

/* ======================================================
   FILE HELPERS
====================================================== */

function readJson(file) {

    try {

        if (!fs.existsSync(file)) {
            return {};
        }

        return JSON.parse(
            fs.readFileSync(file, "utf8")
        );

    } catch {

        return {};
    }
}

function writeJson(file, data) {

    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

/* ======================================================
   PRODUCT CLASSIFICATION
====================================================== */

function classifyProduct(rawProductName) {

    const text = lower(rawProductName);

    const mapped = (
        category,
        subcategory
    ) => ({
        category,
        subcategory,
        status: "Mapped"
    });

    if (!text) {

        return {
            category: "Other / Unclassified",
            subcategory: "Other / Unclassified",
            status: "Unmapped"
        };
    }

    /* Shrink Wrap / Cap Seal */

    if (
        /cap\s*seal|pvc\s*seal|shrink\s*cap/.test(text)
    ) {
        return mapped(
            "Shrink Wrap / Cap Seal",
            "Cap Seal"
        );
    }

    if (
        /shrink\s*(film|wrap)|plastic\s*shrink/.test(text)
    ) {
        return mapped(
            "Shrink Wrap / Cap Seal",
            "Shrink Film"
        );
    }

    if (
        /cling\s*(wrap|film)|food\s*(wrap|film)/.test(text)
    ) {
        return mapped(
            "Shrink Wrap / Cap Seal",
            "Cling Wrap / Food Wrap"
        );
    }

    if (
        /shrink\s*sleeve/.test(text)
    ) {
        return mapped(
            "Shrink Wrap / Cap Seal",
            "Shrink Sleeve"
        );
    }

    /* Bottle / Container */

    if (/\bjar\b/.test(text)) {
        return mapped(
            "Bottle / Container",
            "Jar"
        );
    }

    if (/\bbottle\b/.test(text)) {
        return mapped(
            "Bottle / Container",
            "Bottle"
        );
    }

    if (/\bcontainer\b/.test(text)) {
        return mapped(
            "Bottle / Container",
            "Container"
        );
    }

    /* Tape */

    if (
        /double\s*sided|double\s*tape/.test(text)
    ) {
        return mapped(
            "Tape / Adhesive",
            "Double-Sided Tape"
        );
    }

    if (
        /packaging\s*tape|packing\s*tape|carton\s*tape|brown\s*tape/.test(text)
    ) {
        return mapped(
            "Tape / Adhesive",
            "Packaging Tape"
        );
    }

    if (
        /adhesive\s*tape|masking\s*tape|foam\s*tape/.test(text)
    ) {
        return mapped(
            "Tape / Adhesive",
            "Adhesive Tape"
        );
    }

    /* Label / Sticker */

    if (/\bsticker\b/.test(text)) {
        return mapped(
            "Label / Sticker",
            "Sticker"
        );
    }

    if (/\blabel\b/.test(text)) {
        return mapped(
            "Label / Sticker",
            "Label"
        );
    }

    /* Mailer */

    if (
        /poly\s*mailer|mailer\s*bag/.test(text)
    ) {
        return mapped(
            "Mailer / Shipping Packaging",
            "Poly Mailer"
        );
    }

    if (
        /courier\s*bag/.test(text)
    ) {
        return mapped(
            "Mailer / Shipping Packaging",
            "Courier Bag"
        );
    }

    if (
        /shipping\s*bag/.test(text)
    ) {
        return mapped(
            "Mailer / Shipping Packaging",
            "Shipping Bag"
        );
    }

    /* Protective Packaging */

    if (
        /bubble\s*wrap|bubble\s*film|air\s*bubble/.test(text)
    ) {
        return mapped(
            "Protective Packaging",
            "Bubble Wrap"
        );
    }

    if (
        /protective\s*film|protection\s*film|surface\s*film/.test(text)
    ) {
        return mapped(
            "Protective Packaging",
            "Protective Film"
        );
    }

    /* Plastic Bags */

    if (/sando\s*bag/.test(text)) {
        return mapped(
            "Plastic Bags",
            "Sando Bag"
        );
    }

    if (/labo\s*bag/.test(text)) {
        return mapped(
            "Plastic Bags",
            "Labo Bag"
        );
    }

    if (
        /trash\s*bag|garbage\s*bag|basura\s*bag/.test(text)
    ) {
        return mapped(
            "Plastic Bags",
            "Trash / Garbage Bag"
        );
    }

    if (/ice\s*bag/.test(text)) {
        return mapped(
            "Plastic Bags",
            "Ice Bag"
        );
    }

    if (/sandwich\s*bag/.test(text)) {
        return mapped(
            "Plastic Bags",
            "Sandwich Bag"
        );
    }

    if (/counter\s*bag/.test(text)) {
        return mapped(
            "Plastic Bags",
            "Counter Bag"
        );
    }

    if (
        /printed\s*(plastic\s*)?bag|custom\s*printed\s*bag/.test(text)
    ) {
        return mapped(
            "Plastic Bags",
            "Printed Plastic Bag"
        );
    }

    /* Accessories */

    if (
        /rubber\s*band|elastic\s*band/.test(text)
    ) {
        return mapped(
            "Packaging Accessories",
            "Rubber Band"
        );
    }

    if (/\bgloves?\b/.test(text)) {
        return mapped(
            "Packaging Accessories",
            "Gloves"
        );
    }

    if (
        /silica\s*gel|desiccant/.test(text)
    ) {
        return mapped(
            "Packaging Accessories",
            "Silica Gel / Desiccant"
        );
    }

    if (
        /cutter|cutting\s*tool|utility\s*knife|box\s*cutter/.test(text)
    ) {
        return mapped(
            "Packaging Accessories",
            "Cutter / Cutting Tool"
        );
    }

    if (
        /packaging\s*tool|packing\s*tool|heat\s*gun/.test(text)
    ) {
        return mapped(
            "Packaging Accessories",
            "Packaging Tool"
        );
    }

    /* General Supplies */

    if (
        /tissue|kitchen\s*towel|cleaning\s*material|cleaning\s*cloth/.test(text)
    ) {
        return mapped(
            "Packaging / General Supplies",
            "Tissue / Cleaning Material"
        );
    }

    if (
        /\brags?\b|wiping\s*cloth/.test(text)
    ) {
        return mapped(
            "Packaging / General Supplies",
            "Rags / Cloth"
        );
    }

    if (/toothpick/.test(text)) {
        return mapped(
            "Packaging / General Supplies",
            "Toothpick"
        );
    }

    if (
        /naphthalene|moth\s*ball/.test(text)
    ) {
        return mapped(
            "Packaging / General Supplies",
            "Naphthalene / Moth Balls"
        );
    }

    if (
        /money\s*envelope|cash\s*envelope|ang\s*pao/.test(text)
    ) {
        return mapped(
            "Packaging / General Supplies",
            "Money Envelope"
        );
    }

    return {
        category: "Other / Unclassified",
        subcategory: "Other / Unclassified",
        status: "Review"
    };
}

/* ======================================================
   GEOGRAPHIC STANDARDIZATION
====================================================== */

function standardizeGeography(
    rawProvince,
    rawCity
) {

    const sourceRegion = clean(rawProvince);
    const sourceProvince = clean(rawCity);

    let region =
        sourceRegion || "Unclassified";

    let province =
        sourceProvince || "Unclassified";

    /*
      Actual dataset interpretation:

      Shopee Province → Region
      Shopee City     → Province
    */

    if (
        lower(province) === "aurora"
    ) {
        region = "North Luzon";
    }

    return {
        rawProvince: sourceRegion,
        rawCity: sourceProvince,
        region,
        province,

        status:
            sourceRegion && sourceProvince
                ? "Mapped"
                : "Review"
    };
}

/* ======================================================
   READ UNIQUE READY IMPORTS
====================================================== */

function getReadyImports(
    databaseFile
) {

    const database =
        readJson(databaseFile);

    const imports =
        Array.isArray(database.imports)
            ? database.imports
            : [];

    const ready =
        imports.filter(
            item =>
                item.status === "Ready" &&
                item.storedFileName
        );

    /*
      Prevent duplicate database records from causing
      the same physical file to be processed twice.
    */

    const unique = [];
    const seen = new Set();

    for (const item of ready) {

        const key =
            item.storedFileName ||
            item.fileName;

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        unique.push(item);
    }

    return unique;
}

/* ======================================================
   READ ALL SOURCE ROWS
====================================================== */

function readSourceRows(
    imports,
    uploadDir
) {

    const rows = [];
    const columns = new Set();

    const missingFiles = [];
    const invalidFiles = [];

    for (const item of imports) {

        const filePath =
            path.join(
                uploadDir,
                item.storedFileName
            );

        if (!fs.existsSync(filePath)) {

            missingFiles.push({
                fileName: item.fileName,
                storedFileName: item.storedFileName
            });

            continue;
        }

        try {

            const workbook =
                XLSX.readFile(
                    filePath,
                    {
                        cellDates: true
                    }
                );

            if (
                !workbook.SheetNames.includes(
                    "orders"
                )
            ) {

                invalidFiles.push({
                    fileName: item.fileName,
                    reason:
                        'Missing "orders" sheet.'
                });

                continue;
            }

            const worksheet =
                workbook.Sheets.orders;

            const data =
                XLSX.utils.sheet_to_json(
                    worksheet,
                    {
                        defval: null,
                        raw: false
                    }
                );

            for (
                let index = 0;
                index < data.length;
                index++
            ) {

                const row =
                    data[index];

                Object.keys(row).forEach(
                    column =>
                        columns.add(column)
                );

                rows.push({
                    item,
                    row,
                    sourceRow:
                        index + 2
                });
            }

        } catch (error) {

            invalidFiles.push({
                fileName: item.fileName,
                reason: error.message
            });
        }
    }

    return {
        rows,
        columns: [...columns].sort(),
        missingFiles,
        invalidFiles
    };
}

/* ======================================================
   SERVICE
====================================================== */

export function createPreparationService({
    uploadDir,
    dataDir,
    databaseFile
}) {

    const preparedFile =
        path.join(
            dataDir,
            PREPARED_FILE
        );

    const stateFile =
        path.join(
            dataDir,
            STATE_FILE
        );

    const overridesFile =
        path.join(
            dataDir,
            OVERRIDES_FILE
        );

    let cachedBuild = null;

    /* ==================================================
       BUILD PREPARATION DATA
    ================================================== */

    function build() {

        if (cachedBuild) {
            return cachedBuild;
        }

        const ready =
            getReadyImports(
                databaseFile
            );

        if (!ready.length) {

            throw new Error(
                "No ready imported datasets are available for preparation."
            );
        }

        const source =
            readSourceRows(
                ready,
                uploadDir
            );

        const rows =
            source.rows;

        if (!rows.length) {

            if (
                source.missingFiles.length > 0
            ) {

                throw new Error(
                    `${source.missingFiles.length} imported file(s) are missing from server/data/uploads. Re-import the Excel files through Data Management.`
                );
            }

            throw new Error(
                "No transaction rows were found in the imported datasets."
            );
        }

        /* ----------------------------------------------
           Required-column validation
        ---------------------------------------------- */

        const missingColumns =
            REQUIRED_COLUMNS.filter(
                column =>
                    !source.columns.includes(
                        column
                    )
            );

        if (
            missingColumns.length > 0
        ) {

            throw new Error(
                `Required columns are missing: ${missingColumns.join(", ")}`
            );
        }

        const overrides =
            readJson(
                overridesFile
            );

        /* ----------------------------------------------
           Containers
        ---------------------------------------------- */

        const rowHashes =
            new Set();

        const duplicateRecords = [];

        const products =
            new Map();

        const geography =
            new Map();

        const statusOrders =
            new Map();

        const returnOrders =
            new Map();

        const uniqueOrders =
            new Set();

        const uniqueStatuses =
            new Set();

        const master =
            [];

        /* ----------------------------------------------
           Quality counters
        ---------------------------------------------- */

        let duplicateCount = 0;

        let invalidDateRecords = 0;

        let invalidQuantityRecords = 0;

        let invalidReturnQuantityRecords = 0;

        let excessiveReturnQuantityRecords = 0;

        let missingProductRecords = 0;

        let missingRegionRecords = 0;

        let missingProvinceRecords = 0;

        /* ----------------------------------------------
           Exact duplicate hash

           IMPORTANT:
           Order ID is NOT used by itself.

           The entire row is hashed.
        ---------------------------------------------- */

        function rowHash(row) {

            return JSON.stringify(
                source.columns.map(
                    column =>
                        row[column] ?? null
                )
            );
        }

        /* ----------------------------------------------
           PROCESS ROWS
        ---------------------------------------------- */

        rows.forEach(
            (sourceRecord, index) => {

                const row =
                    sourceRecord.row;

                const orderId =
                    clean(
                        row["Order ID"]
                    );

                const status =
                    clean(
                        row["Order Status"]
                    );

                const rawProductName =
                    clean(
                        row["Product Name"]
                    );

                const rawProvince =
                    clean(
                        row["Province"]
                    );

                const rawCity =
                    clean(
                        row["City"]
                    );

                const returnedStatus =
                    clean(
                        row["Return / Refund Status"]
                    );

                const quantity =
                    number(
                        row["Quantity"]
                    );

                const returnedQuantity =
                    number(
                        row["Returned quantity"]
                    );

                /* --------------------------------------
                   Unique order/status examination
                -------------------------------------- */

                if (orderId) {
                    uniqueOrders.add(orderId);
                }

                if (status) {
                    uniqueStatuses.add(status);
                }

                if (orderId) {

                    if (
                        !statusOrders.has(
                            orderId
                        )
                    ) {

                        statusOrders.set(
                            orderId,
                            new Set()
                        );
                    }

                    if (status) {

                        statusOrders
                            .get(orderId)
                            .add(status);
                    }
                }

                /* --------------------------------------
                   Date examination
                -------------------------------------- */

                const time =
                    dateFields(
                        row[
                            "Order Creation Date"
                        ]
                    );

                if (
                    !time.orderCreationDate
                ) {

                    invalidDateRecords++;
                }

                /* --------------------------------------
                   Numeric examination
                -------------------------------------- */

                if (
                    quantity === null ||
                    quantity < 0
                ) {

                    invalidQuantityRecords++;
                }

                if (
                    returnedQuantity !== null &&
                    returnedQuantity < 0
                ) {

                    invalidReturnQuantityRecords++;
                }

                if (
                    quantity !== null &&
                    returnedQuantity !== null &&
                    returnedQuantity >
                        quantity
                ) {

                    excessiveReturnQuantityRecords++;
                }

                /* --------------------------------------
                   Product mapping
                -------------------------------------- */

                let product =
                    overrides[
                        rawProductName
                    ];

                if (!product) {

                    product =
                        classifyProduct(
                            rawProductName
                        );
                }

                if (!rawProductName) {
                    missingProductRecords++;
                }

                const productKey =
                    rawProductName ||
                    "__EMPTY_PRODUCT__";

                products.set(
                    productKey,
                    {
                        rawProductName:
                            rawProductName ||
                            "Other / Unclassified",

                        category:
                            product.category,

                        subcategory:
                            product.subcategory,

                        status:
                            product.status
                    }
                );

                /* --------------------------------------
                   Geography mapping
                -------------------------------------- */

                const geo =
                    standardizeGeography(
                        rawProvince,
                        rawCity
                    );

                if (!rawProvince) {
                    missingRegionRecords++;
                }

                if (!rawCity) {
                    missingProvinceRecords++;
                }

                const geographyKey =
                    `${rawProvince}|||${rawCity}`;

                geography.set(
                    geographyKey,
                    {
                        rawProvince,
                        rawCity,
                        region: geo.region,
                        province: geo.province,
                        status: geo.status
                    }
                );

                /* --------------------------------------
                   Returns/refunds
                -------------------------------------- */

                if (
                    orderId &&
                    (
                        returnedStatus ||
                        (
                            returnedQuantity !== null &&
                            returnedQuantity > 0
                        )
                    )
                ) {

                    if (
                        !returnOrders.has(
                            orderId
                        )
                    ) {

                        returnOrders.set(
                            orderId,
                            {
                                statuses:
                                    new Set(),

                                products:
                                    new Set(),

                                returnedQuantity:
                                    0
                            }
                        );
                    }

                    const returnInfo =
                        returnOrders.get(
                            orderId
                        );

                    if (returnedStatus) {

                        returnInfo.statuses.add(
                            returnedStatus
                        );
                    }

                    if (rawProductName) {

                        returnInfo.products.add(
                            rawProductName
                        );
                    }

                    if (
                        returnedQuantity !== null
                    ) {

                        returnInfo.returnedQuantity +=
                            returnedQuantity;
                    }
                }

                /* --------------------------------------
                   EXACT DUPLICATE DETECTION
                -------------------------------------- */

                const hash =
                    rowHash(row);

                const isDuplicate =
                    rowHashes.has(hash);

                if (isDuplicate) {

                    duplicateCount++;

                    if (
                        duplicateRecords.length <
                        200
                    ) {

                        duplicateRecords.push({
                            sourceFile:
                                sourceRecord.item.fileName,

                            sourceRow:
                                sourceRecord.sourceRow,

                            orderId,

                            productName:
                                rawProductName,

                            date:
                                clean(
                                    row[
                                        "Order Creation Date"
                                    ]
                                ),

                            quantity:
                                quantity
                        });
                    }

                } else {

                    rowHashes.add(hash);
                }

                /*
                  Do not add exact duplicate rows
                  to the prepared Master Data.
                */

                if (isDuplicate) {
                    return;
                }

                /* --------------------------------------
                   ANALYTICAL INCLUSION RULE
                -------------------------------------- */

                const isCompleted =
                    lower(status) ===
                    "completed";

                const validQuantity =
                    quantity !== null &&
                    quantity >= 0
                        ? quantity
                        : 0;

                const validReturned =
                    returnedQuantity !== null &&
                    returnedQuantity >= 0
                        ? returnedQuantity
                        : 0;

                const netQuantity =
                    Math.max(
                        0,
                        validQuantity -
                            validReturned
                    );

                /* --------------------------------------
                   Financial handling

                   Total Buyer Payment is treated as
                   the transaction-line revenue field.

                   Repeated order-level totals are NOT
                   used here.
                -------------------------------------- */

                const lineRevenue =
                    number(
                        row[
                            "Total Buyer Payment"
                        ]
                    ) ?? 0;

                const totalDiscount =
                    number(
                        row[
                            "Total Discount(PHP)"
                        ]
                    ) ?? 0;

                const sellerDiscount =
                    number(
                        row[
                            "Price Discount(from Seller)(PHP)"
                        ]
                    ) ?? 0;

                const shopeeRebate =
                    number(
                        row[
                            "Shopee Rebate(PHP)"
                        ]
                    ) ?? 0;

                const serviceFee =
                    number(
                        row[
                            "Service Fee"
                        ]
                    ) ?? 0;

                const paidTime =
                    parseDate(
                        row[
                            "Order Paid Time"
                        ]
                    );

                const shipTime =
                    parseDate(
                        row[
                            "Ship Time"
                        ]
                    );

                const completeTime =
                    parseDate(
                        row[
                            "Order Complete Time"
                        ]
                    );

                master.push({

                    etl_run_id: null,

                    source_file_name:
                        sourceRecord.item.fileName,

                    source_row_number:
                        sourceRecord.sourceRow,

                    order_id:
                        orderId,

                    order_status:
                        status || null,

                    return_refund_status:
                        returnedStatus ||
                        null,

                    /* TIME */

                    order_creation_date:
                        time.orderCreationDate,

                    order_paid_time:
                        paidTime
                            ? paidTime.toISOString()
                            : null,

                    ship_time:
                        shipTime
                            ? shipTime.toISOString()
                            : null,

                    order_complete_time:
                        completeTime
                            ? completeTime.toISOString()
                            : null,

                    year:
                        time.year,

                    month:
                        time.month,

                    month_name:
                        time.monthName,

                    month_number:
                        time.monthNumber,

                    year_month:
                        time.yearMonth,

                    quarter:
                        time.quarter,

                    /* GEOGRAPHY */

                    raw_province:
                        rawProvince || null,

                    raw_city:
                        rawCity || null,

                    region:
                        geo.region,

                    province:
                        geo.province,

                    /* PRODUCT */

                    raw_product_name:
                        rawProductName ||
                        "Other / Unclassified",

                    category:
                        product.category,

                    subcategory:
                        product.subcategory,

                    /* QUANTITY */

                    quantity:
                        validQuantity,

                    returned_quantity:
                        returnedQuantity,

                    net_quantity:
                        netQuantity,

                    /* FINANCIAL */

                    line_revenue:
                        lineRevenue,

                    total_discount:
                        totalDiscount,

                    seller_price_discount:
                        sellerDiscount,

                    shopee_rebate:
                        shopeeRebate,

                    service_fee:
                        serviceFee,

                    /* FLAGS */

                    is_exact_duplicate:
                        false,

                    is_included_in_analysis:
                        isCompleted,

                    exclusion_reason:
                        isCompleted
                            ? null
                            : "Non-Completed order status"
                });
            }
        );

        /* ==================================================
           STATUS REVIEW
        ================================================== */

        const nonCompletedOrders =
            [];

        for (
            const [
                orderId,
                statuses
            ]
            of statusOrders.entries()
        ) {

            const statusList =
                [...statuses];

            const completedOnly =
                statusList.length === 1 &&
                lower(
                    statusList[0]
                ) === "completed";

            if (!completedOnly) {

                nonCompletedOrders.push({
                    orderId,
                    statuses:
                        statusList
                });
            }
        }

        /* ==================================================
           DATE COVERAGE
        ================================================== */

        const validDates =
            rows
                .map(
                    item =>
                        dateFields(
                            item.row[
                                "Order Creation Date"
                            ]
                        ).orderCreationDate
                )
                .filter(Boolean)
                .sort();

        const minDate =
            validDates[0] || null;

        const maxDate =
            validDates[
                validDates.length - 1
            ] || null;

        /* ==================================================
           RETURN REVIEW
        ================================================== */

        const returnReview =
            [...returnOrders.entries()]
                .slice(0, 200)
                .map(
                    ([
                        orderId,
                        info
                    ]) => ({
                        orderId,

                        returnStatuses:
                            [
                                ...info.statuses
                            ],

                        products:
                            [
                                ...info.products
                            ].slice(0, 10),

                        returnedQuantity:
                            info.returnedQuantity
                    })
                );

        /* ==================================================
           QUALITY
        ================================================== */

        const quality = {

            duplicateRows:
                duplicateCount,

            nonCompletedOrders:
                nonCompletedOrders.length,

            returnRefundOrders:
                returnOrders.size,

            invalidDateRecords,

            invalidQuantityRecords,

            invalidReturnQuantityRecords,

            excessiveReturnQuantityRecords,

            missingProductRecords,

            missingRegionRecords,

            missingProvinceRecords,

            uniqueStatuses:
                [...uniqueStatuses],

            missingFiles:
                source.missingFiles,

            invalidFiles:
                source.invalidFiles
        };

        /* ==================================================
           VALIDATION

           Duplicate handling is considered a valid ETL
           operation because duplicate rows are excluded
           from the Master Data.

           The FRONTEND still requires the user to review
           them before proceeding.
        ================================================== */

        const validation = {

            geographicMappingPrepared:
                geography.size > 0 &&
                missingRegionRecords === 0 &&
                missingProvinceRecords === 0,

            productClassificationPrepared:
                products.size > 0,

            duplicateHandlingPrepared:
                duplicateCount >= 0,

            timeFieldsGenerated:
                master.length > 0 &&
                master.every(
                    row =>
                        row.year_month &&
                        row.quarter
                ),

            analyticalMeasuresPrepared:
                master.length > 0
        };

        /* ==================================================
           SOURCE PROFILE
        ================================================== */

        const state = {

            generatedAt:
                new Date().toISOString(),

            source: {

                filesImported:
                    ready.length,

                transactionLines:
                    rows.length,

                uniqueOrders:
                    uniqueOrders.size,

                uniqueProducts:
                    products.size,

                dateCoverage: {

                    min:
                        minDate,

                    max:
                        maxDate
                }
            },

            quality,

            validation,

            readyForAnalysis:
                false
        };

        cachedBuild = {

            master,

            state,

            products:
                [...products.values()],

            geography:
                [...geography.values()],

            duplicateRecords,

            statusReview:
                nonCompletedOrders
                    .slice(0, 200),

            returnReview,

            quality,

            taxonomy: TAXONOMY,

            timeFields: [

                {
                    field: "Year",
                    source: "Order Creation Date",
                    example: "2025"
                },

                {
                    field: "Month",
                    source: "Order Creation Date",
                    example: "November"
                },

                {
                    field: "Month Number",
                    source: "Order Creation Date",
                    example: "11"
                },

                {
                    field: "Year-Month",
                    source: "Order Creation Date",
                    example: "2025-11"
                },

                {
                    field: "Quarter",
                    source: "Order Creation Date",
                    example: "Q4"
                }
            ]
        };

        return cachedBuild;
    }

    /* ==================================================
       PUBLIC FUNCTIONS
    ================================================== */

    function profile() {

        const result =
            build();

        return {
            source:
                result.state.source,

            quality:
                result.quality
        };
    }

    function duplicates() {

        const result =
            build();

        return {

            total:
                result.quality.duplicateRows,

            records:
                result.duplicateRecords
        };
    }

    function statuses() {

        const result =
            build();

        return {

            totalOrders:
                result.quality.nonCompletedOrders,

            records:
                result.statusReview
        };
    }

    function returns() {

        const result =
            build();

        return {

            totalOrders:
                result.quality.returnRefundOrders,

            records:
                result.returnReview
        };
    }

    function geography() {

        const result =
            build();

        return {

            total:
                result.geography.length,

            records:
                result.geography
        };
    }

    function products(search = "") {

        const result =
            build();

        const query =
            lower(search);

        const records =
            result.products.filter(
                item =>
                    !query ||
                    lower(
                        item.rawProductName
                    ).includes(query)
            );

        return {

            records,

            total:
                records.length,

            taxonomy:
                result.taxonomy
        };
    }

    function saveProductMapping({
        rawProductName,
        category,
        subcategory
    }) {

        if (!rawProductName) {

            throw new Error(
                "Raw Product Name is required."
            );
        }

        if (
            !TAXONOMY[category]
        ) {

            throw new Error(
                "Invalid product category."
            );
        }

        if (
            !TAXONOMY[category].includes(
                subcategory
            )
        ) {

            throw new Error(
                "Invalid subcategory for the selected category."
            );
        }

        const overrides =
            readJson(
                overridesFile
            );

        overrides[
            rawProductName
        ] = {

            category,

            subcategory,

            status:
                category ===
                "Other / Unclassified"
                    ? "Review"
                    : "Mapped"
        };

        writeJson(
            overridesFile,
            overrides
        );

        cachedBuild = null;

        return overrides[
            rawProductName
        ];
    }

    function getTimeFields() {

        return build().timeFields;
    }

    function run() {

        cachedBuild = null;

        const result =
            build();

        const runId =
            `${Date.now()}-prep`;

        result.master.forEach(
            row => {
                row.etl_run_id =
                    runId;
            }
        );

        writeJson(
            preparedFile,
            result.master
        );

        /*
          At this stage duplicate handling has been
          performed automatically, but the frontend still
          requires the user to open Review before proceeding.
        */

        result.state.runId =
            runId;

        result.state.prepared =
            true;

        result.state.readyForAnalysis =
            false;

        result.state.validation =
            {
                ...result.state.validation,

                duplicateHandlingPrepared:
                    true
            };

        writeJson(
            stateFile,
            result.state
        );

        return result.state;
    }

    function currentStatus() {

        const state =
            fs.existsSync(stateFile)
                ? readJson(stateFile)
                : {
                    prepared: false,
                    readyForAnalysis: false
                };

        return {

            prepared:
                fs.existsSync(
                    preparedFile
                ),

            ...state
        };
    }

    function masterSummary() {

        if (
            !fs.existsSync(
                preparedFile
            )
        ) {

            return {
                prepared: false
            };
        }

        const rows =
            readJson(
                preparedFile
            );

        return {

            prepared: true,

            records:
                Array.isArray(rows)
                    ? rows.length
                    : 0,

            includedRecords:
                Array.isArray(rows)
                    ? rows.filter(
                        row =>
                            row.is_included_in_analysis
                    ).length
                    : 0,

            excludedRecords:
                Array.isArray(rows)
                    ? rows.filter(
                        row =>
                            !row.is_included_in_analysis
                    ).length
                    : 0,

            generatedAt:
                fs.statSync(
                    preparedFile
                ).mtime.toISOString()
        };
    }

    function clearCache() {

        cachedBuild = null;
    }

    return {

        profile,

        duplicates,

        statuses,

        returns,

        geography,

        products,

        saveProductMapping,

        timeFields:
            getTimeFields,

        run,

        status:
            currentStatus,

        masterSummary,

        clearCache
    };
}