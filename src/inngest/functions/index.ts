import type { InngestFunction } from "inngest";
import { applicationCreatedNode1 } from "./applicationCreated";
import { quizSubmittedNode3 } from "./quizSubmitted";

export const inngestFunctions: InngestFunction.Like[] = [
  applicationCreatedNode1,
  quizSubmittedNode3,
];
