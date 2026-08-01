/**
 * Project Alpha — public runtime config
 * Replace FORMSPREE_FORM_ID with your Formspree form ID from https://formspree.io
 * Example: "xpwkgqyz"
 */
window.PA_CONFIG = {
    FORMSPREE_FORM_ID: "YOUR_FORMSPREE_ID",
    get formspreeEndpoint() {
        const id = (this.FORMSPREE_FORM_ID || "").trim();
        if (!id || id === "YOUR_FORMSPREE_ID") return null;
        return `https://formspree.io/f/${id}`;
    }
};
