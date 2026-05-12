import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeWWVB, encodeWWVB, modulateWWVB } from "../src/index.js";

test("WWVB round-trips a representative UTC time", () => {
  const t = new Date(Date.UTC(2026, 4, 12, 17, 23, 0)); // 2026-05-12 17:23 UTC
  const frame = encodeWWVB({ time: t, dut1Tenths: 3 });
  assert.equal(frame.symbols.length, 60);
  for (const p of [0, 9, 19, 29, 39, 49, 59]) {
    assert.equal(frame.symbols[p], "M", `marker at ${p}`);
  }
  const decoded = decodeWWVB(frame, 2026);
  assert.equal(decoded.time.toISOString(), t.toISOString());
  assert.equal(decoded.dut1, 3);
});

test("WWVB round-trips negative DUT1", () => {
  const t = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
  const frame = encodeWWVB({ time: t, dut1Tenths: -7 });
  const decoded = decodeWWVB(frame, 2026);
  assert.equal(decoded.dut1, -7);
});

test("WWVB round-trips leap-day and end-of-year", () => {
  const samples = [
    new Date(Date.UTC(2024, 1, 29, 23, 59, 0)), // leap day
    new Date(Date.UTC(2024, 11, 31, 23, 59, 0)),
    new Date(Date.UTC(2024, 0, 1, 0, 0, 0)),
  ];
  for (const t of samples) {
    const frame = encodeWWVB({ time: t });
    const decoded = decodeWWVB(frame, 2024);
    assert.equal(decoded.time.toISOString(), t.toISOString(), `roundtrip ${t.toISOString()}`);
  }
});

test("WWVB envelope drops carrier for correct duration", () => {
  const t = new Date(Date.UTC(2026, 4, 12, 17, 23, 0));
  const frame = encodeWWVB({ time: t });
  const env = modulateWWVB(frame, 1000); // 1 sample / ms
  // Second 0 is a marker → first 800 samples low, rest high.
  for (let j = 0; j < 800; j++) assert.equal(env[j], 0, `marker low at ${j}`);
  for (let j = 800; j < 1000; j++) assert.equal(env[j], 1, `marker high at ${j}`);
});

test("WWVB rejects tampered marker", () => {
  const t = new Date(Date.UTC(2026, 4, 12, 17, 23, 0));
  const frame = encodeWWVB({ time: t });
  frame.symbols[9] = "0";
  assert.throws(() => decodeWWVB(frame, 2026), /Missing marker/);
});
