# FSE Deployment Cost Calculator

A secure, authentication-gated cost estimation tool for Field Service Engineer (FSE) deployments.

**Live URL**: [cozmcode.github.io/project-cost-estimates](https://cozmcode.github.io/project-cost-estimates)

## Features

- **Cost Calculator**: Calculate deployment costs for single FSEs or bulk uploads
- **Project Staffing**: Analyse staffing options and recommendations
- **Secure Access**: Authentication with email verification and 2FA
- **User Management**: Admin panel for superusers to approve/manage users

## Authentication

- Email verification on signup
- Email-based 2FA on each login
- Pre-approved users bypass approval queue
- Superuser panel for user management

### Pre-approved Users
- benjamin@thecozm.com (Superuser)
- graham@thecozm.com
- harish@thecozm.com

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Authentication**: Supabase Auth
- **Database**: Supabase PostgreSQL
- **Hosting**: GitHub Pages

## Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Update `js/supabase-config.js` with your project URL and anon key
3. Run the following SQL in Supabase SQL Editor:

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

-- Policy: Users can read their own record
CREATE POLICY "Users can read own record" ON app_users
    FOR SELECT USING (auth.uid() = id);

-- Policy: Superusers can read all records
CREATE POLICY "Superusers can read all" ON app_users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'superuser'
        )
    );

-- Policy: Superusers can update all records
CREATE POLICY "Superusers can update all" ON app_users
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'superuser'
        )
    );

-- Policy: Superusers can delete records
CREATE POLICY "Superusers can delete" ON app_users
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'superuser'
        )
    );

-- Policy: Allow insert for authenticated users (for self-registration)
CREATE POLICY "Authenticated users can insert own record" ON app_users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Insert pre-approved users (run after first user signs up)
-- INSERT INTO app_users (email, role, approved) VALUES
--   ('benjamin@thecozm.com', 'superuser', true),
--   ('graham@thecozm.com', 'user', true),
--   ('harish@thecozm.com', 'user', true);
```

4. Configure Authentication:
   - Go to Authentication > Providers > Email
   - Enable email provider
   - Configure email templates for verification

## Local Development

Simply open `index.html` in a browser or use a local server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx serve
```

## Deployment

This project is deployed via GitHub Pages. Any push to the `main` branch automatically updates the live site.

---

Powered by The Cozm
