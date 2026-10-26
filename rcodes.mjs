/*
 * DNS RCODEs defined by IANA in
 * https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml#dns-parameters-6
 *
 * The header holds the lower 4 bits; with EDNS the OPT record adds 8 more (RFC 6891), so codes
 * 16 and up (BADVERS, BADCOOKIE, ...) only appear in a packet's `fullRcode`.
 */
const RCODES = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
  6: 'YXDOMAIN',
  7: 'YXRRSET',
  8: 'NXRRSET',
  9: 'NOTAUTH',
  10: 'NOTZONE',
  11: 'DSOTYPENI',
  16: 'BADVERS', // also BADSIG in TSIG records (RFC 8945)
  17: 'BADKEY',
  18: 'BADTIME',
  19: 'BADMODE',
  20: 'BADNAME',
  21: 'BADALG',
  22: 'BADTRUNC',
  23: 'BADCOOKIE'
}

const NAMES = { BADSIG: 16 }
for (const [rcode, name] of Object.entries(RCODES)) NAMES[name] = Number(rcode)

export function toString (rcode) {
  return RCODES[rcode] || 'RCODE_' + rcode
}

export function toRcode (code) {
  const upper = code.toUpperCase()
  if (Object.prototype.hasOwnProperty.call(NAMES, upper)) return NAMES[upper]
  const generic = /^RCODE_(\d+)$/.exec(upper)
  if (generic) return Number(generic[1])
  return 0
}
