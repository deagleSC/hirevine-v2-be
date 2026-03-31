import mongoose, { type Document, Schema } from "mongoose";

/** Hiring company / tenant. Jobs always belong to one org; candidates are platform users and may have no org. */
export interface IOrganization extends Document {
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
  },
  { timestamps: true },
);

export const Organization = mongoose.model<IOrganization>(
  "Organization",
  organizationSchema,
);
