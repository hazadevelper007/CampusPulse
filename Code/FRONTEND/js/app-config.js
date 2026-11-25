// USE_LOCAL_STORAGE = true: accounts and records are kept in this browser (no server needed).
// Set to false and point API_BASE_URL at a Flask REST API to use real endpoints.
window.CONFIG = {
  API_BASE_URL: "/api",
  USE_LOCAL_STORAGE: true,

  // Grace period: a Reserved booking must be verified by a lab assistant within this many
  // minutes AFTER ITS START TIME (as already described on the dashboards), otherwise it is released.
  GRACE_MINUTES: 15,

  // Permitted email domains per role. Edit here if your institution uses different domains.
  EMAIL_DOMAINS: {
    student: ["student.uet.pk"],
    assistant: ["uet.pk"],
    admin: ["uet.pk"]
  },

  // Student departments offered at registration (edit as needed).
  DEPARTMENTS: ["Computer Science", "Software Engineering", "Electrical Engineering", "Mechanical Engineering", "Civil Engineering", "Biomedical Engineering", "Mathematics", "Physics"],

  EMAIL_RE: /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/,

  // Returns "" when the email is valid (and, if a role is given, uses a domain permitted for it).
  emailError(email, role) {
    const v = String(email || "").trim();
    if (!this.EMAIL_RE.test(v)) return "Enter a valid email address.";
    const list = this.EMAIL_DOMAINS[role];
    if (role && list) {
      const dom = v.split("@")[1].toLowerCase();
      if (!list.includes(dom)) {
        const who = { student: "a Student", assistant: "a Lab Assistant", admin: "an Administrator" }[role];
        return "This email domain is not permitted for " + who + " account. Use " + list.map(d => "@" + d).join(" or ") + ".";
      }
    }
    return "";
  },

  // Sign-in check: valid format and a domain that SOME role permits. Whether the chosen role matches the
  // account is reported separately (after the password is verified) as a role-mismatch error.
  loginEmailError(email) {
    const v = String(email || "").trim();
    if (!this.EMAIL_RE.test(v)) return "Enter a valid email address.";
    const dom = v.split("@")[1].toLowerCase();
    if (!Object.values(this.EMAIL_DOMAINS).some(l => l.includes(dom)))
      return "This email domain is not permitted. Use your university email (" + [...new Set(Object.values(this.EMAIL_DOMAINS).flat())].map(d => "@" + d).join(", ") + ").";
    return "";
  },

  // Roll numbers are entered by the student (e.g. CS-810); they are NOT taken from the email or the name.
  normRoll(v) { return String(v || "").trim(); },          // stored and shown exactly as typed
  rollKey(v) { return String(v || "").trim().toUpperCase(); },   // used only to compare (cs-810 and CS-810 are the same roll number)
  rollError(v) {
    v = this.normRoll(v);
    if (!/^[A-Za-z0-9][A-Za-z0-9\-\/]{2,19}$/.test(v) || !/\d/.test(v)) return "Enter a valid roll number such as CS-810 (letters, digits and hyphens; must contain a digit).";
    return "";
  }
};
