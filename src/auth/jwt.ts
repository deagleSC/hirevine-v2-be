import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../models/User";

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

const ROLES: UserRole[] = ["recruiter", "candidate", "admin"];

function isUserRole(s: string): s is UserRole {
  return (ROLES as string[]).includes(s);
}

export function signAuthToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresInSec });
}

export function verifyAuthToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid token");
  }
  const { sub, email, role } = decoded as Record<string, unknown>;
  if (
    typeof sub !== "string" ||
    typeof email !== "string" ||
    typeof role !== "string"
  ) {
    throw new Error("Invalid token payload");
  }
  if (!isUserRole(role)) {
    throw new Error("Invalid token role");
  }
  return { sub, email, role };
}
