import mongoose, { type Document, Schema, type Types } from "mongoose";

export type NodeResultType = "RESUME_ANALYSIS" | "QUIZ_RESULT" | "FINAL_REPORT";

export interface INodeResult extends Document {
  applicationRunId: Types.ObjectId;
  jobId: Types.ObjectId;
  organizationId: Types.ObjectId;
  /** 1 = resume, 2 = quiz, 3 = final report (fixed pipeline). */
  nodeIndex: 1 | 2 | 3;
  nodeType: NodeResultType;
  score?: number;
  reasoning?: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const nodeResultSchema = new Schema<INodeResult>(
  {
    applicationRunId: {
      type: Schema.Types.ObjectId,
      ref: "ApplicationRun",
      required: true,
      index: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    nodeIndex: { type: Number, required: true, enum: [1, 2, 3] },
    nodeType: {
      type: String,
      enum: ["RESUME_ANALYSIS", "QUIZ_RESULT", "FINAL_REPORT"],
      required: true,
    },
    score: { type: Number, min: 0, max: 100 },
    reasoning: { type: String },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

nodeResultSchema.index({ applicationRunId: 1, nodeIndex: 1 }, { unique: true });

export const NodeResult = mongoose.model<INodeResult>(
  "NodeResult",
  nodeResultSchema,
);
