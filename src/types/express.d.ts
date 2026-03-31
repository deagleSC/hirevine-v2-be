import type { UserRole } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; email: string; role: UserRole };
      /** Set by `requireRecruiterOrganization` — recruiter/admin’s org for job routes. */
      orgId?: string;
    }
  }
}

export {};
