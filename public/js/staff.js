/* =============================================
   Adventure Kingdom - Staff Dashboard
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

  let currentRejectId = null;

  // --- Check existing session ---
  initDashboard();

  async function initDashboard() {
    if (Auth.isAuthenticated()) {
      const valid = await Auth.verifyToken();
      if (valid) {
        showDashboard();
        return;
      }
    }
    showLogin();
  }

  function showLogin() {
    loginScreen.style.display = 'flex';
    dashboard.classList.remove('active');
  }

  function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.classList.add('active');
    document.getElementById('dashRole').textContent = Auth.getRole().toUpperCase();
    loadStats();
    loadReservations();
  }

  // --- Login ---
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const result = await Auth.login(email, password);
    if (result.success) {
      showDashboard();
    } else {
      loginError.textContent = result.error;
    }
  });

  // --- Logout ---
  logoutBtn.addEventListener('click', () => {
    Auth.clearSession();
    showLogin();
  });

  // --- Load Stats ---
  async function loadStats() {
    try {
      const res = await Auth.apiFetch('/api/reservations/stats/overview');
      const data = await res.json();
      if (data.success) {
        document.getElementById('statPending').textContent = data.data.pending || 0;
        document.getElementById('statConfirmed').textContent = data.data.confirmed || 0;
        document.getElementById('statRejected').textContent = data.data.rejected || 0;
        document.getElementById('statTotal').textContent = data.data.total || 0;
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  // --- Load Reservations ---
  async function loadReservations(params = {}) {
    const tbody = document.getElementById('reservationsBody');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:#999;">Loading...</td></tr>';

    try {
      const query = new URLSearchParams();
      if (params.status) query.set('status', params.status);
      if (params.date) query.set('date', params.date);
      if (params.search) query.set('search', params.search);

      const res = await Auth.apiFetch(`/api/reservations?${query.toString()}`);
      const data = await res.json();

      if (!data.success || !data.data.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:#999;">No reservations found.</td></tr>';
        return;
      }

      const slotNames = {
        'morning': '9:00-11:00',
        'afternoon': '12:00-14:00',
        'late-afternoon': '15:00-17:00',
        'evening': '18:00-20:00'
      };

      const themeNames = { 'forest': 'Enchanted Forest', 'royal': 'Royal Room' };
      const pkgNames = { 'lion': 'Lion (290\u20AC)', 'royal': 'Royal (440\u20AC)' };

      tbody.innerHTML = data.data.map(r => `
        <tr>
          <td>#${r.id}</td>
          <td>${r.party_date}</td>
          <td>${slotNames[r.time_slot] || r.time_slot}</td>
          <td>${themeNames[r.theme] || r.theme}</td>
          <td>${esc(r.child_name)} (${r.child_age}yr)</td>
          <td>${esc(r.parent_name)}<br><small style="color:#999;">${esc(r.parent_email)}</small></td>
          <td>${pkgNames[r.package] || r.package}</td>
          <td><strong>${r.estimated_total}\u20AC</strong></td>
          <td><span class="status-badge ${r.status}">${r.status}</span></td>
          <td>
            <button class="action-btn view" data-action="view" data-id="${r.id}">View</button>
            ${r.status === 'pending' ? `
              <button class="action-btn confirm" data-action="confirm" data-id="${r.id}">Confirm</button>
              <button class="action-btn reject" data-action="reject" data-id="${r.id}">Reject</button>
            ` : ''}
            ${r.status === 'confirmed' ? `
              <button class="action-btn reject" data-action="cancel" data-id="${r.id}">Cancel</button>
            ` : ''}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:#c00;">Failed to load reservations.</td></tr>';
    }
  }

  // --- Filters ---
  document.getElementById('filterBtn').addEventListener('click', () => {
    loadReservations({
      status: document.getElementById('filterStatus').value,
      date: document.getElementById('filterDate').value,
      search: document.getElementById('filterSearch').value
    });
  });

  // Also filter on Enter key in search
  document.getElementById('filterSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('filterBtn').click();
  });

  // --- Event delegation for action buttons (CSP blocks inline onclick) ---
  document.getElementById('reservationsBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    const action = btn.dataset.action;
    if (action === 'view') viewReservation(id);
    else if (action === 'confirm') updateStatus(id, 'confirmed');
    else if (action === 'reject') openRejectModal(id);
    else if (action === 'cancel') updateStatus(id, 'cancelled');
  });

  // --- View Reservation Detail ---
  async function viewReservation(id) {
    try {
      const res = await Auth.apiFetch(`/api/reservations/${id}`);
      const data = await res.json();
      if (!data.success) return;

      const r = data.data;
      const slotNames = {
        'morning': '9:00-11:00', 'afternoon': '12:00-14:00',
        'late-afternoon': '15:00-17:00', 'evening': '18:00-20:00'
      };

      document.getElementById('modalContent').innerHTML = `
        <div class="detail-row"><span class="detail-label">ID</span><span class="detail-value">#${r.id}</span></div>
        <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="status-badge ${r.status}">${r.status}</span></span></div>
        <div class="detail-row"><span class="detail-label">Parent</span><span class="detail-value">${esc(r.parent_name)}</span></div>
        <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${esc(r.parent_phone)}</span></div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${esc(r.parent_email)}</span></div>
        <div class="detail-row"><span class="detail-label">Child</span><span class="detail-value">${esc(r.child_name)} (age ${r.child_age})</span></div>
        <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${r.party_date}</span></div>
        <div class="detail-row"><span class="detail-label">Time Slot</span><span class="detail-value">${slotNames[r.time_slot] || r.time_slot}</span></div>
        <div class="detail-row"><span class="detail-label">Theme</span><span class="detail-value">${r.theme === 'forest' ? 'Enchanted Forest' : 'Royal Room'}</span></div>
        <div class="detail-row"><span class="detail-label">Package</span><span class="detail-value">${r.package === 'lion' ? 'Lion (290\u20AC)' : 'Royal Party (440\u20AC)'}</span></div>
        <div class="detail-row"><span class="detail-label">Children</span><span class="detail-value">${r.num_children}</span></div>
        <div class="detail-row"><span class="detail-label">Adults</span><span class="detail-value">${r.num_adults}</span></div>
        <div class="detail-row"><span class="detail-label">Extra Pizza</span><span class="detail-value">${r.addon_pizza} (${r.addon_pizza * 10}\u20AC)</span></div>
        <div class="detail-row"><span class="detail-label">Extra Cake</span><span class="detail-value">${r.addon_cake} (${r.addon_cake * 20}\u20AC)</span></div>
        <div class="detail-row"><span class="detail-label">Extra Children</span><span class="detail-value">${r.addon_extra_child} (${r.addon_extra_child * 8}\u20AC)</span></div>
        <div class="detail-row"><span class="detail-label">Estimated Total</span><span class="detail-value"><strong>${r.estimated_total}\u20AC</strong></span></div>
        ${r.notes ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">${esc(r.notes)}</span></div>` : ''}
        ${r.rejection_reason ? `<div class="detail-row"><span class="detail-label">Rejection Reason</span><span class="detail-value">${esc(r.rejection_reason)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">Submitted</span><span class="detail-value">${r.created_at}</span></div>
      `;

      document.getElementById('detailModal').style.display = 'flex';
    } catch (err) {
      console.error('Failed to load reservation:', err);
      alert('Failed to load reservation details. Please try again.');
    }
  }

  // --- Update Status ---
  async function updateStatus(id, status, reason) {
    try {
      const res = await Auth.apiFetch(`/api/reservations/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, rejection_reason: reason || null })
      });
      const data = await res.json();
      if (data.success) {
        loadStats();
        loadReservations({
          status: document.getElementById('filterStatus').value,
          date: document.getElementById('filterDate').value,
          search: document.getElementById('filterSearch').value
        });
      } else {
        alert('Failed to update: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Failed to update reservation. Please try again.');
    }
  }

  // --- Reject Modal ---
  function openRejectModal(id) {
    currentRejectId = id;
    document.getElementById('rejectReason').value = '';
    document.getElementById('rejectModal').style.display = 'flex';
  }

  document.getElementById('confirmRejectBtn').addEventListener('click', () => {
    if (currentRejectId) {
      const reason = document.getElementById('rejectReason').value;
      updateStatus(currentRejectId, 'rejected', reason);
      document.getElementById('rejectModal').style.display = 'none';
      currentRejectId = null;
    }
  });

  // --- Close Modals ---
  document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('detailModal').style.display = 'none';
  });

  document.getElementById('rejectModalClose').addEventListener('click', () => {
    document.getElementById('rejectModal').style.display = 'none';
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
