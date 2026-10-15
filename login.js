/* Admin login page. API_BASE comes from config.js. */
(function () {
    'use strict';
    var API = String(typeof API_BASE !== 'undefined' ? API_BASE : '').replace(/\/+$/, '');

    function getStored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

    // Already logged in as an admin? Skip straight to the dashboard
    // (the dashboard re-checks the session with the server).
    (function redirectIfLoggedIn() {
        var token = getStored('fastsewa_token');
        var user = null;
        try { user = JSON.parse(getStored('fastsewa_current_user') || 'null'); } catch (e) { user = null; }
        if (token && user && user.userType === 'admin') window.location.replace('dashboard.html');
    })();

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('adminLoginForm');
        var errorBox = document.getElementById('loginError');
        var btn = document.getElementById('loginBtn');
        var original = btn.innerHTML;

        function showError(msg) {
            errorBox.textContent = msg;
            errorBox.classList.add('show');
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            errorBox.classList.remove('show');
            var email = document.getElementById('email').value.trim();
            var password = document.getElementById('password').value;
            if (!API) { showError('config.js is missing API_BASE.'); return; }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';

            fetch(API + '/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, password: password })
            }).then(function (res) {
                return res.text().then(function (t) {
                    var data;
                    try { data = JSON.parse(t); } catch (err) { data = { success: false, message: 'Server error (' + res.status + '). Please try again shortly.' }; }
                    return data;
                });
            }).then(function (data) {
                if (!data.success) { showError(data.message || 'Login failed. Please check your credentials.'); return; }
                if (!data.user || data.user.userType !== 'admin') { showError("This account doesn't have admin access."); return; }
                localStorage.setItem('fastsewa_token', data.token);
                localStorage.setItem('fastsewa_current_user', JSON.stringify(data.user));
                window.location.href = 'dashboard.html';
            }).catch(function () {
                showError('Connection error. Please check that the backend is reachable and try again.');
            }).finally(function () {
                btn.disabled = false;
                btn.innerHTML = original;
            });
        });
    });
})();
