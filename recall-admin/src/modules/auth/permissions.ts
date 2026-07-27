export type Role = "PRIMARY_ADMIN" | "ADMIN" | "OPERATOR";

export type Permission =
  | "users:read"
  | "users:reveal-sensitive"
  | "users:import"
  | "users:export"
  | "tasks:work"
  | "mail:send-reviewed"
  | "rules:publish"
  | "location-rules:publish"
  | "operators:manage"
  | "admins:manage"
  | "integrations:manage"
  | "audit:read";

const permissions: Record<Role, ReadonlySet<Permission>> = {
  PRIMARY_ADMIN: new Set([
    "users:read",
    "users:reveal-sensitive",
    "users:import",
    "users:export",
    "tasks:work",
    "mail:send-reviewed",
    "rules:publish",
    "location-rules:publish",
    "operators:manage",
    "admins:manage",
    "integrations:manage",
    "audit:read"
  ]),
  ADMIN: new Set([
    "users:read",
    "users:reveal-sensitive",
    "users:import",
    "tasks:work",
    "mail:send-reviewed",
    "rules:publish",
    "operators:manage",
    "integrations:manage",
    "audit:read"
  ]),
  OPERATOR: new Set([
    "users:read",
    "users:reveal-sensitive",
    "tasks:work",
    "mail:send-reviewed"
  ])
};

export function can(role: Role, permission: Permission): boolean {
  return permissions[role].has(permission);
}
