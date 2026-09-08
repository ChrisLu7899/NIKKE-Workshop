import { recognizeSkillField } from "./skillLevelShared.js";

export const field = "skill1Level";
export const recognize = (context) => recognizeSkillField(context, field, "skill1");
