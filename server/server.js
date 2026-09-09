import express from "express";
import cors from "cors";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPreparationService } from "./preparation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4000;

// --------------------------------------------------
// DIRECTORIES
// --------------------------------------------------

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DATABASE_FILE = path.join(DATA_DIR, "database.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const preparation = createPreparationService({
    uploadDir: UPLOAD_DIR,
    dataDir: DATA_DIR,
    databaseFile: DATABASE_FILE
});

if (!fs.existsSync(DATABASE_FILE)) {
    fs.writeFileSync(
        DATABASE_FILE,
        JSON.stringify({ imports: [] }, null, 2)
    );
}

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(cors());
app.use(express.json());

const upload = multer({
    dest: UPLOAD_DIR,
    limits: {
        fileSize: 50 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const allowed = [
            ".xlsx",
            ".xls"
        ];

        const ext = path.extname(file.originalname).toLowerCase();

        if (!allowed.includes(ext)) {
            return cb(
                new Error("Only .xlsx and .xls files are allowed.")
            );
        }

        cb(null, true);
    }
});

// --------------------------------------------------
// DATABASE HELPERS
// --------------------------------------------------

function readDatabase() {
    return JSON.parse(
        fs.readFileSync(DATABASE_FILE, "utf8")
    );
}

function writeDatabase(data) {
    fs.writeFileSync(
        DATABASE_FILE,
        JSON.stringify(data, null, 2)
    );
}

// --------------------------------------------------
// REQUIRED SHOPEE COLUMNS
// --------------------------------------------------

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

// --------------------------------------------------
// DATE PARSER
// --------------------------------------------------

function parseDate(value) {
    if (!value) return null;

    if (value instanceof Date && !isNaN(value)) {
        return value;
    }

    const date = new Date(value);

    if (!isNaN(date)) {
        return date;
    }

    return null;
}

// --------------------------------------------------
// FILE ANALYSIS
// --------------------------------------------------

function analyzeWorkbook(filePath) {

    const workbook = XLSX.readFile(filePath, {
        cellDates: true
    });

    if (!workbook.SheetNames.includes("orders")) {
        throw new Error(
            'The workbook does not contain an "orders" sheet.'
        );
    }

    const worksheet = workbook.Sheets["orders"];

    const rows = XLSX.utils.sheet_to_json(
        worksheet,
        {
            defval: null,
            raw: false
        }
    );

    // Empty workbook
    if (rows.length === 0) {
        return {
            valid: true,
            empty: true,
            records: 0,
            columns: [],
            uniqueOrders: 0,
            uniqueProducts: 0,
            uniqueProvinces: 0,
            duplicateRows: 0,
            minDate: null,
            maxDate: null
        };
    }

    const columns = Object.keys(rows[0]);

    // --------------------------------------------------
    // COLUMN VALIDATION
    // --------------------------------------------------

    const missingColumns = REQUIRED_COLUMNS.filter(
        column => !columns.includes(column)
    );

    if (missingColumns.length > 0) {
        throw new Error(
            `Missing required columns: ${missingColumns.join(", ")}`
        );
    }

    // --------------------------------------------------
    // UNIQUE ORDERS
    // --------------------------------------------------

    const orders = new Set();

    rows.forEach(row => {
        if (row["Order ID"]) {
            orders.add(String(row["Order ID"]));
        }
    });

    // --------------------------------------------------
    // UNIQUE PRODUCTS
    // --------------------------------------------------

    const products = new Set();

    rows.forEach(row => {
        if (row["Product Name"]) {
            products.add(String(row["Product Name"]).trim());
        }
    });

    // --------------------------------------------------
    // UNIQUE PROVINCES
    // --------------------------------------------------

    const provinces = new Set();

    rows.forEach(row => {
        if (row["City"]) {
            provinces.add(String(row["City"]).trim());
        }
    });

    // --------------------------------------------------
    // DUPLICATE ROW DETECTION
    // --------------------------------------------------

    const rowHashes = new Set();
    let duplicateRows = 0;

    rows.forEach(row => {

        const rowString = JSON.stringify(row);

        if (rowHashes.has(rowString)) {
            duplicateRows++;
        } else {
            rowHashes.add(rowString);
        }

    });

    // --------------------------------------------------
    // DATE RANGE
    // --------------------------------------------------

    const dates = [];

    rows.forEach(row => {

        const date = parseDate(
            row["Order Creation Date"]
        );

        if (date) {
            dates.push(date);
        }

    });

    dates.sort((a, b) => a - b);

    const minDate =
        dates.length > 0
            ? dates[0].toISOString()
            : null;

    const maxDate =
        dates.length > 0
            ? dates[dates.length - 1].toISOString()
            : null;

    return {
        valid: true,
        empty: false,
        records: rows.length,
        columns,
        uniqueOrders: orders.size,
        uniqueProducts: products.size,
        uniqueProvinces: provinces.size,
        duplicateRows,
        minDate,
        maxDate
    };
}

// --------------------------------------------------
// GET IMPORTED DATASETS
// --------------------------------------------------

app.get("/api/datasets", (req, res) => {

    const database = readDatabase();

    res.json(database.imports);

});

// --------------------------------------------------
// GET DATASET SUMMARY
// --------------------------------------------------

app.get("/api/datasets/summary", (req, res) => {

    const database = readDatabase();

    const imports = database.imports;

    const readyImports = imports.filter(
        item => item.status === "Ready"
    );

    const totalRecords = readyImports.reduce(
        (sum, item) => sum + item.records,
        0
    );

    const products = new Set();
    const provinces = new Set();

    readyImports.forEach(item => {

        (item.products || []).forEach(product => {
            products.add(product);
        });

        (item.provinces || []).forEach(province => {
            provinces.add(province);
        });

    });

    res.json({
        filesImported: imports.length,
        totalRecords,
        uniqueProducts: products.size,
        provincesCovered: provinces.size
    });

});

// --------------------------------------------------
// UPLOAD FILES
// --------------------------------------------------

app.post(
    "/api/datasets/import",
    upload.array("files", 100),
    (req, res) => {

        const database = readDatabase();

        const imported = [];

        for (const file of req.files) {

            try {

                const analysis =
                    analyzeWorkbook(file.path);

                const importId =
                    Date.now().toString() +
                    "-" +
                    Math.random()
                        .toString(36)
                        .substring(2, 8);

                const extension =
                    path.extname(file.originalname);

                const finalFileName =
                    `${importId}${extension}`;

                const finalPath =
                    path.join(
                        UPLOAD_DIR,
                        finalFileName
                    );

                fs.renameSync(
                    file.path,
                    finalPath
                );

                const record = {

                    id: importId,

                    fileName:
                        file.originalname,

                    storedFileName:
                        finalFileName,

                    month:
                        getMonthFromDate(
                            analysis.minDate
                        ),

                    year:
                        getYearFromDate(
                            analysis.minDate
                        ),

                    records:
                        analysis.records,

                    fileSize:
                        file.size,

                    importDate:
                        new Date().toISOString(),

                    status:
                        analysis.empty
                            ? "Empty"
                            : "Ready",

                    duplicateRows:
                        analysis.duplicateRows,

                    uniqueOrders:
                        analysis.uniqueOrders,

                    uniqueProducts:
                        analysis.uniqueProducts,

                    uniqueProvinces:
                        analysis.uniqueProvinces,

                    minDate:
                        analysis.minDate,

                    maxDate:
                        analysis.maxDate,

                    columns:
                        analysis.columns

                };

                database.imports.push(record);

                imported.push(record);

            } catch (error) {

                imported.push({

                    fileName:
                        file.originalname,

                    status:
                        "Error",

                    error:
                        error.message

                });

                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }

            }

        }

        writeDatabase(database);

        res.json({
            success: true,
            imported
        });

    }
);

// --------------------------------------------------
// DELETE IMPORT
// --------------------------------------------------

app.delete(
    "/api/datasets/:id",
    (req, res) => {

        const database = readDatabase();

        const index =
            database.imports.findIndex(
                item => item.id === req.params.id
            );

        if (index === -1) {
            return res.status(404).json({
                error: "Dataset not found."
            });
        }

        const dataset =
            database.imports[index];

        const filePath =
            path.join(
                UPLOAD_DIR,
                dataset.storedFileName
            );

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        database.imports.splice(index, 1);

        writeDatabase(database);

        res.json({
            success: true
        });

    }
);

// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------

function getMonthFromDate(dateString) {

    if (!dateString) return "-";

    const date = new Date(dateString);

    if (isNaN(date)) return "-";

    return date.toLocaleString(
        "en-US",
        {
            month: "long"
        }
    );

}

function getYearFromDate(dateString) {

    if (!dateString) return "-";

    const date = new Date(dateString);

    if (isNaN(date)) return "-";

    return date.getFullYear();

}

// ============================================================
// DATA PREPARATION / ETL
// Append this block BEFORE the existing ERROR HANDLER section.
// ============================================================

const PREPARED_FILE = path.join(DATA_DIR, "prepared_master_data.json");
const PREPARATION_STATE_FILE = path.join(DATA_DIR, "preparation_state.json");

const PRODUCT_TAXONOMY = {
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

const PRODUCT_OPTIONS = Object.entries(PRODUCT_TAXONOMY).flatMap(
    ([category, subcategories]) =>
        subcategories.map(subcategory => ({ category, subcategory }))
);

function normalizeText(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function parseNumeric(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    let text = String(value).trim();
    if (!text) return null;

    const negativeByParentheses = /^\(.*\)$/.test(text);

    text = text
        .replace(/PHP/gi, "")
        .replace(/₱/g, "")
        .replace(/,/g, "")
        .replace(/\s/g, "")
        .replace(/[()]/g, "");

    const number = Number(text);
    if (!Number.isFinite(number)) return null;

    return negativeByParentheses ? -number : number;
}

function parseFlexibleDate(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (value instanceof Date && !isNaN(value.getTime())) {
        return value;
    }

    const text = String(value).trim();
    if (!text) return null;

    // ISO-style values.
    const iso = new Date(text);
    if (!isNaN(iso.getTime())) {
        return iso;
    }

    return null;
}

function formatDateOnly(date) {
    if (!date || isNaN(date.getTime())) return null;

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function getTimeFields(dateValue) {
    const date = parseFlexibleDate(dateValue);

    if (!date) {
        return {
            orderCreationDate: null,
            year: null,
            month: null,
            monthNumber: null,
            monthName: null,
            yearMonth: null,
            quarter: null
        };
    }

    const year = date.getFullYear();
    const monthNumber = date.getMonth() + 1;
    const monthName = date.toLocaleString("en-US", { month: "long" });
    const quarter = `Q${Math.ceil(monthNumber / 3)}`;

    return {
        orderCreationDate: formatDateOnly(date),
        year,
        month: monthNumber,
        monthNumber,
        monthName,
        yearMonth: `${year}-${String(monthNumber).padStart(2, "0")}`,
        quarter
    };
}

function normalizeProductText(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function classifyProduct(rawProductName) {
    const text = normalizeProductText(rawProductName);

    if (!text) {
        return {
            category: "Other / Unclassified",
            subcategory: "Other / Unclassified",
            status: "Unmapped"
        };
    }

    // --------------------------------------------------------
    // Shrink Wrap / Cap Seal
    // --------------------------------------------------------
    if (
        /cap\s*seal|pvc\s*seal|bottle\s*seal|shrink\s*cap/.test(text)
    ) {
        return {
            category: "Shrink Wrap / Cap Seal",
            subcategory: /cap\s*seal|pvc\s*seal|bottle\s*seal|shrink\s*cap/.test(text)
                ? "Cap Seal"
                : "Other / Unclassified",
            status: "Mapped"
        };
    }

    if (/shrink\s*(film|wrap)|plastic\s*shrink/.test(text)) {
        return {
            category: "Shrink Wrap / Cap Seal",
            subcategory: "Shrink Film",
            status: "Mapped"
        };
    }

    if (/cling\s*wrap|food\s*wrap|cling\s*film|food\s*film/.test(text)) {
        return {
            category: "Shrink Wrap / Cap Seal",
            subcategory: "Cling Wrap / Food Wrap",
            status: "Mapped"
        };
    }

    if (/shrink\s*sleeve/.test(text)) {
        return {
            category: "Shrink Wrap / Cap Seal",
            subcategory: "Shrink Sleeve",
            status: "Mapped"
        };
    }

    // --------------------------------------------------------
    // Bottle / Container
    // --------------------------------------------------------
    if (/\bjar\b/.test(text)) {
        return {
            category: "Bottle / Container",
            subcategory: "Jar",
            status: "Mapped"
        };
    }

    if (/\bbottle\b/.test(text)) {
        return {
            category: "Bottle / Container",
            subcategory: "Bottle",
            status: "Mapped"
        };
    }

    if (/\bcontainer\b/.test(text)) {
        return {
            category: "Bottle / Container",
            subcategory: "Container",
            status: "Mapped"
        };
    }

    // --------------------------------------------------------
    // Tape / Adhesive
    // --------------------------------------------------------
    if (/double\s*sided|double\s*tape/.test(text)) {
        return {
            category: "Tape / Adhesive",
            subcategory: "Double-Sided Tape",
            status: "Mapped"
        };
    }

    if (/packaging\s*tape|packing\s*tape|carton\s*tape|brown\s*tape/.test(text)) {
        return {
            category: "Tape / Adhesive",
            subcategory: "Packaging Tape",
            status: "Mapped"
        };
    }

    if (/adhesive\s*tape|adhesive|masking\s*tape|foam\s*tape/.test(text)) {
        return {
            category: "Tape / Adhesive",
            subcategory: "Adhesive Tape",
            status: "Mapped"
        };
    }

    // --------------------------------------------------------
    // Label / Sticker
    // --------------------------------------------------------
    if (/\bsticker\b/.test(text)) {
        return {
            category: "Label / Sticker",
            subcategory: "Sticker",
            status: "Mapped"
        };
    }

    if (/\blabel\b/.test(text)) {
        return {
            category: "Label / Sticker",
            subcategory: "Label",
            status: "Mapped"
        };
    }

    // --------------------------------------------------------
    // Mailer / Shipping Packaging
    // --------------------------------------------------------
    if (/poly\s*mailer|mailer\s*bag|poly\s*bag\s*mailer/.test(text)) {
        return {
            category: "Mailer / Shipping Packaging",
            subcategory: "Poly Mailer",
            status: "Mapped"
        };
    }

    if (/courier\s*bag|courier\s*poly/.test(text)) {
        return {
            category: "Mailer / Shipping Packaging",
            subcategory: "Courier Bag",
            status: "Mapped"
        };
    }

    if (/shipping\s*bag|shipping\s*mail/.test(text)) {
        return {
            category: "Mailer / Shipping Packaging",
            subcategory: "Shipping Bag",
            status: "Mapped"
        };
    }

    // --------------------------------------------------------
    // Protective Packaging
    // --------------------------------------------------------
    if (/bubble\s*wrap|bubble\s*film|air\s*bubble/.test(text)) {
        return {
            category: "Protective Packaging",
            subcategory: "Bubble Wrap",
            status: "Mapped"
        };
    }

    if (/protective\s*film|protection\s*film|surface\s*film/.test(text)) {
        return {
            category: "Protective Packaging",
            subcategory: "Protective Film",
            status: "Mapped"
        };
    }

    // --------------------------------------------------------
    // Plastic Bags
    // --------------------------------------------------------
    if (/sando\s*bag/.test(text)) {
        return {
            category: "Plastic Bags",
            subcategory: "Sando Bag",
            status: "Mapped"
        };
    }

    if (/labo\s*bag/.test(text)) {
        return {
            category: "Plastic Bags",
            subcategory: "Labo Bag",
            status: "Mapped"
        };
    }

    if (/trash\s*bag|garbage\s*bag|basura\s*bag/.test(text)) {
        return {
            category: "Plastic Bags",
            subcategory: "Trash / Garbage Bag",
            status: "Mapped"
        };
    }

    if (/ice\s*bag/.test(text)) {
        return {
            category: "Plastic Bags",
            subcategory: "Ice Bag",
            status: "Mapped"
        };
    }

    if (/sandwich\s*bag|sandwich\s*plastic/.test(text)) {
        return {
            category: "Plastic Bags",
            subcategory: "Sandwich Bag",
            status: "Mapped"
        };
    }

    if (/counter\s*bag/.test(text)) {
        return {
            category: "Plastic Bags",
            subcategory: "Counter Bag",
            status: "Mapped"
        };
    }

    if (/printed\s*(plastic\s*)?bag|custom\s*printed\s*bag/.test(text)) {
        return {
            category: "Plastic Bags",
            subcategory: "Printed Plastic Bag",
            status: "Mapped"
        };
    }

    // --------------------------------------------------------
    // Packaging Accessories
    // --------------------------------------------------------
    if (/rubber\s*band|elastic\s*band/.test(text)) {
        return {
            category: "Packaging Accessories",
            subcategory: "Rubber Band",
            status: "Mapped"
        };
    }

    if (/\bgloves?\b|hand\s*glove/.test(text)) {
        return {
            category: "Packaging Accessories",
            subcategory: "Gloves",
            status: "Mapped"
        };
    }

    if (/silica\s*gel|desiccant|moisture\s*absorber/.test(text)) {
        return {
            category: "Packaging Accessories",
            subcategory: "Silica Gel / Desiccant",
            status: "Mapped"
        };
    }

    if (/cutter|cutting\s*tool|utility\s*knife|box\s*cutter/.test(text)) {
        return {
            category: "Packaging Accessories",
            subcategory: "Cutter / Cutting Tool",
            status: "Mapped"
        };
    }

    if (/packaging\s*tool|packing\s*tool|heat\s*gun/.test(text)) {
        return {
            category: "Packaging Accessories",
            subcategory: "Packaging Tool",
            status: "Mapped"
        };
    }

    // --------------------------------------------------------
    // Packaging / General Supplies
    // --------------------------------------------------------
    if (/tissue|kitchen\s*towel|cleaning\s*material|cleaning\s*cloth/.test(text)) {
        return {
            category: "Packaging / General Supplies",
            subcategory: "Tissue / Cleaning Material",
            status: "Mapped"
        };
    }

    if (/\brags?\b|rag\s*cloth|wiping\s*cloth/.test(text)) {
        return {
            category: "Packaging / General Supplies",
            subcategory: "Rags / Cloth",
            status: "Mapped"
        };
    }

    if (/toothpick/.test(text)) {
        return {
            category: "Packaging / General Supplies",
            subcategory: "Toothpick",
            status: "Mapped"
        };
    }

    if (/naphthalene|moth\s*ball/.test(text)) {
        return {
            category: "Packaging / General Supplies",
            subcategory: "Naphthalene / Moth Balls",
            status: "Mapped"
        };
    }

    if (/money\s*envelope|cash\s*envelope|ang\s*pao/.test(text)) {
        return {
            category: "Packaging / General Supplies",
            subcategory: "Money Envelope",
            status: "Mapped"
        };
    }

    return {
        category: "Other / Unclassified",
        subcategory: "Other / Unclassified",
        status: "Review"
    };
}


const PRODUCT_OVERRIDES_FILE = path.join(
    DATA_DIR,
    "product_mapping_overrides.json"
);

function readProductOverrides() {
    if (!fs.existsSync(PRODUCT_OVERRIDES_FILE)) return {};

    try {
        return JSON.parse(
            fs.readFileSync(PRODUCT_OVERRIDES_FILE, "utf8")
        );
    } catch {
        return {};
    }
}

function writeProductOverrides(overrides) {
    fs.writeFileSync(
        PRODUCT_OVERRIDES_FILE,
        JSON.stringify(overrides, null, 2)
    );
}

function applyProductOverride(rawProductName, classification) {
    const overrides = readProductOverrides();
    const override = overrides[rawProductName];

    if (!override) return classification;

    return {
        category: override.category,
        subcategory: override.subcategory,
        status: override.status || "Mapped"
    };
}

function getGeographicMapping(rawProvince, rawCity) {
    const sourceProvince = normalizeText(rawProvince);
    const sourceCity = normalizeText(rawCity);

    let region = sourceProvince || "Unclassified";
    let province = sourceCity || "Unclassified";
    let status = "Mapped";

    // Known source inconsistency identified during dataset review.
    if (province.toLowerCase() === "aurora") {
        region = "North Luzon";
    }

    if (!sourceProvince || !sourceCity) {
        status = "Review";
    }

    return {
        region,
        province,
        status
    };
}

function rowHash(row, columns) {
    return JSON.stringify(
        columns.map(column => row[column] ?? null)
    );
}

function getReadyImportedFiles() {
    const database = readDatabase();

    return database.imports.filter(
        item => item.status === "Ready" && item.storedFileName
    );
}

function readImportedRows(imports) {
    const allRows = [];
    const columnSet = new Set();

    for (const dataset of imports) {
        const filePath = path.join(UPLOAD_DIR, dataset.storedFileName);

        if (!fs.existsSync(filePath)) continue;

        const workbook = XLSX.readFile(filePath, {
            cellDates: true
        });

        if (!workbook.SheetNames.includes("orders")) continue;

        const worksheet = workbook.Sheets["orders"];

        const rows = XLSX.utils.sheet_to_json(
            worksheet,
            {
                defval: null,
                raw: false
            }
        );

        rows.forEach((row, index) => {
            Object.keys(row).forEach(column => columnSet.add(column));

            allRows.push({
                dataset,
                sourceRowNumber: index + 2,
                row
            });
        });
    }

    return {
        rows: allRows,
        columns: Array.from(columnSet).sort()
    };
}

function buildPreparation() {
    const imports = getReadyImportedFiles();

    if (imports.length === 0) {
        throw new Error("No ready imported datasets are available for preparation.");
    }

    const { rows: sourceRows, columns } = readImportedRows(imports);

    const duplicateHashes = new Set();
    const duplicateIndices = new Set();
    const duplicateSamples = [];

    sourceRows.forEach((item, index) => {
        const hash = rowHash(item.row, columns);

        if (duplicateHashes.has(hash)) {
            duplicateIndices.add(index);
            if (duplicateSamples.length < 50) {
                duplicateSamples.push({
                    row: item.sourceRowNumber,
                    orderId: normalizeText(item.row["Order ID"]),
                    productName: normalizeText(item.row["Product Name"]),
                    date: normalizeText(item.row["Order Creation Date"]),
                    quantity: parseNumeric(item.row["Quantity"])
                });
            }
        } else {
            duplicateHashes.add(hash);
        }
    });

    const masterRows = [];

    const statusOrders = new Map();
    const returnOrders = new Map();
    const productMap = new Map();
    const geographyMap = new Map();

    let invalidDateRecords = 0;
    let invalidQuantityRecords = 0;
    let invalidReturnQuantityRecords = 0;
    let excessiveReturnQuantityRecords = 0;
    let missingProductRecords = 0;
    let missingGeographyRecords = 0;

    sourceRows.forEach((item, index) => {
        const row = item.row;
        const duplicate = duplicateIndices.has(index);

        const orderId = normalizeText(row["Order ID"]);
        const status = normalizeText(row["Order Status"]);
        const returnStatus = normalizeText(row["Return / Refund Status"]);
        const rawProductName = normalizeText(row["Product Name"]);

        const time = getTimeFields(row["Order Creation Date"]);
        const quantity = parseNumeric(row["Quantity"]);
        const returnedRaw = parseNumeric(row["Returned quantity"]);

        if (!time.orderCreationDate) invalidDateRecords++;
        if (quantity === null || quantity < 0) invalidQuantityRecords++;
        if (returnedRaw !== null && returnedRaw < 0) invalidReturnQuantityRecords++;
        if (
            quantity !== null &&
            returnedRaw !== null &&
            returnedRaw > quantity
        ) {
            excessiveReturnQuantityRecords++;
        }

        const product = applyProductOverride(
            rawProductName,
            classifyProduct(rawProductName)
        );
        const geo = getGeographicMapping(
            row["Province"],
            row["City"]
        );

        if (!rawProductName) missingProductRecords++;
        if (geo.region === "Unclassified" || geo.province === "Unclassified") {
            missingGeographyRecords++;
        }

        const productKey = rawProductName || "__EMPTY_PRODUCT__";
        if (!productMap.has(productKey)) {
            productMap.set(productKey, {
                rawProductName,
                category: product.category,
                subcategory: product.subcategory,
                status: product.status
            });
        }

        const rawProvince = normalizeText(row["Province"]);
        const rawCity = normalizeText(row["City"]);
        const geoKey = `${rawProvince}|||${rawCity}`;
        if (!geographyMap.has(geoKey)) {
            geographyMap.set(geoKey, {
                rawProvince,
                rawCity,
                region: geo.region,
                province: geo.province,
                status: geo.status
            });
        }

        if (orderId) {
            if (!statusOrders.has(orderId)) {
                statusOrders.set(orderId, {
                    orderId,
                    statuses: new Set(),
                    products: new Set(),
                    dates: new Set()
                });
            }

            const statusInfo = statusOrders.get(orderId);
            if (status) statusInfo.statuses.add(status);
            if (rawProductName) statusInfo.products.add(rawProductName);
            if (time.orderCreationDate) statusInfo.dates.add(time.orderCreationDate);

            if (returnStatus || (returnedRaw !== null && returnedRaw > 0)) {
                if (!returnOrders.has(orderId)) {
                    returnOrders.set(orderId, {
                        orderId,
                        returnStatuses: new Set(),
                        products: new Set(),
                        returnedQuantity: 0
                    });
                }

                const returnInfo = returnOrders.get(orderId);
                if (returnStatus) returnInfo.returnStatuses.add(returnStatus);
                if (rawProductName) returnInfo.products.add(rawProductName);
                if (returnedRaw !== null) {
                    returnInfo.returnedQuantity += returnedRaw;
                }
            }
        }

        // Duplicate rows are removed from the prepared master dataset.
        if (duplicate) return;

        // Core analysis rule: Completed orders only.
        const included = status.toLowerCase() === "completed";

        const safeQuantity = quantity !== null && quantity >= 0
            ? quantity
            : 0;

        const safeReturned = returnedRaw !== null && returnedRaw >= 0
            ? returnedRaw
            : 0;

        const netQuantity = Math.max(
            0,
            safeQuantity - safeReturned
        );

        const lineRevenue = parseNumeric(
            row["Total Buyer Payment"]
        );

        const masterRow = {
            etl_run_id: null,
            source_file_name: item.dataset.fileName,
            source_row_number: item.sourceRowNumber,

            order_id: orderId,
            order_status: status || null,
            return_refund_status: returnStatus || null,

            order_creation_date: time.orderCreationDate,
            order_paid_time: parseFlexibleDate(row["Order Paid Time"])
                ? parseFlexibleDate(row["Order Paid Time"]).toISOString()
                : null,
            ship_time: parseFlexibleDate(row["Ship Time"])
                ? parseFlexibleDate(row["Ship Time"]).toISOString()
                : null,
            order_complete_time: parseFlexibleDate(row["Order Complete Time"])
                ? parseFlexibleDate(row["Order Complete Time"]).toISOString()
                : null,

            year: time.year,
            month: time.month,
            month_name: time.monthName,
            month_number: time.monthNumber,
            year_month: time.yearMonth,
            quarter: time.quarter,

            raw_province: rawProvince || null,
            raw_city: rawCity || null,
            region: geo.region,
            province: geo.province,

            raw_product_name: rawProductName || "Other / Unclassified",
            category: product.category,
            subcategory: product.subcategory,

            quantity: safeQuantity,
            returned_quantity: returnedRaw,
            net_quantity: netQuantity,

            line_revenue: lineRevenue ?? 0,
            total_discount: parseNumeric(row["Total Discount(PHP)"]) ?? 0,
            seller_price_discount: parseNumeric(row["Price Discount(from Seller)(PHP)"]) ?? 0,
            shopee_rebate: parseNumeric(row["Shopee Rebate(PHP)"]) ?? 0,
            service_fee: parseNumeric(row["Service Fee"]) ?? 0,

            is_exact_duplicate: false,
            is_included_in_analysis: included,
            exclusion_reason: included ? null : "Non-Completed order status"
        };

        masterRows.push(masterRow);
    });

    const uniqueOrders = new Set(
        sourceRows
            .map(item => normalizeText(item.row["Order ID"]))
            .filter(Boolean)
    );

    const completedOrders = new Set();
    const nonCompletedOrders = new Set();

    statusOrders.forEach(info => {
        const statuses = Array.from(info.statuses);
        if (statuses.length === 1 && statuses[0].toLowerCase() === "completed") {
            completedOrders.add(info.orderId);
        } else {
            nonCompletedOrders.add(info.orderId);
        }
    });

    const statusReview = Array.from(statusOrders.values())
        .filter(info => nonCompletedOrders.has(info.orderId))
        .slice(0, 100)
        .map(info => ({
            orderId: info.orderId,
            statuses: Array.from(info.statuses),
            products: Array.from(info.products).slice(0, 5),
            dates: Array.from(info.dates).slice(0, 5)
        }));

    const returnReview = Array.from(returnOrders.values())
        .slice(0, 100)
        .map(info => ({
            orderId: info.orderId,
            returnStatuses: Array.from(info.returnStatuses),
            products: Array.from(info.products).slice(0, 5),
            returnedQuantity: info.returnedQuantity
        }));

    const dates = masterRows
        .map(row => row.order_creation_date)
        .filter(Boolean)
        .sort();

    const mappedProductCount = Array.from(productMap.values())
        .filter(item => item.status === "Mapped")
        .length;

    const reviewProductCount = Array.from(productMap.values())
        .filter(item => item.status !== "Mapped")
        .length;

    const prepared = {
        generatedAt: new Date().toISOString(),
        source: {
            filesImported: imports.length,
            transactionLines: sourceRows.length,
            uniqueOrders: uniqueOrders.size,
            uniqueProducts: new Set(
                sourceRows
                    .map(item => normalizeText(item.row["Product Name"]))
                    .filter(Boolean)
            ).size,
            dateCoverage: {
                min: dates[0] || null,
                max: dates[dates.length - 1] || null
            }
        },
        quality: {
            duplicateRows: duplicateIndices.size,
            nonCompletedOrders: nonCompletedOrders.size,
            returnRefundOrders: returnOrders.size,
            invalidDateRecords,
            invalidQuantityRecords,
            invalidReturnQuantityRecords,
            excessiveReturnQuantityRecords,
            missingProductRecords,
            missingGeographyRecords
        },
        mappings: {
            products: Array.from(productMap.values()),
            geography: Array.from(geographyMap.values())
        },
        reviews: {
            duplicates: duplicateSamples,
            statuses: statusReview,
            returns: returnReview
        },
        masterData: masterRows
    };

    return prepared;
}

function savePreparationState(prepared) {
    const state = {
        generatedAt: prepared.generatedAt,
        source: prepared.source,
        quality: prepared.quality,
        productMappingCount: prepared.mappings.products.length,
        mappedProductCount: prepared.mappings.products.filter(
            item => item.status === "Mapped"
        ).length,
        reviewProductCount: prepared.mappings.products.filter(
            item => item.status !== "Mapped"
        ).length,
        geographicMappingCount: prepared.mappings.geography.length,
        validation: {
            geographicMappingPrepared:
                prepared.mappings.geography.length > 0 &&
                prepared.quality.missingGeographyRecords === 0,
            productClassificationPrepared:
                prepared.mappings.products.length > 0,
            duplicateHandlingReviewed:
                prepared.quality.duplicateRows >= 0,
            timeFieldsGenerated:
                prepared.masterData.length > 0 &&
                prepared.masterData.every(row => row.year_month),
            analyticalMeasuresPrepared:
                prepared.masterData.length > 0
        }
    };

    state.readyForAnalysis = Object.values(state.validation)
        .every(Boolean);

    fs.writeFileSync(
        PREPARATION_STATE_FILE,
        JSON.stringify(state, null, 2)
    );

    return state;
}

// ------------------------------------------------------------
// PREPARATION STATUS
// ------------------------------------------------------------

app.get("/api/preparation/status", (req, res) => {
    if (!fs.existsSync(PREPARATION_STATE_FILE)) {
        return res.json({
            prepared: false,
            readyForAnalysis: false
        });
    }

    try {
        res.json({
            prepared: true,
            ...JSON.parse(
                fs.readFileSync(PREPARATION_STATE_FILE, "utf8")
            )
        });
    } catch (error) {
        res.status(500).json({
            error: "Unable to read preparation status."
        });
    }
});

// ------------------------------------------------------------
// RUN ETL / FEATURE ENGINEERING
// ------------------------------------------------------------

app.post("/api/preparation/run", (req, res) => {
    try {
        const prepared = buildPreparation();

        const runId =
            Date.now().toString() +
            "-prep-" +
            Math.random().toString(36).substring(2, 8);

        prepared.masterData = prepared.masterData.map(row => ({
            ...row,
            etl_run_id: runId
        }));

        // Local prepared master dataset.
        // This becomes the payload that can later be loaded into Supabase.
        fs.writeFileSync(
            PREPARED_FILE,
            JSON.stringify(prepared.masterData, null, 2)
        );

        const state = savePreparationState(prepared);

        res.json({
            success: true,
            runId,
            ...state
        });
    } catch (error) {
        console.error("Preparation failed:", error);

        res.status(500).json({
            success: false,
            error: error.message || "Data preparation failed."
        });
    }
});

// ------------------------------------------------------------
// PREPARATION PROFILE / QUALITY
// ------------------------------------------------------------

app.get("/api/preparation/profile", (req, res) => {
    try {
        const prepared = buildPreparation();

        res.json({
            source: prepared.source,
            quality: prepared.quality
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ------------------------------------------------------------
// DUPLICATE REVIEW
// ------------------------------------------------------------

app.get("/api/preparation/duplicates", (req, res) => {
    try {
        const prepared = buildPreparation();
        res.json({
            total: prepared.quality.duplicateRows,
            records: prepared.reviews.duplicates
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ------------------------------------------------------------
// ORDER STATUS REVIEW
// ------------------------------------------------------------

app.get("/api/preparation/status-review", (req, res) => {
    try {
        const prepared = buildPreparation();
        res.json({
            totalOrders: prepared.quality.nonCompletedOrders,
            records: prepared.reviews.statuses
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ------------------------------------------------------------
// RETURN / REFUND REVIEW
// ------------------------------------------------------------

app.get("/api/preparation/returns", (req, res) => {
    try {
        const prepared = buildPreparation();
        res.json({
            totalOrders: prepared.quality.returnRefundOrders,
            records: prepared.reviews.returns
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ------------------------------------------------------------
// GEOGRAPHIC MAPPING
// ------------------------------------------------------------

app.get("/api/preparation/geography", (req, res) => {
    try {
        const prepared = buildPreparation();
        res.json({
            total: prepared.mappings.geography.length,
            records: prepared.mappings.geography
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// ------------------------------------------------------------
// PRODUCT MAPPING
// ------------------------------------------------------------

app.get("/api/preparation/products", (req, res) => {
    try {
        const prepared = buildPreparation();
        const search = normalizeProductText(req.query.search || "");

        let records = prepared.mappings.products;

        if (search) {
            records = records.filter(item =>
                normalizeProductText(item.rawProductName).includes(search)
            );
        }

        res.json({
            total: records.length,
            records,
            taxonomy: PRODUCT_TAXONOMY,
            options: PRODUCT_OPTIONS
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});


// ------------------------------------------------------------
// SAVE PRODUCT MAPPING OVERRIDE
// ------------------------------------------------------------

app.patch("/api/preparation/products", (req, res) => {
    try {
        const rawProductName = normalizeText(req.body?.rawProductName);
        const category = normalizeText(req.body?.category);
        const subcategory = normalizeText(req.body?.subcategory);

        if (!rawProductName) {
            return res.status(400).json({
                error: "Raw Product Name is required."
            });
        }

        if (!PRODUCT_TAXONOMY[category]) {
            return res.status(400).json({
                error: "Invalid product category."
            });
        }

        if (!PRODUCT_TAXONOMY[category].includes(subcategory)) {
            return res.status(400).json({
                error: "Invalid subcategory for the selected category."
            });
        }

        const overrides = readProductOverrides();

        overrides[rawProductName] = {
            category,
            subcategory,
            status:
                category === "Other / Unclassified"
                    ? "Review"
                    : "Mapped"
        };

        writeProductOverrides(overrides);

        res.json({
            success: true,
            mapping: {
                rawProductName,
                ...overrides[rawProductName]
            }
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || "Unable to save product mapping."
        });
    }
});

// ------------------------------------------------------------
// TIME FIELDS
// ------------------------------------------------------------

app.get("/api/preparation/time-fields", (req, res) => {
    res.json({
        fields: [
            {
                field: "Year",
                format: "YYYY",
                example: "2025"
            },
            {
                field: "Month",
                format: "Month name",
                example: "November"
            },
            {
                field: "Month Number",
                format: "1–12",
                example: "11"
            },
            {
                field: "Year-Month",
                format: "YYYY-MM",
                example: "2025-11"
            },
            {
                field: "Quarter",
                format: "Q1–Q4",
                example: "Q4"
            }
        ]
    });
});

// ------------------------------------------------------------
// PREPARED MASTER DATA SUMMARY
// ------------------------------------------------------------

app.get("/api/preparation/master-summary", (req, res) => {
    if (!fs.existsSync(PREPARED_FILE)) {
        return res.json({
            prepared: false
        });
    }

    try {
        const rows = JSON.parse(
            fs.readFileSync(PREPARED_FILE, "utf8")
        );

        res.json({
            prepared: true,
            records: rows.length,
            includedRecords: rows.filter(
                row => row.is_included_in_analysis
            ).length,
            excludedRecords: rows.filter(
                row => !row.is_included_in_analysis
            ).length,
            generatedAt: fs.statSync(PREPARED_FILE).mtime.toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: "Unable to read prepared master dataset."
        });
    }
});


app.get("/api/preparation/status", (req, res) => {
    try { res.json(preparation.status()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/api/preparation/profile", (req, res) => {
    try { res.json(preparation.profile()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/api/preparation/duplicates", (req, res) => {
    try { res.json(preparation.duplicates()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/api/preparation/status-review", (req, res) => {
    try { res.json(preparation.statuses()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/api/preparation/returns", (req, res) => {
    try { res.json(preparation.returns()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/api/preparation/geography", (req, res) => {
    try { res.json(preparation.geography()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/api/preparation/products", (req, res) => {
    try { res.json(preparation.products(req.query.search || "")); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.patch("/api/preparation/products", (req, res) => {
    try {
        const mapping = preparation.saveProductMapping(req.body);
        res.json({ success: true, mapping });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get("/api/preparation/time-fields", (req, res) => {
    try { res.json({ fields: preparation.timeFields() }); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/preparation/run", (req, res) => {
    try { res.json({ success: true, ...preparation.run() }); }
    catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get("/api/preparation/master-summary", (req, res) => {
    try { res.json(preparation.masterSummary()); }
    catch (error) { res.status(500).json({ error: error.message }); }
});


// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use((error, req, res, next) => {

    console.error(error);

    res.status(400).json({
        error:
            error.message ||
            "Something went wrong."
    });

});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(
    PORT,
    () => {
        console.log(
            `Saipher CG backend running on http://localhost:${PORT}`
        );
    }
);