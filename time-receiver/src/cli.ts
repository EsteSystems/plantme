#!/usr/bin/env node
/**
 * Long-wave time-receiver demo CLI.
 *
 * Subcommands:
 *   demo [--protocol wwvb|dcf77|rbu] [--time ISO]
 *     Encodes the given time as a frame, prints the symbol stream, then
 *     decodes it back and prints the result.
 *
 *   visualize [--protocol wwvb|dcf77|rbu] [--time ISO]
 *     Prints an ASCII rendering of the modulation envelope (one row = one
 *     second; "#" = full carrier, "." = suppressed).
 */

import type { Frame, Protocol } from "./types.js";
import { decodeDCF77, decodeRBU, decodeWWVB } from "./index.js";
import { encodeDCF77, encodeRBU, encodeWWVB } from "./index.js";
import { modulateDCF77, modulateRBU, modulateWWVB } from "./index.js";

interface Args {
  cmd: "demo" | "visualize";
  protocol: Protocol;
  time: Date;
}

function parseArgs(argv: string[]): Args {
  const cmd = (argv[2] === "visualize" ? "visualize" : "demo") as Args["cmd"];
  let protocol: Protocol = "WWVB";
  let time = new Date();
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--protocol" && argv[i + 1]) {
      const p = argv[++i]!.toUpperCase();
      if (p !== "WWVB" && p !== "DCF77" && p !== "RBU") {
        throw new Error(`Unknown protocol: ${p}`);
      }
      protocol = p;
    } else if (a === "--time" && argv[i + 1]) {
      time = new Date(argv[++i]!);
      if (isNaN(time.getTime())) throw new Error(`Bad --time value`);
    }
  }
  return { cmd, protocol, time };
}

function encode(protocol: Protocol, time: Date): Frame {
  switch (protocol) {
    case "WWVB":
      return encodeWWVB({ time, dut1Tenths: 0 });
    case "DCF77":
      return encodeDCF77({ localTime: time, cest: false });
    case "RBU":
      return encodeRBU({ time, dut1Tenths: 0 });
  }
}

function decode(frame: Frame) {
  switch (frame.protocol) {
    case "WWVB":
      return decodeWWVB(frame);
    case "DCF77":
      return decodeDCF77(frame);
    case "RBU":
      return decodeRBU(frame);
  }
}

function modulate(frame: Frame): Float32Array {
  switch (frame.protocol) {
    case "WWVB":
      return modulateWWVB(frame, 100);
    case "DCF77":
      return modulateDCF77(frame, 100);
    case "RBU":
      return modulateRBU(frame, 100);
  }
}

function printFrame(frame: Frame): void {
  const groups: string[] = [];
  for (let i = 0; i < 60; i += 10) {
    groups.push(frame.symbols.slice(i, i + 10).join(""));
  }
  console.log(`${frame.protocol} frame:`);
  console.log("  s00-09 s10-19 s20-29 s30-39 s40-49 s50-59");
  console.log("  " + groups.join(" "));
}

function visualize(frame: Frame): void {
  const env = modulate(frame);
  const samplesPerSec = env.length / 60;
  console.log(`${frame.protocol} envelope (one row per second, ${samplesPerSec} samples/sec):`);
  for (let i = 0; i < 60; i++) {
    const row: string[] = [];
    for (let j = 0; j < samplesPerSec; j++) {
      row.push(env[i * samplesPerSec + j]! > 0.5 ? "#" : ".");
    }
    const sec = i.toString().padStart(2, "0");
    console.log(`  ${sec} ${frame.symbols[i]} |${row.join("")}|`);
  }
}

function main(): void {
  const args = parseArgs(process.argv);
  const frame = encode(args.protocol, args.time);
  printFrame(frame);
  if (args.cmd === "visualize") {
    visualize(frame);
    return;
  }
  const decoded = decode(frame);
  console.log(`Decoded: ${decoded.protocol} -> ${decoded.time.toISOString()}` +
              (decoded.dut1 != null ? ` (DUT1 = ${decoded.dut1 / 10}s)` : "") +
              (decoded.dst != null ? ` [${decoded.dst ? "CEST" : "CET"}]` : ""));
}

main();
