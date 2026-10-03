'use strict';

let token = localStorage.getItem('admin_panel_token') || '';

const $ = (selector) => document.querySelector(selector);

const loginBox = $('#login');
const panelBox = $('#panel');
const loginBtn = $('#loginBtn');
const logoutBtn = $('#logout');
const loginMsg = $('#loginMsg');
const adminName = $('#adminName');
const requestList = $('#requestList');
const playerList = $('#playerList');

function setMessage(message, type = 'error') {
    if (!loginMsg) return;
    loginMsg.textContent = message;
    loginMsg.className = type;
}

function setLoading(button, loading, text = 'Login') {
    if (!button) return;
    button.disabled = loading;
    button.textContent = loading ? 'Please wait...' : text;
}

async function api(path, options = {}) {
    const headers = {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
        response = await fetch(path, { ...options, headers });
    } catch (error) {
        throw new Error('Server ጋር መገናኘት አልተቻለም። Internet ወይም Server ማረጋገጫ ይመልከቱ።');
    }

    const contentType = response.headers.get('content-type') || '';
    let data = {};

    if (contentType.includes('application/json')) {
        data = await response.json().catch(() => ({}));
    } else {
        const text = await response.text().catch(() => '');
        data = { message: text || 'Invalid server response' };
    }

    if (response.status === 401 || response.status === 403) {
        if (path !== '/api/admin/login') {
            logout(false);
        }
        throw new Error(data.message || 'Admin authorization failed');
    }

    if (!response.ok) {
        throw new Error(data.message || data.error || 'Request failed');
    }

    return data;
}

/* =========================
   LOGIN
========================= */
async function login() {
    const adminIdInput = $('#adminId');
    const passwordInput = $('#password');

    const adminId = Number(adminIdInput?.value);
    const password = passwordInput?.value?.trim();

    setMessage('');

    if (!adminId || adminId <= 0) {
        setMessage('ትክክለኛ Admin ID አስገባ።');
        adminIdInput?.focus();
        return;
    }

    if (!password) {
        setMessage('Password አስገባ።');
        passwordInput?.focus();
        return;
    }

    try {
        setLoading(loginBtn, true);

        const data = await api('/api/admin/login', {
            method: 'POST',
            body: JSON.stringify({ adminId, password })
        });

        if (!data.success || !data.token) {
            throw new Error(data.message || 'Login failed');
        }

        token = data.token;
        localStorage.setItem('admin_panel_token', token);

        setMessage('Login successful', 'success');
        await showPanel();

    } catch (error) {
        console.error('Admin login error:', error);
        setMessage(error.message || 'Admin login failed');
    } finally {
        setLoading(loginBtn, false);
    }
}

/* =========================
   SHOW PANEL
========================= */
async function showPanel() {
    if (!token) {
        showLogin();
        return;
    }

    loginBox?.classList.add('hidden');
    panelBox?.classList.remove('hidden');

    try {
        await loadMe();
        await loadRequests();
    } catch (error) {
        console.error(error);
        if (!token) {
            showLogin();
        }
    }
}

function showLogin() {
    panelBox?.classList.add('hidden');
    loginBox?.classList.remove('hidden');
}

/* =========================
   LOAD ADMIN
========================= */
async function loadMe() {
    const data = await api('/api/admin/me');
    if (!data.success || !data.admin) {
        throw new Error('Admin information not found');
    }

    const admin = data.admin;
    if (adminName) {
        adminName.textContent = `${admin.adminName || 'Admin'} · ${admin.adminId}`;
    }
    return admin;
}

/* =========================
   LOGOUT
========================= */
function logout(showMessage = true) {
    token = '';
    localStorage.removeItem('admin_panel_token');
    panelBox?.classList.add('hidden');
    loginBox?.classList.remove('hidden');

    if (loginMsg) {
        loginMsg.textContent = showMessage ? 'You have been logged out.' : '';
    }
    if ($('#password')) {
        $('#password').value = '';
    }
}

/* =========================
   ESCAPE HTML
========================= */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* =========================
   LOAD REQUESTS & PLAYERS
========================= */
async function loadRequests() {
    if (!requestList) return;
    requestList.innerHTML = '<p class="loading">Loading requests...</p>';

    try {
        const data = await api('/api/admin/requests');
        const requests = Array.isArray(data.requests) ? data.requests : [];

        if (!requests.length) {
            requestList.innerHTML = '<p class="empty">No pending requests.</p>';
            return;
        }

        requestList.innerHTML = requests.map((request) => {
            const type = String(request.type || '').toLowerCase();
            const typeLabel = type === 'deposit' ? '💰 DEPOSIT' : '💸 WITHDRAWAL';
            const date = request.date ? new Date(request.date).toLocaleString() : '-';

            return `
                <div class="card">
                    <div class="request-header">
                        <strong>${typeLabel}</strong>
                        <span>ETB ${escapeHtml(request.amount)}</span>
                    </div>
                    <p>👤 ${escapeHtml(request.userName || 'Unknown')}<br>🆔 ${escapeHtml(request.userId)}</p>
                    <p>📄 ${escapeHtml(request.details || request.transactionDetails || '-')}</p>
                    <small>${escapeHtml(date)}</small>
                    <div class="actions">
                        <button class="ok" data-id="${escapeHtml(request._id)}" data-action="approve">✅ Approve</button>
                        <button class="no" data-id="${escapeHtml(request._id)}" data-action="reject">❌ Reject</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        requestList.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    }
}

async function processReq(id, action) {
    if (!id) return;
    const confirmed = confirm(`Are you sure you want to ${action} this request?`);
    if (!confirmed) return;

    try {
        await api(`/api/admin/requests/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
        await loadRequests();
    } catch (error) {
        alert(error.message || 'Could not process request.');
        await loadRequests();
    }
}

async function loadPlayers() {
    if (!playerList) return;
    playerList.innerHTML = '<p class="loading">Loading players...</p>';

    try {
        const data = await api('/api/admin/players');
        const players = Array.isArray(data.players) ? data.players : [];

        if (!players.length) {
            playerList.innerHTML = '<p class="empty">No assigned players.</p>';
            return;
        }

        playerList.innerHTML = `
            <div class="grid">
                <table>
                    <thead>
                        <tr><th>Name</th><th>ID</th><th>Balance</th><th>Games</th><th>Wins</th></tr>
                    </thead>
                    <tbody>
                        ${players.map((player) => `
                            <tr>
                                <td>${escapeHtml(player.userName || '-')}</td>
                                <td>${escapeHtml(player.userId)}</td>
                                <td>ETB ${escapeHtml(player.balance ?? 0)}</td>
                                <td>${escapeHtml(player.totalGames ?? 0)}</td>
                                <td>${escapeHtml(player.wins ?? 0)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        playerList.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    }
}

/* =========================
   EVENTS & TABS
========================= */
document.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', async () => {
        const page = button.dataset.page;
        document.querySelectorAll('#requests, #players').forEach((section) => {
            section.classList.add('hidden');
        });
        const target = document.getElementById(page);
        if (!target) return;
        target.classList.remove('hidden');

        if (page === 'requests') await loadRequests();
        if (page === 'players') await loadPlayers();
    });
});

loginBtn?.addEventListener('click', login);
logoutBtn?.addEventListener('click', () => logout(true));

document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.action;
    if (action === 'approve' || action === 'reject') {
        processReq(id, action);
    }
});

$('#adminId')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('#password')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

(async function init() {
    if (!token) {
        showLogin();
        return;
    }
    try {
        await showPanel();
    } catch (error) {
        logout(false);
    }
})();