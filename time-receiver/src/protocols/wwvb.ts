/**
 * WWVB (Fort Collins, CO) — 60 kHz, 1 bit/sec, AM amplitude reduction.
 *
 * Symbol durations of carrier suppression:
 *   0      : 200 ms
 *   1      : 500 ms
 *   marker : 800 ms
 *
 * Frame layout (NIST SP 432, legacy AM time-code, 60 bits per minute):
 *   s0:  M (frame marker)
 *   s1..s8:   minutes  (40,20,10,_,8,4,2,1)   bit s4 = 0 reserved
 *   s9:  M
 *   s10..s18: hours    (_,_,20,10,_,8,4,2,1)   s10,s11,s14 = 0
 *   s19: M
 *   s20..s28: day-of-year hundreds+tens (_,_,200,100,_,80,40,20,10)
 *   s29: M
 *   s30..s38: day-of-year ones + DUT1 sign (8,4,2,1,_,DUT+,DUT-,DUT+,_)
 *            actually: s30..s33 = day ones (8,4,2,1); s34 = 0;
 *                      s36..s38 = DUT1 sign bits
 *   s39: M
 *   s40..s48: |DUT1| in 0.1s (0.8,0.4,0.2,0.1) + year tens
 *            s40..s43 = |DUT1| (0.8,0.4,0.2,0.1); s44 = 0;
 *            s45..s48 = year tens (80,40,20,10)
 *   s49: M
 *   s50..s58: year ones (8,4,2,1) + leap-year + leap-second + DST status
 *            s50..s53 = year ones (8,4,2,1); s54 = 0;
 *            s55 = leap-year flag; s56 = leap-second-at-end-of-month;
 *            s57..s58 = DST status (00=std all day, 10=std→DST today,
 *                                   11=DST all day, 01=DST→std today)
 *   s59: M
 */

import type { DecodedTime, Frame, Symbol } from "../types.js";
import { dayOfYearUTC, decodeWeighted, encodeWeighted, fromDayOfYearUTC } from "../bcd.js";

const MARKER_POSITIONS = [0, 9, 19, 29, 39, 49, 59] as const;

export interface WWVBFields {
  /** UTC date/time the frame announces (the minute-boundary at s0 of NEXT frame). */
  time: Date;
  /** DUT1 = UT1 - UTC, in tenths of a second, range [-9..+9]. */
  dut1Tenths?: number;
  leapYear?: boolean;
  leapSecondPending?: boolean;
  /** 0=std all day, 1=std→DST today, 2=DST→std today, 3=DST all day. */
  dstStatus?: 0 | 1 | 2 | 3;
}

function placeMarkers(symbols: Symbol[]): void {
  for (const p of MARKER_POSITIONS) symbols[p] = "M";
}

export function encodeWWVB(fields: WWVBFields): Frame {
  const symbols: Symbol[] = Array(60).fill("0");
  placeMarkers(symbols);

  const d = fields.time;
  const minute = d.getUTCMinutes();
  const hour = d.getUTCHours();
  const doy = dayOfYearUTC(d);
  const year = d.getUTCFullYear() % 100;

  // Minutes: s1..s8, with s4 reserved (0)
  const minTensVal = minute - (minute % 10);
  const minOnes = minute % 10;
  const minBits = [
    ...encodeWeighted(minTensVal, [40, 20, 10]),
    0,
    ...encodeWeighted(minOnes, [8, 4, 2, 1]),
  ];
  for (let i = 0; i < 8; i++) symbols[1 + i] = minBits[i] ? "1" : "0";

  // Hours: s10..s18, s10,s11 reserved, s14 reserved
  const hrTensVal = hour - (hour % 10);
  const hrOnes = hour % 10;
  const hrBits = [
    0, 0,
    ...encodeWeighted(hrTensVal, [20, 10]),
    0,
    ...encodeWeighted(hrOnes, [8, 4, 2, 1]),
  ];
  for (let i = 0; i < 9; i++) symbols[10 + i] = hrBits[i] ? "1" : "0";

  // Day-of-year hundreds+tens: s20..s28
  const doyHundredsVal = doy - (doy % 100);
  const doyTensVal = (doy % 100) - (doy % 10);
  const doyOnes = doy % 10;
  const doyHi = [
    0, 0,
    ...encodeWeighted(doyHundredsVal, [200, 100]),
    0,
    ...encodeWeighted(doyTensVal, [80, 40, 20, 10]),
  ];
  for (let i = 0; i < 9; i++) symbols[20 + i] = doyHi[i] ? "1" : "0";

  // s30..s38: day ones (s30..s33), reserved (s34), DUT1 sign (s35..s37), reserved (s38)
  const dut1 = fields.dut1Tenths ?? 0;
  const dut1Sign = dut1 >= 0;
  const doyLo = [
    ...encodeWeighted(doyOnes, [8, 4, 2, 1]),
    0,
    dut1Sign ? 1 : 0,
    dut1Sign ? 0 : 1,
    dut1Sign ? 1 : 0,
    0,
  ];
  for (let i = 0; i < 9; i++) symbols[30 + i] = doyLo[i] ? "1" : "0";

  // s40..s48: |DUT1| tenths (s40..s43), reserved (s44), year tens (s45..s48)
  const dut1Abs = Math.abs(dut1);
  const yrTens = Math.floor(year / 10);
  const dutAndYrHi = [
    ...encodeWeighted(dut1Abs, [8, 4, 2, 1]),
    0,
    ...encodeWeighted(yrTens, [8, 4, 2, 1]),
  ];
  for (let i = 0; i < 9; i++) symbols[40 + i] = dutAndYrHi[i] ? "1" : "0";

  // s50..s58: year ones (s50..s53), reserved (s54), LY (s55), LS (s56), DST (s57..s58)
  const yrOnes = year % 10;
  const dst = fields.dstStatus ?? 0;
  const trailer = [
    ...encodeWeighted(yrOnes, [8, 4, 2, 1]),
    0,
    fields.leapYear ? 1 : 0,
    fields.leapSecondPending ? 1 : 0,
    (dst >> 1) & 1,
    dst & 1,
  ];
  for (let i = 0; i < 9; i++) symbols[50 + i] = trailer[i] ? "1" : "0";

  return { protocol: "WWVB", symbols };
}

function bit(symbols: Symbol[], i: number): number {
  const s = symbols[i];
  if (s === "1") return 1;
  if (s === "0") return 0;
  throw new Error(`Expected data bit at position ${i}, got marker`);
}

export function decodeWWVB(frame: Frame, referenceYear: number = new Date().getUTCFullYear()): DecodedTime {
  if (frame.protocol !== "WWVB") throw new Error(`Not a WWVB frame: ${frame.protocol}`);
  if (frame.symbols.length !== 60) throw new Error(`WWVB frame must be 60 symbols`);
  const s = frame.symbols;
  for (const p of MARKER_POSITIONS) {
    if (s[p] !== "M") throw new Error(`Missing marker at position ${p}`);
  }

  const minute = decodeWeighted([bit(s, 1), bit(s, 2), bit(s, 3)], [40, 20, 10]) * 1 +
                 decodeWeighted([bit(s, 5), bit(s, 6), bit(s, 7), bit(s, 8)], [8, 4, 2, 1]);
  const hour = decodeWeighted([bit(s, 12), bit(s, 13)], [20, 10]) +
               decodeWeighted([bit(s, 15), bit(s, 16), bit(s, 17), bit(s, 18)], [8, 4, 2, 1]);
  const doy = decodeWeighted([bit(s, 22), bit(s, 23)], [200, 100]) +
              decodeWeighted([bit(s, 25), bit(s, 26), bit(s, 27), bit(s, 28)], [80, 40, 20, 10]) +
              decodeWeighted([bit(s, 30), bit(s, 31), bit(s, 32), bit(s, 33)], [8, 4, 2, 1]);

  const dutSignBits = [bit(s, 35), bit(s, 36), bit(s, 37)];
  // 101 = positive, 010 = negative (per NIST)
  const dutSign = dutSignBits[0] === 1 && dutSignBits[2] === 1 ? +1 : -1;
  const dutAbs = decodeWeighted([bit(s, 40), bit(s, 41), bit(s, 42), bit(s, 43)], [8, 4, 2, 1]);
  const dut1Tenths = dutSign * dutAbs;

  const yrTens = decodeWeighted([bit(s, 45), bit(s, 46), bit(s, 47), bit(s, 48)], [8, 4, 2, 1]);
  const yrOnes = decodeWeighted([bit(s, 50), bit(s, 51), bit(s, 52), bit(s, 53)], [8, 4, 2, 1]);
  const yr2 = yrTens * 10 + yrOnes;

  // Recover full year: snap to the century closest to referenceYear.
  const refCentury = Math.floor(referenceYear / 100) * 100;
  const candidates = [refCentury + yr2, refCentury - 100 + yr2, refCentury + 100 + yr2];
  candidates.sort((a, b) => Math.abs(a - referenceYear) - Math.abs(b - referenceYear));
  const year = candidates[0]!;

  const leapYear = bit(s, 55) === 1;
  const leapSecondPending = bit(s, 56) === 1;
  const dstStatus = (bit(s, 57) << 1) | bit(s, 58);

  return {
    protocol: "WWVB",
    time: fromDayOfYearUTC(year, doy, hour, minute),
    dut1: dut1Tenths,
    leapSecondPending,
    ...(leapYear ? { leapYear: true } as object : {}),
    ...(dstStatus ? { dstStatus } as object : {}),
  };
}

/**
 * Convert a WWVB symbol stream into an amplitude envelope at `sampleRate` Hz.
 * Each second is `sampleRate` samples; carrier is suppressed (amplitude = 0)
 * for the first 200/500/800 ms then restored to 1.0.
 */
export function modulateWWVB(frame: Frame, sampleRate = 1000): Float32Array {
  const samplesPerSec = sampleRate;
  const env = new Float32Array(60 * samplesPerSec).fill(1);
  for (let i = 0; i < 60; i++) {
    const dur = frame.symbols[i] === "0" ? 0.2 : frame.symbols[i] === "1" ? 0.5 : 0.8;
    const lowSamples = Math.round(dur * samplesPerSec);
    for (let j = 0; j < lowSamples; j++) env[i * samplesPerSec + j] = 0;
  }
  return env;
}
