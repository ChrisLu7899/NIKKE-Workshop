// SPDX-License-Identifier: GPL-3.0-or-later

import characterSkillIconCatalog from "../data/characterSkillIconCatalog.json" with { type: "json" };

const SKILL_ICON_ROOT = "/ui-assets/nikke/skill-icons";

const resourceIdOf = (character) => String(
  character?.resource_id
    ?? character?.resourceId
    ?? character?.base?.resourceId
    ?? "",
).trim();

export function getNikkeSkillIconUrls(character) {
  const entry = characterSkillIconCatalog[resourceIdOf(character)] || {};
  return [
    { key: "skill1", label: "技能 1", url: entry.skill1 ? `${SKILL_ICON_ROOT}/${entry.skill1}` : "" },
    { key: "skill2", label: "技能 2", url: entry.skill2 ? `${SKILL_ICON_ROOT}/${entry.skill2}` : "" },
    { key: "burst", label: "爆裂技能", url: entry.burst ? `${SKILL_ICON_ROOT}/${entry.burst}` : "" },
  ];
}
