# Agentic Mailing Orchestrator

Automate personalized email outreach by uploading a spreadsheet, configuring multiple intelligent mailing agents, and dispatching campaigns with a single click.

## ✨ Highlights

- Excel & CSV ingestion with smart column detection
- Unlimited mailing agents with custom filters and templates
- Liquid-style templating using spreadsheet headings (e.g. `{{First Name}}`)
- Preview engine to validate subjects and bodies per agent
- Nodemailer backend with JSON dry-run fallback for local development

## 🚀 Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Copy and edit environment variables**

   ```bash
   cp .env.local.example .env.local
   ```

   Update the SMTP credentials so the app can relay messages.

3. **Run locally**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 and upload an `.xlsx` or `.csv` file. The first sheet is used automatically.

## 🧠 How It Works

1. Upload a spreadsheet — the app normalizes columns and previews the first few rows.
2. Choose the email column (and optional name column).
3. Spin up as many agents as you like. Each agent may:
   - Rename itself
   - Target a segment through column-based filters
   - Customize subject & body templates with placeholders
4. Launch the run. The backend turns templates into ready-to-send emails and hands them to Nodemailer.

If SMTP credentials are missing, the server switches to a JSON transport and logs payloads while returning a “dry run” message.

## 📦 Tech Stack

- [Next.js 14 (App Router)](https://nextjs.org/)
- [React 18](https://react.dev/)
- [XLSX](https://github.com/SheetJS/sheetjs) for spreadsheet parsing
- [Nodemailer](https://nodemailer.com/about/) for delivery
- [Zod](https://zod.dev/) for runtime validation

## ⚙️ Scripts

- `npm run dev` – Start the development server
- `npm run build` – Create a production build
- `npm start` – Serve the production build
- `npm run lint` – Run ESLint
- `npm run typecheck` – Verify TypeScript types

## 🔐 Environment Variables

| Variable           | Description                                        |
| ------------------ | -------------------------------------------------- |
| `SMTP_HOST`        | SMTP server host                                   |
| `SMTP_PORT`        | SMTP server port (default `587`)                   |
| `SMTP_SECURE`      | `true` for TLS/SSL (false by default)              |
| `SMTP_USER`        | SMTP username or API key                           |
| `SMTP_PASS`        | SMTP password                                      |
| `MAIL_FROM`        | Default from email (fallback to `SMTP_USER`)       |
| `MAIL_FROM_NAME`   | Optional display name for the sender               |

## ✅ Deployment

The project runs perfectly on [Vercel](https://vercel.com/). Make sure to add the environment variables in the Vercel dashboard before deploying to production.
