// IANA "DNS EDNS0 Option Codes (OPT)"
// https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml#dns-parameters-11
const CODES = {
  1: 'LLQ',
  2: 'UL',
  3: 'NSID',
  5: 'DAU',
  6: 'DHU',
  7: 'N3U',
  8: 'CLIENT_SUBNET',
  9: 'EXPIRE',
  10: 'COOKIE',
  11: 'TCP_KEEPALIVE',
  12: 'PADDING',
  13: 'CHAIN',
  14: 'KEY_TAG',
  15: 'EDE',
  16: 'CLIENT_TAG',
  17: 'SERVER_TAG',
  18: 'REPORT_CHANNEL',
  19: 'ZONEVERSION',
  20: 'MQTYPE_QUERY',
  21: 'MQTYPE_RESPONSE',
  22: 'EDE_EXTRA_TEXT_LANGUAGE',
  23: 'FILTERING_CONTACT',
  24: 'FILTERING_ORGANIZATION',
  25: 'FILTERING_DB',
  26: 'STRUCTURED_DNS_ERROR',
  20292: 'UMBRELLA_IDENT',
  26946: 'DEVICEID'
}

const NAMES = {}
for (const [code, name] of Object.entries(CODES)) NAMES[name] = Number(code)

export function toString (type) {
  if (type < 0) {
    return null
  }
  return CODES[type] || `OPTION_${type}`
}

export function toCode (name) {
  if (typeof name === 'number') {
    return name
  }
  if (!name) {
    return -1
  }
  const upper = name.toUpperCase()
  if (Object.prototype.hasOwnProperty.call(NAMES, upper)) return NAMES[upper]
  const m = name.match(/_(\d+)$/)
  if (m) {
    return parseInt(m[1], 10)
  }
  return -1
}
