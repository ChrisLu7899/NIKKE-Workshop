import { recognizeSkillField } from "./skillLevelShared.js";

export const field = "skill2Level";
export const recognize = (context) => recognizeSkillField(context, field, "skill2");
