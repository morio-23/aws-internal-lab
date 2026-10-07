export const APPLICATION_ROLES = [
  "Learner",
  "Operator",
  "Administrator",
  "SecurityAuditor",
] as const;

export type ApplicationRole = (typeof APPLICATION_ROLES)[number];

export type UserIdentity = {
  subject: string;
  displayName?: string;
  roles: readonly ApplicationRole[];
};

export type ApplicationPermission =
  | "workspace:read-own"
  | "workspace:mutate-own"
  | "runtime:force-stop"
  | "config:write"
  | "audit:read";

const ROLE_PERMISSIONS: Record<ApplicationRole, readonly ApplicationPermission[]> = {
  Learner: ["workspace:read-own", "workspace:mutate-own"],
  Operator: ["runtime:force-stop"],
  Administrator: ["runtime:force-stop", "config:write", "audit:read"],
  SecurityAuditor: ["audit:read"],
};

export function isApplicationRole(value: string): value is ApplicationRole {
  return (APPLICATION_ROLES as readonly string[]).includes(value);
}

export function hasPermission(
  identity: UserIdentity,
  permission: ApplicationPermission,
): boolean {
  return identity.roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}

export function requirePermission(
  identity: UserIdentity,
  permission: ApplicationPermission,
): void {
  if (!hasPermission(identity, permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
}
