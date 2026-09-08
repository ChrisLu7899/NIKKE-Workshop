// SPDX-License-Identifier: GPL-3.0-or-later
// Conservative seven-segment-like glyph evidence, not a value-range guess.
const PATTERNS = ["1110111", "0010010", "1011101", "1011011", "0111010", "1101011", "1101111", "1010010", "1111111", "1111011"];
const CELLS = [[.2,0,.8,.18],[0,.16,.32,.48],[.68,.16,1,.48],[.2,.41,.8,.61],[0,.57,.32,.85],[.68,.57,1,.85],[.2,.82,.8,1]];

export function recognizeTrainingDigit(mask, width, height) {
  if (height < 7 || width < 1) return { value: null, confidence: 0 };
  const ink = mask.reduce((sum, pixel) => sum + Boolean(pixel), 0) / (width * height);
  if (ink < .12 || ink > .95) return { value: null, confidence: 0 };
  const aspect = width / height;
  if (aspect < .25) return { value: 1, confidence: .85 };
  const scores = CELLS.map(([l,t,r,b]) => {
    let ink = 0, total = 0;
    for (let y = Math.floor(t*height); y < Math.ceil(b*height); y++) for (let x = Math.floor(l*width); x < Math.ceil(r*width); x++) {
      ink += mask[y*width+x] ? 1 : 0; total++;
    }
    return ink / Math.max(1,total);
  });
  const ranked = PATTERNS.map((pattern, value) => ({ value,
    distance: [...pattern].reduce((sum, bit, i) => sum + Math.abs(Number(bit) - scores[i]),0)/7,
  })).sort((a,b) => a.distance-b.distance);
  const margin = ranked[1].distance-ranked[0].distance;
  const valid = ranked[0].distance <= .3 && margin >= .09;
  return { value: valid ? ranked[0].value : null, confidence: valid ? .82 : 0, scores, margin, ranked: ranked.slice(0,2) };
}
