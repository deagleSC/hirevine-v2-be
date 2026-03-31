import mongoose, { type Document, Schema, type Types } from "mongoose";

/**
 * RBAC: recruiters manage org jobs; candidates use the apply portal.
 * Marketplace: jobs carry their employer `organizationId`; candidates often have
 * `organizationId: null` and may apply across orgs—authorization for apply lives
 * on POST apply (active job, one run per candidate per job, etc.), not on matching org.
 */
export type UserRole = "recruiter" | "candidate" | "admin";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  role: UserRole;
  /** Recruiters/admins: employer org. Candidates: usually unset (platform / cross-org apply). */
  organizationId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["recruiter", "candidate", "admin"],
      required: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>("User", userSchema);
