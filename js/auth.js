/* Project Alpha AI — Mock auth (localStorage) */

(function (global) {
    const AUTH_KEYS = {
        users: "pa_users",
        session: "pa_session"
    };

    function loadJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function saveJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }

    function getUsers() {
        let users = loadJSON(AUTH_KEYS.users, []);
        if (!Array.isArray(users)) users = [];

        const demoEmail = "demo@projectalpha.ai";
        const demo = users.find((u) => u.email === demoEmail);
        let dirty = false;

        if (!demo) {
            users.unshift({
                id: 1,
                name: "Alex Rivera",
                email: demoEmail,
                password: "demo1234",
                createdAt: new Date().toISOString()
            });
            dirty = true;
        } else if (demo.password !== "demo1234") {
            /* Investor demos always keep the published demo password */
            demo.password = "demo1234";
            dirty = true;
        }

        if (dirty) saveJSON(AUTH_KEYS.users, users);
        return users;
    }

    function getSession() {
        return loadJSON(AUTH_KEYS.session, null);
    }

    function isLoggedIn() {
        const session = getSession();
        return Boolean(session && session.loggedIn && session.email);
    }

    function setSession(user) {
        return saveJSON(AUTH_KEYS.session, {
            loggedIn: true,
            email: user.email,
            name: user.name,
            createdAt: Date.now()
        });
    }

    function clearSession() {
        try {
            localStorage.removeItem(AUTH_KEYS.session);
        } catch {
            /* ignore */
        }
    }

    function findUser(email) {
        const normalized = String(email || "").trim().toLowerCase();
        return getUsers().find((u) => u.email === normalized) || null;
    }

    function signup({ name, email, password }) {
        const cleanName = String(name || "").trim();
        const cleanEmail = String(email || "").trim().toLowerCase();
        const cleanPassword = String(password || "");

        if (cleanName.length < 2) {
            return { ok: false, error: "Enter your full name (at least 2 characters)." };
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return { ok: false, error: "Enter a valid email address." };
        }
        if (cleanPassword.length < 8) {
            return { ok: false, error: "Password must be at least 8 characters." };
        }
        if (findUser(cleanEmail)) {
            return { ok: false, error: "An account with this email already exists." };
        }

        const users = getUsers();
        const user = {
            id: Date.now(),
            name: cleanName,
            email: cleanEmail,
            /* Demo only — never store plaintext passwords in production */
            password: cleanPassword,
            createdAt: new Date().toISOString()
        };
        users.push(user);
        if (!saveJSON(AUTH_KEYS.users, users)) {
            return { ok: false, error: "Could not save account. Storage may be full." };
        }
        setSession(user);
        return { ok: true, user: { name: user.name, email: user.email } };
    }

    function login({ email, password }) {
        const cleanEmail = String(email || "").trim().toLowerCase();
        const cleanPassword = String(password || "");

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return { ok: false, error: "Enter a valid email address." };
        }
        if (!cleanPassword) {
            return { ok: false, error: "Enter your password." };
        }

        const user = findUser(cleanEmail);
        if (!user || user.password !== cleanPassword) {
            return { ok: false, error: "Invalid email or password." };
        }

        setSession(user);
        return { ok: true, user: { name: user.name, email: user.email } };
    }

    function logout() {
        clearSession();
    }

    function updateAccount({ name, email, password }) {
        const session = getSession();
        if (!session?.email) {
            return { ok: false, error: "Not signed in." };
        }

        const cleanName = String(name || "").trim();
        const cleanEmail = String(email || "").trim().toLowerCase();
        const cleanPassword = password != null ? String(password) : "";

        if (cleanName.length < 2) {
            return { ok: false, error: "Enter a display name (at least 2 characters)." };
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return { ok: false, error: "Enter a valid email address." };
        }
        if (cleanPassword && cleanPassword.length < 8) {
            return { ok: false, error: "Password must be at least 8 characters." };
        }

        const users = getUsers();
        const idx = users.findIndex((u) => u.email === String(session.email).toLowerCase());
        if (idx === -1) {
            return { ok: false, error: "Account not found." };
        }

        const emailTaken = users.some(
            (u, i) => i !== idx && u.email === cleanEmail
        );
        if (emailTaken) {
            return { ok: false, error: "Another account already uses this email." };
        }

        const isDemoAccount =
            users[idx].email === "demo@projectalpha.ai" || cleanEmail === "demo@projectalpha.ai";
        const nextPassword = isDemoAccount
            ? "demo1234"
            : cleanPassword
                ? cleanPassword
                : users[idx].password;

        users[idx] = {
            ...users[idx],
            name: cleanName,
            email: isDemoAccount ? "demo@projectalpha.ai" : cleanEmail,
            password: nextPassword
        };

        if (!saveJSON(AUTH_KEYS.users, users)) {
            return { ok: false, error: "Could not save changes. Storage may be full." };
        }

        setSession(users[idx]);
        return { ok: true, user: { name: users[idx].name, email: users[idx].email } };
    }

    function requireAuth(loginPath) {
        if (!isLoggedIn()) {
            const redirect = loginPath || "./login.html";
            window.location.replace(redirect);
            return false;
        }
        return true;
    }

    function redirectIfAuthed(dashboardPath) {
        if (isLoggedIn()) {
            window.location.replace(dashboardPath || "./dashboard.html");
            return true;
        }
        return false;
    }

    global.AlphaAuth = {
        AUTH_KEYS,
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
