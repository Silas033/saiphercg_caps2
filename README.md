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

This project has no third-party runtime dependencies. `npm install` is included so the setup follows the standard npm workflow and remains ready for future dependencies.

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
