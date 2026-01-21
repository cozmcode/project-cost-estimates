// Admin Panel Module for FSE Cost Calculator
// User management for superusers

class AdminManager {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
    }

    async init() {
        this.supabase = window.SupabaseConfig.init();
        if (!this.supabase) {
            this.showError('Failed to initialise. Please refresh the page.');
            return false;
        }

        // Check for existing session
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session) {
            window.location.href = 'index.html';
            return false;
        }

        this.currentUser = session.user;

        // Verify superuser access
        const isSuperuser = await this.checkSuperuserAccess();
        if (!isSuperuser) {
            window.location.href = 'app.html';
            return false;
        }

        this.updateUserDisplay();
        await this.loadUsers();
        return true;
    }

    async checkSuperuserAccess() {
        try {
            const { data: appUser, error } = await this.supabase
                .from('app_users')
                .select('role')
                .eq('id', this.currentUser.id)
                .single();

            if (error) throw error;
            return appUser.role === 'superuser';
        } catch (err) {
            console.error('Error checking superuser:', err);
            return false;
        }
    }

    updateUserDisplay() {
        const emailEl = document.getElementById('user-email');
        const avatarEl = document.getElementById('user-avatar');

        if (emailEl) emailEl.textContent = this.currentUser.email;
        if (avatarEl) avatarEl.textContent = this.currentUser.email.charAt(0).toUpperCase();
    }

    async loadUsers() {
        try {
            const { data: users, error } = await this.supabase
                .from('app_users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.renderPendingUsers(users.filter(u => !u.approved));
            this.renderApprovedUsers(users.filter(u => u.approved));
        } catch (err) {
            console.error('Error loading users:', err);
            this.showError('Failed to load users. Please refresh.');
        }
    }

    renderPendingUsers(users) {
        const tbody = document.getElementById('pending-users-body');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4">
                        <div class="empty-state">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                            </svg>
                            <p>No pending requests</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.email}</td>
                <td><span class="badge badge-warning">Pending</span></td>
                <td>${this.formatDate(user.created_at)}</td>
                <td>
                    <button class="action-btn approve" onclick="adminManager.approveUser('${user.id}')">
                        Approve
                    </button>
                    <button class="action-btn deny" onclick="adminManager.denyUser('${user.id}')">
                        Deny
                    </button>
                </td>
            </tr>
        `).join('');
    }

    renderApprovedUsers(users) {
        const tbody = document.getElementById('approved-users-body');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4">
                        <div class="empty-state">
                            <p>No approved users yet</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.email}</td>
                <td>
                    ${user.role === 'superuser'
                        ? '<span class="badge badge-info">Superuser</span>'
                        : '<span class="badge badge-success">User</span>'}
                </td>
                <td>${this.formatDate(user.created_at)}</td>
                <td>
                    ${user.email !== this.currentUser.email
                        ? `<button class="action-btn deny" onclick="adminManager.revokeAccess('${user.id}')">
                               Revoke
                           </button>`
                        : '<span style="color: var(--grey-600); font-size: 12px;">You</span>'}
                </td>
            </tr>
        `).join('');
    }

    async approveUser(userId) {
        try {
            const { error } = await this.supabase
                .from('app_users')
                .update({ approved: true })
                .eq('id', userId);

            if (error) throw error;

            this.showSuccess('User approved successfully');
            await this.loadUsers();
        } catch (err) {
            console.error('Error approving user:', err);
            this.showError('Failed to approve user');
        }
    }

    async denyUser(userId) {
        if (!confirm('Are you sure you want to deny this user? This will delete their account.')) {
            return;
        }

        try {
            const { error } = await this.supabase
                .from('app_users')
                .delete()
                .eq('id', userId);

            if (error) throw error;

            this.showSuccess('User request denied');
            await this.loadUsers();
        } catch (err) {
            console.error('Error denying user:', err);
            this.showError('Failed to deny user');
        }
    }

    async revokeAccess(userId) {
        if (!confirm('Are you sure you want to revoke this user\'s access?')) {
            return;
        }

        try {
            const { error } = await this.supabase
                .from('app_users')
                .update({ approved: false })
                .eq('id', userId);

            if (error) throw error;

            this.showSuccess('Access revoked');
            await this.loadUsers();
        } catch (err) {
            console.error('Error revoking access:', err);
            this.showError('Failed to revoke access');
        }
    }

    async signOut() {
        try {
            await this.supabase.auth.signOut();
            window.location.href = 'index.html';
        } catch (err) {
            console.error('Error signing out:', err);
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showMessage(message, type) {
        const container = document.getElementById('message-container');
        if (!container) return;

        container.innerHTML = `
            <div class="status-message ${type}">
                <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    ${type === 'success'
                        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>'
                        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>'}
                </svg>
                <span>${message}</span>
            </div>
        `;

        setTimeout(() => {
            container.innerHTML = '';
        }, 3000);
    }
}

// Initialise on page load
let adminManager;

document.addEventListener('DOMContentLoaded', async () => {
    adminManager = new AdminManager();
    await adminManager.init();
});

function adminSignOut() {
    adminManager.signOut();
}
