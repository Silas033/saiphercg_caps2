import "dotenv/config";

import express from "express";
import cors from "cors";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

import {
    createPreparationService
} from "./preparation.js";


/*
==========================================================
SAIPHER CG DSS BACKEND
==========================================================

DATA FLOW

Excel Files
    ↓
Data Management
    ↓
Data Preparation / ETL
    ↓
prepared_master_data.json
    ↓
Supabase master_transactions
    ↓
Descriptive / Predictive / Prescriptive Analytics
==========================================================
*/


/* ======================================================
   BASIC SERVER SETUP
====================================================== */

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const app =
    express();

const PORT =
    4000;


/* ======================================================
   DIRECTORIES
====================================================== */

const DATA_DIR =
    path.join(
        __dirname,
        "data"
    );

const UPLOAD_DIR =
    path.join(
        DATA_DIR,
        "uploads"
    );

const DATABASE_FILE =
    path.join(
        DATA_DIR,
        "database.json"
    );

const PREPARED_FILE =
    path.join(
        DATA_DIR,
        "prepared_master_data.json"
    );


fs.mkdirSync(
    UPLOAD_DIR,
    {
        recursive: true
    }
);


if (
    !fs.existsSync(
        DATABASE_FILE
    )
) {
    fs.writeFileSync(
        DATABASE_FILE,
        JSON.stringify(
            {
                imports: []
            },
            null,
            2
        ),
        "utf8"
    );
}


/* ======================================================
   SUPABASE
====================================================== */

const SUPABASE_URL =
    process.env.SUPABASE_URL?.trim();

const SUPABASE_SECRET_KEY =
    process.env.SUPABASE_SECRET_KEY?.trim();

let supabase = null;

if (
    SUPABASE_URL &&
    SUPABASE_SECRET_KEY
) {
    supabase =
        createClient(
            SUPABASE_URL,
            SUPABASE_SECRET_KEY
        );

    console.log(
        "Supabase configuration detected."
    );
} else {
    console.warn(
        "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY to .env."
    );
}


/* ======================================================
   MIDDLEWARE
====================================================== */

app.use(
    cors()
);

app.use(
    express.json(
        {
            limit: "10mb"
        }
    )
);


/* ======================================================
   DATABASE HELPERS
====================================================== */

function readDatabase() {

    try {

        return JSON.parse(
            fs.readFileSync(
                DATABASE_FILE,
                "utf8"
            )
        );

    } catch {

        return {
            imports: []
        };
    }
}


function writeDatabase(
    database
) {

    fs.writeFileSync(
        DATABASE_FILE,
        JSON.stringify(
            database,
            null,
            2
        ),
        "utf8"
    );
}


/* ======================================================
   REQUIRED EXCEL COLUMNS
====================================================== */

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
   DATE HELPERS
====================================================== */

function parseDate(
    value
) {

    if (!value) {
        return null;
    }

    if (
        value instanceof Date &&
        !Number.isNaN(
            value.getTime()
        )
    ) {

        return value;
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return null;
    }

    return date;
}


function getMonthFromDate(
    dateString
) {

    const date =
        parseDate(
            dateString
        );

    if (!date) {
        return "-";
    }

    return date.toLocaleString(
        "en-US",
        {
            month: "long"
        }
    );
}


function getYearFromDate(
    dateString
) {

    const date =
        parseDate(
            dateString
        );

    if (!date) {
        return "-";
    }

    return date.getFullYear();
}


/* ======================================================
   WORKBOOK ANALYSIS
====================================================== */

function analyzeWorkbook(
    filePath
) {

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

        throw new Error(
            'The workbook does not contain an "orders" sheet.'
        );
    }


    const worksheet =
        workbook.Sheets.orders;


    const rows =
        XLSX.utils.sheet_to_json(
            worksheet,
            {
                defval: null,
                raw: false
            }
        );


    /* Empty workbook */

    if (
        rows.length === 0
    ) {

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


    const columns =
        Object.keys(
            rows[0]
        );


    const missingColumns =
        REQUIRED_COLUMNS.filter(
            column =>
                !columns.includes(
                    column
                )
        );


    if (
        missingColumns.length > 0
    ) {

        throw new Error(
            `Missing required columns: ${missingColumns.join(", ")}`
        );
    }


    /* Unique orders */

    const orders =
        new Set();

    rows.forEach(
        row => {

            if (
                row["Order ID"]
            ) {

                orders.add(
                    String(
                        row["Order ID"]
                    ).trim()
                );
            }
        }
    );


    /* Unique products */

    const products =
        new Set();

    rows.forEach(
        row => {

            if (
                row["Product Name"]
            ) {

                products.add(
                    String(
                        row["Product Name"]
                    ).trim()
                );
            }
        }
    );


    /*
      Actual dataset interpretation:

      Shopee Province = Region
      Shopee City = Province
    */

    const provinces =
        new Set();

    rows.forEach(
        row => {

            if (
                row["City"]
            ) {

                provinces.add(
                    String(
                        row["City"]
                    ).trim()
                );
            }
        }
    );


    /* Exact duplicate detection */

    const hashes =
        new Set();

    let duplicateRows =
        0;

    rows.forEach(
        row => {

            const hash =
                JSON.stringify(
                    row
                );

            if (
                hashes.has(hash)
            ) {

                duplicateRows++;

            } else {

                hashes.add(hash);
            }
        }
    );


    /* Date range */

    const dates =
        rows
            .map(
                row =>
                    parseDate(
                        row[
                            "Order Creation Date"
                        ]
                    )
            )
            .filter(Boolean)
            .sort(
                (a, b) =>
                    a - b
            );


    return {

        valid: true,

        empty: false,

        records:
            rows.length,

        columns,

        uniqueOrders:
            orders.size,

        uniqueProducts:
            products.size,

        uniqueProvinces:
            provinces.size,

        duplicateRows,

        minDate:
            dates.length
                ? dates[0].toISOString()
                : null,

        maxDate:
            dates.length
                ? dates[
                    dates.length - 1
                ].toISOString()
                : null
    };
}


/* ======================================================
   PREPARATION SERVICE
====================================================== */

const preparation =
    createPreparationService({

        uploadDir:
            UPLOAD_DIR,

        dataDir:
            DATA_DIR,

        databaseFile:
            DATABASE_FILE
    });


/* ======================================================
   HEALTH CHECK
====================================================== */

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            ok: true,

            message:
                "Saipher CG DSS backend is running."
        });
    }
);


/* ======================================================
   MULTER
====================================================== */

const upload =
    multer({

        dest:
            UPLOAD_DIR,

        limits: {

            fileSize:
                50 * 1024 * 1024
        },

        fileFilter:
            (req, file, callback) => {

                const allowed = [
                    ".xlsx",
                    ".xls"
                ];

                const extension =
                    path.extname(
                        file.originalname
                    ).toLowerCase();


                if (
                    !allowed.includes(
                        extension
                    )
                ) {

                    return callback(
                        new Error(
                            "Only .xlsx and .xls files are allowed."
                        )
                    );
                }


                callback(
                    null,
                    true
                );
            }
    });


/* ======================================================
   DATA MANAGEMENT
====================================================== */

app.get(
    "/api/datasets",
    (req, res) => {

        const database =
            readDatabase();

        res.json(
            database.imports || []
        );
    }
);


/* ======================================================
   DATASET SUMMARY
====================================================== */

app.get(
    "/api/datasets/summary",
    (req, res) => {

        try {

            const database =
                readDatabase();

            const imports =
                database.imports || [];


            const ready =
                imports.filter(
                    item =>
                        item.status ===
                        "Ready"
                );


            const totalRecords =
                ready.reduce(
                    (
                        sum,
                        item
                    ) =>
                        sum +
                        Number(
                            item.records || 0
                        ),
                    0
                );


            const uniqueProducts =
                new Set();

            const uniqueProvinces =
                new Set();


            ready.forEach(
                item => {

                    if (
                        Array.isArray(
                            item.productValues
                        )
                    ) {

                        item.productValues.forEach(
                            value =>
                                uniqueProducts.add(
                                    value
                                )
                        );
                    }


                    if (
                        Array.isArray(
                            item.provinceValues
                        )
                    ) {

                        item.provinceValues.forEach(
                            value =>
                                uniqueProvinces.add(
                                    value
                                )
                        );
                    }
                }
            );


            res.json({

                filesImported:
                    ready.length,

                totalRecords,

                uniqueProducts:
                    uniqueProducts.size,

                provincesCovered:
                    uniqueProvinces.size
            });

        } catch (error) {

            console.error(
                "Dataset summary error:",
                error
            );

            res.status(500).json({

                error:
                    error.message
            });
        }
    }
);


/* ======================================================
   IMPORT EXCEL FILES
====================================================== */

app.post(
    "/api/datasets/import",

    upload.array(
        "files",
        100
    ),

    (req, res) => {

        try {

            const database =
                readDatabase();


            if (
                !Array.isArray(
                    database.imports
                )
            ) {

                database.imports =
                    [];
            }


            const imported =
                [];


            const existingNames =
                new Set(

                    database.imports.map(
                        item =>
                            String(
                                item.fileName ||
                                ""
                            ).toLowerCase()
                    )
                );


            for (
                const file
                of req.files || []
            ) {

                try {

                    const originalName =
                        file.originalname;


                    /*
                      Prevent duplicate
                      monthly files.
                    */

                    if (
                        existingNames.has(
                            originalName.toLowerCase()
                        )
                    ) {

                        if (
                            fs.existsSync(
                                file.path
                            )
                        ) {

                            fs.unlinkSync(
                                file.path
                            );
                        }


                        imported.push({

                            fileName:
                                originalName,

                            status:
                                "Already Imported",

                            message:
                                "This file is already present in Data Management and was not imported again."
                        });

                        continue;
                    }


                    const analysis =
                        analyzeWorkbook(
                            file.path
                        );


                    const importId =
                        `${Date.now()}-${Math.random()
                            .toString(36)
                            .slice(2, 8)}`;


                    const extension =
                        path.extname(
                            originalName
                        );


                    const storedFileName =
                        `${importId}${extension}`;


                    const finalPath =
                        path.join(
                            UPLOAD_DIR,
                            storedFileName
                        );


                    fs.renameSync(
                        file.path,
                        finalPath
                    );


                    const record = {

                        id:
                            importId,

                        fileName:
                            originalName,

                        storedFileName,

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


                    database.imports.push(
                        record
                    );


                    existingNames.add(
                        originalName.toLowerCase()
                    );


                    imported.push(
                        record
                    );


                } catch (error) {

                    if (
                        fs.existsSync(
                            file.path
                        )
                    ) {

                        fs.unlinkSync(
                            file.path
                        );
                    }


                    imported.push({

                        fileName:
                            file.originalname,

                        status:
                            "Error",

                        error:
                            error.message
                    });
                }
            }


            writeDatabase(
                database
            );


            /*
              New Data Management data means
              the preparation cache is no longer valid.
            */

            preparation.clearCache();


            res.json({

                success: true,

                imported
            });


        } catch (error) {

            console.error(
                "Import error:",
                error
            );


            res.status(500).json({

                success: false,

                error:
                    error.message
            });
        }
    }
);


/* ======================================================
   DELETE DATASET
====================================================== */

app.delete(
    "/api/datasets/:id",

    (req, res) => {

        try {

            const database =
                readDatabase();


            const index =
                (
                    database.imports || []
                ).findIndex(
                    item =>
                        item.id ===
                        req.params.id
                );


            if (
                index === -1
            ) {

                return res.status(
                    404
                ).json({

                    error:
                        "Dataset not found."
                });
            }


            const dataset =
                database.imports[index];


            if (
                dataset.storedFileName
            ) {

                const filePath =
                    path.join(
                        UPLOAD_DIR,
                        dataset.storedFileName
                    );


                if (
                    fs.existsSync(
                        filePath
                    )
                ) {

                    fs.unlinkSync(
                        filePath
                    );
                }
            }


            database.imports.splice(
                index,
                1
            );


            writeDatabase(
                database
            );


            preparation.clearCache();


            res.json({

                success: true
            });

        } catch (error) {

            console.error(
                "Delete dataset error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    error.message
            });
        }
    }
);


/* ======================================================
   DATA PREPARATION API
====================================================== */

app.get(
    "/api/preparation/status",

    (req, res) => {

        try {

            res.json(
                preparation.status()
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    error.message
            });
        }
    }
);


app.get(
    "/api/preparation/profile",

    (req, res) => {

        try {

            res.json(
                preparation.profile()
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    error.message
            });
        }
    }
);


app.get(
    "/api/preparation/duplicates",

    (req, res) => {

        try {

            res.json(
                preparation.duplicates()
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    error.message
            });
        }
    }
);


app.get(
    "/api/preparation/status-review",

    (req, res) => {

        try {

            res.json(
                preparation.statuses()
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    error.message
            });
        }
    }
);


app.get(
    "/api/preparation/returns",

    (req, res) => {

        try {

            res.json(
                preparation.returns()
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    error.message
            });
        }
    }
);


app.get(
    "/api/preparation/geography",

    (req, res) => {

        try {

            res.json(
                preparation.geography()
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    error.message
            });
        }
    }
);


app.get(
    "/api/preparation/products",

    (req, res) => {

        try {

            res.json(
                preparation.products(
                    req.query.search || ""
                )
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    error.message
            });
        }
    }
);


app.patch(
    "/api/preparation/products",

    (req, res) => {

        try {

            const mapping =
                preparation.saveProductMapping(
                    req.body
                );


            res.json({

                success: true,

                mapping
            });


        } catch (error) {

            console.error(error);

            res.status(400).json({

                error:
                    error.message
            });
        }
    }
);


app.get(
    "/api/preparation/time-fields",

    (req, res) => {

        try {

            res.json({

                fields:
                    preparation.timeFields()
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    error.message
            });
        }
    }
);


app.post(
    "/api/preparation/run",

    async (req, res) => {

        try {

            const result =
                preparation.run();


            /*
              After the local ETL finishes, immediately push
              the prepared master data to Supabase as well.
              If this fails, the local preparation result is
              still returned, but flagged with the sync error
              so the UI can surface it instead of silently
              losing the data.
            */

            let supabaseSync = null;

            try {

                supabaseSync =
                    await syncPreparedMasterData();

            } catch (syncError) {

                console.error(
                    "Supabase sync error (during preparation run):",
                    syncError
                );

                supabaseSync = {

                    success: false,

                    error:
                        syncError.message
                };
            }


            res.json({

                success: true,

                ...result,

                supabaseSync
            });


        } catch (error) {

            console.error(
                "Preparation error:",
                error
            );


            res.status(500).json({

                success: false,

                error:
                    error.message
            });
        }
    }
);


app.get(
    "/api/preparation/master-summary",

    (req, res) => {

        try {

            res.json(
                preparation.masterSummary()
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({

                error:
                    error.message
            });
        }
    }
);


/* ======================================================
   SUPABASE HELPERS
====================================================== */


/*
   Convert a prepared row into the exact structure
   used by master_transactions.
*/

function prepareSupabaseRow(
    row,
    syncRunId
) {

    return {

        etl_run_id:
            syncRunId,

        source_file_name:
            row.source_file_name ?? null,

        source_row_number:
            row.source_row_number ?? null,

        order_id:
            row.order_id ?? null,

        order_status:
            row.order_status ?? null,

        return_refund_status:
            row.return_refund_status ?? null,

        order_creation_date:
            row.order_creation_date ?? null,

        order_paid_time:
            row.order_paid_time ?? null,

        ship_time:
            row.ship_time ?? null,

        order_complete_time:
            row.order_complete_time ?? null,

        year:
            row.year ?? null,

        month:
            row.month ?? null,

        month_name:
            row.month_name ?? null,

        month_number:
            row.month_number ?? null,

        year_month:
            row.year_month ?? null,

        quarter:
            row.quarter ?? null,

        raw_province:
            row.raw_province ?? null,

        raw_city:
            row.raw_city ?? null,

        region:
            row.region ?? null,

        province:
            row.province ?? null,

        raw_product_name:
            row.raw_product_name ?? null,

        category:
            row.category ?? null,

        subcategory:
            row.subcategory ?? null,

        quantity:
            row.quantity ?? 0,

        returned_quantity:
            row.returned_quantity ?? 0,

        net_quantity:
            row.net_quantity ?? 0,

        line_revenue:
            row.line_revenue ?? 0,

        total_discount:
            row.total_discount ?? 0,

        seller_price_discount:
            row.seller_price_discount ?? 0,

        shopee_rebate:
            row.shopee_rebate ?? 0,

        service_fee:
            row.service_fee ?? 0,

        is_exact_duplicate:
            Boolean(
                row.is_exact_duplicate
            ),

        is_included_in_analysis:
            Boolean(
                row.is_included_in_analysis
            ),

        exclusion_reason:
            row.exclusion_reason ?? null
    };
}


/*
   Convert a unique product classification record
   (from preparation.products()) into the row shape
   used by the product_mapping dimension table.
*/

function prepareProductMappingRow(product) {

    return {

        raw_product_name:
            product.rawProductName,

        category:
            product.category,

        subcategory:
            product.subcategory,

        mapping_status:
            product.status,

        updated_at:
            new Date().toISOString()
    };
}


/*
   Convert a unique province/city combination
   (from preparation.geography()) into the row shape
   used by the geographic_mapping dimension table.
*/

function prepareGeographicMappingRow(geo) {

    return {

        raw_province:
            geo.rawProvince || null,

        raw_city:
            geo.rawCity || null,

        region:
            geo.region,

        province:
            geo.province,

        updated_at:
            new Date().toISOString()
    };
}


/*
   Upsert the current unique product and geography
   mappings into their dimension tables. These are
   reference/lookup tables, so they are reconciled by
   unique key (upsert) rather than fully replaced like
   master_transactions.

   Failures here are returned rather than thrown, since
   master_transactions is the primary single source of
   truth and may already have synced successfully by the
   time this runs.
*/

async function syncDimensionTables() {

    const warnings = [];


    const productRecords =
        preparation.products().records ||
        [];

    if (
        productRecords.length > 0
    ) {

        const rows =
            productRecords.map(
                prepareProductMappingRow
            );

        const {
            error
        } =
            await supabase
                .from(
                    "product_mapping"
                )
                .upsert(
                    rows,
                    {
                        onConflict:
                            "raw_product_name"
                    }
                );

        if (error) {

            console.error(
                "product_mapping sync error:",
                error
            );

            warnings.push(
                `product_mapping sync failed: ${error.message}`
            );
        }
    }


    const geographyRecords =
        preparation.geography().records ||
        [];

    if (
        geographyRecords.length > 0
    ) {

        const rows =
            geographyRecords.map(
                prepareGeographicMappingRow
            );

        const {
            error
        } =
            await supabase
                .from(
                    "geographic_mapping"
                )
                .upsert(
                    rows,
                    {
                        onConflict:
                            "raw_province,raw_city"
                    }
                );

        if (error) {

            console.error(
                "geographic_mapping sync error:",
                error
            );

            warnings.push(
                `geographic_mapping sync failed: ${error.message}`
            );
        }
    }


    return warnings;
}


/* ======================================================
   SUPABASE SYNC
====================================================== */

async function syncPreparedMasterData() {

    if (!supabase) {

        throw new Error(
            "Supabase is not configured. Check SUPABASE_URL and SUPABASE_SECRET_KEY in .env."
        );
    }


    if (
        !fs.existsSync(
            PREPARED_FILE
        )
    ) {

        throw new Error(
            "prepared_master_data.json does not exist. Run Data Preparation first."
        );
    }


    const prepared =
        JSON.parse(
            fs.readFileSync(
                PREPARED_FILE,
                "utf8"
            )
        );


    if (
        !Array.isArray(
            prepared
        )
    ) {

        throw new Error(
            "prepared_master_data.json does not contain an array."
        );
    }


    if (
        prepared.length === 0
    ) {

        throw new Error(
            "Prepared Master Data is empty."
        );
    }


    /*
      Generate a real UUID for the Supabase ETL run.
      This works whether your etl_run_id column is
      UUID-compatible or text-compatible.
    */

    const syncRunId =
        crypto.randomUUID();


    console.log(
        `Starting Supabase sync. Run: ${syncRunId}`
    );


    /*
      ----------------------------------------------------
      STEP 1
      Remove the previous master dataset.
      ----------------------------------------------------

      created_at is NOT NULL with the SQL structure
      previously provided, so this removes all rows.
    */

    const {
        error:
            deleteError
    } =
        await supabase
            .from(
                "master_transactions"
            )
            .delete()
            .gte(
                "created_at",
                "1900-01-01T00:00:00.000Z"
            );


    if (
        deleteError
    ) {

        throw new Error(
            `Supabase could not clear master_transactions: ${deleteError.message}`
        );
    }


    /*
      ----------------------------------------------------
      STEP 2
      Insert prepared data in chunks.
      ----------------------------------------------------
    */

    const BATCH_SIZE =
        500;

    let inserted =
        0;


    for (
        let start = 0;
        start < prepared.length;
        start += BATCH_SIZE
    ) {

        const batch =
            prepared
                .slice(
                    start,
                    start + BATCH_SIZE
                )
                .map(
                    row =>
                        prepareSupabaseRow(
                            row,
                            syncRunId
                        )
                );


        const {
            error
        } =
            await supabase
                .from(
                    "master_transactions"
                )
                .insert(
                    batch
                );


        if (
            error
        ) {

            throw new Error(
                `Supabase insert failed at records ${start + 1}-${Math.min(
                    start + BATCH_SIZE,
                    prepared.length
                )}: ${error.message}`
            );
        }


        inserted +=
            batch.length;


        console.log(
            `Supabase sync progress: ${inserted}/${prepared.length}`
        );
    }


    /*
      ----------------------------------------------------
      STEP 2.5
      Sync the product and geography dimension tables.
      Non-fatal: master_transactions has already synced
      successfully by this point.
      ----------------------------------------------------
    */

    const dimensionWarnings =
        await syncDimensionTables();


    /*
      ----------------------------------------------------
      STEP 3
      Save ETL run information.
      ----------------------------------------------------
    */

    const includedRecords =
        prepared.filter(
            row =>
                Boolean(
                    row.is_included_in_analysis
                )
        ).length;


    const excludedRecords =
        prepared.length -
        includedRecords;


    const uniqueOrders =
        new Set(
            prepared
                .map(
                    row =>
                        row.order_id
                )
                .filter(Boolean)
        ).size;


    const uniqueProducts =
        new Set(
            prepared
                .map(
                    row =>
                        row.raw_product_name
                )
                .filter(Boolean)
        ).size;


    const regions =
        new Set(
            prepared
                .map(
                    row =>
                        row.region
                )
                .filter(Boolean)
        ).size;


    const provinces =
        new Set(
            prepared
                .map(
                    row =>
                        row.province
                )
                .filter(Boolean)
        ).size;


    const duplicateRows =
        prepared.filter(
            row =>
                Boolean(
                    row.is_exact_duplicate
                )
        ).length;


    const minDate =
        prepared
            .map(
                row =>
                    row.order_creation_date
            )
            .filter(Boolean)
            .sort()[0] || null;


    const maxDate =
        prepared
            .map(
                row =>
                    row.order_creation_date
            )
            .filter(Boolean)
            .sort()
            .at(-1) || null;


    /*
      Store the ETL run.

      The important part is that the master table
      has the same syncRunId.
    */

    const {
        error:
            etlError
    } =
        await supabase
            .from(
                "etl_runs"
            )
            .upsert(
                {

                    run_id:
                        syncRunId,

                    source_file_count:
                        new Set(
                            prepared
                                .map(
                                    row =>
                                        row.source_file_name
                                )
                                .filter(Boolean)
                        ).size,

                    source_row_count:
                        prepared.length,

                    unique_orders:
                        uniqueOrders,

                    unique_products:
                        uniqueProducts,

                    region_count:
                        regions,

                    province_count:
                        provinces,

                    duplicate_rows:
                        duplicateRows,

                    included_rows:
                        includedRecords,

                    excluded_rows:
                        excludedRecords,

                    date_min:
                        minDate,

                    date_max:
                        maxDate
                },
                {
                    onConflict:
                        "run_id"
                }
            );


    /*
      NOTE: etl_runs is a secondary metadata log.
      The actual master data has already been inserted
      above by this point, so a failure here should NOT
      make the whole sync look like it failed. It's
      surfaced as a warning instead.
    */

    let etlRunWarning = null;

    if (
        etlError
    ) {

        console.error(
            "ETL run logging failed (master data was still uploaded):",
            etlError
        );

        etlRunWarning =
            `Master data was uploaded, but ETL run logging failed: ${etlError.message}`;
    }


    const allWarnings =
        [
            ...dimensionWarnings,

            ...(
                etlRunWarning
                    ? [etlRunWarning]
                    : []
            )
        ];

    const combinedWarning =
        allWarnings.length > 0
            ? allWarnings.join(" | ")
            : null;


    /*
      Final database verification.
    */

    const {
        count,
        error:
            countError
    } =
        await supabase
            .from(
                "master_transactions"
            )
            .select(
                "id",
                {
                    count: "exact",
                    head: true
                }
            );


    if (
        countError
    ) {

        throw new Error(
            `Master data was uploaded, but verification failed: ${countError.message}`
        );
    }


    return {

        success: true,

        runId:
            syncRunId,

        preparedRecords:
            prepared.length,

        insertedRecords:
            inserted,

        databaseRecords:
            count,

        includedRecords,

        excludedRecords,

        uniqueOrders,

        uniqueProducts,

        regions,

        provinces,

        duplicateRows,

        dateMin:
            minDate,

        dateMax:
            maxDate,

        warning:
            combinedWarning
    };
}


/* ======================================================
   SUPABASE CONNECTION TEST
====================================================== */

app.get(
    "/api/supabase/test",

    async (req, res) => {

        try {

            if (!supabase) {

                return res.status(
                    503
                ).json({

                    success: false,

                    connected: false,

                    error:
                        "Supabase is not configured. Check your .env file."
                });
            }


            const {
                data,
                error
            } =
                await supabase
                    .from(
                        "etl_runs"
                    )
                    .select(
                        "run_id"
                    )
                    .limit(
                        1
                    );


            if (
                error
            ) {

                return res.status(
                    500
                ).json({

                    success: false,

                    connected: false,

                    error:
                        error.message
                });
            }


            res.json({

                success: true,

                connected: true,

                message:
                    "Supabase connection is working.",

                etlRuns:
                    data || []
            });

        } catch (error) {

            console.error(
                "Supabase test error:",
                error
            );


            res.status(
                500
            ).json({

                success: false,

                connected: false,

                error:
                    error.message
            });
        }
    }
);


/* ======================================================
   SUPABASE MASTER DATA SYNC
====================================================== */

app.post(
    "/api/supabase/sync",

    async (req, res) => {

        try {

            const result =
                await syncPreparedMasterData();


            res.json(
                result
            );


        } catch (error) {

            console.error(
                "Supabase sync error:",
                error
            );


            res.status(
                500
            ).json({

                success: false,

                error:
                    error.message
            });
        }
    }
);


/* ======================================================
   SUPABASE MASTER DATA COUNT
====================================================== */

app.get(
    "/api/supabase/master-count",

    async (req, res) => {

        try {

            if (!supabase) {

                return res.status(
                    503
                ).json({

                    success: false,

                    error:
                        "Supabase is not configured."
                });
            }


            const {
                count,
                error
            } =
                await supabase
                    .from(
                        "master_transactions"
                    )
                    .select(
                        "id",
                        {
                            count: "exact",
                            head: true
                        }
                    );


            if (
                error
            ) {

                return res.status(
                    500
                ).json({

                    success: false,

                    error:
                        error.message
                });
            }


            res.json({

                success: true,

                masterRecords:
                    count
            });


        } catch (error) {

            console.error(
                "Master count error:",
                error
            );


            res.status(
                500
            ).json({

                success: false,

                error:
                    error.message
            });
        }
    }
);


/* ======================================================
   ERROR HANDLER
====================================================== */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            error
        );


        res.status(
            400
        ).json({

            error:
                error.message ||
                "Something went wrong."
        });
    }
);


/* ======================================================
   START SERVER
====================================================== */

app.listen(
    PORT,
    () => {

        console.log(
            "=============================================="
        );

        console.log(
            "SAIPHER CG DSS BACKEND"
        );

        console.log(
            `Running on http://localhost:${PORT}`
        );

        console.log(
            "=============================================="
        );

        console.log(
            `Supabase: ${
                supabase
                    ? "Configured"
                    : "NOT CONFIGURED"
            }`
        );
    }
);