import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import catalog from '../src/data/equipmentCatalog.json' with { type: 'json' };
import { normalizeEquipmentMetadata, mergeEquipmentMetadata } from '../src/domain/equipmentMetadata.js';
import { equipmentSlot, resolveEquipmentDisplay, mergeOverloadOcrMetadata } from '../src/domain/equipmentCatalog.js';
import { parseRawEquipments } from '../src/utils/equipmentOptions.js';
import { buildCharacterCardData } from '../src/domain/characterCard.js';
import { buildCalculatorAccountSnapshot, buildUnifiedCalculatorSnapshot } from '../src/utils/calculatorSnapshot.js';
import { normalizeLocalCharacterRecord, reconcileLocalCharactersAfterSync, saveLocalCharacterRecord, updateLocalCharacterEquipmentSlot, hasLocalCharacterData } from '../src/domain/localCharacterRoster.js';
import { createLocalGalleryWorkbook, importLocalGalleryBuffer } from '../src/utils/localGalleryExcel.js';

const role = { id: 1, resource_id: 352, name_code: 'fixture', name_cn: '测试角色', class: 'Attacker', element: 'Fire', original_rare: 'SSR' };
const gear = (tier, slot = 0, cls = 'Attacker') => catalog.records.find(r => r.item_rare === tier && r.class === cls && equipmentSlot(r) === slot);
const affixes = [[{ position: 1, functionType: 'StatAtk', value: 11.81, level: 11 }], [], [], []];
const meta = [{ tid: gear('T9').id, level: 0, corporationType: 1 }, { tid: 0 }, null, { tid: gear('T7', 3).id, level: 3 }];
const save = draft => saveLocalCharacterRecord([], { catalogCharacter: role, catalog: [role], draft });

test('124 official identities, all class/slot/tier combinations resolve to 72 exact local images', () => {
  assert.equal(catalog.records.length, 124);
  assert.equal(Object.keys(catalog.icons).length, 72);
  for (const r of catalog.records) {
    const slot = equipmentSlot(r), data = Array(4).fill(null); data[slot] = { tid: r.id };
    const display = resolveEquipmentDisplay(data, slot, [], 'WrongClass');
    assert.equal(display.tier, r.item_rare); assert.equal(display.isOverload, r.item_rare === 'T10');
    const png = readFileSync(new URL('../public' + display.icon, import.meta.url));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [128, 128]);
    const part = ['head', 'body', 'arm', 'leg'][slot]; assert.ok(r.resource_id.includes(`_${part}_`));
  }
  assert.equal(gear('T1').resource_id, gear('T2').resource_id);
  assert.equal(resolveEquipmentDisplay([{ tid: 3100901 }], 0).tier, 'T9');
  assert.equal(resolveEquipmentDisplay([{ tid: 3100901 }], 0).isOverload, false);
});

test('raw sync metadata distinguishes zero, unknown and incomplete fields without inventing levels', () => {
  const raw = parseRawEquipments({ head_equip_tid: String(gear('T9').id), head_equip_lv: 0, torso_equip_tid: 0 });
  assert.deepEqual(normalizeEquipmentMetadata(raw), [{ tid: gear('T9').id, level: 0, corporationType: null }, { tid: 0, level: null, corporationType: null }, null, null]);
  assert.deepEqual(normalizeEquipmentMetadata([{ tid: ' ' }, { tid: true }, { tid: -1 }, { tid: 1.5 }]), [null, null, null, null]);
  assert.equal(mergeEquipmentMetadata([null], meta)[0].tid, gear('T9').id);
  assert.equal(mergeEquipmentMetadata([{ tid: 0 }], meta)[0].tid, 0);
  assert.equal(mergeEquipmentMetadata([{ tid: gear('T1').id }], meta)[0].level, null);
});

test('enterprise origin works independently across T1–T9 without turning purple badges into T10', () => {
  for (let tier = 1; tier <= 9; tier++) {
    for (const [corporationType, expected] of [[1, 'ELYSION'], ['2', 'MISSILIS'], ['tetra', 'TETRA'], [4, 'PILGRIM'], [7, 'ABNORMAL']]) {
      const d = resolveEquipmentDisplay([{ tid: gear(`T${tier}`).id, corporationType }], 0, [], 'Supporter');
      assert.equal(d.manufacturer, expected); assert.equal(d.isOverload, false); assert.equal(d.tier, `T${tier}`);
      assert.match(d.label, /企业装备/);
      assert.equal(d.icon, resolveEquipmentDisplay([{ tid: gear(`T${tier}`).id }], 0).icon);
    }
  }
  for (const corporationType of [null, 0, 'NONE', 'ALL', 99, 'Unknown']) {
    assert.equal(resolveEquipmentDisplay([{ tid: gear('T8').id, corporationType }], 0).manufacturer, '');
  }
  for (const tid of [0, 99999999, gear('T8', 1).id]) {
    assert.equal(resolveEquipmentDisplay([{ tid, corporationType: 2 }], 0).manufacturer, '');
  }
  const t10 = resolveEquipmentDisplay([{ tid: gear('T10').id, corporationType: 2 }], 0);
  assert.equal(t10.manufacturer, ''); assert.equal(t10.isOverload, true);
});

test('unknown IDs, wrong slots and empty equipment never become default T10', () => {
  for (const m of [[{ tid: 99999999 }], [{ tid: gear('T9', 1).id }], [{ tid: 0 }]]) {
    const d = resolveEquipmentDisplay(m, 0, affixes[0], 'Attacker'); assert.equal(d.icon, ''); assert.equal(d.isOverload, false);
  }
  assert.equal(resolveEquipmentDisplay([], 0, [], 'Attacker').icon, '');
  assert.equal(resolveEquipmentDisplay([], 0, affixes[0], 'Attacker').isOverload, true);
});

test('sync snapshot, local roster and unified card preserve ordinary gear and discard stale OL affixes', () => {
  const snapshot = { accounts: [buildCalculatorAccountSnapshot({ elements: { Fire: [{ ...role, is_owned: true, raw_equipments: meta }] } })] };
  assert.deepEqual(snapshot.accounts[0].characters[0].equipmentMetadata, normalizeEquipmentMetadata(meta));
  const old = save({ equipments: affixes, equipmentMetadata: [{ tid: gear('T10').id }] }).records;
  const next = reconcileLocalCharactersAfterSync(old, snapshot, [role]).records;
  assert.equal(next[0].equipments[0][0].functionType, '');
  assert.deepEqual(next[0].equipmentMetadata, normalizeEquipmentMetadata(meta));
  const data = buildUnifiedCalculatorSnapshot(snapshot, next).accounts[0].characters[0];
  const card = buildCharacterCardData(role, data);
  assert.equal(card.equipmentDisplays[0].tier, 'T9'); assert.equal(card.equipmentDisplays[1].state, 'empty');
  assert.equal(hasLocalCharacterData(save({ equipmentMetadata: meta }).record), true);
  assert.ok(updateLocalCharacterEquipmentSlot(next, { nameCode: 'fixture', slotIndex: 0, lines: affixes[0] }).errors.length);
  assert.deepEqual(normalizeLocalCharacterRecord(JSON.parse(JSON.stringify(next[0]))).equipmentMetadata, normalizeEquipmentMetadata(meta));
});

test('T10 OCR updates the same physical slot identity without fabricating enhancement level', () => {
  const entries = [{ equipmentSlot: '头部', lines: affixes[0] }];
  const updated = mergeOverloadOcrMetadata(meta, entries, role.class);
  assert.equal(updated[0].tid, gear('T10').id); assert.equal(updated[0].level, null);
  assert.equal(updated[1].tid, 0);
  assert.equal(save({ equipments: affixes, equipmentMetadata: updated }).record.equipments[0][0].functionType, 'StatAtk');
});

test('Excel round-trip preserves ordinary gear IDs, zero levels, corporate origin and empty slots', async () => {
  const record = save({ equipmentMetadata: meta }).record;
  const workbook = createLocalGalleryWorkbook([record]);
  const result = await importLocalGalleryBuffer(await workbook.xlsx.writeBuffer(), { catalog: [role] });
  assert.deepEqual(result.summary.errors, []);
  assert.deepEqual(result.records[0].equipmentMetadata, normalizeEquipmentMetadata(meta));
  workbook.getWorksheet('装备').spliceColumns(5, 3);
  const legacy = await importLocalGalleryBuffer(await workbook.xlsx.writeBuffer(), { catalog: [role], existingRecords: [record] });
  assert.deepEqual(legacy.records[0].equipmentMetadata, record.equipmentMetadata);
});

test('Excel invalid or duplicate equipment identity rows fail without changing existing records', async () => {
  const record = save({ equipmentMetadata: meta }).record;
  for (const value of [-1, 3.5, 'oops']) {
    const workbook = createLocalGalleryWorkbook([record]); workbook.getWorksheet('装备').getCell('E2').value = value;
    const result = await importLocalGalleryBuffer(await workbook.xlsx.writeBuffer(), { catalog: [role], existingRecords: [record] });
    assert.equal(result.summary.skipped, 1); assert.deepEqual(result.records[0], record);
  }
  const duplicate = createLocalGalleryWorkbook([record]);
  duplicate.getWorksheet('装备').getCell('C3').value = 1;
  const result = await importLocalGalleryBuffer(await duplicate.xlsx.writeBuffer(), { catalog: [role], existingRecords: [record] });
  assert.equal(result.summary.skipped, 1); assert.deepEqual(result.records[0], record);
});
