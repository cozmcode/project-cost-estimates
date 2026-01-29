# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FSE Deployment Cost Calculator — a secure, authentication-gated web application for calculating Field Service Engineer deployment costs for international assignments. Built for The Cozm as a client tool for Wärtsilä.

**Live URL**: https://cozmcode.github.io/project-cost-estimates

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript (no build step, no bundler)
- **Styling**: Tailwind CSS (CDN) + custom CSS (`css/app.css`)
- **Authentication**: Supabase Auth with OTP-only login (8-digit codes)
- **Database**: Supabase PostgreSQL with Row Level Security
- **Hosting**: GitHub Pages (auto-deploys from `main` branch)
- **Voice**: OpenAI Realtime API (WebRTC) via Supabase Edge Functions
- **Exchange Rates**: Frankfurter API (ECB data)

## Local Development

```bash
python3 -m http.server 8000
open "http://localhost:8000/app.html?dev=true"
```

`?dev=true` bypasses authentication on localhost only — sets you as superuser with full access.

No build step, no linting, no test runner. Testing is manual via the browser.

## Architecture

### Page Flow
- `index.html` → Login/signup with email OTP
- `app.html` → Main application (calculator, staffing, screening, analytics tabs) — requires approved user
- `admin.html` → User management panel (superusers only)

### JavaScript Modules

| File | Lines | Purpose |
|------|-------|---------|
| `js/app-logic.js` | ~2,700 | Core calculator logic, country configs, tax calculations, UI orchestration for all tabs |
| `js/voice-commands.js` | ~2,500 | OpenAI Realtime API voice assistant — WebRTC connection, function calling, voice-activated form filling |
| `js/staffing-engine.js` | ~200 | Resource optimisation engine — candidate scoring by speed/cost/compliance weights |
| `js/view-screening.js` | ~340 | Screening tab — move classification (business trip vs assignment) |
| `js/view-staffing.js` | ~210 | Staffing tab UI — renders optimisation results |
| `js/view-analytics.js` | ~160 | Analytics tab — roster overview, cost trends, world map |
| `js/auth.js` | ~480 | `AuthManager` class — OTP flow and session management |
| `js/admin.js` | ~270 | `AdminManager` class — user approval/revocation |
| `js/supabase-config.js` | ~80 | Supabase client init, pre-approved user lists |
| `js/mock-data.js` | ~300 | Mock employee roster, visa rules, flight costs for staffing engine |
| `js/tax-rules.json` | — | Country-specific progressive tax brackets |
| `data/per-diem-data.js` | — | Per diem rates by country (Finnish Tax Admin source) |

### Supabase Edge Functions

| Function | Purpose |
|----------|---------|
| `realtime-token/` | Generates ephemeral tokens for OpenAI Realtime API (gpt-realtime-mini, Nova voice) |
| `tts/` | Proxies TTS requests to OpenAI (keeps API key server-side) |
| `calculate-tax/` | Server-side tax calculation |
| `screen-move/` | Move screening classification |
| `analyze-sentiment/` | Sentiment analysis for feedback tracking |

### Key Data Flow

1. **Calculator**: User fills form → `app-logic.js` fetches exchange rate from Frankfurter API → applies progressive tax brackets from `tax-rules.json` → renders results with Chart.js donut chart
2. **Staffing**: User sets demand + weight sliders → `staffing-engine.js` filters mock roster by role → scores candidates on speed (visa days), cost (salary + flight), compliance (risk rules) → returns ranked list
3. **Voice**: User clicks mic → `voice-commands.js` requests ephemeral token from Edge Function → opens WebRTC connection to OpenAI → voice commands trigger function calls that fill forms and navigate tabs

### Authentication Flow
1. User enters email → OTP sent via Supabase
2. User verifies 8-digit code
3. `app_users` table checked/created with approval status
4. Pre-approved emails (all `@thecozm.com`) bypass approval queue
5. Superuser: `benjamin@thecozm.com` (has admin panel access)

### Database Schema
`app_users` table with RLS policies:
- `id` (UUID) → References auth.users
- `email` (TEXT), `role` (TEXT: 'user'|'superuser'), `approved` (BOOLEAN)

## Git Branches

| Branch | Status | Purpose |
|--------|--------|---------|
| `main` | Production | Stable, auto-deploys to GitHub Pages |
| `staffing-spec-alignment` | Active development | Voice commands, async visa API, carbon footprint |

Feature branches `feature/voice-commands` and `feature/staffing-engine-v2` are superseded.

## CRITICAL: Voice Button Protection

**NEVER remove or replace the Voice button in `app.html`.** This has been accidentally removed multiple times during edits.

The Voice button MUST exist in TWO locations:
1. **Desktop**: `id="voiceBtn"` with `onclick="toggleVoice()"`
2. **Mobile**: `id="voiceBtnMobile"` with `onclick="toggleVoice()"`

**Pre-commit check:**
```bash
grep -n "voiceBtn\|voiceBtnMobile" app.html
```

If either is missing after an edit, the voice functionality has been broken.

## Tax & Calculation Rules

**No simplifications allowed.** This calculator must apply granular, accurate tax rules:

- Always use progressive tax brackets — never flat-rate shortcuts
- Non-resident taxation uses actual brackets (e.g., UK non-residents: 20%/40%/45%, not a blanket 20%)
- Every rate must link to an official government source (`taxSource` and `taxSourceUrl` fields in `tax-rules.json`)
- Brazil INSS: 35% combined (employer 27.5% + employee 7.5%)
- Brazil tax: 25% flat for non-residents
- Finland–Brazil: No social security treaty — dual contributions required

## UI Components

### Results Layout
Two-column layout: left (60%) for assignment summary + expandable breakdown groups, right (40%) for total cost + Chart.js donut chart. Stacks vertically below 1024px.

### Key CSS Classes
| Class | Purpose |
|-------|---------|
| `.hero-total-card` | Main total display with teal gradient |
| `.cost-breakdown-bar` | Stacked bar visualisation |
| `.accordion-section` | Collapsible detail container |
| `.info-box` / `.warning-box` | Informational / warning callouts |
| `.breakdown-group` | Expandable cost category card (`.expanded` state) |

### Tooltips
```html
<label class="form-label">
  Label Text
  <span class="tooltip-wrapper">
    <span class="help-icon">i</span>
    <span class="tooltip-content">Help text on hover</span>
  </span>
</label>
```

## Brand Colours

| Colour | Hex | CSS Variable |
|--------|-----|--------------|
| Teal | `#44919c` | `--cozm-teal` |
| Light Teal | `#C7E5E9` | `--cozm-light-teal` |
| Red | `#BD4040` | `--cozm-red` |
| Gold | `#BD8941` | `--cozm-gold` |

## Language & Style

- British English throughout (organisation, authorise, colour)
- Date format: UK style "1 January 2025"
- Company name: **"The Cozm"** (never "Cozm" alone)
- 4-space indentation

## Important Rules

- **Do not add UI elements or features without explicit user approval** — always check before adding buttons, controls, or functionality not specifically requested
- When fixing bugs, make minimal changes — avoid adding "improvements" beyond what was asked

## Testing

Standard test case: Finland → Brazil, €7,000/month, 6 months, 22 working days/month. Expected total ~€36,362 (tax ~€10,500 + INSS ~€14,700 + per diem €8,712 + admin ~€2,450).

```bash
python3 -m http.server 8000 & sleep 1 && open "http://localhost:8000/app.html?dev=true"
```

See `TESTING_GUIDE.md` for detailed scenarios and `TROUBLESHOOTING.md` for common issues.
