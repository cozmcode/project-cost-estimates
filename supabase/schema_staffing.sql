-- Create table for storing employee profiles
create table employees (
  id uuid default uuid_generate_v4() primary key,
  first_name text not null,
  last_name text not null,
  nationality text not null, -- ISO country code or name
  role text not null,
  current_location text not null, -- ISO country code or name
  base_salary_eur numeric not null,
  skills text[], -- Array of strings e.g. ['Electrical', 'Safety Certified']
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create table for storing visa rules (knowledge base)
create table visa_rules (
  id uuid default uuid_generate_v4() primary key,
  origin_country text not null,
  destination_country text not null,
  visa_required boolean not null,
  processing_time_days integer not null, -- 0 means no visa/instant
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(origin_country, destination_country)
);

-- Create table for storing projects (demand)
create table projects (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  destination_country text not null,
  start_date date not null,
  duration_months integer not null,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table employees enable row level security;
alter table visa_rules enable row level security;
alter table projects enable row level security;

-- Policies (Open read for authenticated users for demo purposes)
create policy "Authenticated users can read employees" on employees for select using (auth.role() = 'authenticated');
create policy "Authenticated users can read visa_rules" on visa_rules for select using (auth.role() = 'authenticated');
create policy "Authenticated users can read projects" on projects for select using (auth.role() = 'authenticated');

-- Allow authenticated users to insert (for uploads)
create policy "Authenticated users can insert employees" on employees for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can insert projects" on projects for insert with check (auth.role() = 'authenticated');
