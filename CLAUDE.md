# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FSE Deployment Cost Calculator - a secure, authentication-gated web application for calculating Field Service Engineer deployment costs. Built for The Cozm as a client tool for Wärtsilä.

**Live URL**: https://cozmcode.github.io/project-cost-estimates

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript (no build step)
- **Authentication**: Supabase Auth with OTP-only login (8-digit codes)
- **Database**: Supabase PostgreSQL with Row Level Security
- **Hosting**: GitHub Pages (auto-deploys from `main` branch)

## Local Development

```bash
python3 -m http.server 8000
# or
npx serve
```

Then open http://localhost:8000

## Architecture

### Page Flow
1. `index.html` → Login/signup with email OTP verification
2. `app.html` → Main calculator (requires approved user)
3. `admin.html` → User management (superusers only)

### JavaScript Modules
- `js/supabase-config.js` → Supabase client init, pre-approved user lists
- `js/auth.js` → `AuthManager` class handling OTP flow and session management
- `js/admin.js` → `AdminManager` class for user approval/revocation

### Authentication Flow
1. User enters email → OTP sent via Supabase
2. User verifies 8-digit code
3. `app_users` table checked/created with approval status
4. Pre-approved emails (defined in `supabase-config.js`) bypass approval queue
5. Unapproved users see "pending approval" screen

### Database Schema
The `app_users` table links to Supabase `auth.users`:
- `id` (UUID) → References auth.users
- `email` (TEXT) → User email
- `role` (TEXT) → 'user' or 'superuser'
- `approved` (BOOLEAN) → Access gate

## Key Configuration

Pre-approved users and superusers are defined in `js/supabase-config.js`:
- `PRE_APPROVED_EMAILS` → Users who get auto-approved on first login
- `SUPERUSER_EMAILS` → Users with admin panel access

## Brand Colours

| Colour | Hex | CSS Variable |
|--------|-----|--------------|
| Teal | `#44919c` | `--cozm-teal` |
| Light Teal | `#C7E5E9` | `--cozm-light-teal` |
| Red | `#BD4040` | `--cozm-red` |
| Gold | `#BD8941` | `--cozm-gold` |

## UI Components

### Tooltips / Help Text
Form labels have help icons (small "i" badges) that show tooltip text on hover. Structure:
```html
<label class="form-label">
  Label Text
  <span class="tooltip-wrapper">
    <span class="help-icon">i</span>
    <span class="tooltip-content">Help text shown on hover</span>
  </span>
</label>
```
- `.tooltip-content` is `display: none` by default
- Shows on `.tooltip-wrapper:hover`
- If tooltips appear inline (not hidden), check CSS is loading properly

### Results Layout
Two-column layout with donut chart:
- Left column (60%): Assignment Summary + expandable breakdown groups
- Right column (40%): Total cost + Chart.js donut chart + legend + action buttons
- Mobile: stacks vertically at <1024px breakpoint

### Expandable Breakdown Groups
Cost categories (Tax, Social Security, Per Diem, Admin Fees) use expandable cards:
- Click header to expand/collapse details
- Uses `toggleBreakdownGroup(groupId)` function
- Styled with `.breakdown-group` and `.expanded` state

## Tax & Calculation Rules

**CRITICAL: No simplifications allowed.** This calculator must apply granular, accurate tax rules:

- **Never use flat rates as shortcuts** - Always apply progressive tax brackets for both residents AND non-residents where applicable
- **Non-resident taxation** - Use actual progressive brackets, not simplified flat rates (e.g., UK non-residents should use 20%/40%/45% brackets, not a blanket 20%)
- **Source all rates** - Every tax rate, social security rate, and per diem must link to an official government source
- **Keep rates current** - Update to latest tax year rates annually (e.g., 2025/26 rates for UK)
- **Document assumptions** - If any estimation is unavoidable, clearly label it in the UI and explain the limitation

### Tax Rules JSON (`js/tax-rules.json`)
Contains progressive tax brackets and non-resident rates for each country. When updating:
1. Verify against official government sources
2. Update the `taxSource` and `taxSourceUrl` fields
3. Test calculations against manual calculations

## Language & Style

- British English throughout (organisation, authorise, colour)
- Date format: UK style "1 January 2025"
- Company name: **"The Cozm"** (never "Cozm" alone)

## Important Rules for Claude

- **Do not add new UI elements or features without explicit user approval** - Always check with the user before adding buttons, controls, or functionality not specifically requested
- When fixing bugs, make minimal changes - avoid adding "improvements" or "enhancements" beyond what was asked
