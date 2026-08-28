// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from "react";
import { Box } from "@mui/material";
import { CHARACTER_CARD_SLOT_KEYS, buildCharacterCardData } from "../../domain/characterCard.js";
import "./characterCard.css";

const CARD_WIDTH = 736;
const CARD_HEIGHT = 1096;
const ASSET_ROOT = "/ui-assets/nikke";

const metaFile = (group, value) => {
  const normalized = String(value || "").trim().toLocaleLowerCase();
  if (!normalized) return "";
  if (group === "burst") {
    const burst = { step1: "burst-1", step2: "burst-2", step3: "burst-3", allstep: "burst-all" }[normalized];
    return burst ? `${ASSET_ROOT}/metadata/burst/${burst}.png` : "";
  }
  const aliases = {
    element: { electronic: "electric" },
    weapon: { "rocket launcher": "rl", assault: "ar" },
  };
  const filename = aliases[group]?.[normalized] || normalized;
  return `${ASSET_ROOT}/metadata/${group}/${filename}.png`;
};

const formatValue = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "—";

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

function CharacterArt({ artworkUrl, alt, artworkOffsetX, artworkOffsetY, artworkScale }) {
  const [source, setSource] = useState(artworkUrl || "");
  if (!source) return <div className="nikke-card-art-placeholder" aria-label="隐私模式或暂无角色立绘"><span>暂无可用全身立绘</span></div>;
  return (
    <img
      className="nikke-card-character-art"
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

function IdentityPanel({ data }) {
  const metadata = [
    { group: "burst", value: data.burstStage, alt: "爆裂阶段", kind: "native" },
    { group: "element", value: data.element, alt: "属性", kind: "native element" },
    { group: "weapon", value: data.weaponType, alt: "武器", kind: "glyph weapon" },
    { group: "class", value: data.className, alt: "职业", kind: "glyph class" },
    { group: "manufacturer", value: data.corporation, alt: "企业", kind: "glyph manufacturer" },
  ];
  const filledStars = Math.max(0, Math.min(3, Number(data.limitBreak.grade) || 0));
  return (
    <section className="nikke-card-identity" aria-label={`${data.name}角色信息`}>
      <div className="nikke-card-rarity-row">
        <img className="nikke-card-rarity" src={`${ASSET_ROOT}/character-card/rarity-ssr.png`} alt={data.rarity} />
        <div className="nikke-card-breakthrough" aria-label={`${filledStars}星，核心突破${data.limitBreak.core || 0}`}>
          <span className="nikke-card-stars" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <img key={index} src={`${ASSET_ROOT}/character-card/star-${index < filledStars ? "filled" : "empty"}.png`} alt="" />
            ))}
          </span>
          {data.limitBreak.core > 0 ? (
            <span className="nikke-card-core">
              <img src={`${ASSET_ROOT}/character-card/core-frame.webp`} alt="" />
              <strong>{String(data.limitBreak.core).padStart(2, "0")}</strong>
            </span>
          ) : null}
        </div>
      </div>
      <div className={`nikke-card-level-name ${data.name.length >= 8 ? "long-name" : ""}`}>
        <span className="nikke-card-level">LV. <strong>{data.level ?? "—"}</strong></span>
        <h2 title={data.name}>{data.name}</h2>
      </div>
      <div className="nikke-card-affection" aria-label={`好感度 ${data.affection ?? "未知"}`}>
        <span><b aria-hidden="true">»</b> attraction</span><strong>RANK</strong><em>{data.affection ?? "—"}</em>
      </div>
      <div className="nikke-card-combat">
        <span>战斗力</span><strong>{data.combat ?? "—"}</strong><b>BATTLE</b>
      </div>
      <div className="nikke-card-meta-stack">
        {metadata.map((item) => {
          const src = metaFile(item.group, item.value);
          return (
            <span key={item.group} className={`nikke-card-meta ${item.kind}`} title={item.alt}>
              {src ? <img src={src} alt={item.alt} /> : <span aria-label={`${item.alt}未知`}>—</span>}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function AffixValue({ line }) {
  if (!line) return <><span className="nikke-card-affix-name">—</span><span className="nikke-card-affix-values">—</span></>;
  const tier = Number(line.level);
  return (
    <>
      <span className="nikke-card-affix-name" title={line.label}>{line.label}</span>
      <span className="nikke-card-affix-values"><span>【{Number.isFinite(tier) ? tier : "—"}档】</span><strong>{formatValue(line.value)}%</strong></span>
    </>
  );
}

function EquipmentCard({ data, slotIndex }) {
  const slot = CHARACTER_CARD_SLOT_KEYS[slotIndex];
  const classIcon = metaFile("class", data.className);
  return (
    <article className="nikke-card-equipment">
      <span className="nikke-card-equipment-icon" aria-label={`${slot}装备`}>
        <img className="nikke-card-equipment-art" src={`${ASSET_ROOT}/equipment/overload/${data.equipmentFamily}-${slot}.png`} alt="" />
        <span className="nikke-card-equipment-badges" aria-hidden="true">
          <span className="nikke-card-overload-badge"><img src={`${ASSET_ROOT}/character-card/overload-badge-source.png`} alt="" /></span>
          <span className="nikke-card-class-badge"><i />{classIcon ? <img src={classIcon} alt="" /> : null}</span>
        </span>
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

function EquipmentPanel({ data }) {
  return (
    <section className="nikke-card-equipment-panel" aria-label="四件装备和词条">
      {data.topAffixes.length ? (
        <div className="nikke-card-affix-summary" aria-label="档位合计最高的三个词条">
          {data.topAffixes.map((item) => (
            <div key={item.functionType}>
              <span title={item.label}>{item.label}</span>
              <span>【{item.totalLevel}档】<strong>{item.totalValue.toFixed(2)}%</strong></span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="nikke-card-equipment-grid">
        {CHARACTER_CARD_SLOT_KEYS.map((slot, index) => <EquipmentCard key={slot} data={data} slotIndex={index} />)}
      </div>
    </section>
  );
}

export default function CharacterCard({ catalogCharacter, characterData, artworkUrl, artworkPreference }) {
  const data = useMemo(() => buildCharacterCardData(catalogCharacter, characterData), [catalogCharacter, characterData]);
  const artworkOffsetX = (artworkPreference?.objectPositionX ?? 50) - 50;
  const artworkOffsetY = artworkPreference?.objectPositionY ?? 0;
  const artworkScale = artworkPreference?.artworkScale ?? 100;
  return (
    <ScaledCard>
      <article className="nikke-character-card" aria-label={`${data.name}角色卡`}>
        <CharacterArt
          key={artworkUrl}
          artworkUrl={artworkUrl}
          alt={`${data.name}立绘`}
          artworkOffsetX={artworkOffsetX}
          artworkOffsetY={artworkOffsetY}
          artworkScale={artworkScale}
        />
        <IdentityPanel data={data} />
        <EquipmentPanel data={data} />
      </article>
    </ScaledCard>
  );
}
