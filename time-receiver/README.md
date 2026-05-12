# time-receiver

A TypeScript simulator for the three major long-wave (LF) time-code radio
broadcasts:

| Station | Location               | Carrier   | Format          |
|---------|------------------------|-----------|-----------------|
| WWVB    | Fort Collins, CO, USA  | 60 kHz    | PWM AM, BCD     |
| DCF77   | Mainflingen, Germany   | 77.5 kHz  | PWM AM, LSB-BCD |
| RBU     | Taldom (Moscow), RU    | 66.(6) kHz| PWM AM (model)  |

Each protocol module exposes an encoder, a decoder, and a baseband amplitude
modulator. The encoder takes a JavaScript `Date` plus protocol-specific flags
(DUT1, DST, leap-second pending, ...) and emits a 60-symbol frame
(`"0" | "1" | "M"`). The modulator turns the frame into an envelope at a
configurable sample rate; the decoder inverts the encoder and validates parity
or marker structure.

> The RBU format on real receivers uses phase manipulation as well as AM
> pulse-width. The implementation here models a clean PWM AM variant only,
> sufficient for end-to-end simulation but not for decoding live off-air RBU.

## Layout

```
time-receiver/
├── src/
│   ├── bcd.ts                # weighted-BCD helpers + parity
│   ├── cli.ts                # `time-receiver demo|visualize`
│   ├── index.ts              # public re-exports
│   ├── types.ts              # Frame / Symbol / DecodedTime
│   └── protocols/
│       ├── wwvb.ts
│       ├── dcf77.ts
│       └── rbu.ts
└── test/                     # node:test round-trip tests
```

## Usage

```bash
npm install
npm test
npm run demo -- --protocol dcf77 --time 2026-05-12T17:23:00Z
npm run cli -- visualize --protocol wwvb
```

Programmatic:

```ts
import { encodeDCF77, decodeDCF77 } from "time-receiver";

const frame = encodeDCF77({
  localTime: new Date(Date.UTC(2026, 4, 12, 19, 23, 0)),
  cest: true,
});
const decoded = decodeDCF77(frame);
console.log(decoded.time, decoded.dst);
```
