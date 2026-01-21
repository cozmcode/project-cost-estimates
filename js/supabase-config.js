// Supabase Configuration
// IMPORTANT: Replace these values with your actual Supabase project credentials

const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // e.g., 'https://xxxxx.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Your anon/public key

// Pre-approved users (will be synced to database on first login)
const PRE_APPROVED_EMAILS = [
    'benjamin@thecozm.com',
    'graham@thecozm.com',
    'harish@thecozm.com'
];

// Superuser emails
const SUPERUSER_EMAILS = [
    'benjamin@thecozm.com'
];

// Initialise Supabase client
let supabase;

function initSupabase() {
    if (typeof window !== 'undefined' && window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return supabase;
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
