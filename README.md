# Saipher Co. Login Frontend

A lightweight administrator login frontend built with plain JavaScript, CSS, and HTML. It includes the dashboard login screen, password visibility toggle, form validation, and set/reset password flow.

## Requirements

- Node.js 18 or newer
- npm (included with Node.js)

Check your installation:

```bash
node --version
npm --version
```

## Run locally

Clone the repository and switch to the login frontend branch:

```bash
git clone --branch login-frontend https://github.com/Silas033/saiphercg_caps2.git
cd saiphercg_caps2/frontend
```

Install npm metadata and start the local server:

```bash
npm install
npm start
```

Open [http://localhost:5500](http://localhost:5500) in your browser.

This project has no third-party runtime dependencies. The browser loads the Supabase client as an ES module.

## Supabase backend setup

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor.
2. In **Authentication > Users**, create the one administrator account. Copy the user's UUID and insert a matching `profiles` row using the example in the SQL file, with `is_admin` set to `true`.
3. Put the Project URL and **publishable/anon** key in `frontend/supabase-config.js`. This key is designed for browser use; never use a `service_role` key there.
4. Do not add a public password-reset flow. If a password must be reset, the Supabase project owner handles it directly in the Supabase dashboard.

The login form uses Supabase Auth, then checks the signed-in user's own RLS-protected profile for approved administrator access. The schema permits only one dashboard profile, and account creation or password resets are performed only by the Supabase project owner.

## Use another port

Windows PowerShell:

```powershell
$env:PORT=3000
npm start
```

macOS or Linux:

```bash
PORT=3000 npm start
```

Then open `http://localhost:3000`.

## Project files

- `frontend/index.html` — page structure
- `frontend/styles.css` — responsive styling
- `frontend/app.js` — login/reset interactions and validation
- `frontend/server.js` — dependency-free Node.js static server
