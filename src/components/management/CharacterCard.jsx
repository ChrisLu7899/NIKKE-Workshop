// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from "react";
import { Box } from "@mui/material";
import {
  CHARACTER_CARD_SLOT_KEYS,
  buildCharacterCardData,
  characterCardNumber,
  formatCharacterCardPercent,
  characterCardRarityAsset,
  collectibleDollAssetForWeapon,
  favoriteItemStarCount,
  formatCoreBreakthroughBadge,
} from "../../domain/characterCard.js";
import { getNikkeFavoriteItemIconUrl } from "../../utils/nikkeAvatar.js";
import { getNikkeSkillIconUrls } from "../../utils/nikkeSkillIcons.js";
import { CUBE_ICON_CATALOG } from "../../domain/cubeIconCatalog.js";
import { cubeDisplayAsset } from "../../domain/characterObjectAssets.js";
import { characterMetadataAsset as metaFile } from "../../domain/characterMetadata.js";
import decorationAssets from "../../data/characterDecorationAssets.json";
import { CHARACTER_CARD_WIDTH as CARD_WIDTH, CHARACTER_CARD_HEIGHT as CARD_HEIGHT, DEFAULT_CHARACTER_CARD_MODULES } from "../../domain/characterCardLayout.js";
import "./characterCard.css";

const ASSET_ROOT = "/ui-assets/nikke";

function ScaledCard({ children }) {
  const hostRef = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver !== "function") return undefined;
    const update = () => {
      const widthScale = host.clientWidth / CARD_WIDTH;
      const heightScale = host.clientHeight > 0 ? host.clientHeight / CARD_HEIGHT : 1;
      setScale(Math.min(1, Math.max(0.1, widthScale), Math.max(0.1, heightScale)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  return (
    <Box ref={hostRef} sx={{ display: "grid", width: "100%", height: "100%", minHeight: 0, placeItems: "center", overflow: "hidden" }}>
      <Box sx={{ position: "relative", width: CARD_WIDTH * scale, height: CARD_HEIGHT * scale, flex: "none" }}>
        <Box sx={{ position: "absolute", inset: 0, width: CARD_WIDTH, height: CARD_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

function CharacterArt({ artworkUrl, alt, artworkOffsetX, artworkOffsetY, artworkScale, containArtwork = false }) {
  const [source, setSource] = useState(artworkUrl || "");
  if (!source) return <div className="nikke-card-art-placeholder" aria-label="隐私模式或暂无角色立绘"><span>暂无可用全身立绘</span></div>;
  return (
    <img
      className={`nikke-card-character-art${containArtwork ? " is-contained" : ""}`}
      src={source}
      alt={alt}
      style={{
        objectPosition: "50% 50%",
        transform: `translate(${artworkOffsetX}%, ${artworkOffsetY}%) scale(${artworkScale / 100})`,
        transformOrigin: "50% 50%",
      }}
      onError={() => setSource("")}
    />
  );
}

function RarityBadge({ rarity }) {
  const [failed, setFailed] = useState(false);
  const src = characterCardRarityAsset(rarity);
  return src && !failed
    ? <img className="nikke-card-rarity" src={src} alt={`稀有度 ${rarity}`} onError={() => setFailed(true)} />
    : <span className="nikke-card-rarity nikke-card-rarity-fallback" aria-label={`稀有度 ${rarity || "未知"}`}>{rarity || "—"}</span>;
}

function MetadataImage({ src }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img src={src} alt="" aria-hidden="true" onError={() => setFailed(true)} />
    : <span aria-hidden="true">—</span>;
}

function Decoration({ name, className = "" }) {
  const [failed, setFailed] = useState(false);
  return <span className={`nikke-card-decoration ${className}${failed ? " is-unavailable" : ""}`} aria-hidden="true">
    {!failed ? <img src={decorationAssets[name]} alt="" onError={() => setFailed(true)} /> : null}
  </span>;
}

function LevelBadge({ value, label }) {
  return <small className="nikke-card-level-badge" aria-label={label}>
    <Decoration name="level-badge" /><b>{value}</b>
  </small>;
}

function IdentityPanel({ data, skillIcons, visibleModules }) {
  const metadata = [
    { group: "burst", value: data.burstStage, alt: "爆裂阶段", kind: "native" },
    { group: "element", value: data.element, alt: "属性", kind: "native element" },
    { group: "weapon", value: data.weaponType, alt: "武器", kind: "glyph weapon" },
    { group: "class", value: data.className, alt: "职业", kind: "glyph class", level: data.classLevel },
    { group: "manufacturer", value: data.corporation, alt: "企业", kind: "glyph manufacturer", level: data.corporationLevel },
  ];
  const filledStars = Math.max(0, Math.min(3, Number(data.limitBreak.grade) || 0));
  const coreBadge = formatCoreBreakthroughBadge(data.limitBreak.core);
  const hasVisibleContent = ["rarity", "levelName", "affection", "combat", "metadata", "skills", "cube"]
    .some((key) => visibleModules[key]);
  if (!hasVisibleContent) return null;
  const renderMetadata = (item) => {
    const src = metaFile(item.group, item.value);
    const hasLevel = item.group === "class" || item.group === "manufacturer";
    const numericLevel = item.level === null || item.level === undefined || item.level === ""
      ? null
      : Number(item.level);
    const levelLabel = Number.isFinite(numericLevel) ? Math.max(0, Math.trunc(numericLevel)) : "—";
    const identityLabel = `${item.alt} ${src ? item.value : "未知"}`;
    const accessibleLabel = hasLevel ? `${identityLabel}，等级${levelLabel}` : identityLabel;
    return (
      <span key={item.group} className={`nikke-card-meta ${item.kind}`} role="img" title={accessibleLabel} aria-label={accessibleLabel}>
        <MetadataImage key={src} src={src} />
        {hasLevel ? <small className="nikke-card-meta-level" aria-hidden="true"><b>LV.</b><strong>{levelLabel}</strong></small> : null}
      </span>
    );
  };
  return (
    <section className="nikke-card-identity" aria-label={`${data.name}角色信息`}>
      {visibleModules.rarity ? <div className="nikke-card-rarity-row">
        <RarityBadge key={data.rarity} rarity={data.rarity} />
        <div className="nikke-card-breakthrough" aria-label={`${filledStars}星，核心突破${coreBadge || 0}`}>
          <span className="nikke-card-stars" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <img key={index} src={`${ASSET_ROOT}/metadata/breakthrough/star-${index < filledStars ? "filled" : "empty"}.png`} alt="" />
            ))}
          </span>
          {coreBadge ? (
            <span className="nikke-card-core">
              <img src={`${ASSET_ROOT}/metadata/breakthrough/core-frame.png`} alt="" />
              <strong className={coreBadge === "MAX" ? "is-max" : undefined}>{coreBadge}</strong>
            </span>
          ) : null}
        </div>
      </div> : null}
      {visibleModules.levelName ? <div className={`nikke-card-level-name ${data.name.length >= 8 ? "long-name" : ""}`}>
        <span className="nikke-card-level">LV. <strong>{data.level ?? "—"}</strong></span>
        <h2 title={data.name}>{data.name}</h2>
      </div> : null}
      {visibleModules.affection ? <div className="nikke-card-affection" aria-label={`好感度 ${data.affection ?? "未知"}`}>
        <Decoration name="affection-frame" className="nikke-card-affection-frame" />
        <span className="nikke-card-affection-caption"><b aria-hidden="true">»</b> attraction</span><strong>RANK</strong>
        <em className={String(data.affection ?? "—").length > 2 ? "is-wide" : undefined}>
          <Decoration name="heart" className="nikke-card-affection-heart" /><b>{data.affection ?? "—"}</b>
        </em>
      </div> : null}
      {visibleModules.combat ? <div className="nikke-card-combat">
        <span>战斗力</span><strong>{data.combat ?? "—"}</strong><b>BATTLE</b>
      </div> : null}
      {visibleModules.metadata ? <div className="nikke-card-meta-stack">
        <span className="nikke-card-meta-row is-primary">{metadata.slice(0, 3).map(renderMetadata)}</span>
        <span className="nikke-card-meta-row is-secondary">{metadata.slice(3).map(renderMetadata)}</span>
      </div> : null}
      {visibleModules.skills ? <SkillLevelPanel data={data} skillIcons={skillIcons} /> : null}
      {visibleModules.cube ? <CubePanel data={data} /> : null}
    </section>
  );
}

function ObjectImage({ src, className, alt = "" }) {
  const [failedSource, setFailedSource] = useState("");
  if (!src || src === failedSource) return null;
  return <img src={src} className={className} alt={alt} onError={() => setFailedSource(src)} />;
}

function FavoriteItemPanel({ data, favoriteItemIconUrl }) {
  const rarity = String(data.favoriteItemRarity || "").trim().toUpperCase();
  const level = characterCardNumber(data.favoriteItemLevel);
  const hasLevel = level !== null && level >= 0;
  if (!rarity && (!hasLevel || level === 0)) return null;
  const levelLabel = hasLevel ? Math.trunc(level) : "—";
  const observed = data.favoriteItemObservation;
  const starCount = hasLevel ? favoriteItemStarCount(rarity, levelLabel)
    : observed?.rarity === rarity && Number.isInteger(observed.stars) && observed.stars >= 0 && observed.stars <= 3 ? observed.stars : null;
  const starsLabel = starCount === null ? "星级未知" : `${starCount}星`;
  const isFavoriteItem = rarity === "SSR";
  const dollAsset = collectibleDollAssetForWeapon(data.weaponType);
  const imageUrl = isFavoriteItem && favoriteItemIconUrl
    ? favoriteItemIconUrl
    : dollAsset ? `${ASSET_ROOT}/character-card/${dollAsset}` : "";
  const itemLabel = isFavoriteItem ? "珍藏品" : "收藏品";
  return (
    <section
      className={`nikke-card-favorite-item is-${rarity.toLocaleLowerCase() || "unknown"}${isFavoriteItem && favoriteItemIconUrl ? " has-favorite-icon" : ""}`}
      aria-label={`${itemLabel}${rarity ? ` ${rarity}` : ""}，${starsLabel}`}
    >
      <span className="nikke-card-favorite-mascot" aria-hidden="true">
        <ObjectImage src={imageUrl} />
      </span>
      <span className="nikke-card-favorite-stars" title={`${rarity || itemLabel}，${starsLabel}`} aria-hidden="true">
        {starCount === null ? <b>—</b> : [0, 1, 2].map((index) => <i className={index < starCount ? "filled" : undefined} key={index}>★</i>)}
      </span>
    </section>
  );
}

function SkillLevelPanel({ data, skillIcons }) {
  const levels = [data.skill1Level, data.skill2Level, data.burstSkillLevel];
  const skills = skillIcons
    .map((skill, index) => ({ ...skill, level: Number(levels[index]) }))
    .filter((skill) => skill.url && Number.isFinite(skill.level) && skill.level >= 1 && skill.level <= 10);
  if (!skills.length) return null;
  const standardSkills = skills.filter((skill) => skill.key !== "burst");
  const burstSkill = skills.find((skill) => skill.key === "burst");
  const renderSkill = (skill) => (
    <span className={`nikke-card-skill is-${skill.key}`} key={skill.key} title={`${skill.label} LV.${skill.level}`}>
      <Decoration name="skill-frame" className="nikke-card-skill-frame" />
      <ObjectImage className="nikke-card-skill-glyph" src={skill.url} alt={skill.label} />
      <LevelBadge value={skill.level} label={`等级 ${skill.level}`} />
    </span>
  );
  return (
    <section className="nikke-card-skills" aria-label="技能等级">
      <span className="nikke-card-standard-skills">{standardSkills.map(renderSkill)}</span>
      {burstSkill ? renderSkill(burstSkill) : null}
    </section>
  );
}

function CubePanel({ data }) {
  const normalizedName = (value) => String(value || "").trim().toLocaleLowerCase();
  const cube = CUBE_ICON_CATALOG.find((item) => (
    (Number.isFinite(Number(data.cubeId)) && item.cubeId === Number(data.cubeId))
    || (Number.isFinite(Number(data.cubeResourceId)) && item.resourceId === Number(data.cubeResourceId))
    || (normalizedName(data.cubeNameCn) && normalizedName(item.nameCn) === normalizedName(data.cubeNameCn))
    || (normalizedName(data.cubeNameEn) && normalizedName(item.nameEn) === normalizedName(data.cubeNameEn))
  ));
  const numericLevel = Number(data.cubeLevel);
  const hasLevel = Number.isInteger(numericLevel) && numericLevel >= 1 && numericLevel <= 15;
  if (!cube && !hasLevel) return null;
  const name = cube?.nameCn || data.cubeNameCn || data.cubeNameEn || "魔方";
  return (
    <section className="nikke-card-cube" aria-label={`${name}，等级${hasLevel ? Math.trunc(numericLevel) : "未知"}`} title={name}>
      <span className="nikke-card-cube-art" aria-hidden="true">
        {cube ? <ObjectImage src={cubeDisplayAsset(cube.resourceId)} /> : <b>◇</b>}
      </span>
      <LevelBadge value={hasLevel ? Math.trunc(numericLevel) : "—"} label={`等级 ${hasLevel ? Math.trunc(numericLevel) : "未知"}`} />
    </section>
  );
}

function AffixValue({ line }) {
  if (!line) return <><span className="nikke-card-affix-name">—</span><span className="nikke-card-affix-values">—</span></>;
  const tier = characterCardNumber(line.level);
  return (
    <>
      <span className="nikke-card-affix-name" title={line.label}>{line.label}</span>
      <span className="nikke-card-affix-values"><span>【{tier ?? "—"}档】</span><strong>{formatCharacterCardPercent(line.value)}</strong></span>
    </>
  );
}

function EquipmentImage({ src, className, fallback = null }) {
  const [failedSource, setFailedSource] = useState("");
  return src && failedSource !== src ? <img className={className} src={src} alt="" onError={() => setFailedSource(src)} /> : fallback;
}

function EquipmentCard({ data, slotIndex }) {
  const equipment = data.equipmentDisplays[slotIndex];
  const classIcon = metaFile("class", equipment.className);
  const manufacturerIcon = metaFile('manufacturer', equipment.manufacturer);
  return (
    <article className="nikke-card-equipment">
      <span className={`nikke-card-equipment-icon${equipment.isOverload ? '' : ' is-standard'}`} aria-label={equipment.label} title={equipment.label} data-equipment-tier={equipment.tier} data-equipment-tid={equipment.tid ?? equipment.metadata?.tid ?? ''}>
        <EquipmentImage className="nikke-card-equipment-art" src={equipment.icon} fallback={<span className="nikke-card-equipment-placeholder">{equipment.state === 'empty' ? '未装备' : '暂无图标'}</span>} />
        <span className="nikke-card-equipment-badges" aria-hidden="true">
          {equipment.isOverload ? <span className="nikke-card-overload-badge" data-badge-kind="overload"><EquipmentImage src={`${ASSET_ROOT}/equipment/overload-badge.png`} /></span> : null}
          {manufacturerIcon ? <span className="nikke-card-class-badge nikke-card-manufacturer-badge" data-badge-kind="manufacturer"><i /><EquipmentImage src={manufacturerIcon} /></span> : null}
          {classIcon ? <span className="nikke-card-class-badge" data-badge-kind="class"><i /><EquipmentImage src={classIcon} /></span> : null}
        </span>
        {equipment.tier && !equipment.isOverload ? <span className="nikke-card-equipment-tier">{equipment.tier}</span> : null}
      </span>
      <div className="nikke-card-affix-lines">
        {data.equipments[slotIndex].map((line, lineIndex) => {
          const tier = Number(line?.level);
          const className = tier === 15 ? "tier-15" : tier >= 12 ? "tier-blue" : "";
          return <div className={`nikke-card-affix-line ${className}`} key={lineIndex}><AffixValue line={line} /></div>;
        })}
      </div>
    </article>
  );
}

function EquipmentPanel({ data, visibleModules }) {
  if (!visibleModules.affixSummary && !visibleModules.equipments) return null;
  return (
    <section className="nikke-card-equipment-panel" aria-label="四件装备和词条">
      {visibleModules.affixSummary && data.topAffixes.length ? (
        <div className="nikke-card-affix-summary" aria-label="档位合计最高的三个词条">
          {data.topAffixes.map((item) => (
            <div key={item.functionType}>
              <span title={item.label}>{item.label}</span>
              <span>【{item.totalLevel}档】<strong>{formatCharacterCardPercent(item.totalValue)}</strong></span>
            </div>
          ))}
        </div>
      ) : null}
      {visibleModules.equipments ? <div className="nikke-card-equipment-grid">
        {CHARACTER_CARD_SLOT_KEYS.map((slot, index) => <EquipmentCard key={slot} data={data} slotIndex={index} />)}
      </div> : null}
    </section>
  );
}

export default function CharacterCard({ catalogCharacter, characterData, preparedData, artworkUrl, artworkPreference, visibleModules, cardRef, squareArtwork = false }) {
  const data = useMemo(() => preparedData || buildCharacterCardData(catalogCharacter, characterData), [preparedData, catalogCharacter, characterData]);
  const favoriteItemIconUrl = useMemo(() => (
    data.favoriteItemRarity === "SSR" ? getNikkeFavoriteItemIconUrl(catalogCharacter) : ""
  ), [catalogCharacter, data.favoriteItemRarity]);
  const skillIcons = useMemo(() => getNikkeSkillIconUrls(catalogCharacter), [catalogCharacter]);
  const artworkOffsetX = (artworkPreference?.objectPositionX ?? 50) - 50;
  const artworkOffsetY = artworkPreference?.objectPositionY ?? 0;
  const artworkScale = artworkPreference?.artworkScale ?? 100;
  const normalizedVisibleModules = { ...DEFAULT_CHARACTER_CARD_MODULES, ...visibleModules };
  return (
    <ScaledCard>
      <article ref={cardRef} className={`nikke-character-card${squareArtwork ? " is-square-artwork" : ""}`} style={{ "--card-width": `${CARD_WIDTH}px`, "--card-height": `${CARD_HEIGHT}px` }} aria-label={`${data.name}角色卡`}>
        <CharacterArt
          key={artworkUrl}
          artworkUrl={artworkUrl}
          alt={`${data.name}立绘`}
          artworkOffsetX={artworkOffsetX}
          artworkOffsetY={artworkOffsetY}
          artworkScale={artworkScale}
          containArtwork={squareArtwork}
        />
        {normalizedVisibleModules.favoriteItem ? <FavoriteItemPanel data={data} favoriteItemIconUrl={favoriteItemIconUrl} /> : null}
        <IdentityPanel data={data} skillIcons={skillIcons} visibleModules={normalizedVisibleModules} />
        <EquipmentPanel data={data} visibleModules={normalizedVisibleModules} />
      </article>
    </ScaledCard>
  );
}
