/**
 * Shared types for long-wave time-code protocols.
 *
 * Each protocol exchanges one 60-second frame per minute. We model the frame
 * as 60 symbols (one per second). The physical layer is amplitude-modulated
 * carrier suppression: each second the carrier drops to a reduced level for
 * a duration that encodes the symbol.
 */

export type Symbol = "0" | "1" | "M";

export type Protocol = "WWVB" | "DCF77" | "RBU";

export interface DecodedTime {
  /** UTC date/time decoded from the frame. The frame describes the *next*
   *  minute boundary that follows the marker pulse; the encoder/decoder pair
   *  here treats `time` as the wall-clock instant the frame announces. */
  time: Date;
  protocol: Protocol;
  /** DUT1 correction (UT1 - UTC) in tenths of a second, if transmitted. */
  dut1?: number;
  /** Leap-second pending at end of current month (if transmitted). */
  leapSecondPending?: boolean;
  /** Daylight savings indicator(s) (DCF77 specific). */
  dst?: boolean;
  /** Local time as transmitted (DCF77 transmits local CET/CEST). */
  localTime?: Date;
}

export interface Frame {
  symbols: Symbol[];
  protocol: Protocol;
}

/** Carrier modulation envelope: amplitude reduction level (0..1) per ms. */
export interface ModulationEnvelope {
  protocol: Protocol;
  /** Carrier frequency in Hz. */
  carrierHz: number;
  /** Sample rate of the envelope in Hz. */
  sampleRate: number;
  /** Envelope amplitude per sample: 1 = full carrier, 0 = fully suppressed. */
  envelope: Float32Array;
}
