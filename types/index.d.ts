import { RecordType } from '../types.js';
import { RecordClass } from '../rcodes.js';
import { OptionCodes } from '../optioncodes.js';
import { OPCode } from '../opcodes.js';

export { RecordType } from '../types.js';
export { RecordClass } from '../rcodes.js';
export { OptionCodes } from '../optioncodes.js';
export { OPCode } from '../opcodes.js';

export interface Codec <Type> {
  encode(package: Type, buf?: Uint8Array, offset?: number): Uint8Array;
  decode(buf: Uint8Array, offset?: number): Type;
  encodingLength(packet: Type): number;
}

export interface Question {
 type: RecordType;
 name: string;
 class?: RecordClass | undefined;
}

export interface SrvData {
 target: string;
 port?: number;
 priority?: number | undefined;
 weight?: number | undefined;
}

export interface HInfoData {
 cpu: string;
 os: string;
}

export interface SoaData {
 mname: string;
 rname: string;
 serial?: number | undefined;
 refresh?: number | undefined;
 retry?: number | undefined;
 expire?: number | undefined;
 minimum?: number | undefined;
}

export type TxtData = string | Uint8Array | Array<string | Uint8Array>;

export interface CaaData {
 issuerCritical?: boolean | undefined;
 flags?: number | undefined;
 tag: string;
 value: string;
}

export interface MxData {
 preference?: number | undefined;
 exchange: string;
}

export interface BaseAnswer<T, D> {
 type: T;
 name: string;
 ttl?: number | undefined;
 class?: RecordClass | undefined;
 data: D;
 /** Set when the RDATA could not be decoded; `data` then holds the raw RDATA bytes. */
 dataError?: string;
}

/**
 * Record types for which the library will provide a string in the data field.
 */
export type StringRecordType = "A" | "AAAA" | "CNAME" | "DNAME" | "NS" | "PTR" | "MD" | "MF" | "MB" | "MG" | "MR" | "NSAP-PTR" | "EUI48" | "EUI64" | "X25";

/**
 * Record types for which the library does not attempt to process the data
 * field.
 */
export type OtherRecordType =
 | "AXFR"
 | "IXFR";

export type StringAnswer = BaseAnswer<StringRecordType, string>;
export type SrvAnswer = BaseAnswer<"SRV", SrvData>;
export type HInfoAnswer = BaseAnswer<"HINFO", HInfoData>;
export type SoaAnswer = BaseAnswer<"SOA", SoaData>;
export type TxtAnswer = BaseAnswer<"TXT" | "SPF" | "AVC" | "NINFO" | "RESINFO" | "WALLET", TxtData>;
export type CaaAnswer = BaseAnswer<"CAA", CaaData>;
export type MxAnswer = BaseAnswer<"MX" | "KX", MxData>;
export type MInfoAnswer = BaseAnswer<"MINFO", MInfoData>;
export type AfsdbAnswer = BaseAnswer<"AFSDB", AfsdbData>;
export type RtAnswer = BaseAnswer<"RT", RtData>;
export type PxAnswer = BaseAnswer<"PX", PxData>;
export type CertAnswer = BaseAnswer<"CERT", CertData>;
export type AplAnswer = BaseAnswer<"APL", AplItem[]>;
export type DhcidAnswer = BaseAnswer<"DHCID", DhcidData>;
export type IpseckeyAnswer = BaseAnswer<"IPSECKEY", IpseckeyData>;
export type HipAnswer = BaseAnswer<"HIP", HipData>;
export type NidAnswer = BaseAnswer<"NID", NidData>;
export type L32Answer = BaseAnswer<"L32" | "L64", LocatorData>;
export type LpAnswer = BaseAnswer<"LP", LpData>;
export type AmtRelayAnswer = BaseAnswer<"AMTRELAY", AmtRelayData>;
export type DsyncAnswer = BaseAnswer<"DSYNC", DsyncData>;
export type TkeyAnswer = BaseAnswer<"TKEY", TkeyData>;
export type TsigAnswer = BaseAnswer<"TSIG", TsigData>;
export type NullAnswer = BaseAnswer<"NULL", Uint8Array>;
export type OptAnswer = BaseAnswer<"OPT", OptionData[]>;
export type DNSKeyAnswer = BaseAnswer<"DNSKEY" | "CDNSKEY", DNSKeyData>;
export type RRSigAnswer = BaseAnswer<"RRSIG" | "SIG", RRSigData>;
export type KeyAnswer = BaseAnswer<"KEY" | "RKEY", KeyData>;
export type TalinkAnswer = BaseAnswer<"TALINK", TalinkData>;
export type WksAnswer = BaseAnswer<"WKS", WksData>;
export type IsdnAnswer = BaseAnswer<"ISDN", IsdnData>;
export type NsapAnswer = BaseAnswer<"NSAP", NsapData>;
export type GposAnswer = BaseAnswer<"GPOS", GposData>;
export type A6Answer = BaseAnswer<"A6", A6Data>;
export type NxtAnswer = BaseAnswer<"NXT", NxtData>;
export type AtmaAnswer = BaseAnswer<"ATMA", AtmaData>;
export type DoaAnswer = BaseAnswer<"DOA", DoaData>;
export type SinkAnswer = BaseAnswer<"SINK", SinkData>;
export type OpaqueAnswer = BaseAnswer<"EID" | "NIMLOC" | "HHIT" | "BRID", OpaqueData>;
export type RPAnswer = BaseAnswer<"RP", RPData>;
export type NSecAnswer = BaseAnswer<"NSEC", NSecData>;
export type NSec3Answer = BaseAnswer<"NSEC3", NSec3Data>;
export type DSAnswer = BaseAnswer<"DS" | "CDS" | "TA" | "DLV", DigestData>;
export type SSHFPAnswer = BaseAnswer<"SSHFP", SSHFP>;
export type NaptrAnswer = BaseAnswer<"NAPTR", NaptrData>;
export type TlsaAnswer = BaseAnswer<"TLSA" | "SMIMEA", TlsaData>;
export type UriAnswer = BaseAnswer<"URI", UriData>;
export type OpenPgpKeyAnswer = BaseAnswer<"OPENPGPKEY", OpenPgpKeyData>;
export type NSec3ParamAnswer = BaseAnswer<"NSEC3PARAM", NSec3ParamData>;
export type ZoneMDAnswer = BaseAnswer<"ZONEMD", ZoneMDData>;
export type CSyncAnswer = BaseAnswer<"CSYNC", CSyncData>;
export type LocAnswer = BaseAnswer<"LOC", LocData>;
export type SvcbAnswer = BaseAnswer<"SVCB" | "HTTPS", SvcbData>;
export type BufferAnswer = BaseAnswer<OtherRecordType, Uint8Array>;

export type Answer =
 | StringAnswer
 | SrvAnswer
 | HInfoAnswer
 | SoaAnswer
 | TxtAnswer
 | CaaAnswer
 | MxAnswer
 | MInfoAnswer
 | AfsdbAnswer
 | RtAnswer
 | PxAnswer
 | CertAnswer
 | AplAnswer
 | DhcidAnswer
 | IpseckeyAnswer
 | HipAnswer
 | NidAnswer
 | L32Answer
 | LpAnswer
 | AmtRelayAnswer
 | DsyncAnswer
 | TkeyAnswer
 | TsigAnswer
 | KeyAnswer
 | TalinkAnswer
 | WksAnswer
 | IsdnAnswer
 | NsapAnswer
 | GposAnswer
 | A6Answer
 | NxtAnswer
 | AtmaAnswer
 | DoaAnswer
 | SinkAnswer
 | OpaqueAnswer
 | NullAnswer
 | OptAnswer
 | DNSKeyAnswer
 | RRSigAnswer
 | RPAnswer
 | NSecAnswer
 | NSec3Answer
 | DSAnswer
 | SSHFPAnswer
 | NaptrAnswer
 | TlsaAnswer
 | UriAnswer
 | OpenPgpKeyAnswer
 | NSec3ParamAnswer
 | ZoneMDAnswer
 | CSyncAnswer
 | LocAnswer
 | SvcbAnswer
 | BufferAnswer;

export interface Packet {
  /**
   * Whether the packet is a query or a response. This field may be
   * omitted if it is clear from the context of usage what type of packet
   * it is.
   */
  type?: "query" | "response" | undefined;

  id?: number | undefined;

  /**
   * A bit-mask combination of zero or more of:
   * {@link AUTHORITATIVE_ANSWER},
   * {@link TRUNCATED_RESPONSE},
   * {@link RECURSION_DESIRED},
   * {@link RECURSION_AVAILABLE},
   * {@link AUTHENTIC_DATA},
   * {@link CHECKING_DISABLED}.
   */
  flags?: number | undefined;
  questions?: Question[] | undefined;
  answers?: Answer[] | undefined;
  additionals?: Answer[] | undefined;
  authorities?: Answer[] | undefined;
  flag_qr?: boolean;
  opcode?: OPCode;
  flag_aa?: boolean;
  flag_tc?: boolean;
  flag_rd?: boolean;
  flag_ra?: boolean;
  flag_z?: boolean;
  flag_ad?: boolean;
  flag_cd?: boolean;
  rcode?: RecordClass;
}

export const DNSSEC_OK: 32768;
export const AUTHORITATIVE_ANSWER: 1024;
export const TRUNCATED_RESPONSE: 512;
export const RECURSION_DESIRED: 256;
export const RECURSION_AVAILABLE: 128;
export const AUTHENTIC_DATA: 32;
export const CHECKING_DISABLED: 16;

export interface DNSKeyData {
  key: string;
  flags: number;
  algorithm: number;
}
export interface DigestData {
  digest: Uint8Array;
  keyTag: number;
  algorithm: number;
  digestType: number;
}
export type SSHFPFingerPrintLength = 20 | 32;
export type SSHFPHash = 1 | 2;
export type SSHFPFingerPrintLengthFor <T extends SSHFPHash> = T extends 1 ? 20 : 32;
export interface SSHFP {
  algorithm: number;
  /** 1 (SHA-1) and 2 (SHA-256) are checked for length; other values are passed through. */
  hash: SSHFPHash | number;
  fingerprint: string;
}

export interface MInfoData {
  rmailbx: string;
  emailbx: string;
}
export interface AfsdbData {
  subtype: number;
  hostname: string;
}
export interface RtData {
  preference: number;
  host: string;
}
export interface PxData {
  preference: number;
  map822: string;
  mapx400: string;
}
export interface CertData {
  certType: number;
  keyTag: number;
  algorithm: number;
  certificate: Uint8Array;
}
/** address is set for family 1 (IPv4) and 2 (IPv6); other families keep the raw AFDPART in data. */
export interface AplItem {
  family: number;
  prefix: number;
  negation: boolean;
  address?: string;
  data?: Uint8Array;
}
export interface DhcidData {
  data: Uint8Array;
}
/** gateway: null (type 0), IPv4 (1), IPv6 (2) or domain name (3) */
export interface IpseckeyData {
  precedence: number;
  gatewayType: 0 | 1 | 2 | 3;
  algorithm: number;
  gateway: string | null;
  publicKey: Uint8Array;
}
export interface HipData {
  algorithm: number;
  hit: Uint8Array;
  publicKey: Uint8Array;
  rendezvousServers?: string[];
}
export interface NidData {
  preference: number;
  /** four 16-bit hex groups, e.g. '0014:4fff:ff20:8b37' */
  nodeId: string;
}
/** L32: IPv4 address string. L64: four 16-bit hex groups. */
export interface LocatorData {
  preference: number;
  locator: string;
}
export interface LpData {
  preference: number;
  fqdn: string;
}
/** relay: null (type 0), IPv4 (1), IPv6 (2) or domain name (3) */
export interface AmtRelayData {
  precedence: number;
  discoveryOptional: boolean;
  relayType: 0 | 1 | 2 | 3;
  relay: string | null;
}
export interface DsyncData {
  rrtype: RecordType;
  scheme: number;
  port: number;
  target: string;
}
export interface TkeyData {
  algorithm: string;
  inception: number;
  expiration: number;
  mode: number;
  error: number;
  key: Uint8Array;
  other: Uint8Array;
}
export interface TsigData {
  algorithm: string;
  /** seconds since the epoch (48 bits) */
  timeSigned: number;
  fudge: number;
  mac: Uint8Array;
  originalId: number;
  error: number;
  other: Uint8Array;
}
/** KEY / RKEY: like DNSKEY, but protocol is not fixed to 3 */
export interface KeyData {
  flags: number;
  protocol: number;
  algorithm: number;
  key: Uint8Array;
}
export interface TalinkData {
  previous: string;
  next: string;
}
export interface WksData {
  address: string;
  protocol: number;
  ports: number[];
}
export interface IsdnData {
  address: string;
  subaddress?: string;
}
export interface NsapData {
  address: Uint8Array;
}
export interface GposData {
  longitude: string;
  latitude: string;
  altitude: string;
}
/** prefixName is present when prefixLength > 0 */
export interface A6Data {
  prefixLength: number;
  suffix: string;
  prefixName?: string;
}
export interface NxtData {
  nextDomain: string;
  rrtypes: RecordType[];
}
/** format 1 (E.164): address is the digit string; other formats: hex */
export interface AtmaData {
  format: number;
  address: string;
}
export interface DoaData {
  enterprise: number;
  type: number;
  location: number;
  mediaType: string;
  data: Uint8Array;
}
export interface SinkData {
  coding: number;
  subcoding: number;
  data: Uint8Array;
}
export interface OpaqueData {
  data: Uint8Array;
}
export interface NaptrData {
  order: number;
  preference: number;
  flags: string;
  services: string;
  regexp: string;
  replacement: string;
}
export interface TlsaData {
  usage: number;
  selector: number;
  matchingType: number;
  certificate: Uint8Array;
}
export interface UriData {
  priority: number;
  weight: number;
  target: string;
}
export interface OpenPgpKeyData {
  key: Uint8Array;
}
export interface NSec3ParamData {
  algorithm: number;
  flags: number;
  iterations: number;
  salt: Uint8Array;
}
export interface ZoneMDData {
  serial: number;
  scheme: number;
  algorithm: number;
  digest: Uint8Array;
}
export interface CSyncData {
  serial: number;
  flags: number;
  rrtypes: RecordType[];
}
/** RFC 1876 values as on the wire (see index.mjs for their units). */
export interface LocData {
  version?: 0;
  size: number;
  horizontalPrecision: number;
  verticalPrecision: number;
  latitude: number;
  longitude: number;
  altitude: number;
}
export interface SvcParams {
  mandatory?: string[];
  alpn?: string[];
  'no-default-alpn'?: true;
  port?: number;
  ipv4hint?: string[];
  ech?: Uint8Array;
  ipv6hint?: string[];
  dohpath?: string;
  ohttp?: true;
  [key: `key${number}`]: Uint8Array;
}
export interface SvcbData {
  priority: number;
  targetName: string;
  params: SvcParams;
}

export interface NSecData {
  nextDomain: Uint8Array;
  rrtypes: RecordType[];
}
export interface NSec3Data {
  salt: Uint8Array;
  nextDomain: Uint8Array;
  algorithm: number;
  flags: number;
  iterations: number;
  rrtypes: RecordType[];
}

export type ACodec = Codec<string>;
export type PtrCodec = Codec<Uint8Array>;
export type TxtCodec = Codec<Uint8Array[]>;
export type NullCodec = Codec<Uint8Array>;
export type CaaCodec = Codec<string> & {
  ISSUER_CRITICAL: 128
};
export type DNSKeyCodec = Codec<DNSKeyData> & {
  PROTOCOL_DNSSEC: 3
  ZONE_KEY: 0x80
  SECURE_ENTRYPOINT: 0x8000
};
export type DSCodec = Codec<DigestData>;
export type SSHFPCodec = Codec<SSHFP> & {
  getFingerprintLengthForHashType(hashType: SSHFPHash): SSHFPFingerPrintLength;
};
export type HInfoCodec = Codec<HInfoData>;
export type AAAACodec = Codec<string>;
export type UnknownCodec = Codec<Uint8Array>;
export type SrvCodec = Codec<SrvData>;
export type NSCodec = Codec<string>;
export type SoaCodec = Codec<SoaData>;
export type MxCodec = Codec<MxData>;
export type OptCodec = Codec<OptionData[]>;
export type QuestionCodec = Codec<Question>;
export type RRSigCodec = Codec<RRSigData>;
export type RPCodec = Codec<RPData>;
export type NSecCodec = Codec<NSecData>;
export type NSec3Codec = Codec<NSec3Data>;
export type NaptrCodec = Codec<NaptrData>;
export type TlsaCodec = Codec<TlsaData>;
export type UriCodec = Codec<UriData>;
export type OpenPgpKeyCodec = Codec<OpenPgpKeyData>;
export type NSec3ParamCodec = Codec<NSec3ParamData>;
export type ZoneMDCodec = Codec<ZoneMDData>;
export type CSyncCodec = Codec<CSyncData>;
export type LocCodec = Codec<LocData>;
export type SvcbCodec = Codec<SvcbData>;
export type MInfoCodec = Codec<MInfoData>;
export type AfsdbCodec = Codec<AfsdbData>;
export type RtCodec = Codec<RtData>;
export type PxCodec = Codec<PxData>;
export type CertCodec = Codec<CertData>;
export type AplCodec = Codec<AplItem[]>;
export type DhcidCodec = Codec<DhcidData>;
export type IpseckeyCodec = Codec<IpseckeyData>;
export type HipCodec = Codec<HipData>;
export type EuiCodec = Codec<string>;
export type NidCodec = Codec<NidData>;
export type LocatorCodec = Codec<LocatorData>;
export type LpCodec = Codec<LpData>;
export type AmtRelayCodec = Codec<AmtRelayData>;
export type DsyncCodec = Codec<DsyncData>;
export type TkeyCodec = Codec<TkeyData>;
export type TsigCodec = Codec<TsigData>;
export type KeyCodec = Codec<KeyData>;
export type TalinkCodec = Codec<TalinkData>;
export type WksCodec = Codec<WksData>;
export type IsdnCodec = Codec<IsdnData>;
export type NsapCodec = Codec<NsapData>;
export type GposCodec = Codec<GposData>;
export type A6Codec = Codec<A6Data>;
export type NxtCodec = Codec<NxtData>;
export type AtmaCodec = Codec<AtmaData>;
export type DoaCodec = Codec<DoaData>;
export type SinkCodec = Codec<SinkData>;
export type OpaqueCodec = Codec<OpaqueData>;
export type PacketCodec = Codec<Packet>;

export type SingleQuestionPacket = Omit<Packet, 'questions'> & {
  question: Question
};

export type QueryCodec = Codec<SingleQuestionPacket>;
export type ResponseCodec = Codec<SingleQuestionPacket>;

export const a: ACodec;
export const caa: CaaCodec;
export const ptr: PtrCodec;
export const cname: PtrCodec;
export const dname: PtrCodec;
export const dnskey: DNSKeyCodec;
export const ds: DSCodec;
export const sshfp: SSHFPCodec;
export const hinfo: HInfoCodec;
export const aaaa: AAAACodec;
export const answer: Codec<Answer>;
export const txt: TxtCodec;
export const unknown: UnknownCodec;
export const mx: MxCodec;
export const name: Codec<string>;
export const ns: NSCodec;
export const soa: SoaCodec;
export const srv: SrvCodec;
export const option: Codec<OptionData>;
export const opt: OptCodec;
export const question: QuestionCodec;
export const rrsig: RRSigCodec;
export const rp: RPCodec;
export const nsec: NSecCodec;
export const nsec3: NSec3Codec;
export const naptr: NaptrCodec;
export const tlsa: TlsaCodec;
export const smimea: TlsaCodec;
export const uri: UriCodec;
export const openpgpkey: OpenPgpKeyCodec;
export const nsec3param: NSec3ParamCodec;
export const zonemd: ZoneMDCodec;
export const csync: CSyncCodec;
export const loc: LocCodec;
export const svcb: SvcbCodec;
export const https: SvcbCodec;
export const minfo: MInfoCodec;
export const afsdb: AfsdbCodec;
export const rt: RtCodec;
export const kx: MxCodec;
export const px: PxCodec;
export const cert: CertCodec;
export const apl: AplCodec;
export const dhcid: DhcidCodec;
export const ipseckey: IpseckeyCodec;
export const hip: HipCodec;
export const eui48: EuiCodec;
export const eui64: EuiCodec;
export const nid: NidCodec;
export const l32: LocatorCodec;
export const l64: LocatorCodec;
export const lp: LpCodec;
export const amtrelay: AmtRelayCodec;
export const dsync: DsyncCodec;
export const tkey: TkeyCodec;
export const tsig: TsigCodec;
export const sig: RRSigCodec;
export const key: KeyCodec;
export const rkey: KeyCodec;
export const talink: TalinkCodec;
export const wks: WksCodec;
export const x25: Codec<string>;
export const isdn: IsdnCodec;
export const nsap: NsapCodec;
export const gpos: GposCodec;
export const a6: A6Codec;
export const nxt: NxtCodec;
export const atma: AtmaCodec;
export const doa: DoaCodec;
export const sink: SinkCodec;
export const eid: OpaqueCodec;
export const nimloc: OpaqueCodec;
export const hhit: OpaqueCodec;
export const brid: OpaqueCodec;
export const packet: PacketCodec;
export const query: QueryCodec;
export const response: ResponseCodec;

declare const rnull: NullCodec;
export { rnull as null };

export interface GenericOptionData {
  code: OptionCodes;
  data: Uint8Array;
}
export interface ClientSubnetOptionData {
  code: 'CLIENT_SUBNET';
  ip: string;
  family?: 1 | 2;
  sourcePrefixLength?: number;
  scopePrefixLength?: number;
}
export interface TCPKeepaliveOptionData {
  code: 'TCP_KEEPALIVE';
  timeout?: number;
}
export interface PaddingOptionData {
  code: 'PADDING';
  length?: number;
}
export interface KeyTagOptionData {
  code: 'KEY_TAG';
  tags: number[];
}

export type OptionData =
    GenericOptionData
  | ClientSubnetOptionData
  | TCPKeepaliveOptionData
  | PaddingOptionData
  | KeyTagOptionData;

export interface RRSigData {
  signature: Uint8Array;
  typeCovered: RecordType;
  algorithm: number;
  labels: number;
  originalTTL: number;
  expiration: number;
  inception: number;
  keyTag: number;
  signersName: string;
}

export interface RPData {
  mbox?: string;
  txt?: string;
}

export type AnyTypeCodec =
  ACodec | PtrCodec | TxtCodec | NullCodec | AAAACodec |
  SrvCodec | HInfoCodec | CaaCodec | NSCodec | SoaCodec |
  MxCodec | OptCodec | RRSigCodec | RPCodec | NSecCodec |
  NSec3Codec | DSCodec | UnknownCodec;

export type TypeCodec <Type> =
  Type extends string ?
    Uppercase<Type> extends 'A' ? ACodec :
    Uppercase<Type> extends 'PTR' ? PtrCodec :
    Uppercase<Type> extends 'CNAME' ? PtrCodec :
    Uppercase<Type> extends 'DNAME' ? PtrCodec :
    Uppercase<Type> extends 'TXT' ? TxtCodec :
    Uppercase<Type> extends 'NULL' ? NullCodec :
    Uppercase<Type> extends 'AAAA' ? AAAACodec :
    Uppercase<Type> extends 'SRV' ? SrvCodec :
    Uppercase<Type> extends 'HINFO' ? HInfoCodec :
    Uppercase<Type> extends 'CAA' ? CaaCodec :
    Uppercase<Type> extends 'NS' ? NSCodec :
    Uppercase<Type> extends 'SOA' ? SoaCodec :
    Uppercase<Type> extends 'MX' ? MxCodec :
    Uppercase<Type> extends 'OPT' ? OptCodec :
    Uppercase<Type> extends 'DNSKEY' ? DNSKeyCodec :
    Uppercase<Type> extends 'RRSIG' ? RRSigCodec :
    Uppercase<Type> extends 'RP' ? RPCodec :
    Uppercase<Type> extends 'NSEC' ? NSecCodec :
    Uppercase<Type> extends 'NSEC3' ? NSec3Codec :
    Uppercase<Type> extends 'DS' ? DSCodec :
    UnknownCodec
  : AnyTypeCodec;

export function enc <Type>(type: Type): TypeCodec<Type>;

export function encode(packet: Packet, buf?: Uint8Array, offset?: number): Uint8Array;
export function decode(buf: Uint8Array, offset?: number): Packet;
export function encodingLength(packet: Packet): number;
export function decodeList <T= any>(list: T[], codec: Codec<T>, buf: Uint8Array, offset?: number): Packet[];
export function encodeList <T= any>(list: T[], codec: Codec<T>, buf?: Uint8Array, offset?: number): number;
export function encodingLengthList <T= any>(list: T[], codec: Codec<T>): number;
export function streamDecode(buffer: Uint8Array): Packet | null;
export function streamEncode(packet: Packet): Uint8Array;
