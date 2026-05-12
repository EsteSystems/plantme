import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRBU, encodeRBU } from "../src/index.js";

test("RBU round-trips a UTC time", () => {
  const t = new Date(Date.UTC(2026, 4, 12, 17, 23, 0));
  const frame = encodeRBU({ time: t, dut1Tenths: 4 });
  const decoded = decodeRBU(frame, 2026);
  assert.equal(decoded.time.toISOString(), t.toISOString());
  assert.equal(decoded.dut1, 4);
});

test("RBU round-trips negative DUT1 and leap-second flag", () => {
  const t = new Date(Date.UTC(2026, 5, 30, 23, 59, 0));
  const frame = encodeRBU({ time: t, dut1Tenths: -5, leapSecondPending: true });
  const decoded = decodeRBU(frame, 2026);
  assert.equal(decoded.dut1, -5);
  assert.equal(decoded.leapSecondPending, true);
});

test("RBU round-trips boundary dates", () => {
  const samples = [
    new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
    new Date(Date.UTC(2026, 11, 31, 23, 59, 0)),
    new Date(Date.UTC(2024, 1, 29, 12, 0, 0)),
  ];
  for (const t of samples) {
    const frame = encodeRBU({ time: t });
    const decoded = decodeRBU(frame, t.getUTCFullYear());
    assert.equal(decoded.time.toISOString(), t.toISOString(), `roundtrip ${t.toISOString()}`);
  }
});

test("RBU requires minute marker at s0", () => {
  const t = new Date(Date.UTC(2026, 4, 12, 17, 23, 0));
  const frame = encodeRBU({ time: t });
  frame.symbols[0] = "0";
  assert.throws(() => decodeRBU(frame), /minute marker/);
});
