// assets/js/auth.js
// Use existing API base, or default
window.LT_API_BASE = window.LT_API_BASE || 'https://on3e0z9ssf.execute-api.us-east-2.amazonaws.com';

const LTAuth = {
  _KEY: 'LT_USER',   // localStorage key for auth

  _saveUser(user) {
    try {
      if (!user) {
        localStorage.removeItem(this._KEY);
      } else {
        localStorage.setItem(this._KEY, JSON.stringify(user));
      }
    } catch (e) {
      console.warn('Could not save user to localStorage', e);
    }

    // keep app.js in sync if LT_setCurrentUser exists
    if (typeof window.LT_setCurrentUser === 'function') {
      window.LT_setCurrentUser(user || null);
    }
  },

  // Allow app.js to push a user into auth.js
//   setUser(user) {
//     this._saveUser(user || null);
//   },

  getUser() {
    try {
      const raw = localStorage.getItem(this._KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  logout() {
    this._saveUser(null);
    // Optional: redirect home
    window.location.href = 'index.html';
  },

  async signup(name, email, password) {
    const r = await fetch(`${window.LT_API_BASE}/auth/signup`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    let data = {};
    try { data = await r.json(); } catch {}

    // Treat HTTP error OR explicit ok:false as failure
    if (!r.ok || data.ok === false) {
      throw new Error(data.error || data.message || 'Signup failed');
    }

    // Be flexible with backend shape
    const user = data.user || {
      id:    data.id,
      name:  data.name || name,
      email: data.email || email
    };

    this._saveUser(user);
    return user;
  },

  async login(email, password) {
    const r = await fetch(`${window.LT_API_BASE}/auth/login`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    let data = {};
    try { data = await r.json(); } catch {}

    if (!r.ok || data.ok === false) {
      throw new Error(data.error || data.message || 'Login failed');
    }

    const user = data.user || {
      id:    data.id,
      name:  data.name,
      email: data.email || email
    };

    this._saveUser(user);
    return user;
  }
};

window.LTAuth = LTAuth;