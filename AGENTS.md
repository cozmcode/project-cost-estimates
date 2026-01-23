# AGENTS.md

This file provides context for AI agents working on this project.

## Project Overview

**FSE Deployment Cost Calculator** - A secure, authentication-gated web application for calculating Field Service Engineer (FSE) deployment costs for international assignments. Built by The Cozm as a client tool for Wärtsilä.

**Live URL**: https://cozmcode.github.io/project-cost-estimates

---

## Quick Start for Testing

### Option 1: Dev Mode (Recommended for Development)

The app has a built-in **dev mode** that bypasses authentication on localhost:

```bash
# Start local server
python3 -m http.server 8000

# Open app with dev mode enabled
open "http://localhost:8000/app.html?dev=true"
```

**Important**: The `?dev=true` parameter:
- Only works on `localhost` or `127.0.0.1` (security measure)
- Skips all Supabase authentication checks
- Sets you as a superuser for full access
- Shows "🔧 DEV MODE" in browser console

This is the easiest way to test the calculator without any authentication setup.

### Option 2: Test with Authentication

The app uses Supabase for authentication. The project is already configured with a live Supabase instance:

| Setting | Value |
|---------|-------|
| Supabase URL | `https://cwflqdfytvniozxcreiq.supabase.co` |
| Project | Already configured in `js/supabase-config.js` |

**Pre-approved test emails** (get auto-approved on login):
- Any `@thecozm.com` email address

To test login:
1. Start local server: `python3 -m http.server 8000`
2. Open http://localhost:8000
3. Enter a pre-approved email
4. Check email for 8-digit OTP code
5. Enter code to access the app

### Option 3: Manual localStorage (Fallback)

If dev mode doesn't work, add this to the browser console:

```javascript
// Simulate authenticated state
localStorage.setItem('fse-cost-calc-auth', JSON.stringify({
  access_token: 'test-token',
  user: { email: 'test@example.com' }
}));
location.reload();
```

---

## File Structure

```
project-cost-estimates/
├── index.html          # Login/signup page
├── app.html            # Main calculator (requires auth)
├── admin.html          # User management (superusers only)
├── css/
│   └── app.css         # All styles (brand colours, components)
├── js/
│   ├── supabase-config.js  # Supabase client & pre-approved users
│   ├── auth.js             # AuthManager class (OTP flow)
│   ├── admin.js            # AdminManager class (user approval)
│   ├── app-logic.js        # Calculator logic, UI, staffing engine
│   └── tax-rules.json      # Country tax brackets (if used)
├── data/
│   └── country-data.js     # Per diem rates, country configs
└── assets/
    └── cozm-logo.svg       # Brand logo
```

---

## Business Context

Wärtsilä deploys Field Service Engineers from Finland to various countries (primarily Brazil) for marine and energy equipment servicing. This calculator helps estimate the true cost of these international deployments, including:

- **Host country income tax** (company-paid under tax equalisation policy)
- **Social security contributions** (both home and host country where no treaty exists)
- **Per diem allowances** (Finnish Tax Administration rates)
- **Administrative fees** (visa, work permits, tax filings, service provider coordination)

### Key Policy Points

1. **Tax Equalisation**: Wärtsilä covers host country tax so engineers pay no more than home country rates
2. **Social Security Equalisation**: Company covers host country social security contributions
3. **No Totalization Agreements**: Finland has NO social security treaty with Brazil, meaning dual INSS contributions are required

---

## Reference Materials

The following files in this folder inform the calculator logic:

| File | Purpose |
|------|---------|
| `Cozm cost calculation example GW commentary.xlsx` | Excel model with Greg Wilson's commentary on tax/social security calculations |
| `RE_ Question about FSE to Brazil.pdf` | Email from Wärtsilä confirming mobility policy (pay host tax + social security) |

### Key Findings from Reference Materials

1. **Brazil Tax Rate**: 25% flat rate for non-residents (correct in app)
2. **Brazil INSS**: ~35% combined (employer ~27.5% + employee ~7.5%) - **must be included**
3. **Per Diem**: €66/day for Brazil (Finnish Tax Admin 2025 rates)
4. **Admin Fees**: Pro-rated by assignment length, not annualised

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Vanilla HTML, CSS, JavaScript (no build step) |
| Styling | Tailwind CSS (CDN) + custom CSS |
| Authentication | Supabase Auth with OTP-only login (8-digit codes) |
| Database | Supabase PostgreSQL with Row Level Security |
| Hosting | GitHub Pages (auto-deploys from `main` branch) |
| Exchange Rates | ECB via Frankfurter API (refreshed every 24h) |

---

## Architecture

### Page Flow

```
index.html (Login/Signup)
    ↓
[OTP Verification]
    ↓
app.html (Main Calculator) ← Requires approved user
    ↓
admin.html (User Management) ← Superusers only
```

### Key JavaScript Files

| File | Purpose |
|------|---------|
| `js/supabase-config.js` | Supabase client init, pre-approved user lists |
| `js/auth.js` | `AuthManager` class for OTP flow and session management |
| `js/admin.js` | `AdminManager` class for user approval/revocation |
| `js/app-logic.js` | Core calculation logic, staffing optimisation, UI interactions |
| `js/tax-rules.json` | Country-specific tax brackets and rules |

### Database Schema

The `app_users` table in Supabase:
- `id` (UUID) → References auth.users
- `email` (TEXT) → User email
- `role` (TEXT) → 'user' or 'superuser'
- `approved` (BOOLEAN) → Access gate

---

## Supabase Configuration

The project uses an existing Supabase instance. **You do NOT need to set up a new one.**

### Existing Configuration

Located in `js/supabase-config.js`:
- **URL**: `https://cwflqdfytvniozxcreiq.supabase.co`
- **Anon Key**: Already configured
- **Storage Key**: `fse-cost-calc-auth`

### Pre-Approved Users

Defined in `js/supabase-config.js` → `PRE_APPROVED_EMAILS` array:
- All `@thecozm.com` team emails are pre-approved
- Superuser: `benjamin@thecozm.com` (has admin access)

### Database SQL (Reference Only)

If you ever need to recreate the database, here's the schema:

```sql
-- Create app_users table
CREATE TABLE app_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superuser')),
    approved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Policies for access control
CREATE POLICY "Users can read own record" ON app_users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Superusers can read all" ON app_users
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'superuser')
    );

CREATE POLICY "Superusers can update all" ON app_users
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'superuser')
    );

CREATE POLICY "Authenticated users can insert own record" ON app_users
    FOR INSERT WITH CHECK (auth.uid() = id);
```

---

## Git & Deployment Workflow

1. All changes pushed to `main` branch
2. GitHub Pages automatically deploys from `main`
3. Live site updates within 1-2 minutes

```bash
# Typical workflow
git add .
git commit -m "Description of changes"
git push origin main
```

---

## Country Configuration

Key configuration in `js/app-logic.js`:

```javascript
const countryConfig = {
    Brazil: {
        taxRate: 0.25,           // 25% non-resident flat rate
        socialSec: 0.35,         // 35% INSS (employer + employee)
        noTreatyWarning: true,   // Shows warning banner
        // ... other fields
    },
    // ... other countries
};
```

---

## Testing Scenarios

### Standard Test Case

Use this to verify the calculator works correctly:

| Field | Value |
|-------|-------|
| Route | Finland → Brazil |
| Duration | 6 months |
| Monthly Salary | €7,000 |
| Working Days/Month | 22 |

### Expected Results (Approximate)

| Component | Amount |
|-----------|--------|
| Gross salary | €42,000 |
| Tax (25% non-resident) | ~€10,500 |
| Social security (35% INSS) | ~€14,700 |
| Per diem (€66 × 132 days) | €8,712 |
| Admin fees (pro-rated) | ~€2,450 |
| **Total** | ~€36,362 |

### How to Run a Test

1. Start server: `python3 -m http.server 8000`
2. Open http://localhost:8000/app.html?dev=true (dev mode bypasses auth)
3. Fill in the form with test values above
4. Click "Generate Estimate"
5. Verify numbers match expected results

**Quick test command:**
```bash
python3 -m http.server 8000 & sleep 1 && open "http://localhost:8000/app.html?dev=true"
```

---

## UI Components

### Results View (Redesigned Jan 2025)

The results section uses:

1. **Alert Banner** - Warning for no-treaty situations (gold/amber)
2. **Hero Total Card** - Teal gradient with total cost and daily rate
3. **Stacked Bar** - Visual breakdown of cost proportions
4. **Component Cards** - 4 cards for Tax, Social Security, Per Diem, Admin
5. **Accordion Sections** - Collapsible detail views:
   - Income & Per Diem Breakdown
   - Tax Calculation Details (with info box)
   - Social Security Details (with warning box if no treaty)
   - Exchange Rate & Sources

### Key CSS Classes

| Class | Purpose |
|-------|---------|
| `.hero-total-card` | Main total display with gradient |
| `.cost-breakdown-bar` | Stacked bar visualisation |
| `.accordion-section` | Collapsible detail container |
| `.info-box` | Light teal informational box |
| `.warning-box` | Gold-bordered warning box |
| `.workings-table` | Zebra-striped data table |

---

## Brand Guidelines

| Colour | Hex | CSS Variable | Usage |
|--------|-----|--------------|-------|
| Teal | `#44919c` | `--cozm-teal` | Primary brand, headings, links |
| Light Teal | `#C7E5E9` | `--cozm-light-teal` | Backgrounds, info boxes |
| Red | `#BD4040` | `--cozm-red` | Errors, critical alerts |
| Gold | `#BD8941` | `--cozm-gold` | Warnings, highlights |

---

## Language & Style

- British English throughout (organisation, authorise, colour)
- Date format: UK style "1 January 2025"
- Company name: **"The Cozm"** (never "Cozm" alone)

---

## Troubleshooting

### "Supabase library not loaded" Error

The app loads Supabase from CDN. If offline or CDN blocked:
- Check network connectivity
- The CDN URL is in `index.html` and `app.html` head sections

### Authentication Redirect Loop

If stuck on login page:
1. Clear localStorage: `localStorage.clear()`
2. Check browser console for errors
3. Verify Supabase URL is accessible

### Calculations Not Showing

If clicking "Generate Estimate" does nothing:
1. Open browser console (F12 → Console)
2. Look for JavaScript errors
3. Common issues:
   - Missing country data
   - Exchange rate API failed
   - Form validation errors

### Exchange Rate API Issues

The app uses Frankfurter API for EUR/BRL rates. If unavailable:
- Check https://api.frankfurter.app/latest?from=EUR&to=BRL
- Fallback rate is hardcoded in `app-logic.js`
