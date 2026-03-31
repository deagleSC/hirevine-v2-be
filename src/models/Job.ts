import mongoose, { type Document, Schema, type Types } from "mongoose";
import type { JobPipeline } from "../jobs/jobPipelineSchema";

export type JobStatus = "draft" | "active" | "paused" | "closed";

export interface IJob extends Document {
  organizationId: Types.ObjectId;
  createdBy: Types.ObjectId;
  title: string;
  description: string;
  status: JobStatus;
  /** Fixed 3-node pipeline (resume → quiz → report). Omitted from public API responses. */
  pipeline?: JobPipeline | null;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, default: "" },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "closed"],
      required: true,
      default: "draft",
      index: true,
    },
    pipeline: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

jobSchema.index({ organizationId: 1, status: 1 });

export const Job = mongoose.model<IJob>("Job", jobSchema);
