/**
 * DCF77 (Mainflingen, Germany) — 77.5 kHz, 1 bit/sec, AM amplitude reduction
 * to ~15% for 100 ms (logical 0) or 200 ms (logical 1). Second 59 has no
 * amplitude reduction at all, marking the upcoming minute boundary.
 *
 * Frame layout (one minute = 59 transmitted bits + the silent 60th second):
 *   s0          : start-of-minute (always 0)
 *   s1..s14     : weather/civil-defense/operator data (modeled as 0 here)
 *   s15         : antenna bit
 *   s16         : DST change announcement (1 in the hour before a switch)
 *   s17         : CEST in effect (Z2 = 1)
 *   s18         : CET in effect  (Z1 = 1)
 *   s19         : leap-second announcement
 *   s20         : start-of-time marker (always 1)
 *   s21..s27    : minute   (1,2,4,8,10,20,40)        — LSB first weighted BCD
 *   s28         : even parity over s21..s27
 *   s29..s34    : hour     (1,2,4,8,10,20)
 *   s35         : even parity over s29..s34
 *   s36..s41    : day      (1,2,4,8,10,20)
 *   s42..s44    : weekday  (1,2,4) — 1=Mon..7=Sun
 *   s45..s49    : month    (1,2,4,8,10)
 *   s50..s57    : year     (1,2,4,8,10,20,40,80)     — last 2 digits
 *   s58         : even parity over s36..s57
 *   s59         : (no carrier reduction — minute mark)
 *
 * The frame describes the time of the *upcoming* minute boundary at s0 of
 * the next frame. We follow the same convention: `time` is that boundary.
 */

import type { DecodedTime, Frame, Symbol } from "../types.js";
import { decodeWeighted, encodeWeighted, evenParity } from "../bcd.js";

const LSB_FIRST_2 = [1, 2] as const;
const LSB_FIRST_3 = [1, 2, 4] as const;
const LSB_FIRST_4 = [1, 2, 4, 8] as const;
const LSB_FIRST_6 = [1, 2, 4, 8, 10, 20] as const;
const LSB_FIRST_7 = [1, 2, 4, 8, 10, 20, 40] as const;
const LSB_FIRST_5 = [1, 2, 4, 8, 10] as const;
const LSB_FIRST_8 = [1, 2, 4, 8, 10, 20, 40, 80] as const;

export interface DCF77Fields {
  /** Local time (CET or CEST) the frame announces. */
  localTime: Date;
  /** True if CEST (summer time) is in effect, false for CET. */
  cest: boolean;
  /** True if a DST switch is announced in this hour. */
  dstChangeAnnounced?: boolean;
  /** True if a leap second is announced at end of this hour. */
  leapSecondAnnounced?: boolean;
  /** True for antenna-bit set (informational). */
  antennaBit?: boolean;
  /** Local weekday: 1 = Monday .. 7 = Sunday. If omitted, computed from
   *  localTime treating it as a wall-clock instant. */
  weekday?: number;
}

/** Weekday 1..7 (Mon..Sun) from a date treated as wall-clock UTC. */
function weekdayMonSun(d: Date): number {
  const w = d.getUTCDay(); // 0=Sun..6=Sat
  return w === 0 ? 7 : w;
}

export function encodeDCF77(fields: DCF77Fields): Frame {
  const symbols: Symbol[] = Array(60).fill("0");

  // s0..s14: M (start), then 14 zero data bits (we keep zero).
  symbols[0] = "0";

  symbols[15] = fields.antennaBit ? "1" : "0";
  symbols[16] = fields.dstChangeAnnounced ? "1" : "0";
  symbols[17] = fields.cest ? "1" : "0";
  symbols[18] = fields.cest ? "0" : "1";
  symbols[19] = fields.leapSecondAnnounced ? "1" : "0";
  symbols[20] = "1"; // start-of-time always 1

  const d = fields.localTime;
  const minute = d.getUTCMinutes();
  const hour = d.getUTCHours();
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const year2 = d.getUTCFullYear() % 100;
  const weekday = fields.weekday ?? weekdayMonSun(d);

  const minBits = encodeWeighted(minute, LSB_FIRST_7);
  for (let i = 0; i < 7; i++) symbols[21 + i] = minBits[i] ? "1" : "0";
  symbols[28] = evenParity(minBits) ? "1" : "0";

  const hourBits = encodeWeighted(hour, LSB_FIRST_6);
  for (let i = 0; i < 6; i++) symbols[29 + i] = hourBits[i] ? "1" : "0";
  symbols[35] = evenParity(hourBits) ? "1" : "0";

  const dayBits = encodeWeighted(day, LSB_FIRST_6);
  for (let i = 0; i < 6; i++) symbols[36 + i] = dayBits[i] ? "1" : "0";

  const wdBits = encodeWeighted(weekday, LSB_FIRST_3);
  for (let i = 0; i < 3; i++) symbols[42 + i] = wdBits[i] ? "1" : "0";

  const monBits = encodeWeighted(month, LSB_FIRST_5);
  for (let i = 0; i < 5; i++) symbols[45 + i] = monBits[i] ? "1" : "0";

  const yrBits = encodeWeighted(year2, LSB_FIRST_8);
  for (let i = 0; i < 8; i++) symbols[50 + i] = yrBits[i] ? "1" : "0";

  const dateBits = [...dayBits, ...wdBits, ...monBits, ...yrBits];
  symbols[58] = evenParity(dateBits) ? "1" : "0";

  // s59: no carrier reduction. We represent that as a marker.
  symbols[59] = "M";

  return { protocol: "DCF77", symbols };
}

function dbit(s: Symbol[], i: number): number {
  if (s[i] === "1") return 1;
  if (s[i] === "0") return 0;
  throw new Error(`Expected data bit at position ${i}, got ${s[i]}`);
}

export function decodeDCF77(frame: Frame, referenceYear: number = new Date().getUTCFullYear()): DecodedTime {
  if (frame.protocol !== "DCF77") throw new Error(`Not a DCF77 frame: ${frame.protocol}`);
  if (frame.symbols.length !== 60) throw new Error(`DCF77 frame must be 60 symbols`);
  const s = frame.symbols;
  if (s[0] !== "0") throw new Error(`DCF77 s0 must be 0`);
  if (s[20] !== "1") throw new Error(`DCF77 s20 (start-of-time) must be 1`);
  if (s[59] !== "M") throw new Error(`DCF77 s59 must be the silent minute marker`);

  const cestZ2 = dbit(s, 17);
  const cetZ1 = dbit(s, 18);
  if (cestZ2 === cetZ1) {
    throw new Error(`DCF77 Z1/Z2 must differ (got both ${cestZ2})`);
  }

  const minBits = [21, 22, 23, 24, 25, 26, 27].map((i) => dbit(s, i));
  if (evenParity(minBits) !== dbit(s, 28)) throw new Error(`DCF77 minute parity error`);
  const minute = decodeWeighted(minBits, LSB_FIRST_7);

  const hourBits = [29, 30, 31, 32, 33, 34].map((i) => dbit(s, i));
  if (evenParity(hourBits) !== dbit(s, 35)) throw new Error(`DCF77 hour parity error`);
  const hour = decodeWeighted(hourBits, LSB_FIRST_6);

  const dayBits = [36, 37, 38, 39, 40, 41].map((i) => dbit(s, i));
  const wdBits = [42, 43, 44].map((i) => dbit(s, i));
  const monBits = [45, 46, 47, 48, 49].map((i) => dbit(s, i));
  const yrBits = [50, 51, 52, 53, 54, 55, 56, 57].map((i) => dbit(s, i));
  const dateBits = [...dayBits, ...wdBits, ...monBits, ...yrBits];
  if (evenParity(dateBits) !== dbit(s, 58)) throw new Error(`DCF77 date parity error`);

  const day = decodeWeighted(dayBits, LSB_FIRST_6);
  const weekday = decodeWeighted(wdBits, LSB_FIRST_3);
  const month = decodeWeighted(monBits, LSB_FIRST_5);
  const year2 = decodeWeighted(yrBits, LSB_FIRST_8);

  const refCentury = Math.floor(referenceYear / 100) * 100;
  const candidates = [refCentury + year2, refCentury - 100 + year2, refCentury + 100 + year2];
  candidates.sort((a, b) => Math.abs(a - referenceYear) - Math.abs(b - referenceYear));
  const year = candidates[0]!;

  const localTime = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetH = cestZ2 ? 2 : 1;
  const utcTime = new Date(localTime.getTime() - offsetH * 3600 * 1000);

  return {
    protocol: "DCF77",
    time: utcTime,
    localTime,
    dst: cestZ2 === 1,
    leapSecondPending: dbit(s, 19) === 1,
    ...(weekday ? { weekday } as object : {}),
  };
}

export function modulateDCF77(frame: Frame, sampleRate = 1000): Float32Array {
  const env = new Float32Array(60 * sampleRate).fill(1);
  for (let i = 0; i < 60; i++) {
    let dur = 0;
    if (frame.symbols[i] === "0") dur = 0.1;
    else if (frame.symbols[i] === "1") dur = 0.2;
    else dur = 0; // M (s59): no carrier reduction
    const lowSamples = Math.round(dur * sampleRate);
    // DCF77 reduces to ~15%, not zero — keep the residual carrier.
    for (let j = 0; j < lowSamples; j++) env[i * sampleRate + j] = 0.15;
  }
  return env;
}
