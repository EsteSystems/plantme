/**
 * RBU (Taldom, Russia) — 66.(6) kHz long-wave time signal.
 *
 * The on-air RBU format combines phase manipulation with AM second pulses.
 * For this simulator we model a clean, pulse-width-modulated AM variant
 * that captures the salient observable bits and DUT1 transmission:
 *
 *   second 0      : no carrier reduction (minute-start marker)
 *   seconds 1..59 : carrier reduction for either 100 ms (0) or 500 ms (1)
 *
 * Frame layout (60 symbols, 1 sec each):
 *   s0          : minute marker (M)
 *   s1..s8      : minute   tens (40,20,10), reserved (0), ones (8,4,2,1)
 *   s9          : reserved (0)
 *   s10..s17    : hour     reserved×2, tens (20,10), ones (8,4,2,1)
 *   s18..s20    : weekday  (1..7)  weights (4,2,1)
 *   s21..s27    : day      tens (20,10), reserved, ones (8,4,2,1)
 *   s28..s32    : month    tens (10), reserved, ones (8,4,2,1)
 *   s33..s40    : year     tens (80,40,20,10), ones (8,4,2,1)
 *   s41         : DUT1 sign (1 = positive, 0 = negative)
 *   s42..s45    : |DUT1| tenths-of-second (8,4,2,1)
 *   s46         : leap-second pending
 *   s47..s58    : reserved (0)
 *   s59         : reserved (0)
 */

import type { DecodedTime, Frame, Symbol } from "../types.js";
import { decodeWeighted, encodeWeighted } from "../bcd.js";

export interface RBUFields {
  /** UTC date/time the frame announces (boundary at s0 of NEXT frame). */
  time: Date;
  /** DUT1 in tenths of a second, range [-9..+9]. */
  dut1Tenths?: number;
  leapSecondPending?: boolean;
  /** Weekday 1..7 (Mon..Sun). Derived from `time` if omitted. */
  weekday?: number;
}

function weekdayMonSun(d: Date): number {
  const w = d.getUTCDay();
  return w === 0 ? 7 : w;
}

function set(symbols: Symbol[], start: number, bits: readonly number[]): void {
  for (let i = 0; i < bits.length; i++) symbols[start + i] = bits[i] ? "1" : "0";
}

export function encodeRBU(fields: RBUFields): Frame {
  const symbols: Symbol[] = Array(60).fill("0");
  symbols[0] = "M";

  const d = fields.time;
  const minute = d.getUTCMinutes();
  const hour = d.getUTCHours();
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const year2 = d.getUTCFullYear() % 100;
  const weekday = fields.weekday ?? weekdayMonSun(d);

  // s1..s8: minute
  set(symbols, 1, [
    ...encodeWeighted(minute - (minute % 10), [40, 20, 10]),
    0,
    ...encodeWeighted(minute % 10, [8, 4, 2, 1]),
  ]);

  // s10..s17: hour = reserved×2 (s10,s11), tens (s12,s13), ones (s14..s17)
  set(symbols, 10, [
    0, 0,
    ...encodeWeighted(hour - (hour % 10), [20, 10]),
    ...encodeWeighted(hour % 10, [8, 4, 2, 1]),
  ]);

  // s18..s20: weekday
  set(symbols, 18, encodeWeighted(weekday, [4, 2, 1]));

  // s21..s27: day = tens(20,10), reserved, ones(8,4,2,1)  -> 7 bits
  set(symbols, 21, [
    ...encodeWeighted(day - (day % 10), [20, 10]),
    0,
    ...encodeWeighted(day % 10, [8, 4, 2, 1]),
  ]);

  // s28..s32: month = tens(10) (s28), ones(8,4,2,1) (s29..s32) -> 5 bits
  set(symbols, 28, [
    ...encodeWeighted(month - (month % 10), [10]),
    ...encodeWeighted(month % 10, [8, 4, 2, 1]),
  ]);

  // s33..s40: year tens(80,40,20,10) (s33..s36) + ones(8,4,2,1) (s37..s40)
  set(symbols, 33, [
    ...encodeWeighted(year2 - (year2 % 10), [80, 40, 20, 10]),
    ...encodeWeighted(year2 % 10, [8, 4, 2, 1]),
  ]);

  // s41: DUT1 sign, s42..s45: |DUT1|, s46: leap-second pending
  const dut1 = fields.dut1Tenths ?? 0;
  symbols[41] = dut1 >= 0 ? "1" : "0";
  set(symbols, 42, encodeWeighted(Math.abs(dut1), [8, 4, 2, 1]));
  symbols[46] = fields.leapSecondPending ? "1" : "0";

  return { protocol: "RBU", symbols };
}

function rbit(s: Symbol[], i: number): number {
  if (s[i] === "1") return 1;
  if (s[i] === "0") return 0;
  throw new Error(`Expected data bit at position ${i}, got ${s[i]}`);
}

export function decodeRBU(frame: Frame, referenceYear: number = new Date().getUTCFullYear()): DecodedTime {
  if (frame.protocol !== "RBU") throw new Error(`Not an RBU frame: ${frame.protocol}`);
  if (frame.symbols.length !== 60) throw new Error(`RBU frame must be 60 symbols`);
  const s = frame.symbols;
  if (s[0] !== "M") throw new Error(`RBU s0 must be the minute marker`);

  const minute =
    decodeWeighted([rbit(s, 1), rbit(s, 2), rbit(s, 3)], [40, 20, 10]) +
    decodeWeighted([rbit(s, 5), rbit(s, 6), rbit(s, 7), rbit(s, 8)], [8, 4, 2, 1]);
  const hour =
    decodeWeighted([rbit(s, 12), rbit(s, 13)], [20, 10]) +
    decodeWeighted([rbit(s, 14), rbit(s, 15), rbit(s, 16), rbit(s, 17)], [8, 4, 2, 1]);

  const weekday = decodeWeighted([rbit(s, 18), rbit(s, 19), rbit(s, 20)], [4, 2, 1]);

  const day =
    decodeWeighted([rbit(s, 21), rbit(s, 22)], [20, 10]) +
    decodeWeighted([rbit(s, 24), rbit(s, 25), rbit(s, 26), rbit(s, 27)], [8, 4, 2, 1]);

  const month =
    decodeWeighted([rbit(s, 28)], [10]) +
    decodeWeighted([rbit(s, 29), rbit(s, 30), rbit(s, 31), rbit(s, 32)], [8, 4, 2, 1]);

  const year2 =
    decodeWeighted([rbit(s, 33), rbit(s, 34), rbit(s, 35), rbit(s, 36)], [80, 40, 20, 10]) +
    decodeWeighted([rbit(s, 37), rbit(s, 38), rbit(s, 39), rbit(s, 40)], [8, 4, 2, 1]);

  const dutSign = rbit(s, 41) === 1 ? +1 : -1;
  const dutAbs = decodeWeighted([rbit(s, 42), rbit(s, 43), rbit(s, 44), rbit(s, 45)], [8, 4, 2, 1]);
  const dut1 = dutSign * dutAbs;
  const leapSecondPending = rbit(s, 46) === 1;

  const refCentury = Math.floor(referenceYear / 100) * 100;
  const candidates = [refCentury + year2, refCentury - 100 + year2, refCentury + 100 + year2];
  candidates.sort((a, b) => Math.abs(a - referenceYear) - Math.abs(b - referenceYear));
  const year = candidates[0]!;

  return {
    protocol: "RBU",
    time: new Date(Date.UTC(year, month - 1, day, hour, minute, 0)),
    dut1,
    leapSecondPending,
    ...(weekday ? { weekday } as object : {}),
  };
}

export function modulateRBU(frame: Frame, sampleRate = 1000): Float32Array {
  const env = new Float32Array(60 * sampleRate).fill(1);
  for (let i = 0; i < 60; i++) {
    let dur = 0;
    if (frame.symbols[i] === "0") dur = 0.1;
    else if (frame.symbols[i] === "1") dur = 0.5;
    else dur = 0; // marker at s0: no reduction
    const lowSamples = Math.round(dur * sampleRate);
    for (let j = 0; j < lowSamples; j++) env[i * sampleRate + j] = 0;
  }
  return env;
}
