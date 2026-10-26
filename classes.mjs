// IANA "DNS CLASSes"
// https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml#dns-parameters-2
const CLASSES = {
  1: 'IN',
  2: 'CS',
  3: 'CH',
  4: 'HS',
  254: 'NONE',
  255: 'ANY'
}

const NAMES = {}
for (const [klass, name] of Object.entries(CLASSES)) NAMES[name] = Number(klass)

export function toString (klass) {
  return CLASSES[klass] || 'UNKNOWN_' + klass
}

export function toClass (name) {
  const upper = name.toUpperCase()
  if (Object.prototype.hasOwnProperty.call(NAMES, upper)) return NAMES[upper]
  // RFC 3597 generic class names (CLASS32) and this library's UNKNOWN_32
  const generic = /^(?:CLASS|UNKNOWN_)(\d+)$/.exec(upper)
  if (generic) return parseInt(generic[1], 10)
  return 0
}
