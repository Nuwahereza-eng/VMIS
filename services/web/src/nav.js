// Central navigation config so the sidebar and the topbar page title stay in
// sync. `roles` (when present) limits an item to those session roles.
export const NAV_ITEMS = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: "bi-grid-1x2",
    title: "Operations dashboard",
    subtitle: "Live park activity, revenue, and station sync health",
    roles: ["management"],
  },
  {
    to: "/register",
    label: "Register",
    icon: "bi-person-plus",
    title: "Register visitor",
    subtitle: "Create a single record per visitor, offline-safe",
  },
  {
    to: "/verify",
    label: "Verify",
    icon: "bi-qr-code-scan",
    title: "Verify visitor",
    subtitle: "Check identity and ticket validity against this device",
  },
  {
    to: "/visits",
    label: "Entry / Exit",
    icon: "bi-door-open",
    title: "Entry and exit",
    subtitle: "Record gate movements and track who is inside the park",
  },
  {
    to: "/activities",
    label: "Activities",
    icon: "bi-binoculars",
    title: "Activity capture",
    subtitle: "Log activities per visitor; the server prices them on sync",
  },
  {
    to: "/sync",
    label: "Sync",
    icon: "bi-arrow-repeat",
    title: "Synchronisation",
    subtitle: "Upload queued work to the central system",
    showOutbox: true,
  },
];
