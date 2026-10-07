import {
  isApplicationRole,
  type ApplicationRole,
  type UserIdentity,
} from "../../../packages/domain/src/auth.js";

export type PrototypeAuthHeaders = Record<string, string | string[] | undefined>;

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolvePrototypeIdentity(
  headers: PrototypeAuthHeaders,
  environment = process.env.NODE_ENV ?? "development",
): UserIdentity | null {
  if (environment === "production") {
    return null;
  }

  const subject = firstHeader(headers["x-prototype-user"]);
  if (!subject) {
    return null;
  }

  const roleHeader = firstHeader(headers["x-prototype-role"]) ?? "Learner";
  const roles = roleHeader
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is ApplicationRole => isApplicationRole(role));

  if (roles.length === 0) {
    return null;
  }

  return {
    subject,
    displayName: firstHeader(headers["x-prototype-display-name"]),
    roles,
  };
}
