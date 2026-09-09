# Saipher CG DSS

Frontend: React 18 + Vite
Backend: Node.js + Express + Multer + SheetJS

## Run frontend
```bash
npm install
npm run dev
```

## Run backend
```bash
cd server
npm install
npm run dev
```

The frontend expects the API at `http://localhost:4000/api` (override with `VITE_API_URL`).

### Data Management behavior
- Accepts multiple `.xlsx` / `.xls` files.
- Reads the `orders` worksheet when present.
- Validates core columns.
- Counts transaction rows.
- Detects empty workbooks.
- Captures month/year from `Order Creation Date`.
- Profiles unique products and province-level geography.
- Stores the uploaded raw workbook and an import manifest in `server/data/datasets.json`.
