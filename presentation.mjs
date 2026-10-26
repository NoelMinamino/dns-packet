// Presentation (zone file) format for decoded records: RFC 1035 section 5 and the RFC of each type.
//
//   rdataToString(answer, options) -> '10 mail.example.com.'
//   rrToString(answer, options)    -> 'example.com. 300 IN MX 10 mail.example.com.'
//
// options:
//   trailingDot (default true)  write domain names inside RDATA as absolute names ending with '.'
//   utf8 (default false)        keep valid UTF-8 text in <character-string>s instead of \DDD escapes
//
// Records whose RDATA could not be decoded (raw Uint8Array data) use the RFC 3597 form '\# <len> <hex>'.
import * as types from './types.mjs'
import * as b from './buffer_utils.mjs'
import { decode as toUtf8 } from 'utf8-codec'

const DEFAULTS = { trailingDot: true, utf8: false }

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function toBase64 (bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0)
    out += BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63] +
      (i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : '=') +
      (i + 2 < bytes.length ? BASE64[n & 63] : '=')
  }
  return out
}

// Base 32 with the "Extended Hex" alphabet, no padding (RFC 4648 section 7, used by NSEC3)
export function toBase32Hex (bytes) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUV'
  let out = ''
  let bits = 0
  let value = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31]
  return out
}

const hex = bytes => b.toHex(bytes, 0, bytes.length)
const HEX = bytes => hex(bytes).toUpperCase()
const generic = bytes => `\\# ${bytes.length}${bytes.length ? ' ' + hex(bytes) : ''}`

const toBytes = value => typeof value === 'string' ? b.from(value) : value

// <character-string> in double quotes; '"' and '\' are escaped, other non-printable bytes become \DDD
export function quote (value, options = DEFAULTS) {
  const bytes = toBytes(value)
  let out = '"'
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]
    if (c === 0x22 || c === 0x5c) {
      out += '\\' + String.fromCharCode(c)
    } else if (c >= 0x20 && c < 0x7f) {
      out += String.fromCharCode(c)
    } else {
      const len = options.utf8 ? b.utf8SequenceLength(bytes, i) : 0
      if (len) {
        out += toUtf8(bytes, i, i + len)
        i += len - 1
      } else {
        out += '\\' + String(c).padStart(3, '0')
      }
    }
  }
  return out + '"'
}

function domain (name, options) {
  if (name === '.' || name === '') return '.'
  return options.trailingDot ? `${name}.` : name
}

function typeName (type) {
  if (typeof type === 'number') type = types.toString(type)
  return type.startsWith('UNKNOWN_') ? `TYPE${type.slice(8)}` : type
}

function className (klass) {
  return klass.startsWith('UNKNOWN_') ? `CLASS${klass.slice(8)}` : klass
}

const CERT_TYPES = { 1: 'PKIX', 2: 'SPKI', 3: 'PGP', 4: 'IPKIX', 5: 'ISPKI', 6: 'IPGP', 7: 'ACPKIX', 8: 'IACPKIX', 253: 'URI', 254: 'OID' }

function locSize (value) {
  return ((value >> 4) * Math.pow(10, value & 0xf) / 100).toFixed(2)
}

function locCoordinate (value, positive, negative) {
  const offset = value - 0x80000000
  const abs = Math.abs(offset)
  const deg = Math.floor(abs / 3600000)
  const min = Math.floor((abs % 3600000) / 60000)
  const sec = ((abs % 60000) / 1000).toFixed(3)
  return `${deg} ${min} ${sec} ${offset < 0 ? negative : positive}`
}

const svcValue = (key, value, options) => {
  switch (key) {
    case 'mandatory': return value.join(',')
    case 'alpn': return quote(value.map(id => id.replace(/[\\,]/g, c => '\\' + c)).join(','), options)
    case 'port': return String(value)
    case 'ipv4hint':
    case 'ipv6hint': return value.join(',')
    case 'ech': return `"${toBase64(value)}"`
    case 'dohpath': return quote(value, options)
  }
  return quote(value, options)
}

function svcParams (params, options) {
  return Object.keys(params).map(key => {
    const value = params[key]
    if (value === true || (value instanceof Uint8Array && value.length === 0)) return key
    return `${key}=${svcValue(key, value, options)}`
  })
}

const gatewayString = (type, value, options) => type === 3 ? domain(value, options) : (type === 0 ? '.' : value)

// One formatter per type; each returns the list of RDATA fields.
const FORMATTERS = {
  A: d => [d],
  AAAA: d => [d],
  NS: (d, o) => [domain(d, o)],
  CNAME: (d, o) => [domain(d, o)],
  DNAME: (d, o) => [domain(d, o)],
  PTR: (d, o) => [domain(d, o)],
  MD: (d, o) => [domain(d, o)],
  MF: (d, o) => [domain(d, o)],
  MB: (d, o) => [domain(d, o)],
  MG: (d, o) => [domain(d, o)],
  MR: (d, o) => [domain(d, o)],
  'NSAP-PTR': (d, o) => [domain(d, o)],
  SOA: (d, o) => [domain(d.mname, o), domain(d.rname, o), d.serial, d.refresh, d.retry, d.expire, d.minimum],
  MX: (d, o) => [d.preference, domain(d.exchange, o)],
  KX: (d, o) => [d.preference, domain(d.exchange, o)],
  RT: (d, o) => [d.preference, domain(d.host, o)],
  AFSDB: (d, o) => [d.subtype, domain(d.hostname, o)],
  LP: (d, o) => [d.preference, domain(d.fqdn, o)],
  PX: (d, o) => [d.preference, domain(d.map822, o), domain(d.mapx400, o)],
  MINFO: (d, o) => [domain(d.rmailbx, o), domain(d.emailbx, o)],
  RP: (d, o) => [domain(d.mbox, o), domain(d.txt, o)],
  TALINK: (d, o) => [domain(d.previous, o), domain(d.next, o)],
  SRV: (d, o) => [d.priority, d.weight, d.port, domain(d.target, o)],
  NAPTR: (d, o) => [d.order, d.preference, quote(d.flags, o), quote(d.services, o), quote(d.regexp, o), domain(d.replacement, o)],
  TXT: (d, o) => d.map(s => quote(s, o)),
  HINFO: (d, o) => [quote(d.cpu, o), quote(d.os, o)],
  X25: (d, o) => [quote(d, o)],
  ISDN: (d, o) => d.subaddress === undefined ? [quote(d.address, o)] : [quote(d.address, o), quote(d.subaddress, o)],
  GPOS: (d, o) => [quote(d.longitude, o), quote(d.latitude, o), quote(d.altitude, o)],
  CAA: (d, o) => [d.flags, d.tag, quote(d.value, o)],
  URI: (d, o) => [d.priority, d.weight, quote(d.target, o)],
  NSAP: d => ['0x' + hex(d.address)],
  WKS: d => [d.address, d.protocol, ...d.ports],
  DNSKEY: d => [d.flags, 3, d.algorithm, toBase64(d.key)],
  KEY: d => [d.flags, d.protocol, d.algorithm, toBase64(d.key)],
  DS: d => [d.keyTag, d.algorithm, d.digestType, HEX(d.digest)],
  RRSIG: (d, o) => [typeName(d.typeCovered), d.algorithm, d.labels, d.originalTTL, d.expiration, d.inception, d.keyTag, domain(d.signersName, o), toBase64(d.signature)],
  NSEC: (d, o) => [domain(d.nextDomain, o), ...d.rrtypes.map(typeName)],
  NXT: (d, o) => [domain(d.nextDomain, o), ...d.rrtypes.map(typeName)],
  NSEC3: d => [d.algorithm, d.flags, d.iterations, d.salt.length ? HEX(d.salt) : '-', toBase32Hex(d.nextDomain), ...d.rrtypes.map(typeName)],
  NSEC3PARAM: d => [d.algorithm, d.flags, d.iterations, d.salt.length ? HEX(d.salt) : '-'],
  SSHFP: d => [d.algorithm, d.hash, d.fingerprint],
  TLSA: d => [d.usage, d.selector, d.matchingType, HEX(d.certificate)],
  OPENPGPKEY: d => [toBase64(d.key)],
  DHCID: d => [toBase64(d.data)],
  CERT: d => [CERT_TYPES[d.certType] || d.certType, d.keyTag, d.algorithm, toBase64(d.certificate)],
  CSYNC: d => [d.serial, d.flags, ...d.rrtypes.map(typeName)],
  ZONEMD: d => [d.serial, d.scheme, d.algorithm, hex(d.digest)],
  LOC: d => [
    locCoordinate(d.latitude, 'N', 'S'),
    locCoordinate(d.longitude, 'E', 'W'),
    `${((d.altitude - 10000000) / 100).toFixed(2)}m`,
    `${locSize(d.size)}m`,
    `${locSize(d.horizontalPrecision)}m`,
    `${locSize(d.verticalPrecision)}m`
  ],
  SVCB: (d, o) => [d.priority, domain(d.targetName, o), ...svcParams(d.params, o)],
  APL: d => d.map(item => {
    const address = item.address !== undefined ? item.address : hex(item.data)
    return `${item.negation ? '!' : ''}${item.family}:${address}/${item.prefix}`
  }),
  IPSECKEY: (d, o) => [d.precedence, d.gatewayType, d.algorithm, gatewayString(d.gatewayType, d.gateway, o), ...(d.publicKey.length ? [toBase64(d.publicKey)] : [])],
  AMTRELAY: (d, o) => [d.precedence, d.discoveryOptional ? 1 : 0, d.relayType, gatewayString(d.relayType, d.relay, o)],
  HIP: (d, o) => [d.algorithm, hex(d.hit), toBase64(d.publicKey), ...(d.rendezvousServers || []).map(n => domain(n, o))],
  EUI48: d => [d],
  NID: d => [d.preference, d.nodeId],
  L32: d => [d.preference, d.locator],
  L64: d => [d.preference, d.locator],
  DSYNC: (d, o) => [typeName(d.rrtype), d.scheme, d.port, domain(d.target, o)],
  A6: (d, o) => d.prefixLength > 0 ? [d.prefixLength, d.suffix, domain(d.prefixName, o)] : [0, d.suffix],
  // ATM Forum af-dans-0152.000: AESA as hex digits, E.164 as '+' and digits
  ATMA: d => [d.format === 1 ? `+${d.address}` : d.address],
  DOA: (d, o) => [d.enterprise, d.type, d.location, quote(d.mediaType, o), d.data.length ? toBase64(d.data) : '-'],
  SINK: d => [generic(Uint8Array.from([d.coding, d.subcoding, ...d.data]))],
  TKEY: (d, o) => [domain(d.algorithm, o), d.inception, d.expiration, d.mode, d.error, d.key.length, toBase64(d.key), d.other.length, toBase64(d.other)].filter(v => v !== ''),
  TSIG: (d, o) => [domain(d.algorithm, o), d.timeSigned, d.fudge, d.mac.length, toBase64(d.mac), d.originalId, d.error, d.other.length, toBase64(d.other)].filter(v => v !== ''),
  OPT: (d, o, rr) => [generic(optionsRdata(rr.options || []))]
}

const ALIASES = {
  CDS: 'DS',
  TA: 'DS',
  DLV: 'DS',
  CDNSKEY: 'DNSKEY',
  RKEY: 'KEY',
  SIG: 'RRSIG',
  SMIMEA: 'TLSA',
  HTTPS: 'SVCB',
  SPF: 'TXT',
  AVC: 'TXT',
  NINFO: 'TXT',
  RESINFO: 'TXT',
  WALLET: 'TXT',
  EUI64: 'EUI48'
}

// EID / NIMLOC / HHIT / BRID keep their RDATA opaque, as { data }
const OPAQUE = new Set(['EID', 'NIMLOC', 'HHIT', 'BRID'])

function optionsRdata (options) {
  const parts = []
  for (const option of options) {
    const data = option.data || new Uint8Array(0)
    parts.push(option.code >> 8, option.code & 0xff, data.length >> 8, data.length & 0xff, ...data)
  }
  return Uint8Array.from(parts)
}

export function rdataToString (rr, options) {
  options = { ...DEFAULTS, ...options }
  const type = typeName(rr.type)
  const data = rr.data
  if (type !== 'OPT' && data instanceof Uint8Array) return generic(data)
  if (OPAQUE.has(type)) return generic(data.data)
  const formatter = FORMATTERS[ALIASES[type] || type]
  if (!formatter) {
    throw new Error(`No presentation format for ${type}`)
  }
  return formatter(data, options, rr).join(' ')
}

export function rrToString (rr, options) {
  options = { ...DEFAULTS, ...options }
  const type = typeName(rr.type)
  let ttl = rr.ttl || 0
  let klass = className(rr.class || 'IN')
  if (type === 'OPT') {
    // RFC 6891: CLASS holds the UDP payload size, TTL the extended RCODE, version and flags
    klass = `CLASS${rr.udpPayloadSize || 0}`
    ttl = ((rr.extendedRcode || 0) * 0x1000000) + ((rr.ednsVersion || 0) << 16) + (rr.flags || 0)
  }
  const owner = rr.name === '.' ? '.' : `${rr.name}.`
  return `${owner} ${ttl} ${klass} ${type} ${rdataToString(rr, options)}`
}
