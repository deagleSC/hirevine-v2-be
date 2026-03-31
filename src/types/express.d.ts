import type { UserRole } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; email: string; role: UserRole };
    }
  }
}

export {};
