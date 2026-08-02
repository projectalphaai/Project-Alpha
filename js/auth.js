/* Project Alpha — real auth client (cookie session + API) */

(function (global) {
  let cachedUser = null;

  async function getSession() {
    try {
      const data = await AlphaAPI.api("/api/auth/me");
      cachedUser = data.loggedIn ? data.user : null;
      return cachedUser;
    } catch {
      cachedUser = null;
      return null;
    }
  }

  function isLoggedIn() {
    return Boolean(cachedUser);
  }

  async function signup({ name, email, password }) {
    try {
      const data = await AlphaAPI.api("/api/auth/signup", {
        method: "POST",
        body: { name, email, password }
      });
      cachedUser = data.user;
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: err.message || "Signup failed." };
    }
  }

  async function login({ email, password }) {
    try {
      const data = await AlphaAPI.api("/api/auth/login", {
        method: "POST",
        body: { email, password }
      });
      cachedUser = data.user;
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: err.message || "Login failed." };
    }
  }

  async function logout() {
    try {
      await AlphaAPI.api("/api/auth/logout", { method: "POST" });
    } catch {
      /* still clear local cache */
    }
    cachedUser = null;
  }

  async function updateAccount(payload) {
    try {
      const data = await AlphaAPI.api("/api/auth/profile", {
        method: "PUT",
        body: payload
      });
      cachedUser = data.user;
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: err.message || "Could not update profile." };
    }
  }

  async function requireAuth(loginPath) {
    const user = await getSession();
    if (!user) {
      window.location.replace(loginPath || "./login.html");
      return false;
    }
    return true;
  }

  async function redirectIfAuthed(dashboardPath) {
    const user = await getSession();
    if (user) {
      window.location.replace(dashboardPath || "./dashboard.html");
      return true;
    }
    return false;
  }

  global.AlphaAuth = {
    getSession,
    isLoggedIn,
    signup,
    login,
    logout,
    updateAccount,
    requireAuth,
    redirectIfAuthed
  };
})(window);
