/*
 * Traditional DNS header OPCODEs (4-bits) defined by IANA in
 * https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml#dns-parameters-5
 */
const OPCODES = {
  0: 'QUERY',
  1: 'IQUERY',
  2: 'STATUS',
  4: 'NOTIFY',
  5: 'UPDATE',
  6: 'DSO'
}

const NAMES = {}
for (const [opcode, name] of Object.entries(OPCODES)) NAMES[name] = Number(opcode)

export function toString (opcode) {
  return OPCODES[opcode] || 'OPCODE_' + opcode
}

export function toOpcode (code) {
  const upper = code.toUpperCase()
  if (Object.prototype.hasOwnProperty.call(NAMES, upper)) return NAMES[upper]
  const generic = /^OPCODE_(\d+)$/.exec(upper)
  if (generic && Number(generic[1]) <= 15) return Number(generic[1])
  return 0
}
