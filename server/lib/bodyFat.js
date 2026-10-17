// Estimated body-fat % from tape measurements (US Navy method). An estimate for tracking change over time, not a medical measurement.
const log10 = Math.log10;
function navyBodyFat({ sex, heightCm, waistCm, neckCm, hipCm }) {
  const h = Number(heightCm), w = Number(waistCm), n = Number(neckCm), hip = Number(hipCm);
  if (!(h > 0 && w > 0 && n > 0)) return null;
  let bf;
  if (sex === 'female') {
    if (!(hip > 0) || w + hip - n <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * log10(w + hip - n) + 0.221 * log10(h)) - 450;
  } else {
    if (w - n <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * log10(w - n) + 0.15456 * log10(h)) - 450;
  }
  if (!Number.isFinite(bf)) return null;
  return Math.round(Math.min(60, Math.max(3, bf)) * 10) / 10;
}
module.exports = { navyBodyFat };
