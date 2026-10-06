import api from './api';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user';
const READ_ONLY_KEY = 'read_only';

const authService = {
  async login(username, password) {
    try {
      const response = await api.post('/auth/login', { username, password });

      if (response.data.success) {
        const { token, user, readOnly } = response.data.data;
        this.setToken(token);
        this.setUser(user);
        this.setReadOnly(readOnly);
        return { success: true, user, readOnly: !!readOnly };
      }

      return { success: false, error: response.data.error || 'Login failed' };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed. Please try again.'
      };
    }
  },

  async logout() {
    try {
      // Call logout endpoint if token exists
      if (this.getToken()) {
        await api.post('/auth/logout');
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear local storage
      this.clearAuth();
    }
  },

  async verifyToken() {
    try {
      const response = await api.get('/auth/verify');
      if (response.data.success) {
        this.setReadOnly(response.data.data?.readOnly);
      }
      return response.data.success;
    } catch (error) {
      this.clearAuth();
      return false;
    }
  },

  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },

  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  getUser() {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  },

  // Read-only mode is decided by the API (READ_ONLY env); the UI only hides controls.
  setReadOnly(readOnly) {
    localStorage.setItem(READ_ONLY_KEY, readOnly === false ? 'false' : 'true');
  },

  isReadOnly() {
    return localStorage.getItem(READ_ONLY_KEY) !== 'false';
  },

  clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(READ_ONLY_KEY);
  },

  isAuthenticated() {
    return !!this.getToken();
  },
};

export default authService;
