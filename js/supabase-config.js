// Supabase Configuration
// IMPORTANT: Replace these values with your actual Supabase project credentials

const SUPABASE_URL = 'https://cwflqdfytvniozxcreiq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3ZmxxZGZ5dHZuaW96eGNyZWlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTIwNDcsImV4cCI6MjA4NDU4ODA0N30.WOrnjzEgujqCGu_6Noh94KJsURoK9_g_qNP96P0ezBE';

// Pre-approved users (will be synced to database on first login)
const PRE_APPROVED_EMAILS = [
    // The Cozm team
    'benjamin@thecozm.com',
    'graham@thecozm.com',
    'harish@thecozm.com',
    'umama@thecozm.com',
    'tanya@thecozm.com',
    'raihana@thecozm.com',
    'michiel@thecozm.com',
    'singh@thecozm.com',
    'jen@thecozm.com',
    'paul@thecozm.com',
    'julia@thecozm.com',
    'enoch@thecozm.com',
    'avni@thecozm.com',
    'siobhan@thecozm.com',
    'sayeed@thecozm.com',
    'ise@thecozm.com'
];

// Superuser emails
const SUPERUSER_EMAILS = [
    'benjamin@thecozm.com'
];

// Initialise Supabase client
let supabaseClient;

function initSupabase() {
    if (typeof window !== 'undefined' && window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return supabaseClient;
    }
    console.error('Supabase library not loaded');
    return null;
}

// Check if email is pre-approved
function isPreApproved(email) {
    return PRE_APPROVED_EMAILS.includes(email.toLowerCase());
}

// Check if email is superuser
function isSuperuser(email) {
    return SUPERUSER_EMAILS.includes(email.toLowerCase());
}

// Export for use in other modules
window.SupabaseConfig = {
    init: initSupabase,
    isPreApproved,
    isSuperuser,
    PRE_APPROVED_EMAILS,
    SUPERUSER_EMAILS
};
