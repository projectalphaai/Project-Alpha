/* Login / Signup page handlers */

document.addEventListener("DOMContentLoaded", () => {
    if (!window.AlphaAuth) return;

    if (document.getElementById("login-form")) {
        AlphaAuth.redirectIfAuthed("./dashboard.html");
        initLogin();
    }
    if (document.getElementById("signup-form")) {
        AlphaAuth.redirectIfAuthed("./dashboard.html");
        initSignup();
    }
});

function setLoading(btn, loading) {
    if (!btn) return;
    const spinner = btn.querySelector(".btn-spinner");
    btn.disabled = loading;
    btn.classList.toggle("is-loading", loading);
    if (spinner) spinner.hidden = !loading;
}

function setFieldError(input, errorEl, message) {
    if (errorEl) errorEl.textContent = message || "";
    input?.classList.toggle("invalid", Boolean(message));
}

function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function initLogin() {
    const form = document.getElementById("login-form");
    const email = document.getElementById("login-email");
    const password = document.getElementById("login-password");
    const formError = document.getElementById("login-form-error");
    const submit = document.getElementById("login-submit");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        formError.hidden = true;
        formError.textContent = "";

        let ok = true;
        const emailVal = (email.value || "").trim();
        const passVal = password.value || "";

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
            setFieldError(email, document.getElementById("login-email-error"), "Enter a valid email.");
            ok = false;
        } else {
            setFieldError(email, document.getElementById("login-email-error"), "");
        }

        if (!passVal) {
            setFieldError(password, document.getElementById("login-password-error"), "Enter your password.");
            ok = false;
        } else {
            setFieldError(password, document.getElementById("login-password-error"), "");
        }

        if (!ok) return;

        setLoading(submit, true);
        await delay(700);
        const result = AlphaAuth.login({ email: emailVal, password: passVal });
        setLoading(submit, false);

        if (!result.ok) {
            formError.hidden = false;
            formError.textContent = result.error;
            return;
        }

        window.location.href = "./dashboard.html";
    });

    [email, password].forEach((el) => {
        el?.addEventListener("input", () => {
            el.classList.remove("invalid");
            const err = document.getElementById(el.id + "-error");
            if (err) err.textContent = "";
            formError.hidden = true;
        });
    });
}

function initSignup() {
    const form = document.getElementById("signup-form");
    const name = document.getElementById("signup-name");
    const email = document.getElementById("signup-email");
    const password = document.getElementById("signup-password");
    const confirm = document.getElementById("signup-confirm");
    const formError = document.getElementById("signup-form-error");
    const submit = document.getElementById("signup-submit");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        formError.hidden = true;
        formError.textContent = "";

        let ok = true;
        const nameVal = (name.value || "").trim();
        const emailVal = (email.value || "").trim();
        const passVal = password.value || "";
        const confirmVal = confirm.value || "";

        if (nameVal.length < 2) {
            setFieldError(name, document.getElementById("signup-name-error"), "Enter your full name.");
            ok = false;
        } else {
            setFieldError(name, document.getElementById("signup-name-error"), "");
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
            setFieldError(email, document.getElementById("signup-email-error"), "Enter a valid email.");
            ok = false;
        } else {
            setFieldError(email, document.getElementById("signup-email-error"), "");
        }

        if (passVal.length < 8) {
            setFieldError(password, document.getElementById("signup-password-error"), "Use at least 8 characters.");
            ok = false;
        } else {
            setFieldError(password, document.getElementById("signup-password-error"), "");
        }

        if (confirmVal !== passVal) {
            setFieldError(confirm, document.getElementById("signup-confirm-error"), "Passwords do not match.");
            ok = false;
        } else {
            setFieldError(confirm, document.getElementById("signup-confirm-error"), "");
        }

        if (!ok) return;

        setLoading(submit, true);
        await delay(900);
        const result = AlphaAuth.signup({ name: nameVal, email: emailVal, password: passVal });
        setLoading(submit, false);

        if (!result.ok) {
            formError.hidden = false;
            formError.textContent = result.error;
            return;
        }

        window.location.href = "./dashboard.html";
    });

    [name, email, password, confirm].forEach((el) => {
        el?.addEventListener("input", () => {
            el.classList.remove("invalid");
            const err = document.getElementById(el.id + "-error");
            if (err) err.textContent = "";
            formError.hidden = true;
        });
    });
}
