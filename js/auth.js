// Authentication Module for FSE Cost Calculator
// Handles login, signup, email verification, and 2FA

class AuthManager {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.currentStep = 'email'; // email, verify, password, 2fa, pending
    }

    async init() {
        this.supabase = window.SupabaseConfig.init();
        if (!this.supabase) {
            this.showError('Failed to initialise authentication. Please refresh the page.');
            return false;
        }

        // Set up auth state change listener for session refresh
        this.supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);
            if (event === 'SIGNED_OUT') {
                this.currentUser = null;
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                this.currentUser = session?.user || null;
            }
        });

        // Check for existing session
        const { data: { session }, error } = await this.supabase.auth.getSession();

        if (error) {
            console.error('Session check error:', error);
            return false;
        }

        if (session) {
            this.currentUser = session.user;
            return await this.checkUserAccess();
        }

        return false;
    }

    // Check if user has access (is approved)
    async checkUserAccess() {
        if (!this.currentUser) return false;

        try {
            const { data: appUser, error } = await this.supabase
                .from('app_users')
                .select('*')
                .eq('id', this.currentUser.id)
                .single();

            if (error && error.code === 'PGRST116') {
                // User not in app_users table, create entry
                await this.createAppUser();
                return this.checkUserAccess();
            }

            if (error) throw error;

            if (appUser.approved) {
                // User is approved, redirect to app
                window.location.href = 'app.html';
                return true;
            } else {
                // User is pending approval
                this.showPendingApproval();
                return false;
            }
        } catch (err) {
            console.error('Error checking user access:', err);
            return false;
        }
    }

    // Create or update app_users entry for user
    async createAppUser() {
        const email = this.currentUser.email.toLowerCase();
        const isPreApproved = window.SupabaseConfig.isPreApproved(email);
        const isSuperuser = window.SupabaseConfig.isSuperuser(email);

        try {
            // First check if user exists by email (in case auth ID changed)
            const { data: existingUser } = await this.supabase
                .from('app_users')
                .select('id')
                .eq('email', email)
                .single();

            if (existingUser && existingUser.id !== this.currentUser.id) {
                // User exists with different ID - update the ID to match new auth user
                await this.supabase
                    .from('app_users')
                    .update({ id: this.currentUser.id })
                    .eq('email', email);
            } else if (!existingUser) {
                // New user - insert
                await this.supabase.from('app_users').insert({
                    id: this.currentUser.id,
                    email: email,
                    role: isSuperuser ? 'superuser' : 'user',
                    approved: isPreApproved
                });
            }
            // If user exists with same ID, nothing to do
        } catch (err) {
            console.error('Error creating/updating app user:', err);
        }
    }

    // Step 1: Enter email - always send OTP (no passwords)
    async submitEmail(email) {
        email = email.toLowerCase().trim();

        if (!this.validateEmail(email)) {
            this.showError('Please enter a valid email address.');
            return;
        }

        this.showLoading(true);

        try {
            // Always send OTP - works for both new and existing users
            const { error } = await this.supabase.auth.signInWithOtp({
                email: email,
                options: {
                    shouldCreateUser: true
                }
            });

            if (error) throw error;

            this.pendingEmail = email;
            this.showStep('verify');
            this.showSuccess('Sign-in code sent to ' + email);
        } catch (err) {
            this.showError(err.message || 'Failed to send sign-in code. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    // Step 2: Verify OTP code
    async verifyOtp(code) {
        if (!code || code.length !== 8) {
            this.showError('Please enter the 8-digit verification code.');
            return;
        }

        this.showLoading(true);

        try {
            const { data, error } = await this.supabase.auth.verifyOtp({
                email: this.pendingEmail,
                token: code,
                type: 'email'
            });

            if (error) throw error;

            this.currentUser = data.user;

            // Check if this is a new user who needs to set password
            // For OTP-verified users, we'll create their app_users entry
            await this.createAppUser();

            // Check access (will redirect if approved)
            const hasAccess = await this.checkUserAccess();

            if (!hasAccess) {
                this.showPendingApproval();
            }
        } catch (err) {
            this.showError(err.message || 'Invalid verification code. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    // Login with email and password
    async login(email, password) {
        email = email.toLowerCase().trim();

        if (!email || !password) {
            this.showError('Please enter your email and password.');
            return;
        }

        this.showLoading(true);

        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            this.currentUser = data.user;
            this.pendingEmail = email;

            // Send 2FA code
            await this.send2FACode();
            this.showStep('2fa');
        } catch (err) {
            this.showError(err.message || 'Invalid email or password.');
        } finally {
            this.showLoading(false);
        }
    }

    // Send 2FA code via email
    async send2FACode() {
        try {
            // Sign out first to send a new OTP
            await this.supabase.auth.signOut();

            const { error } = await this.supabase.auth.signInWithOtp({
                email: this.pendingEmail
            });

            if (error) throw error;

            this.showSuccess('2FA code sent to ' + this.pendingEmail);
        } catch (err) {
            console.error('Error sending 2FA:', err);
            this.showError('Failed to send 2FA code. Please try again.');
        }
    }

    // Verify 2FA code
    async verify2FA(code) {
        if (!code || code.length !== 8) {
            this.showError('Please enter the 8-digit code.');
            return;
        }

        this.showLoading(true);

        try {
            const { data, error } = await this.supabase.auth.verifyOtp({
                email: this.pendingEmail,
                token: code,
                type: 'email'
            });

            if (error) throw error;

            this.currentUser = data.user;
            await this.checkUserAccess();
        } catch (err) {
            this.showError(err.message || 'Invalid 2FA code. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    // Sign out
    async signOut() {
        try {
            await this.supabase.auth.signOut();
            this.currentUser = null;
            window.location.href = 'index.html';
        } catch (err) {
            console.error('Error signing out:', err);
        }
    }

    // Show pending approval screen
    showPendingApproval() {
        this.showStep('pending');
    }

    // Helper: Validate email
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Helper: Show/hide loading state
    showLoading(show) {
        const buttons = document.querySelectorAll('.btn-primary');
        buttons.forEach(btn => {
            if (show) {
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner"></span>';
            } else {
                btn.disabled = false;
                // Restore original text based on step
                if (this.currentStep === 'email') {
                    btn.textContent = 'Continue';
                } else if (this.currentStep === 'verify' || this.currentStep === '2fa') {
                    btn.textContent = 'Verify Code';
                } else if (this.currentStep === 'login') {
                    btn.textContent = 'Sign In';
                }
            }
        });
    }

    // Helper: Show error message
    showError(message) {
        this.showMessage(message, 'error');
    }

    // Helper: Show success message
    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    // Helper: Show message
    showMessage(message, type) {
        const container = document.getElementById('message-container');
        if (!container) return;

        container.innerHTML = `
            <div class="status-message ${type}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    ${type === 'success'
                        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>'
                        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>'}
                </svg>
                <span>${message}</span>
            </div>
        `;

        // Auto-hide after 5 seconds
        setTimeout(() => {
            container.innerHTML = '';
        }, 5000);
    }

    // Helper: Show step
    showStep(step) {
        this.currentStep = step;
        const steps = ['email', 'verify', 'login', '2fa', 'pending'];

        steps.forEach(s => {
            const el = document.getElementById(`step-${s}`);
            if (el) {
                el.classList.toggle('hidden', s !== step);
            }
        });
    }
}

// Initialise on page load
let authManager;

document.addEventListener('DOMContentLoaded', async () => {
    authManager = new AuthManager();
    await authManager.init();
});

// Global functions for form handlers
function submitEmail() {
    const email = document.getElementById('email-input').value;
    authManager.submitEmail(email);
}

function verifyCode() {
    const inputs = document.querySelectorAll('.otp-input');
    let code = '';
    inputs.forEach(input => code += input.value);

    if (authManager.currentStep === 'verify') {
        authManager.verifyOtp(code);
    } else if (authManager.currentStep === '2fa') {
        authManager.verify2FA(code);
    }
}

function loginSubmit() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    authManager.login(email, password);
}

function switchToSignup() {
    authManager.showStep('email');
}

function switchToLogin() {
    authManager.showStep('login');
}

function resendCode() {
    if (authManager.currentStep === '2fa') {
        authManager.send2FACode();
    } else {
        authManager.submitEmail(authManager.pendingEmail);
    }
}

function signOut() {
    authManager.signOut();
}

// OTP input auto-focus
function setupOtpInputs() {
    const inputs = document.querySelectorAll('.otp-input');
    inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                inputs[index - 1].focus();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            const digits = paste.replace(/\D/g, '').slice(0, 8);
            digits.split('').forEach((digit, i) => {
                if (inputs[i]) {
                    inputs[i].value = digit;
                }
            });
            if (digits.length === 8) {
                verifyCode();
            }
        });
    });
}
