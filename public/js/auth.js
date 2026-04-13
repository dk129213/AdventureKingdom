/* =============================================
   Adventure Kingdom - Auth Helper (Staff/Admin)
   ============================================= */

const Auth = {
  getToken() {
    return sessionStorage.getItem('ak_token');
  },

  getRole() {
    return sessionStorage.getItem('ak_role');
  },

  setSession(token, role) {
    sessionStorage.setItem('ak_token', token);
    sessionStorage.setItem('ak_role', role);
  },

  clearSession() {
    sessionStorage.removeItem('ak_token');
    sessionStorage.removeItem('ak_role');
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  async login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      this.setSession(data.token, data.role);
      return { success: true, role: data.role };
    }
    return { success: false, error: data.error || 'Login failed.' };
  },

  async verifyToken() {
    const token = this.getToken();
    if (!token) return false;

    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem('ak_role', data.role);
        return true;
      }
      this.clearSession();
      return false;
    } catch {
      return false;
    }
  },

  // Authenticated fetch wrapper
  async apiFetch(url, options = {}) {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      this.clearSession();
      window.location.reload();
      throw new Error('Session expired');
    }

    return res;
  }
};
