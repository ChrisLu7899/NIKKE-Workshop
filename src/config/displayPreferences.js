// SPDX-License-Identifier: GPL-3.0-or-later

// 妮姬头像、角色卡图片和 Excel 头像统一显示开关。
// 正式构建默认显示；开发者可在未纳入 Git 的 .env.local 中临时开启隐私模式。
const developerPrivacyMode = import.meta.env?.VITE_NIKKE_PRIVACY_MODE === "true";
export const SHOW_NIKKE_IMAGES = !developerPrivacyMode;
