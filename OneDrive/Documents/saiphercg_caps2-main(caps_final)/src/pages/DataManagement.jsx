import { useEffect, useRef, useState } from "react";

import {
    FaCloudUploadAlt,
    FaFileExcel,
    FaSearch,
    FaTrash,
    FaSyncAlt,
    FaEye,
    FaCheckCircle,
    FaDatabase,
    FaBoxOpen,
    FaMapMarkerAlt,
    FaLock,
    FaLockOpen
} from "react-icons/fa";

import "../styles/data-management.css";

const API_URL = "http://localhost:4000/api";

const ITEMS_PER_PAGE = 12;

export default function DataManagement({ setActivePage }) {

    const fileInputRef = useRef(null);

    const [files, setFiles] = useState([]);

    const [summary, setSummary] = useState({
        filesImported: 0,
        totalRecords: 0,
        uniqueProducts: 0,
        provincesCovered: 0
    });

    const [search, setSearch] = useState("");

    const [currentPage, setCurrentPage] = useState(1);

    const [loading, setLoading] = useState(false);

    const [dragging, setDragging] = useState(false);

    const [uploadLocked, setUploadLocked] = useState(true);

    const [selectedFile, setSelectedFile] = useState(null);


    // --------------------------------------------------
    // LOAD DATA
    // --------------------------------------------------

    async function loadData() {

        try {

            const filesResponse = await fetch(
                `${API_URL}/datasets`
            );

            const filesData =
                await filesResponse.json();

            setFiles(filesData);

            const summaryResponse = await fetch(
                `${API_URL}/datasets/summary`
            );

            const summaryData =
                await summaryResponse.json();

            setSummary(summaryData);

        } catch (error) {

            console.error(
                "Unable to load dataset information:",
                error
            );

        }

    }


    useEffect(() => {

        loadData();

    }, []);


    // --------------------------------------------------
    // UPLOAD FILES
    // --------------------------------------------------

    async function uploadFiles(selectedFiles) {

        if (uploadLocked || !selectedFiles.length) {
            return;
        }

        setLoading(true);

        const formData = new FormData();

        selectedFiles.forEach(file => {

            formData.append(
                "files",
                file
            );

        });


        try {

            const response = await fetch(
                `${API_URL}/datasets/import`,
                {
                    method: "POST",
                    body: formData
                }
            );

            const result =
                await response.json();

            if (!response.ok) {

                throw new Error(
                    result.error ||
                    "Upload failed."
                );

            }

            await loadData();

            setCurrentPage(1);

            alert(
                `${result.imported.length} file(s) processed successfully.`
            );

        } catch (error) {

            alert(error.message);

        } finally {

            setLoading(false);

        }

    }


    // --------------------------------------------------
    // FILE INPUT
    // --------------------------------------------------

    function handleFileChange(event) {

        if (uploadLocked) {
            event.target.value = "";
            return;
        }

        const selected =
            Array.from(
                event.target.files
            );

        uploadFiles(selected);

        event.target.value = "";

    }


    // --------------------------------------------------
    // DRAG AND DROP
    // --------------------------------------------------

    function handleDrop(event) {

        event.preventDefault();

        setDragging(false);

        if (uploadLocked) {
            return;
        }

        const droppedFiles =
            Array.from(
                event.dataTransfer.files
            );

        uploadFiles(droppedFiles);

    }


    // --------------------------------------------------
    // DELETE FILE
    // --------------------------------------------------

    async function deleteFile(id) {

        const confirmed =
            window.confirm(
                "Delete this imported dataset?"
            );

        if (!confirmed) {
            return;
        }


        try {

            const response =
                await fetch(
                    `${API_URL}/datasets/${id}`,
                    {
                        method: "DELETE"
                    }
                );


            if (!response.ok) {

                throw new Error(
                    "Unable to delete dataset."
                );

            }


            await loadData();


            // Recalculate the current page
            // after deleting a file.

            setCurrentPage(previousPage => {

                const remainingFiles =
                    files.length - 1;

                const newTotalPages =
                    Math.ceil(
                        remainingFiles /
                        ITEMS_PER_PAGE
                    );

                return Math.min(
                    previousPage,
                    Math.max(
                        newTotalPages,
                        1
                    )
                );

            });


        } catch (error) {

            alert(error.message);

        }

    }


    // --------------------------------------------------
    // FORMAT FILE SIZE
    // --------------------------------------------------

    function formatFileSize(bytes) {

        if (!bytes) {
            return "-";
        }

        const mb =
            bytes / 1024 / 1024;

        return `${mb.toFixed(1)} MB`;

    }


    // --------------------------------------------------
    // FORMAT DATE
    // --------------------------------------------------

    function formatDate(date) {

        if (!date) {
            return "-";
        }

        return new Date(date)
            .toLocaleDateString(
                "en-US",
                {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                }
            );

    }


    // --------------------------------------------------
    // SEARCH
    // --------------------------------------------------

    const filteredFiles =
        files.filter(file =>
            file.fileName
                ?.toLowerCase()
                .includes(
                    search.toLowerCase()
                )
        );


    // --------------------------------------------------
    // PAGINATION
    // --------------------------------------------------

    const totalPages =
        Math.ceil(
            filteredFiles.length /
            ITEMS_PER_PAGE
        );


    const safeCurrentPage =
        Math.min(
            Math.max(
                currentPage,
                1
            ),
            Math.max(
                totalPages,
                1
            )
        );


    const startIndex =
        (safeCurrentPage - 1) *
        ITEMS_PER_PAGE;


    const paginatedFiles =
        filteredFiles.slice(
            startIndex,
            startIndex + ITEMS_PER_PAGE
        );


    const displayStart =
        filteredFiles.length === 0
            ? 0
            : startIndex + 1;


    const displayEnd =
        Math.min(
            startIndex +
            ITEMS_PER_PAGE,
            filteredFiles.length
        );


    // --------------------------------------------------
    // CHANGE PAGE
    // --------------------------------------------------

    function changePage(page) {

        if (
            page < 1 ||
            page > totalPages
        ) {
            return;
        }

        setCurrentPage(page);

    }


    // --------------------------------------------------
    // RENDER
    // --------------------------------------------------

    return (

        <div className="data-management">


            {/* ==================================================
                PAGE HEADER
            ================================================== */}

            <div className="page-header">

                <div>

                    <h1>
                        Data Management
                    </h1>

                    <p>
                        Import and manage Shopee transaction files
                    </p>

                </div>

                <div className="header-note">

                    “Organized data.
                    Better decisions.”

                </div>

            </div>


            {/* ==================================================
                UPLOAD + COVERAGE
            ================================================== */}

            <div className="management-grid">


                {/* UPLOAD CARD */}

                <section className="upload-card" id="dm-upload">

                    <div className="upload-safety-row">
                        <div>
                            <strong>Upload safety</strong>
                            <small>Lock uploads to prevent accidental file selection.</small>
                        </div>
                        <button
                            type="button"
                            className={`upload-lock-toggle ${uploadLocked ? "locked" : "unlocked"}`}
                            role="switch"
                            aria-checked={uploadLocked}
                            aria-label={uploadLocked ? "Unlock file uploads" : "Lock file uploads"}
                            disabled={loading}
                            onClick={() => {
                                setUploadLocked(current => !current);
                                setDragging(false);
                            }}
                        >
                            {uploadLocked ? <FaLock aria-hidden="true" /> : <FaLockOpen aria-hidden="true" />}
                            <span>{uploadLocked ? "Locked" : "Unlocked"}</span>
                        </button>
                    </div>

                    <div
                        className={`upload-zone${dragging ? " dragging" : ""}${uploadLocked ? " locked" : ""}`}
                        aria-disabled={uploadLocked}

                        onDragOver={(event) => {

                            event.preventDefault();

                            if (!uploadLocked) setDragging(true);

                        }}

                        onDragLeave={() =>
                            setDragging(false)
                        }

                        onDrop={handleDrop}

                        onClick={() => {
                            if (!uploadLocked && !loading) fileInputRef.current?.click();
                        }}
                    >

                        <FaCloudUploadAlt
                            className="upload-icon"
                        />


                        <h2>
                            Upload Shopee
                            Transaction Files
                        </h2>


                        <p>
                            Drag and drop your Excel
                            files here or click to browse
                        </p>


                        <button
                            className="browse-button"
                            type="button"
                            disabled={uploadLocked || loading}

                            onClick={(event) => {

                                event.stopPropagation();

                                if (!uploadLocked && !loading) fileInputRef.current?.click();

                            }}
                        >

                            {loading
                                ? "Processing..."
                                : "Browse Files"
                            }

                        </button>


                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".xlsx,.xls"
                            disabled={uploadLocked || loading}
                            hidden
                            onChange={handleFileChange}
                        />


                        <small>

                            You can upload multiple files at once.
                            <br />

                            Supported formats:
                            .xlsx, .xls

                            <br />

                            Maximum file size:
                            50 MB per file

                        </small>

                    </div>

                </section>



                {/* COVERAGE CARD */}

                <section className="coverage-card" id="dm-coverage">

                    <div className="section-title">

                        <FaDatabase />

                        <div>

                            <strong>
                                Data Coverage
                            </strong>

                            <span>
                                January 2021 – November 2025
                            </span>

                        </div>

                    </div>


                    <div className="summary-grid">


                        <SummaryCard
                            icon={
                                <FaFileExcel />
                            }

                            value={
                                summary.filesImported
                            }

                            label="Files Imported"
                        />


                        <SummaryCard
                            icon={
                                <FaDatabase />
                            }

                            value={
                                summary.totalRecords
                                    .toLocaleString()
                            }

                            label="Total Records"
                        />


                        <SummaryCard
                            icon={
                                <FaBoxOpen />
                            }

                            value={
                                summary.uniqueProducts
                            }

                            label="Unique Products"
                        />


                        <SummaryCard
                            icon={
                                <FaMapMarkerAlt />
                            }

                            value={
                                summary.provincesCovered
                            }

                            label="Provinces Covered"
                        />

                    </div>

                </section>

            </div>


            {/* ==================================================
                IMPORTED FILES
            ================================================== */}

            <section className="files-card" id="dm-files">


                {/* TABLE HEADER */}

                <div className="files-header">


                    <div>

                        <h2>
                            Imported Files ({files.length})
                        </h2>

                        <p>
                            Files currently registered in the DSS
                        </p>

                    </div>


                    <div className="file-controls">


                        {/* SEARCH */}

                        <div className="search-box">

                            <FaSearch />

                            <input
                                type="text"

                                placeholder="Search files..."

                                value={search}

                                onChange={(event) => {

                                    setSearch(
                                        event.target.value
                                    );

                                    setCurrentPage(1);

                                }}
                            />

                        </div>


                        {/* REFRESH */}

                        <button
                            className="refresh-button"

                            onClick={() => {

                                loadData();

                                setCurrentPage(1);

                            }}
                        >

                            <FaSyncAlt />

                        </button>

                    </div>

                </div>



                {/* ==================================================
                    TABLE
                ================================================== */}

                <div className="table-wrapper">

                    <table>

                        <thead>

                            <tr>

                                <th>
                                    File Name
                                </th>

                                <th>
                                    Month
                                </th>

                                <th>
                                    Year
                                </th>

                                <th>
                                    Records
                                </th>

                                <th>
                                    File Size
                                </th>

                                <th>
                                    Import Date
                                </th>

                                <th>
                                    Status
                                </th>

                                <th>
                                    Actions
                                </th>

                            </tr>

                        </thead>


                        <tbody>

                            {paginatedFiles.map(file => (

                                <tr key={file.id}>


                                    {/* FILE NAME */}

                                    <td>

                                        <div className="file-name">

                                            <FaFileExcel />

                                            <span>
                                                {file.fileName}
                                            </span>

                                        </div>

                                    </td>


                                    {/* MONTH */}

                                    <td>
                                        {file.month}
                                    </td>


                                    {/* YEAR */}

                                    <td>
                                        {file.year}
                                    </td>


                                    {/* RECORDS */}

                                    <td>
                                        {file.records
                                            ?.toLocaleString()}
                                    </td>


                                    {/* SIZE */}

                                    <td>
                                        {formatFileSize(
                                            file.fileSize
                                        )}
                                    </td>


                                    {/* IMPORT DATE */}

                                    <td>
                                        {formatDate(
                                            file.importDate
                                        )}
                                    </td>


                                    {/* STATUS */}

                                    <td>

                                        <span
                                            className={
                                                file.status === "Ready"
                                                    ? "status ready"
                                                    : file.status === "Error"
                                                        ? "status error"
                                                        : "status empty"
                                            }
                                        >

                                            <FaCheckCircle />

                                            {file.status}

                                        </span>

                                    </td>


                                    {/* ACTIONS */}

                                    <td>

                                        <div className="actions">


                                            {/* VIEW */}

                                            <button
                                                title="View"

                                                onClick={() =>
                                                    setSelectedFile(
                                                        file
                                                    )
                                                }
                                            >

                                                <FaEye />

                                            </button>


                                            {/* REPROCESS */}

                                            <button
                                                title="Reprocess"

                                                onClick={() =>
                                                    alert(
                                                        "Reprocess will be connected to the Data Preparation pipeline next."
                                                    )
                                                }
                                            >

                                                <FaSyncAlt />

                                            </button>


                                            {/* DELETE */}

                                            <button
                                                className="delete-action"

                                                title="Delete"

                                                onClick={() =>
                                                    deleteFile(
                                                        file.id
                                                    )
                                                }
                                            >

                                                <FaTrash />

                                            </button>

                                        </div>

                                    </td>

                                </tr>

                            ))}

                        </tbody>

                    </table>


                    {/* EMPTY STATE */}

                    {filteredFiles.length === 0 && (

                        <div className="empty-state">

                            <FaFileExcel />

                            <strong>
                                No imported files
                            </strong>

                            <span>
                                Upload your Shopee Excel
                                files to get started.
                            </span>

                        </div>

                    )}

                </div>



                {/* ==================================================
                    FOOTER + PAGINATION
                ================================================== */}

                <div className="files-footer">


                    <span>

                        Showing{" "}

                        {displayStart}

                        {"–"}

                        {displayEnd}

                        {" "}of{" "}

                        {filteredFiles.length}

                        {" "}files

                    </span>


                    <div className="pagination">


                        {/* PREVIOUS */}

                        <button
                            disabled={
                                safeCurrentPage === 1
                            }

                            onClick={() =>
                                changePage(
                                    safeCurrentPage - 1
                                )
                            }
                        >

                            ‹

                        </button>


                        {/* PAGE NUMBERS */}

                        {Array.from(
                            {
                                length: totalPages
                            },

                            (_, index) =>
                                index + 1

                        ).map(page => (

                            <button
                                key={page}

                                className={
                                    safeCurrentPage === page
                                        ? "active"
                                        : ""
                                }

                                onClick={() =>
                                    changePage(page)
                                }
                            >

                                {page}

                            </button>

                        ))}


                        {/* NEXT */}

                        <button
                            disabled={
                                safeCurrentPage === totalPages ||
                                totalPages === 0
                            }

                            onClick={() =>
                                changePage(
                                    safeCurrentPage + 1
                                )
                            }
                        >

                            ›

                        </button>

                    </div>

                </div>

            </section>



            {/* ==================================================
                PROCEED
            ================================================== */}

            <div className="proceed-container">

                <button
                    className="proceed-button"
                    onClick={() => setActivePage?.("data-preparation")}
                >

                    Proceed to Data Preparation

                    <span>
                        →
                    </span>

                </button>

            </div>



            {/* ==================================================
                FILE DETAILS MODAL
            ================================================== */}

            {selectedFile && (

                <div
                    className="modal-overlay"

                    onClick={() =>
                        setSelectedFile(null)
                    }
                >

                    <div
                        className="file-modal"

                        onClick={(event) =>
                            event.stopPropagation()
                        }
                    >


                        {/* MODAL HEADER */}

                        <div className="modal-header">

                            <h2>
                                Dataset Details
                            </h2>

                            <button
                                onClick={() =>
                                    setSelectedFile(null)
                                }
                            >

                                ×

                            </button>

                        </div>


                        {/* MODAL BODY */}

                        <div className="modal-body">


                            <Detail
                                label="File Name"
                                value={
                                    selectedFile.fileName
                                }
                            />


                            <Detail
                                label="Records"
                                value={
                                    selectedFile.records
                                        ?.toLocaleString()
                                }
                            />


                            <Detail
                                label="Unique Orders"
                                value={
                                    selectedFile.uniqueOrders
                                }
                            />


                            <Detail
                                label="Unique Products"
                                value={
                                    selectedFile.uniqueProducts
                                }
                            />


                            <Detail
                                label="Provinces"
                                value={
                                    selectedFile.uniqueProvinces
                                }
                            />


                            <Detail
                                label="Exact Duplicate Rows"
                                value={
                                    selectedFile.duplicateRows
                                }
                            />


                            <Detail
                                label="Date Range"
                                value={

                                    `${formatDate(
                                        selectedFile.minDate
                                    )} – ${formatDate(
                                        selectedFile.maxDate
                                    )}`

                                }
                            />

                        </div>

                    </div>

                </div>

            )}

        </div>

    );

}


/* ==================================================
   SUMMARY CARD
================================================== */

function SummaryCard({
    icon,
    value,
    label
}) {

    return (

        <div className="summary-card">

            <div className="summary-icon">
                {icon}
            </div>

            <div>

                <strong>
                    {value}
                </strong>

                <span>
                    {label}
                </span>

            </div>

        </div>

    );

}


/* ==================================================
   DETAIL ROW
================================================== */

function Detail({
    label,
    value
}) {

    return (

        <div className="detail-row">

            <span>
                {label}
            </span>

            <strong>
                {value}
            </strong>

        </div>

    );

}
