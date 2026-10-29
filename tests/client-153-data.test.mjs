import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EQUIPMENT_TIER_VALUES } from '../src/domain/equipmentAffixes.js';
import { EQUIPMENT_FUNCTION_LABELS } from '../src/domain/localCharacterRoster.js';
import { buildExactModel, STAT_TIER_VALUES, TIER_PROBS } from '../src/calculator/engine.js';
import { parseEquipmentOptionLines } from '../src/utils/equipmentOptions.js';

// Independent evidence comes from the signature/CRC-verified client tables,
// not by serializing the application constants under test.
const client = JSON.parse(readFileSync(new URL('./fixtures/client-153.6.10-overload.json', import.meta.url)));

test('153.6.10 overload tables agree with OCR and calculator tiers for all nine stats', () => {
  assert.deepEqual(Object.keys(client.overload).sort(), Object.keys(EQUIPMENT_TIER_VALUES).sort());
  for (const [functionType, record] of Object.entries(client.overload)) {
    assert.equal(record.tiers.length, 15);
    const label = EQUIPMENT_FUNCTION_LABELS[functionType];
    assert.ok(label, functionType);
    assert.deepEqual(record.tiers.map(t => t.level), Array.from({ length: 15 }, (_, i) => i + 1));
    // Accuracy-circle radius and charge-time reductions are signed negatives
    // in FunctionTable; the game's affix display presents their magnitudes.
    assert.equal(record.tiers.every(t => t.basisPoints < 0),
      ['StatAccuracyCircle', 'StatChargeTime'].includes(functionType));
    const displayValues = record.tiers.map(t => Math.abs(t.basisPoints));
    assert.deepEqual(EQUIPMENT_TIER_VALUES[functionType].map(v => Math.round(v * 100)),
      displayValues, functionType);
    assert.deepEqual(STAT_TIER_VALUES[label].map(v => Math.round(parseFloat(v) * 100)),
      displayValues, label);
    for (const tier of record.tiers) {
      const [line] = parseEquipmentOptionLines({ head_equip_option1_id: 1 }, 'head', {
        1: { function_details: [{ function_type: functionType, function_value: tier.basisPoints, level: tier.level }] },
      });
      assert.equal(Math.round(line.function_value * 100), displayValues[tier.level - 1]);
    }
  }
});

test('153.6.10 option group and tier weights agree with the existing solver', () => {
  const targets = Object.entries(client.overload).map(([functionType]) => ({
    stat: EQUIPMENT_FUNCTION_LABELS[functionType], tier: 1, flagged: false,
  }));
  const model = buildExactModel(targets);
  for (const [functionType, record] of Object.entries(client.overload)) {
    assert.equal(model.targets.find(t => t.name === EQUIPMENT_FUNCTION_LABELS[functionType]).weight,
      record.groupWeight, functionType);
    assert.deepEqual(TIER_PROBS, record.tiers.map(t => t.tierWeightPercent), functionType);
  }
});
