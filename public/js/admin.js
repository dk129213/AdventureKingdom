/* =============================================
   Adventure Kingdom - Admin Dashboard
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

  let currentRejectId = null;

  // --- Init ---
  initDashboard();

  async function initDashboard() {
    if (Auth.isAuthenticated()) {
      const valid = await Auth.verifyToken();
      if (valid && Auth.getRole() === 'admin') {
        showDashboard();
        return;
      }
      Auth.clearSession();
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
    loadStats();
    loadReservations();
    loadEvents();
    loadGallery();
  }

  // --- Login ---
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const result = await Auth.login(email, password);
    if (result.success && result.role === 'admin') {
      showDashboard();
    } else if (result.success && result.role !== 'admin') {
      Auth.clearSession();
      loginError.textContent = 'Admin access required.';
    } else {
      loginError.textContent = result.error;
    }
  });

  logoutBtn.addEventListener('click', () => {
    Auth.clearSession();
    showLogin();
  });

  // --- Tabs ---
  document.querySelectorAll('.dash-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // --- Stats ---
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
    } catch (err) { console.error('Stats error:', err); }
  }

  // --- Reservations (reuse staff logic) ---
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

      const slots = { 'morning':'9:00-11:00','afternoon':'12:00-14:00','late-afternoon':'15:00-17:00','evening':'18:00-20:00' };
      const themes = { 'forest':'Enchanted Forest','royal':'Royal Room' };

      tbody.innerHTML = data.data.map(r => `
        <tr>
          <td>#${r.id}</td>
          <td>${r.party_date}</td>
          <td>${slots[r.time_slot]||r.time_slot}</td>
          <td>${themes[r.theme]||r.theme}</td>
          <td>${esc(r.child_name)} (${r.child_age}yr)</td>
          <td>${esc(r.parent_name)}<br><small style="color:#999;">${esc(r.parent_email)}</small></td>
          <td>${r.package==='lion'?'Lion':'Royal'}</td>
          <td><strong>${r.estimated_total}\u20AC</strong></td>
          <td><span class="status-badge ${r.status}">${r.status}</span></td>
          <td>
            <button class="action-btn view" data-action="view" data-id="${r.id}">View</button>
            ${r.status==='pending'?`<button class="action-btn confirm" data-action="confirm" data-id="${r.id}">Confirm</button><button class="action-btn reject" data-action="reject" data-id="${r.id}">Reject</button>`:''}
            ${r.status==='confirmed'?`<button class="action-btn reject" data-action="cancel" data-id="${r.id}">Cancel</button>`:''}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:#c00;">Failed to load.</td></tr>';
    }
  }

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

  document.getElementById('filterBtn').addEventListener('click', () => {
    loadReservations({
      status: document.getElementById('filterStatus').value,
      date: document.getElementById('filterDate').value,
      search: document.getElementById('filterSearch').value
    });
  });

  document.getElementById('filterSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('filterBtn').click();
  });

  // --- View Reservation Detail ---
  async function viewReservation(id) {
    try {
      const res = await Auth.apiFetch(`/api/reservations/${id}`);
      const data = await res.json();
      if (!data.success) return;
      const r = data.data;
      const slots = { 'morning':'9:00-11:00','afternoon':'12:00-14:00','late-afternoon':'15:00-17:00','evening':'18:00-20:00' };
      document.getElementById('modalContent').innerHTML = `
        <div class="detail-row"><span class="detail-label">ID</span><span class="detail-value">#${r.id}</span></div>
        <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="status-badge ${r.status}">${r.status}</span></span></div>
        <div class="detail-row"><span class="detail-label">Parent</span><span class="detail-value">${esc(r.parent_name)}</span></div>
        <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${esc(r.parent_phone)}</span></div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${esc(r.parent_email)}</span></div>
        <div class="detail-row"><span class="detail-label">Child</span><span class="detail-value">${esc(r.child_name)} (${r.child_age}yr)</span></div>
        <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${r.party_date}</span></div>
        <div class="detail-row"><span class="detail-label">Time</span><span class="detail-value">${slots[r.time_slot]||r.time_slot}</span></div>
        <div class="detail-row"><span class="detail-label">Theme</span><span class="detail-value">${r.theme==='forest'?'Enchanted Forest':'Royal Room'}</span></div>
        <div class="detail-row"><span class="detail-label">Package</span><span class="detail-value">${r.package==='lion'?'Lion (290\u20AC)':'Royal (440\u20AC)'}</span></div>
        <div class="detail-row"><span class="detail-label">Children</span><span class="detail-value">${r.num_children}</span></div>
        <div class="detail-row"><span class="detail-label">Adults</span><span class="detail-value">${r.num_adults}</span></div>
        <div class="detail-row"><span class="detail-label">Extras</span><span class="detail-value">Pizza: ${r.addon_pizza}, Cake: ${r.addon_cake}, Extra kids: ${r.addon_extra_child}</span></div>
        <div class="detail-row"><span class="detail-label">Total</span><span class="detail-value"><strong>${r.estimated_total}\u20AC</strong></span></div>
        ${r.notes?`<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">${esc(r.notes)}</span></div>`:''}
        ${r.rejection_reason?`<div class="detail-row"><span class="detail-label">Rejection</span><span class="detail-value">${esc(r.rejection_reason)}</span></div>`:''}
        <div class="detail-row"><span class="detail-label">Submitted</span><span class="detail-value">${r.created_at}</span></div>
      `;
      document.getElementById('detailModal').style.display = 'flex';
    } catch (err) {
      console.error(err);
      alert('Failed to load reservation details. Please try again.');
    }
  }

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
        alert('Failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update reservation. Please try again.');
    }
  }

  function openRejectModal(id) {
    currentRejectId = id;
    document.getElementById('rejectReason').value = '';
    document.getElementById('rejectModal').style.display = 'flex';
  };

  document.getElementById('confirmRejectBtn').addEventListener('click', () => {
    if (currentRejectId) {
      updateStatus(currentRejectId, 'rejected', document.getElementById('rejectReason').value);
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
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', (e) => { if (e.target === o) o.style.display = 'none'; });
  });

  // ========================
  // EVENTS MANAGEMENT
  // ========================

  const publishToggle = document.getElementById('eventPublished');
  publishToggle.addEventListener('click', () => {
    const active = publishToggle.classList.toggle('active');
    publishToggle.dataset.value = active ? '1' : '0';
    document.getElementById('publishLabel').textContent = active ? 'Published' : 'Unpublished';
  });

  async function loadEvents() {
    const tbody = document.getElementById('eventsBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#999;">Loading...</td></tr>';
    try {
      const res = await Auth.apiFetch('/api/events/admin');
      const data = await res.json();
      if (!data.success || !data.data.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#999;">No events.</td></tr>';
        return;
      }
      tbody.innerHTML = data.data.map(e => `
        <tr>
          <td>#${e.id}</td>
          <td>${e.event_date}</td>
          <td>${e.event_time || '-'}</td>
          <td>${esc(e.title_hr)}</td>
          <td>${esc(e.title_en)}</td>
          <td>${e.is_published ? '<span style="color:#27AE60;font-weight:700;">Yes</span>' : '<span style="color:#999;">No</span>'}</td>
          <td>
            <button class="action-btn edit" data-event-action="edit" data-event-id="${e.id}">Edit</button>
            <button class="action-btn delete" data-event-action="delete" data-event-id="${e.id}">Delete</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#c00;">Failed to load.</td></tr>';
    }
  }

  // --- Save Event (Create or Update) ---
  document.getElementById('saveEventBtn').addEventListener('click', async () => {
    const editId = document.getElementById('eventEditId').value;
    const body = {
      title_hr: document.getElementById('eventTitleHr').value,
      title_en: document.getElementById('eventTitleEn').value,
      description_hr: document.getElementById('eventDescHr').value,
      description_en: document.getElementById('eventDescEn').value,
      event_date: document.getElementById('eventDate').value,
      event_time: document.getElementById('eventTime').value || null,
      is_published: publishToggle.dataset.value === '1'
    };

    if (!body.title_hr || !body.title_en || !body.event_date) {
      alert('Title (HR + EN) and date are required.');
      return;
    }

    try {
      if (editId) {
        await Auth.apiFetch(`/api/events/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await Auth.apiFetch('/api/events', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      clearEventForm();
      loadEvents();
    } catch (err) {
      console.error('Save event error:', err);
    }
  });

  // --- Event delegation for events table ---
  document.getElementById('eventsBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-event-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.eventId);
    if (btn.dataset.eventAction === 'edit') editEvent(id);
    else if (btn.dataset.eventAction === 'delete') deleteEvent(id);
  });

  // --- Edit Event ---
  async function editEvent(id) {
    try {
      const res = await Auth.apiFetch(`/api/events/admin`);
      const data = await res.json();
      const event = data.data.find(e => e.id === id);
      if (!event) return;

      document.getElementById('eventEditId').value = event.id;
      document.getElementById('eventTitleHr').value = event.title_hr;
      document.getElementById('eventTitleEn').value = event.title_en;
      document.getElementById('eventDescHr').value = event.description_hr || '';
      document.getElementById('eventDescEn').value = event.description_en || '';
      document.getElementById('eventDate').value = event.event_date;
      document.getElementById('eventTime').value = event.event_time || '';

      if (event.is_published) {
        publishToggle.classList.add('active');
        publishToggle.dataset.value = '1';
        document.getElementById('publishLabel').textContent = 'Published';
      } else {
        publishToggle.classList.remove('active');
        publishToggle.dataset.value = '0';
        document.getElementById('publishLabel').textContent = 'Unpublished';
      }

      document.getElementById('eventFormTitle').textContent = 'Edit Event #' + event.id;
      document.getElementById('cancelEventBtn').style.display = '';
      document.getElementById('eventForm').scrollIntoView({ behavior: 'smooth' });
    } catch (err) { console.error(err); }
  }

  // --- Delete Event ---
  async function deleteEvent(id) {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      await Auth.apiFetch(`/api/events/${id}`, { method: 'DELETE' });
      loadEvents();
    } catch (err) { console.error(err); }
  }

  // --- Cancel Edit ---
  document.getElementById('cancelEventBtn').addEventListener('click', clearEventForm);

  function clearEventForm() {
    document.getElementById('eventEditId').value = '';
    document.getElementById('eventTitleHr').value = '';
    document.getElementById('eventTitleEn').value = '';
    document.getElementById('eventDescHr').value = '';
    document.getElementById('eventDescEn').value = '';
    document.getElementById('eventDate').value = '';
    document.getElementById('eventTime').value = '';
    publishToggle.classList.add('active');
    publishToggle.dataset.value = '1';
    document.getElementById('publishLabel').textContent = 'Published';
    document.getElementById('eventFormTitle').textContent = 'Create New Event';
    document.getElementById('cancelEventBtn').style.display = 'none';
  }

  // ========================
  // GALLERY MANAGEMENT
  // ========================

  async function loadGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    grid.innerHTML = '<p style="text-align:center;padding:40px;color:#999;">Loading gallery...</p>';
    try {
      const res = await Auth.apiFetch('/api/gallery');
      const data = await res.json();
      if (!data.success || !data.data.length) {
        grid.innerHTML = '<p style="text-align:center;padding:40px;color:#999;">No gallery images yet. Upload your first photo above.</p>';
        return;
      }
      grid.innerHTML = data.data.map(img => `
        <div class="gallery-admin-card" data-gallery-id="${img.id}">
          <img src="/gallery-images/${esc(img.filename)}" alt="${esc(img.label_en || img.label_hr || 'Gallery image')}" loading="lazy">
          <div class="gallery-card-info">
            <div class="gallery-card-label">${esc(img.label_hr) || '<em style="color:#999;">No HR label</em>'}</div>
            <div class="gallery-card-sublabel">${esc(img.label_en) || '<em style="color:#999;">No EN label</em>'}</div>
            <div class="gallery-card-order">Sort: ${img.sort_order}</div>
          </div>
          <div class="gallery-card-actions">
            <button class="action-btn edit" data-gallery-action="edit" data-gallery-id="${img.id}">Edit</button>
            <button class="action-btn delete" data-gallery-action="delete" data-gallery-id="${img.id}">Delete</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      grid.innerHTML = '<p style="text-align:center;padding:40px;color:#c00;">Failed to load gallery.</p>';
      console.error('Gallery load error:', err);
    }
  }

  // --- Upload ---
  document.getElementById('uploadGalleryBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('galleryFile');
    const file = fileInput.files[0];
    if (!file) {
      alert('Please select an image file.');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);
    formData.append('label_hr', document.getElementById('galleryLabelHr').value);
    formData.append('label_en', document.getElementById('galleryLabelEn').value);
    formData.append('sort_order', document.getElementById('gallerySortOrder').value || '0');

    const btn = document.getElementById('uploadGalleryBtn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    try {
      const token = Auth.getToken();
      const res = await fetch('/api/gallery', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        // Reset form
        fileInput.value = '';
        document.getElementById('galleryLabelHr').value = '';
        document.getElementById('galleryLabelEn').value = '';
        document.getElementById('gallerySortOrder').value = '0';
        loadGallery();
      } else {
        alert('Upload failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Upload Photo';
    }
  });

  // --- Gallery event delegation ---
  document.getElementById('galleryGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-gallery-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.galleryId);
    if (btn.dataset.galleryAction === 'delete') deleteGalleryImage(id);
    else if (btn.dataset.galleryAction === 'edit') editGalleryImage(id);
  });

  async function deleteGalleryImage(id) {
    if (!confirm('Are you sure you want to delete this image?')) return;
    try {
      const res = await Auth.apiFetch(`/api/gallery/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadGallery();
      } else {
        alert('Delete failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete image.');
    }
  }

  async function editGalleryImage(id) {
    const card = document.querySelector(`.gallery-admin-card[data-gallery-id="${id}"]`);
    if (!card) return;

    const currentHr = card.querySelector('.gallery-card-label').textContent.trim();
    const currentEn = card.querySelector('.gallery-card-sublabel').textContent.trim();
    const currentOrder = card.querySelector('.gallery-card-order').textContent.replace('Sort: ', '').trim();

    const newHr = prompt('Label (HR):', currentHr === 'No HR label' ? '' : currentHr);
    if (newHr === null) return;
    const newEn = prompt('Label (EN):', currentEn === 'No EN label' ? '' : currentEn);
    if (newEn === null) return;
    const newOrder = prompt('Sort order:', currentOrder);
    if (newOrder === null) return;

    try {
      const res = await Auth.apiFetch(`/api/gallery/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          label_hr: newHr,
          label_en: newEn,
          sort_order: parseInt(newOrder) || 0
        })
      });
      const data = await res.json();
      if (data.success) {
        loadGallery();
      } else {
        alert('Update failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Edit error:', err);
      alert('Failed to update image.');
    }
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
