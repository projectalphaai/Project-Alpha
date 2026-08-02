/**
 * Project Alpha — public runtime config
 */
window.PA_CONFIG = {
  API_BASE: "",
  FORMSPREE_FORM_ID: "YOUR_FORMSPREE_ID",
  get formspreeEndpoint() {
    const id = (this.FORMSPREE_FORM_ID || "").trim();
    if (!id || id === "YOUR_FORMSPREE_ID") return null;
    return `https://formspree.io/f/${id}`;
  },
  api(path) {
    return `${this.API_BASE}${path}`;
  }
};
