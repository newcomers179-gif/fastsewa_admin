/*
 * FastSewa admin dashboard.
 * - Every value from the API is HTML-escaped before rendering (customer-
 *   supplied names/messages previously ran as HTML here, which let anyone
 *   steal an admin session through the public contact form).
 * - No inline event handlers: everything is wired with addEventListener, so
 *   the page works under a strict Content-Security-Policy.
 */
(function () {
    'use strict';

    var API = String(window.API_BASE || (typeof API_BASE !== 'undefined' ? API_BASE : '')).replace(/\/+$/, '');

    var CATEGORY_LABELS = {
        construction: 'Construction', land: 'Land Services', finance: 'Finance', legal: 'Legal', medical: 'Medical',
        gst: 'GST', incometax: 'Income Tax', material: 'Material Supply', repair: 'Repair Service', security: 'Security',
        trademark: 'Trademark', 'property-bazaar': 'Property Bazaar', 'legal-gst': 'Legal & GST', 'startup-sathi': 'Startup Sathi'
    };
    var STATUS_LABELS = { pending: 'Request Received', verified: 'Verified', assigned: 'Professional Assigned', completed: 'Completed', cancelled: 'Cancelled' };
    var USER_TYPES = { customer: 'Customer', provider: 'Service Provider', vendor: 'Material Vendor', admin: 'Admin' };
    var CONTACT_STATUSES = { new: 'New', contacted: 'Contacted', closed: 'Closed' };
    var TITLES = { dashboard: 'Dashboard Overview', bookings: 'Bookings Management', payments: 'Payments', contacts: 'Contact Enquiries', pricing: 'Service Pricing', users: 'User Management', admins: 'Admin Management' };

    var state = { bookings: [], contacts: [], payments: [], users: [], plans: [], me: null };

    // ── helpers ────────────────────────────────────────────────
    function esc(v) {
        return String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function $(id) { return document.getElementById(id); }
    function ref(prefix, id) { return prefix + '-' + String(id || '').slice(-6).toUpperCase(); }
    function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }
    function fmtDateTime(d) { return d ? new Date(d).toLocaleString('en-IN') : '—'; }
    function inr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
    function label(map, key) { return map[key] || key || '—'; }
    function getToken() { try { return localStorage.getItem('fastsewa_token'); } catch (e) { return null; } }
    function getUser() { try { return JSON.parse(localStorage.getItem('fastsewa_current_user') || 'null'); } catch (e) { return null; } }
    function clearSession() {
        try { localStorage.removeItem('fastsewa_token'); localStorage.removeItem('fastsewa_current_user'); } catch (e) { /* ignore */ }
    }
    function emptyRow(cols, text, icon) {
        return '<tr><td colspan="' + cols + '" class="empty-state">' + (icon ? '<i class="fas ' + icon + '"></i>' : '') + '<p>' + esc(text) + '</p></td></tr>';
    }

    /** API call → { ok, status, data }. A 401 sends the admin back to login. */
    function api(path, options) {
        options = options || {};
        var headers = { Authorization: 'Bearer ' + getToken() };
        var body = options.body;
        if (body !== undefined && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
        return fetch(API + path, { method: options.method || 'GET', headers: headers, body: body })
            .then(function (res) {
                if (options.raw) return { ok: res.ok, status: res.status, res: res };
                return res.text().then(function (t) {
                    var data;
                    try { data = t ? JSON.parse(t) : {}; } catch (e) { data = { success: false, message: 'Server returned an unexpected response (' + res.status + ')' }; }
                    return { ok: res.ok, status: res.status, data: data };
                });
            })
            .catch(function () { return { ok: false, status: 0, data: { success: false, message: 'Network error — is the backend reachable?' } }; })
            .then(function (r) {
                if (r.status === 401 && !state.loggingOut) {
                    state.loggingOut = true; // parallel requests: notify once
                    clearSession();
                    alert('Your session has expired. Please sign in again.');
                    window.location.href = 'index.html';
                }
                return r;
            });
    }

    function showToast(message, type) {
        var toast = $('admin-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'admin-toast';
            toast.className = 'admin-toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.className = 'admin-toast show ' + (type || 'info');
        toast.textContent = String(message || '');
        clearTimeout(toast._t);
        toast._t = setTimeout(function () { toast.className = 'admin-toast ' + (type || 'info'); }, 3500);
    }

    function statusBadge(status) { return '<span class="status-badge status-' + esc(status) + '">' + esc(label(STATUS_LABELS, status)) + '</span>'; }
    function paymentBadge(b) {
        return b.paymentStatus === 'paid'
            ? '<span class="pay-badge paid" title="' + esc(b.razorpayPaymentId || '') + '">Paid ' + esc(inr(b.amount)) + '</span>'
            : '<span class="pay-badge unpaid">Unpaid</span>';
    }
    function serviceText(b) {
        var page = b.servicePage && b.servicePage !== b.category ? ' · ' + b.servicePage.replace(/-/g, ' ') : '';
        return label(CATEGORY_LABELS, b.category) + page;
    }

    // ── auth gate ──────────────────────────────────────────────
    function checkAdminAuth() {
        var token = getToken();
        var user = getUser();
        if (!token || !user || user.userType !== 'admin') {
            clearSession();
            window.location.replace('index.html');
            return Promise.resolve(false);
        }
        renderMe(user);
        // Confirm with the server (token still valid and still an admin).
        return api('/auth/me').then(function (r) {
            if (!r.ok || !r.data.user || r.data.user.userType !== 'admin') {
                clearSession();
                window.location.replace('index.html');
                return false;
            }
            state.me = r.data.user;
            renderMe(r.data.user);
            return true;
        });
    }

    function renderMe(user) {
        var first = user.firstName || (user.fullName || 'Admin').split(' ')[0];
        $('adminName').textContent = user.fullName || first;
        $('adminAvatar').textContent = first.charAt(0).toUpperCase();
    }

    // ── dashboard ──────────────────────────────────────────────
    function loadDashboard() {
        return Promise.all([api('/admin/stats'), api('/admin/bookings')]).then(function (rs) {
            var stats = rs[0].ok ? rs[0].data.stats : null;
            if (rs[1].ok) state.bookings = rs[1].data.bookings || [];
            if (stats) {
                $('totalCustomers').textContent = stats.customers;
                $('totalPartners').textContent = (stats.providers || stats.vendors) ? '+ ' + stats.providers + ' providers, ' + stats.vendors + ' vendors' : '';
                $('totalBookings').textContent = stats.bookings;
                $('pendingBookings').textContent = stats.pendingBookings;
                $('paidRevenue').textContent = inr(stats.paidRevenue);
                $('orphanAlert').hidden = !stats.paidWithoutBooking;
                $('orphanAlertText').textContent = stats.paidWithoutBooking + ' paid order(s) have no booking yet — the customer may have closed the page after paying.';
                $('contactsAlert').hidden = !stats.newContacts;
                $('contactsAlertText').textContent = stats.newContacts + ' new enquir' + (stats.newContacts === 1 ? 'y' : 'ies') + ' waiting for a reply.';
            } else {
                showToast(rs[0].data.message || 'Failed to load dashboard stats', 'error');
            }
            var recent = state.bookings.slice(0, 6);
            $('recentBookingsTable').innerHTML = recent.length ? recent.map(function (b) {
                return '<tr>' +
                    '<td data-label="ID"><a href="#" class="link" data-view-booking="' + esc(b._id) + '"><strong>' + esc(ref('FS', b._id)) + '</strong></a></td>' +
                    '<td data-label="Customer">' + esc(b.fullName || 'N/A') + '</td>' +
                    '<td data-label="Service">' + esc(serviceText(b)) + '</td>' +
                    '<td data-label="Payment">' + paymentBadge(b) + '</td>' +
                    '<td data-label="Date">' + esc(fmtDate(b.date)) + '</td>' +
                    '<td data-label="Status">' + statusBadge(b.status) + '</td>' +
                    '</tr>';
            }).join('') : emptyRow(6, 'No recent bookings');
        });
    }

    // ── bookings ───────────────────────────────────────────────
    function loadBookings() {
        return api('/admin/bookings').then(function (r) {
            if (!r.ok) { showToast(r.data.message || 'Failed to load bookings', 'error'); return; }
            state.bookings = r.data.bookings || [];
            renderBookings();
        });
    }

    function renderBookings() {
        var q = ($('bookingSearch').value || '').trim().toLowerCase();
        var st = $('bookingStatusFilter').value;
        var pay = $('bookingPaymentFilter').value;
        var rows = state.bookings.filter(function (b) {
            if (st && b.status !== st) return false;
            if (pay && (b.paymentStatus || 'unpaid') !== pay) return false;
            if (!q) return true;
            return [ref('FS', b._id), b.fullName, b.email, b.phone, b.serviceType, b.planName, b.category, b.servicePage]
                .some(function (v) { return String(v || '').toLowerCase().indexOf(q) !== -1; });
        });
        $('allBookingsTable').innerHTML = rows.length ? rows.map(function (b) {
            var options = Object.keys(STATUS_LABELS).map(function (s) {
                return '<option value="' + s + '"' + (b.status === s ? ' selected' : '') + '>' + esc(STATUS_LABELS[s]) + '</option>';
            }).join('');
            return '<tr>' +
                '<td data-label="Booking ID"><strong>' + esc(ref('FS', b._id)) + '</strong></td>' +
                '<td data-label="Customer">' + esc(b.fullName || 'N/A') + '<br><small class="muted">' + esc(b.email || '') + '</small></td>' +
                '<td data-label="Phone">' + (b.phone ? '<a class="link" href="tel:' + esc(b.phone) + '">' + esc(b.phone) + '</a>' : 'N/A') + '</td>' +
                '<td data-label="Service">' + esc(serviceText(b)) + (b.serviceType ? '<br><small class="muted">' + esc(b.serviceType) + '</small>' : '') + '</td>' +
                '<td data-label="Payment">' + paymentBadge(b) + '</td>' +
                '<td data-label="Date">' + esc(fmtDate(b.date)) + '</td>' +
                '<td data-label="Status"><select class="status-select" data-booking-status="' + esc(b._id) + '">' + options + '</select></td>' +
                '<td data-label="Action" class="actions">' +
                '<button class="btn btn-light" data-view-booking="' + esc(b._id) + '" title="View details"><i class="fas fa-eye"></i></button>' +
                '<button class="btn btn-danger" data-delete-booking="' + esc(b._id) + '" title="Delete"><i class="fas fa-trash"></i></button>' +
                '</td></tr>';
        }).join('') : emptyRow(8, 'No bookings found', 'fa-inbox');
    }

    function detail(name, value) {
        if (value === undefined || value === null || value === '') return '';
        return '<div class="detail-row"><span>' + esc(name) + '</span><strong>' + esc(value) + '</strong></div>';
    }

    function viewBooking(id) {
        return api('/admin/bookings/' + encodeURIComponent(id)).then(function (r) {
            if (!r.ok) { showToast(r.data.message || 'Could not load booking', 'error'); return; }
            var b = r.data.booking;
            var account = b.userId && typeof b.userId === 'object' ? b.userId : null;
            var details = b.details ? Object.keys(b.details).map(function (k) { return detail(k, b.details[k]); }).join('') : '';
            var docs = (b.documents || []).map(function (d) {
                return '<button class="btn btn-light doc-btn" data-download-doc="' + esc(d.fileId) + '" data-booking="' + esc(b._id) + '" data-filename="' + esc(d.filename) + '">' +
                    '<i class="fas fa-file-arrow-down"></i> ' + esc(d.filename) + ' (' + esc(Math.max(1, Math.round((d.size || 0) / 1024))) + ' KB)</button>';
            }).join('');
            $('bookingModalTitle').textContent = 'Booking ' + ref('FS', b._id);
            $('bookingModalBody').innerHTML =
                '<h3>Service</h3>' +
                detail('Category', serviceText(b)) + detail('Service type', b.serviceType) + detail('Status', label(STATUS_LABELS, b.status)) +
                detail('Requested on', fmtDateTime(b.date)) + detail('Preferred date', b.bookDate ? fmtDate(b.bookDate) : '') +
                detail('Time slot', b.timeSlot) + detail('Selected expert', b.selectedDoc) +
                detail('Monthly income', b.monthlyIncome !== undefined ? inr(b.monthlyIncome) : '') +
                detail('Monthly expense', b.monthlyExpense !== undefined ? inr(b.monthlyExpense) : '') +
                '<h3>Payment</h3>' +
                detail('Status', b.paymentStatus === 'paid' ? 'Paid (verified by server)' : 'Not paid online') +
                detail('Plan', b.planName) + detail('Amount', b.amount !== undefined ? inr(b.amount) : '') +
                detail('Razorpay payment', b.razorpayPaymentId) + detail('Razorpay order', b.razorpayOrderId) +
                '<h3>Customer</h3>' +
                detail('Name', b.fullName) + detail('Email', b.email) + detail('Phone', b.phone) +
                (account ? detail('Account', (account.fullName || '') + ' <' + account.email + '> · ' + label(USER_TYPES, account.userType)) : detail('Account', 'deleted')) +
                '<h3>Message</h3>' +
                '<div class="message-box">' + esc(b.message || b.notes || '—') + '</div>' +
                (b.message && b.notes ? '<div class="message-box">' + esc(b.notes) + '</div>' : '') +
                (details ? '<h3>Other form details</h3>' + details : '') +
                (docs ? '<h3>Documents</h3><div class="doc-list">' + docs + '</div>' : '');
            openModal('bookingModal');
        });
    }

    function downloadDocument(bookingId, fileId, filename) {
        api('/admin/bookings/' + encodeURIComponent(bookingId) + '/documents/' + encodeURIComponent(fileId), { raw: true }).then(function (r) {
            if (!r.ok) { showToast('Could not download the document', 'error'); return; }
            return r.res.blob().then(function (blob) {
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = filename || 'document';
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
            });
        });
    }

    function updateBookingStatus(id, status, select) {
        select.disabled = true;
        api('/admin/bookings/' + encodeURIComponent(id), { method: 'PUT', body: { status: status } }).then(function (r) {
            select.disabled = false;
            if (!r.ok) { showToast(r.data.message || 'Failed to update status', 'error'); loadBookings(); return; }
            var b = state.bookings.find(function (x) { return x._id === id; });
            if (b) b.status = status;
            showToast('Status updated to "' + label(STATUS_LABELS, status) + '"', 'success');
        });
    }

    function deleteBooking(id) {
        if (!confirm('Delete booking ' + ref('FS', id) + '? This cannot be undone.')) return;
        api('/admin/bookings/' + encodeURIComponent(id), { method: 'DELETE' }).then(function (r) {
            if (!r.ok) { showToast(r.data.message || 'Failed to delete booking', 'error'); return; }
            state.bookings = state.bookings.filter(function (b) { return b._id !== id; });
            renderBookings();
            showToast('Booking deleted', 'success');
        });
    }

    // ── payments ───────────────────────────────────────────────
    function loadPayments() {
        var st = $('paymentStatusFilter').value;
        return api('/admin/payments' + (st ? '?status=' + encodeURIComponent(st) : '')).then(function (r) {
            if (!r.ok) { showToast(r.data.message || 'Failed to load payments', 'error'); return; }
            state.payments = r.data.payments || [];
            $('paymentsTable').innerHTML = state.payments.length ? state.payments.map(function (p) {
                var u = p.userId && typeof p.userId === 'object' ? p.userId : null;
                var bookingCell = p.bookingId
                    ? '<a href="#" class="link" data-view-booking="' + esc(p.bookingId) + '">' + esc(ref('FS', p.bookingId)) + '</a>'
                    : (p.status === 'paid' ? '<span class="pay-badge unpaid">Needs follow-up</span>' : '—');
                return '<tr>' +
                    '<td data-label="Date">' + esc(fmtDateTime(p.paidAt || p.createdAt)) + '</td>' +
                    '<td data-label="Customer">' + (u ? esc(u.fullName || '') + '<br><small class="muted">' + esc(u.email || '') + (u.phone ? ' · ' + esc(u.phone) : '') + '</small>' : '<span class="muted">deleted user</span>') + '</td>' +
                    '<td data-label="Plan">' + esc(p.planName) + '</td>' +
                    '<td data-label="Amount">' + esc(inr(p.amount)) + '</td>' +
                    '<td data-label="Status"><span class="pay-badge ' + (p.status === 'paid' ? 'paid' : 'unpaid') + '">' + esc(p.status) + (p.verifiedVia ? ' · ' + esc(p.verifiedVia) : '') + '</span></td>' +
                    '<td data-label="Razorpay Ref"><small>' + esc(p.razorpayPaymentId || p.razorpayOrderId) + '</small></td>' +
                    '<td data-label="Booking">' + bookingCell + '</td>' +
                    '</tr>';
            }).join('') : emptyRow(7, 'No payments found', 'fa-receipt');
        });
    }

    // ── contacts ───────────────────────────────────────────────
    function loadContacts() {
        return api('/admin/contacts').then(function (r) {
            if (!r.ok) { showToast(r.data.message || 'Failed to load enquiries', 'error'); return; }
            state.contacts = r.data.contacts || [];
            renderContacts();
        });
    }

    function renderContacts() {
        var st = $('contactStatusFilter').value;
        var rows = state.contacts.filter(function (c) { return !st || (c.status || 'new') === st; });
        $('allContactsTable').innerHTML = rows.length ? rows.map(function (c) {
            var options = Object.keys(CONTACT_STATUSES).map(function (s) {
                return '<option value="' + s + '"' + ((c.status || 'new') === s ? ' selected' : '') + '>' + CONTACT_STATUSES[s] + '</option>';
            }).join('');
            var preview = String(c.message || '');
            if (preview.length > 70) preview = preview.slice(0, 70) + '…';
            return '<tr>' +
                '<td data-label="ID"><strong>' + esc(ref('EQ', c._id)) + '</strong></td>' +
                '<td data-label="Name">' + esc(c.name || 'N/A') + '</td>' +
                '<td data-label="Contact">' + (c.phone ? '<a class="link" href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a><br>' : '') + (c.email ? '<small><a class="link" href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a></small>' : '') + '</td>' +
                '<td data-label="Interested In">' + esc(c.service || 'General Inquiry') + '</td>' +
                '<td data-label="Message" class="message-cell">' + esc(preview) + '</td>' +
                '<td data-label="Source"><span class="source-chip ' + esc(c.source || 'website') + '">' + esc(c.source || 'website') + '</span></td>' +
                '<td data-label="Date">' + esc(fmtDate(c.date)) + '</td>' +
                '<td data-label="Status"><select class="status-select" data-contact-status="' + esc(c._id) + '">' + options + '</select></td>' +
                '<td data-label="Action" class="actions">' +
                '<button class="btn btn-light" data-view-contact="' + esc(c._id) + '" title="Read message"><i class="fas fa-eye"></i></button>' +
                '<button class="btn btn-danger" data-delete-contact="' + esc(c._id) + '" title="Delete"><i class="fas fa-trash"></i></button>' +
                '</td></tr>';
        }).join('') : emptyRow(9, 'No enquiries found', 'fa-inbox');
    }

    function viewContact(id) {
        var c = state.contacts.find(function (x) { return x._id === id; });
        if (!c) return;
        $('contactModalTitle').textContent = 'Enquiry ' + ref('EQ', c._id);
        $('contactModalBody').innerHTML =
            detail('Name', c.name) + detail('Email', c.email) + detail('Phone', c.phone) + detail('Interested in', c.service) +
            detail('Source', c.source) + detail('Received', fmtDateTime(c.date)) +
            '<h3>Message</h3><div class="message-box">' + esc(c.message) + '</div>' +
            '<div class="modal-actions">' +
            (c.phone ? '<a class="btn btn-primary" href="tel:' + esc(c.phone) + '"><i class="fas fa-phone"></i> Call</a>' : '') +
            (c.phone ? '<a class="btn btn-light" target="_blank" rel="noopener" href="https://wa.me/' + esc(String(c.phone).replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')) + '"><i class="fab fa-whatsapp"></i> WhatsApp</a>' : '') +
            (c.email ? '<a class="btn btn-light" href="mailto:' + esc(c.email) + '"><i class="fas fa-envelope"></i> Email</a>' : '') +
            '</div>';
        openModal('contactModal');
    }

    function updateContactStatus(id, status, select) {
        select.disabled = true;
        api('/admin/contacts/' + encodeURIComponent(id), { method: 'PUT', body: { status: status } }).then(function (r) {
            select.disabled = false;
            if (!r.ok) { showToast(r.data.message || 'Failed to update enquiry', 'error'); return; }
            var c = state.contacts.find(function (x) { return x._id === id; });
            if (c) c.status = status;
            showToast('Enquiry marked as ' + CONTACT_STATUSES[status], 'success');
        });
    }

    function deleteContact(id) {
        if (!confirm('Delete this enquiry? This cannot be undone.')) return;
        api('/admin/contacts/' + encodeURIComponent(id), { method: 'DELETE' }).then(function (r) {
            if (!r.ok) { showToast(r.data.message || 'Failed to delete enquiry', 'error'); return; }
            state.contacts = state.contacts.filter(function (c) { return c._id !== id; });
            renderContacts();
            showToast('Enquiry deleted', 'success');
        });
    }

    // ── pricing ────────────────────────────────────────────────
    function pageLabel(filename) {
        return String(filename || '').replace('.html', '').split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
    }

    function loadPricing() {
        return api('/admin/pricing').then(function (r) {
            if (!r.ok) { showToast(r.data.message || 'Failed to load pricing', 'error'); return; }
            state.plans = r.data.plans || [];
            renderPricing();
        });
    }

    function renderPricing() {
        var filter = ($('pricingFilter').value || '').toLowerCase();
        var rows = state.plans.filter(function (p) {
            return !filter || p.page.toLowerCase().indexOf(filter) !== -1 || p.planName.toLowerCase().indexOf(filter) !== -1;
        });
        $('allPricingTable').innerHTML = rows.length ? rows.map(function (p) {
            var note = p.syncable === false ? ' <i class="fas fa-circle-info" title="This page shows its own rate card — this is only the amount charged at booking"></i>' : '';
            return '<tr>' +
                '<td data-label="Page">' + esc(pageLabel(p.page)) + note + '</td>' +
                '<td data-label="Plan Name"><strong>' + esc(p.planName) + '</strong></td>' +
                '<td data-label="Unit">' + esc(p.unit || '—') + '</td>' +
                '<td data-label="Price"><input type="number" min="1" step="1" class="price-input" id="price-' + esc(p._id) + '" value="' + esc(p.price) + '"></td>' +
                '<td data-label="Action"><button class="btn btn-primary" data-save-price="' + esc(p._id) + '"><i class="fas fa-save"></i> Save</button></td>' +
                '</tr>';
        }).join('') : emptyRow(5, 'No plans match "' + filter + '"', 'fa-tags');
    }

    function savePrice(id, button) {
        var input = $('price-' + id);
        var price = Number(input.value);
        if (!Number.isFinite(price) || price < 1) { showToast('Price must be a positive number', 'error'); return; }
        var plan = state.plans.find(function (p) { return p._id === id; });
        if (plan && Math.abs(price - plan.price) / plan.price > 0.5 &&
            !confirm('Change "' + plan.planName + '" from ' + inr(plan.price) + ' to ' + inr(price) + '?')) return;
        button.disabled = true;
        api('/admin/pricing/' + encodeURIComponent(id), { method: 'PUT', body: { price: price } }).then(function (r) {
            button.disabled = false;
            if (!r.ok) { showToast(r.data.message || 'Failed to update price', 'error'); return; }
            if (plan) plan.price = r.data.plan.price;
            input.value = r.data.plan.price;
            showToast('Price updated', 'success');
        });
    }

    // ── users & admins ─────────────────────────────────────────
    function loadUsers() {
        return api('/admin/users').then(function (r) {
            if (!r.ok) { showToast(r.data.message || 'Failed to load users', 'error'); return; }
            state.users = r.data.users || [];
            renderUsers();
            renderAdmins();
        });
    }

    function renderUsers() {
        var type = $('userTypeFilter').value;
        var rows = state.users.filter(function (u) { return u.userType !== 'admin' && (!type || u.userType === type); });
        $('usersTable').innerHTML = rows.length ? rows.map(function (u) {
            return '<tr>' +
                '<td data-label="Name">' + esc(u.fullName || ((u.firstName || '') + ' ' + (u.lastName || ''))) + '</td>' +
                '<td data-label="Email">' + esc(u.email) + '</td>' +
                '<td data-label="Phone">' + esc(u.phone || 'N/A') + '</td>' +
                '<td data-label="Type"><span class="source-chip">' + esc(label(USER_TYPES, u.userType)) + '</span></td>' +
                '<td data-label="Joined">' + esc(fmtDate(u.date)) + '</td>' +
                '<td data-label="Action"><button class="btn btn-danger" data-delete-user="' + esc(u._id) + '" data-name="' + esc(u.email) + '"><i class="fas fa-trash"></i> Delete</button></td>' +
                '</tr>';
        }).join('') : emptyRow(6, 'No users found', 'fa-users');
    }

    function renderAdmins() {
        var me = state.me || getUser() || {};
        var myId = me._id || me.id;
        var admins = state.users.filter(function (u) { return u.userType === 'admin'; });
        $('adminsTable').innerHTML = admins.length ? admins.map(function (u) {
            return '<tr>' +
                '<td data-label="Name">' + esc(u.fullName || ((u.firstName || '') + ' ' + (u.lastName || ''))) + '</td>' +
                '<td data-label="Email">' + esc(u.email) + '</td>' +
                '<td data-label="Role"><span class="admin-badge">ADMIN</span></td>' +
                '<td data-label="Added On">' + esc(fmtDate(u.date)) + '</td>' +
                '<td>' + (u._id === myId ? '<span class="muted">You</span>' : '') + '</td>' +
                '</tr>';
        }).join('') : emptyRow(5, 'No admins found');
    }

    function deleteUser(id, name) {
        if (!confirm('Delete the account ' + name + '? Their bookings stay on record. This cannot be undone.')) return;
        api('/admin/users/' + encodeURIComponent(id), { method: 'DELETE' }).then(function (r) {
            if (!r.ok) { showToast(r.data.message || 'Delete failed', 'error'); return; }
            state.users = state.users.filter(function (u) { return u._id !== id; });
            renderUsers();
            showToast(r.data.message || 'User deleted', 'success');
        });
    }

    function submitUserForm(e, isAdmin) {
        e.preventDefault();
        var p = isAdmin ? 'admin' : 'user';
        var body = {
            firstName: $(p + 'FirstName').value.trim(),
            lastName: $(p + 'LastName').value.trim(),
            email: $(p + 'Email').value.trim(),
            password: $(p + 'Password').value,
            userType: isAdmin ? 'admin' : $('userTypeSelect').value
        };
        if (!isAdmin) body.phone = $('userPhone').value.trim();
        if (body.password.length < 8) { showToast('Password must be at least 8 characters', 'error'); return; }
        var form = e.target;
        var btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        api('/admin/users', { method: 'POST', body: body }).then(function (r) {
            btn.disabled = false;
            if (!r.ok) { showToast(r.data.message || 'Failed to add user', 'error'); return; }
            showToast((isAdmin ? 'Admin' : 'User') + ' added successfully', 'success');
            closeModal(isAdmin ? 'addAdminModal' : 'addUserModal');
            form.reset();
            loadUsers();
        });
    }

    // ── UI plumbing ────────────────────────────────────────────
    var current = 'dashboard';
    var loaders = { dashboard: loadDashboard, bookings: loadBookings, payments: loadPayments, contacts: loadContacts, pricing: loadPricing, users: loadUsers, admins: loadUsers };

    function showSection(id) {
        if (!$(id)) return;
        current = id;
        document.querySelectorAll('.section').forEach(function (s) { s.classList.toggle('active', s.id === id); });
        document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.toggle('active', n.getAttribute('data-section') === id); });
        document.querySelector('.header-title').textContent = TITLES[id] || 'Dashboard';
        if (loaders[id]) loaders[id]();
        if (window.innerWidth < 900) { $('sidebar').classList.remove('active'); $('sidebarOverlay').classList.remove('active'); }
    }

    function openModal(id) { $(id).classList.add('active'); }
    function closeModal(id) { $(id).classList.remove('active'); }
    function toggleSidebar() { $('sidebar').classList.toggle('active'); $('sidebarOverlay').classList.toggle('active'); }

    function logout() {
        if (!confirm('Are you sure you want to log out?')) return;
        clearSession();
        window.location.href = 'index.html';
    }

    function updateTime() {
        $('currentTime').textContent = new Date().toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
    }

    function bindEvents() {
        document.addEventListener('click', function (e) {
            var t = e.target.closest('[data-section], [data-section-link], [data-action], [data-view-booking], [data-delete-booking], [data-view-contact], [data-delete-contact], [data-save-price], [data-delete-user], [data-download-doc]');
            if (!t) {
                if (e.target.classList.contains('modal')) e.target.classList.remove('active');
                return;
            }
            var d = t.dataset;
            if (d.section || d.sectionLink) { e.preventDefault(); showSection(d.section || d.sectionLink); return; }
            if (d.viewBooking) { e.preventDefault(); viewBooking(d.viewBooking); return; }
            if (d.deleteBooking) { deleteBooking(d.deleteBooking); return; }
            if (d.viewContact) { viewContact(d.viewContact); return; }
            if (d.deleteContact) { deleteContact(d.deleteContact); return; }
            if (d.savePrice) { savePrice(d.savePrice, t); return; }
            if (d.deleteUser) { deleteUser(d.deleteUser, d.name); return; }
            if (d.downloadDoc) { downloadDocument(d.booking, d.downloadDoc, d.filename); return; }
            switch (d.action) {
                case 'logout': logout(); break;
                case 'toggle-sidebar': toggleSidebar(); break;
                case 'open-modal': openModal(d.modal); break;
                case 'close-modal': closeModal(d.modal); break;
                case 'refresh': if (loaders[current]) loaders[current](); break;
                default: break;
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') document.querySelectorAll('.modal.active').forEach(function (m) { m.classList.remove('active'); });
            if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.nav-item, .logout-btn')) { e.preventDefault(); e.target.click(); }
        });
        document.addEventListener('change', function (e) {
            var t = e.target;
            if (t.dataset.bookingStatus) updateBookingStatus(t.dataset.bookingStatus, t.value, t);
            else if (t.dataset.contactStatus) updateContactStatus(t.dataset.contactStatus, t.value, t);
            else if (t.id === 'bookingStatusFilter' || t.id === 'bookingPaymentFilter') renderBookings();
            else if (t.id === 'contactStatusFilter') renderContacts();
            else if (t.id === 'paymentStatusFilter') loadPayments();
            else if (t.id === 'userTypeFilter') renderUsers();
        });
        $('bookingSearch').addEventListener('input', renderBookings);
        $('pricingFilter').addEventListener('input', renderPricing);
        $('addUserForm').addEventListener('submit', function (e) { submitUserForm(e, false); });
        $('addAdminForm').addEventListener('submit', function (e) { submitUserForm(e, true); });
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!API) { document.body.innerHTML = '<p style="padding:40px">config.js is missing API_BASE.</p>'; return; }
        bindEvents();
        updateTime();
        setInterval(updateTime, 30000);
        checkAdminAuth().then(function (ok) { if (ok) loadDashboard(); });
    });
})();
