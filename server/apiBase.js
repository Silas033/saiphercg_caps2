// One place for the API address.
// Local development: http://localhost:4000/api (unchanged).
// Deployed (Vercel): set VITE_API_URL to your hosted server, e.g. https://your-server.onrender.com/api
export const API_BASE = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:4000/api" : "/api")
).replace(/\/$/, "");
