import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeDCF77, encodeDCF77 } from "../src/index.js";

test("DCF77 round-trips local CET time", () => {
  const local = new Date(Date.UTC(2026, 0, 15, 14, 35, 0)); // 15 Jan 2026 14:35 CET
  const frame = encodeDCF77({ localTime: local, cest: false });
  const decoded = decodeDCF77(frame, 2026);
  assert.equal(decoded.localTime?.toISOString(), local.toISOString());
  // UTC should be one hour earlier
  assert.equal(decoded.time.toISOString(), new Date(local.getTime() - 3600_000).toISOString());
  assert.equal(decoded.dst, false);
});

test("DCF77 round-trips CEST", () => {
  const local = new Date(Date.UTC(2026, 6, 4, 9, 0, 0));
  const frame = encodeDCF77({ localTime: local, cest: true });
  const decoded = decodeDCF77(frame, 2026);
  assert.equal(decoded.dst, true);
  assert.equal(decoded.time.toISOString(), new Date(local.getTime() - 2 * 3600_000).toISOString());
});

test("DCF77 detects minute-parity errors", () => {
  const local = new Date(Date.UTC(2026, 0, 15, 14, 35, 0));
  const frame = encodeDCF77({ localTime: local, cest: false });
  // Flip a minute bit but not parity → must fail parity.
  frame.symbols[21] = frame.symbols[21] === "1" ? "0" : "1";
  assert.throws(() => decodeDCF77(frame, 2026), /minute parity/);
});

test("DCF77 detects date-parity errors", () => {
  const local = new Date(Date.UTC(2026, 0, 15, 14, 35, 0));
  const frame = encodeDCF77({ localTime: local, cest: false });
  frame.symbols[36] = frame.symbols[36] === "1" ? "0" : "1"; // flip a day bit
  assert.throws(() => decodeDCF77(frame, 2026), /date parity/);
});

test("DCF77 frame structure invariants", () => {
  const frame = encodeDCF77({ localTime: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)), cest: false });
  assert.equal(frame.symbols[0], "0");
  assert.equal(frame.symbols[20], "1");
  assert.equal(frame.symbols[59], "M");
});
