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

## Language & Style

- British English throughout (organisation, authorise, colour)
- Date format: UK style "1 January 2025"
- Company name: **"The Cozm"** (never "Cozm" alone)
