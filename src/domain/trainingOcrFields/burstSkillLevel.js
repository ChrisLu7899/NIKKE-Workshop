import { recognizeSkillField } from "./skillLevelShared.js";

export const field = "burstSkillLevel";
export const recognize = (context) => recognizeSkillField(context, field, "burst");
