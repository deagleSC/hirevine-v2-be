import type { JobPipeline } from "../jobs/jobPipelineSchema";

function mergeNode1(
  base: JobPipeline["node1"],
  patch?: Record<string, unknown>,
): JobPipeline["node1"] {
  if (!patch) return base;
  return {
    rubric:
      typeof patch.rubric === "string" && patch.rubric.trim().length > 0
        ? patch.rubric
        : base.rubric,
    mustHaveSkills: Array.isArray(patch.mustHaveSkills)
      ? (patch.mustHaveSkills as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : base.mustHaveSkills,
    niceToHaveSkills: Array.isArray(patch.niceToHaveSkills)
      ? (patch.niceToHaveSkills as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : base.niceToHaveSkills,
    passThreshold:
      patch.passThreshold === undefined
        ? base.passThreshold
        : typeof patch.passThreshold === "number"
          ? patch.passThreshold
          : base.passThreshold,
  };
}

function mergeNode2(
  base: JobPipeline["node2"],
  patch?: Record<string, unknown>,
): JobPipeline["node2"] {
  if (!patch) return base;
  const questions = Array.isArray(patch.questions)
    ? patch.questions
    : base.questions;
  return {
    questions: questions as JobPipeline["node2"]["questions"],
  };
}

function mergeNode3(
  base: JobPipeline["node3"],
  patch?: Record<string, unknown>,
): JobPipeline["node3"] {
  if (!patch) return base;
  return {
    reportInstructions:
      typeof patch.reportInstructions === "string" &&
      patch.reportInstructions.trim().length > 0
        ? patch.reportInstructions
        : base.reportInstructions,
    scoringWeightsHint:
      patch.scoringWeightsHint === undefined
        ? base.scoringWeightsHint
        : typeof patch.scoringWeightsHint === "string"
          ? patch.scoringWeightsHint
          : base.scoringWeightsHint,
  };
}

/**
 * Deep-merge recruiter-supplied JSON patches into the current pipeline.
 * Does not add/remove top-level nodes (node1–node3); node2 `questions` replaces when provided.
 */
export function mergePipelinePatches(
  current: JobPipeline,
  patches: {
    node1?: Record<string, unknown>;
    node2?: Record<string, unknown>;
    node3?: Record<string, unknown>;
  },
): JobPipeline {
  return {
    version: 1,
    node1: mergeNode1(current.node1, patches.node1),
    node2: mergeNode2(current.node2, patches.node2),
    node3: mergeNode3(current.node3, patches.node3),
  };
}
