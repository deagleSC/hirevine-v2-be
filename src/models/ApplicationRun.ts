import mongoose, { type Document, Schema, type Types } from "mongoose";

export type ApplicationStatus =
  | "NODE_1_PENDING"
  | "NODE_2_PENDING"
  | "NODE_3_PENDING"
  | "COMPLETED"
  | "REJECTED";

export interface IApplicationRun extends Document {
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  /** Denormalized from Job for recruiter queries without joining. */
  organizationId: Types.ObjectId;
  status: ApplicationStatus;
  /** Public URL of the resume file (from Vercel Blob upload in production). */
  resumeUrl: string;
  currentFitScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

const applicationRunSchema = new Schema<IApplicationRun>(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "NODE_1_PENDING",
        "NODE_2_PENDING",
        "NODE_3_PENDING",
        "COMPLETED",
        "REJECTED",
      ],
      required: true,
      default: "NODE_1_PENDING",
    },
    resumeUrl: { type: String, required: true, trim: true },
    currentFitScore: { type: Number, min: 0, max: 100 },
  },
  { timestamps: true },
);

applicationRunSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });
applicationRunSchema.index({ candidateId: 1, createdAt: -1 });
applicationRunSchema.index({ organizationId: 1, jobId: 1 });
applicationRunSchema.index({ organizationId: 1, createdAt: -1 });
applicationRunSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const ApplicationRun = mongoose.model<IApplicationRun>(
  "ApplicationRun",
  applicationRunSchema,
);
