/**
 * BCD helpers shared across protocols.
 *
 * Long-wave time codes pack decimal digits as fixed-weight bit fields.
 * The weights vary per protocol and per field (e.g. WWVB minute uses
 * 40-20-10 / 8-4-2-1, DCF77 uses 1-2-4-8 / 10-20-40-80), so we expose
 * a generic helper that encodes/decodes an integer against an explicit
 * weight vector. This avoids ambiguous "BCD" assumptions.
 */

export function encodeWeighted(value: number, weights: readonly number[]): number[] {
  // Greedy descending: weight order on the wire is arbitrary (LSB-first for
  // DCF77, MSB-first for WWVB), so we sort by magnitude before subtracting
  // and write each chosen bit back to its original position.
  const indexed = weights.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w);
  const bits = new Array<number>(weights.length).fill(0);
  let remaining = value;
  for (const { w, i } of indexed) {
    if (remaining >= w) {
      bits[i] = 1;
      remaining -= w;
    }
  }
  if (remaining !== 0) {
    throw new Error(`Value ${value} not representable in weights ${weights.join(",")}`);
  }
  return bits;
}

export function decodeWeighted(bits: readonly number[], weights: readonly number[]): number {
  if (bits.length !== weights.length) {
    throw new Error(`bit/weight length mismatch: ${bits.length} vs ${weights.length}`);
  }
  let sum = 0;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) sum += weights[i]!;
  }
  return sum;
}

/** Even parity over the given bits (returns 0 if even number of 1s, else 1). */
export function evenParity(bits: readonly number[]): number {
  return bits.reduce((p, b) => p ^ (b & 1), 0);
}

/** Returns 1-based day of year (1..366) for the given UTC date. */
export function dayOfYearUTC(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const diff = d.getTime() - start;
  return Math.floor(diff / 86_400_000);
}

/** Returns a UTC Date for year + day-of-year + hour + minute. */
export function fromDayOfYearUTC(
  year: number,
  doy: number,
  hour: number,
  minute: number,
): Date {
  const jan1 = Date.UTC(year, 0, 1, hour, minute, 0);
  return new Date(jan1 + (doy - 1) * 86_400_000);
}
