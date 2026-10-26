import { Answer } from './types/index';

export interface PresentationOptions {
  /** Write domain names inside RDATA as absolute names ending with '.' (default true) */
  trailingDot?: boolean;
  /** Keep valid UTF-8 text in character-strings instead of \DDD escapes (default false) */
  utf8?: boolean;
}

/** RDATA in presentation (zone file) format, e.g. '10 mail.example.com.' */
export function rdataToString(rr: Answer, options?: PresentationOptions): string;
/** Whole record in presentation format, e.g. 'example.com. 300 IN MX 10 mail.example.com.' */
export function rrToString(rr: Answer, options?: PresentationOptions): string;
export function toBase64(bytes: Uint8Array): string;
export function toBase32Hex(bytes: Uint8Array): string;
export function quote(value: string | Uint8Array, options?: PresentationOptions): string;
