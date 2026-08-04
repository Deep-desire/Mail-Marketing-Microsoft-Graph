# VUF Mail Marketing System

A production-grade, full-stack email marketing system built with a **React 18 + TypeScript SPA** on the frontend, an **Express (Node.js) & Azure Functions API** on the backend, and **Supabase (PostgreSQL)** for reliable database persistence. Deployed on **Vercel** and **Azure**.

---

## 🏗️ Physical Architecture & System Overview

```
                                 ┌──────────────────────────────────────────────┐
                                 │          Client Web Browser                  │
                                 │     (React 18 + TypeScript + Vite)           │
                                 └──────────────────────┬───────────────────────┘
                                                        │
                                                        │ HTTP REST Requests (JWT Auth)
                                                        ▼
                                 ┌──────────────────────────────────────────────┐
                                 │        Vercel Serverless / Express API       │
                                 │            (backend/src/index.js)            │
                                 └──────────────┬────────────────┬──────────────┘
                                                │                │
                        Prisma PostgreSQL Queries│                │ Dual Provider Email Engine
                                                ▼                ▼
┌─────────────────────────────────┐   ┌───────────────────┐   ┌──────────────────────────────────┐
│     Supabase PostgreSQL DB      │   │  Azure Functions  │   │      Microsoft Graph API /       │
│ (Uploads, Contacts, Templates)  │   │  Timer Scheduler  ├──►│  Azure Communication Services    │
└─────────────────────────────────┘   └───────────────────┘   └──────────────────────────────────┘
```

---

## 🛠️ Technology Stack

### Frontend
- **Framework:** React 18 + TypeScript (built with Vite)
- **Styling:** Tailwind CSS 3 (Dark glassmorphism theme)
- **Routing:** React Router 6
- **State & Tables:** TanStack Table (v8)
- **Forms & Icons:** React Hook Form, Lucide React Icons
- **HTTP Client:** Axios with JWT Interceptors (`vuf_token`)

### Backend
- **Framework:** Express.js (Node.js 18+) running on Vercel Serverless & Node environments
- **Background Engine:** In-Process Async Worker + Azure Timer Trigger (`CampaignSchedulerTrigger`)
- **Database & ORM:** Supabase PostgreSQL + Prisma ORM
- **Email Delivery:** Microsoft Graph API (Primary via Azure Entra ID OAuth2) with optional Azure Communication Services fallback
- **Template Engine:** Handlebars (dynamic `{{name}}`, `{{email}}`, and `{{unsubscribeLink}}` variables)
- **Excel Processor:** `xlsx` (SheetJS) with zero-disk, pure in-memory parsing
- **Security:** JWT Authentication, bcrypt password hashing, CORS protection, Rate Limiting

---

## 📂 Detailed Project Structure

```text
Desire-Mail-Marketing-Excel/
├── README.md                          # Comprehensive system documentation
├── architecture.md                     # Technical system architecture & sequence diagrams
├── docker-compose.yml                  # Local development containers
├── vercel.json                         # Root Vercel deployment routing
├── backend/
│   ├── .env                            # Backend environment variables
│   ├── .funcignore                     # Azure Functions deployment ignore rules
│   ├── host.json                       # Azure Functions host configuration
│   ├── local.settings.json             # Azure Functions local settings
│   ├── package.json                    # Backend dependencies & scripts
│   ├── vercel.json                     # Backend Vercel serverless configuration
│   ├── CampaignSchedulerTrigger/       # Azure Timer Trigger Function
│   │   ├── function.json               # Timer trigger schedule (cron: 0 */5 * * * *)
│   │   └── index.js                    # Azure timer trigger script
│   ├── prisma/
│   │   ├── schema.prisma               # Prisma PostgreSQL database models
│   │   └── seed.js                     # Admin account database seeder
│   └── src/
│       ├── auth.js                     # JWT token generation & authentication middleware
│       ├── email.js                    # Email Engine (Microsoft Graph API + Azure ACS)
│       ├── index.js                    # Core Express server, API routes & background worker
│       ├── prisma.js                   # Prisma Client instance initialization
│       └── templates-service.js        # Handlebars template rendering & caching engine
└── frontend/
    ├── package.json                    # Frontend dependencies
    ├── tailwind.config.js              # Custom Tailwind CSS styling tokens
    ├── vite.config.ts                  # Vite build engine configuration
    └── src/
        ├── App.tsx                     # Main App component & React Router setup
        ├── main.tsx                    # React entrypoint
        ├── index.css                   # Custom global CSS styles & dark design tokens
        ├── api/                        # Axios API helpers
        │   ├── axios.ts                # Axios instance with auth interceptors
        │   ├── template.api.ts         # Template CRUD API client
        │   └── upload.api.ts           # Uploads & Contacts API client
        ├── components/                 # Reusable UI components
        │   ├── Header.tsx              # Application header & user menu
        │   ├── PageLoader.tsx          # Full-page loading spinner
        │   ├── ReportTable.tsx         # TanStack paginated contacts table
        │   ├── Sidebar.tsx             # Navigation sidebar menu
        │   ├── StatusBadge.tsx         # Color-coded delivery & validation status badges
        │   ├── StatsCard.tsx           # Dashboard analytical summary card
        │   └── TemplateEditor.tsx      # Split-screen HTML & Preview template editor
        ├── pages/                      # Application route pages
        │   ├── Login.tsx               # Admin authentication page
        │   ├── Dashboard.tsx           # Dashboard metrics & quick actions
        │   ├── Uploads.tsx             # Excel file upload & campaign history
        │   ├── UploadDetails.tsx       # Campaign details, contacts list & send triggers
        │   ├── Templates.tsx           # Email template management grid
        │   ├── CreateTemplate.tsx      # Template builder & test email sender
        │   ├── DeliveryLogs.tsx        # Comprehensive searchable email delivery logs
        │   └── Unsubscribe.tsx         # Public subscriber opt-out page
        └── types/                      # TypeScript interfaces & type definitions
```

---

## ⚡ How the Project Works (Workflow & Data Pipeline)

### 1. Excel Upload & Validation Pipeline
- **Upload:** Admin uploads a `.xlsx` spreadsheet on the `/uploads` page.
- **Parsing:** Backend parses the file completely in memory using `xlsx`. Column headers are normalized to lowercase (`name`, `email`).
- **Validation Engine:**
  - **Empty Check:** Missing emails are flagged as `invalid` (`Email is empty`).
  - **Regex Check:** Email format checked via `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
  - **Duplicate Check:** Duplicate emails within the same file are marked as `duplicate`.
  - **Unsubscribe Check:** Queries the `unsubscribed` database table. Opted-out emails are flagged as `unsubscribed`.
- **Database Insertion:** Valid, invalid, duplicate, and unsubscribed records are bulk-inserted into the `contacts` table under the created `upload` record in Supabase.

### 2. Template Creation & Dynamic Merge
- Admin creates email templates using Handlebars syntax.
- Available merge variables: `{{name}}`, `{{email}}`, and `{{unsubscribeLink}}`.
- The backend automatically injects a cryptographically signed SHA-256 opt-out URL for each recipient.

### 3. Campaign Dispatch & Email Engine
- **Send Initiation:** Clicking **Send Email Template** marks campaign status as `processing` and contacts as `pending`.
- **In-Process Background Processor:** An asynchronous worker in `backend/src/index.js` loops through pending contacts.
- **Dual Email Delivery Engine (`backend/src/email.js`):**
  1. **Primary:** Tries sending via **Azure Communication Services** (Port 443 HTTPS REST API).
  2. **Secondary/Fallback:** If ACS is not configured, uses **Nodemailer SMTP** (AWS SES / Office365 with automatic fallback).
- **Auto-Recovery:** An automated 10-second worker loop automatically resumes any pending campaigns in case of server restarts.

### 4. Scheduled Campaigns & Azure Integration
- Admin can schedule campaigns for a future date/time (`scheduledAt`).
- Status is set to `scheduled`.
- **Production Trigger:** The Azure Timer Function (`CampaignSchedulerTrigger`) fires every 5 minutes (`0 */5 * * * *`), calling `GET /api/cron/check-scheduler`.
- The backend checks Supabase for due campaigns (`scheduledAt <= NOW()`), converts them to `processing`, and dispatches emails.

---

## 📋 Comprehensive API Endpoints Reference

### Authentication
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/auth/login` | No | Authenticates admin user and returns JWT token |
| `GET` | `/api/auth/me` | Yes | Returns current authenticated admin profile |

### Uploads & Campaign Management
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/uploads/excel` | Yes | Uploads `.xlsx` file, runs validation, creates campaign |
| `GET` | `/api/uploads` | Yes | Returns list of all upload campaigns sorted by date |
| `GET` | `/api/uploads/:id` | Yes | Fetches single upload details with template info |
| `GET` | `/api/uploads/:id/contacts` | Yes | Returns paginated contacts for a campaign |
| `GET` | `/api/uploads/:id/stats` | Yes | Lightweight polling endpoint for delivery counters |
| `PUT` | `/api/uploads/:id` | Yes | Updates campaign label or file name |
| `DELETE` | `/api/uploads/:id` | Yes | Permanently deletes campaign and all associated contacts |
| `POST` | `/api/uploads/:id/send` | Yes | Initiates campaign email delivery |
| `POST` | `/api/uploads/:id/schedule` | Yes | Schedules campaign for future delivery date |
| `POST` | `/api/uploads/:id/unschedule` | Yes | Cancels campaign schedule and returns to idle |
| `POST` | `/api/uploads/:id/finalize` | Yes | Recounts statistics and marks campaign complete |

### Contacts Management
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/contacts/logs` | Yes | Searchable, paginated email delivery logs |
| `PUT` | `/api/contacts/:id` | Yes | Updates contact details and recalibrates upload stats |
| `DELETE` | `/api/contacts/:id` | Yes | Deletes contact and recalibrates upload stats |

### Templates CRUD
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/templates` | Yes | Fetches all saved email templates |
| `GET` | `/api/templates/:id` | Yes | Fetches template details by ID |
| `POST` | `/api/templates` | Yes | Creates a new email template |
| `PUT` | `/api/templates/:id` | Yes | Updates existing template name, subject, or HTML |
| `DELETE` | `/api/templates/:id` | Yes | Deletes a template from Supabase |
| `POST` | `/api/templates/:id/test` | Yes | Dispatches a instant test email to preview template |

### Unsubscribe (Public)
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/unsubscribe/:token` | No | Validates unsubscribe token |
| `POST` | `/api/unsubscribe/:token` | No | Adds recipient to unsubscribed list and flags contacts |

### Cron & Health Check
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | No | Health check endpoint for database status |
| `GET` | `/api/cron/check-scheduler` | Secret Bearer | Azure Timer trigger endpoint to process due campaigns |

---

## 🛠️ Local Development Setup

### 1. Prerequisites
- **Node.js:** v18 or v20+
- **Database:** Supabase PostgreSQL instance

### 2. Backend Setup
```powershell
cd backend

# Install dependencies
npm install

# Generate Prisma client bindings
npm run prisma:generate

# Start backend development server
npm start
```
> The Express API server will listen on `http://localhost:7071`.

### 3. Frontend Setup
```powershell
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
> Open `http://localhost:5173` in your browser.

### 4. Default Credentials
- **Email:** `admin@vuf.org`
- **Password:** `admin123`

---

## 📄 License

Private Project — Desire Mail Marketing System.

jashpal bhai 

Password: ywhpqghqmzzznddc
Password name: Desire Mail