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
    to: "/visitors",
    label: "Visitors",
    icon: "bi-people",
    title: "Visitor registry",
    subtitle: "Browse every visitor synced to the central system, park-wide",
    roles: ["management"],
  },
  {
    to: "/register",
    label: "Register Visitor",
    icon: "bi-person-plus",
    title: "Register visitor",
    subtitle: "Create a single record per visitor, offline-safe",
    roles: ["gate_officer", "management"],
  },
  {
    to: "/verify",
    label: "Scan QR Code",
    icon: "bi-qr-code-scan",
    title: "Scan QR Code",
    subtitle: "Scan a visitor's QR to open their profile and ticket status",
    roles: ["gate_officer", "management"],
  },
  {
    to: "/activities",
    label: "Activities",
    icon: "bi-binoculars",
    title: "Add Activity / Payment",
    subtitle: "Log activities per visitor; the server prices them on sync",
    roles: ["activity_officer", "management"],
  },
  {
    to: "/accommodation",
    label: "Accommodation",
    icon: "bi-house-door",
    title: "Accommodation",
    subtitle: "Record and review where visitors are staying",
    roles: ["gate_officer", "management"],
  },
  {
    to: "/payments",
    label: "Payments",
    icon: "bi-cash-coin",
    title: "Payments",
    subtitle: "Revenue captured across activities and stations",
    roles: ["management"],
  },
  {
    to: "/visits",
    label: "Gate Management",
    icon: "bi-door-open",
    title: "Gate management",
    subtitle: "Record entries and exits and track who is inside the park",
    roles: ["gate_officer", "management"],
  },
  {
    to: "/alerts",
    label: "Alerts",
    icon: "bi-bell",
    title: "Alerts",
    subtitle: "Expiry warnings, overstays, and missing exits",
    roles: ["management"],
    showAlerts: true,
  },
  {
    to: "/reports",
    label: "Reports",
    icon: "bi-file-earmark-bar-graph",
    title: "Reports",
    subtitle: "Periodic summaries of visitors, entries, activities, and revenue",
    roles: ["management"],
  },
  {
    to: "/sync",
    label: "Sync Status",
    icon: "bi-arrow-repeat",
    title: "Synchronisation",
    subtitle: "Upload queued work to the central system",
    showOutbox: true,
  },
  {
    to: "/settings",
    label: "Settings",
    icon: "bi-gear",
    title: "Settings",
    subtitle: "Station, session, and working-mode information",
  },
  {
    to: "/users",
    label: "Users",
    icon: "bi-person-badge",
    title: "Users",
    subtitle: "Manage officer and management accounts",
    roles: ["management"],
  },
];

// Nav items a given role may see. Items without a `roles` list are open to all
// (e.g. Sync — every officer queues and uploads their own work).
export function navItemsForRole(role) {
  return NAV_ITEMS.filter((i) => !i.roles || i.roles.includes(role));
}

// The landing route for a role is its first permitted nav item: management
// lands on the dashboard, a gate officer on registration, an activity officer
// on activity capture. Falls back to Sync if a role somehow has nothing else.
export function homeForRole(role) {
  const items = navItemsForRole(role);
  return items.length ? items[0].to : "/sync";
}

