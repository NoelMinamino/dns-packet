import * as ip from '@leichtgewicht/ip-codec'
import * as types from './types.mjs'
import * as rcodes from './rcodes.mjs'
import * as opcodes from './opcodes.mjs'
import * as classes from './classes.mjs'
import * as optioncodes from './optioncodes.mjs'
import * as b from './buffer_utils.mjs'
import { decode as toUtf8 } from 'utf8-codec'

export { rdataToString, rrToString } from './presentation.mjs'

const QUERY_FLAG = 0
const RESPONSE_FLAG = 1 << 15
const FLUSH_MASK = 1 << 15
const NOT_FLUSH_MASK = ~FLUSH_MASK
const QU_MASK = 1 << 15
const NOT_QU_MASK = ~QU_MASK

function codec ({ bytes = 0, encode, decode, encodingLength }) {
  encode.bytes = bytes
  decode.bytes = bytes
  return {
    encode,
    decode,
    encodingLength: encodingLength || (() => bytes)
  }
}

// Names are strings in master-file form (RFC 1035 section 5.1): inside a label "." and "\" are written as
// "\." and "\\", and bytes that are not printable as "\DDD" (decimal). Valid UTF-8 is kept as it is.
function escapeLabel (buf, start, end) {
  let out = ''
  for (let i = start; i < end; i++) {
    const c = buf[i]
    if (c === 0x2e || c === 0x5c) {
      out += '\\' + String.fromCharCode(c)
    } else if (c > 0x20 && c < 0x7f) {
      out += String.fromCharCode(c)
    } else {
      const len = c >= 0x80 ? b.utf8SequenceLength(buf, i, end) : 0
      if (len) {
        out += toUtf8(buf, i, i + len)
        i += len - 1
      } else {
        out += '\\' + String(c).padStart(3, '0')
      }
    }
  }
  return out
}

// The labels of a name in master-file form, as bytes. Empty labels (leading / trailing ".") are dropped.
function nameLabels (str) {
  if (!str.includes('\\')) {
    return str.split('.').filter(label => label.length).map(label => b.from(label))
  }
  const labels = []
  let label = []
  const chars = Array.from(str)
  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i]
    if (ch === '.') {
      if (label.length) labels.push(Uint8Array.from(label))
      label = []
      continue
    }
    if (ch === '\\' && i + 1 < chars.length) {
      const digits = chars.slice(i + 1, i + 4).join('')
      if (/^\d{3}$/.test(digits) && Number(digits) <= 255) {
        label.push(Number(digits))
        i += 3
        continue
      }
      ch = chars[++i]
    }
    label.push(...b.from(ch))
  }
  if (label.length) labels.push(Uint8Array.from(label))
  return labels
}

export const name = codec({
  encode (str, buf, offset) {
    if (!buf) buf = new Uint8Array(name.encodingLength(str))
    if (!offset) offset = 0
    const oldOffset = offset

    for (const label of nameLabels(str)) {
      if (label.length > 63) throw new Error(`Cannot encode name (label longer than 63 bytes): ${str}`)
      buf[offset++] = label.length
      buf.set(label, offset)
      offset += label.length
    }

    buf[offset++] = 0

    name.encode.bytes = offset - oldOffset
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const list = []
    let oldOffset = offset
    let totalLength = 0
    let consumedBytes = 0
    let jumped = false

    while (true) {
      if (offset >= buf.length) {
        throw new Error('Cannot decode name (buffer overflow)')
      }
      const len = buf[offset++]
      consumedBytes += jumped ? 0 : 1

      if (len === 0) {
        break
      } else if ((len & 0xc0) === 0) {
        if (offset + len > buf.length) {
          throw new Error('Cannot decode name (buffer overflow)')
        }
        totalLength += len + 1
        if (totalLength > 254) {
          throw new Error('Cannot decode name (name too long)')
        }
        list.push(escapeLabel(buf, offset, offset + len))
        offset += len
        consumedBytes += jumped ? 0 : len
      } else if ((len & 0xc0) === 0xc0) {
        if (offset + 1 > buf.length) {
          throw new Error('Cannot decode name (buffer overflow)')
        }
        const jumpOffset = b.readUInt16BE(buf, offset - 1) - 0xc000
        if (jumpOffset >= oldOffset) {
          // Allow only pointers to prior data. RFC 1035, section 4.1.4 states:
          // "[...] an entire domain name or a list of labels at the end of a domain name
          // is replaced with a pointer to a prior occurance (sic) of the same name."
          throw new Error('Cannot decode name (bad pointer)')
        }
        offset = jumpOffset
        oldOffset = jumpOffset
        consumedBytes += jumped ? 0 : 1
        jumped = true
      } else {
        throw new Error('Cannot decode name (bad label)')
      }
    }

    name.decode.bytes = consumedBytes
    return list.length === 0 ? '.' : list.join('.')
  },
  encodingLength (n) {
    return nameLabels(n).reduce((sum, label) => sum + label.length + 1, 1)
  }
})

const string = codec({
  encode (s, buf, offset) {
    if (!buf) buf = new Uint8Array(string.encodingLength(s))
    if (!offset) offset = 0

    const len = b.write(buf, s, offset + 1)
    buf[offset] = len
    string.encode.bytes = len + 1
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const len = buf[offset]
    const s = toUtf8(buf, offset + 1, offset + 1 + len)
    string.decode.bytes = len + 1
    return s
  },
  encodingLength (s) {
    return b.bytelength(s) + 1
  }
})

const header = codec({
  bytes: 12,
  encode (h, buf, offset) {
    if (!buf) buf = new Uint8Array(header.encodingLength(h))
    if (!offset) offset = 0

    const flags = (h.flags || 0) & 32767
    const type = h.type === 'response' ? RESPONSE_FLAG : QUERY_FLAG

    b.writeUInt16BE(buf, h.id || 0, offset)
    b.writeUInt16BE(buf, flags | type, offset + 2)
    b.writeUInt16BE(buf, h.questions.length, offset + 4)
    b.writeUInt16BE(buf, h.answers.length, offset + 6)
    b.writeUInt16BE(buf, h.authorities.length, offset + 8)
    b.writeUInt16BE(buf, h.additionals.length, offset + 10)

    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    if (buf.length < 12) throw new Error('Header must be 12 bytes')
    const flags = b.readUInt16BE(buf, offset + 2)

    return {
      id: b.readUInt16BE(buf, offset),
      type: flags & RESPONSE_FLAG ? 'response' : 'query',
      flags: flags & 32767,
      flag_qr: ((flags >> 15) & 0x1) === 1,
      opcode: opcodes.toString((flags >> 11) & 0xf),
      flag_aa: ((flags >> 10) & 0x1) === 1,
      flag_tc: ((flags >> 9) & 0x1) === 1,
      flag_rd: ((flags >> 8) & 0x1) === 1,
      flag_ra: ((flags >> 7) & 0x1) === 1,
      flag_z: ((flags >> 6) & 0x1) === 1,
      flag_ad: ((flags >> 5) & 0x1) === 1,
      flag_cd: ((flags >> 4) & 0x1) === 1,
      rcode: rcodes.toString(flags & 0xf),
      questions: new Array(b.readUInt16BE(buf, offset + 4)),
      answers: new Array(b.readUInt16BE(buf, offset + 6)),
      authorities: new Array(b.readUInt16BE(buf, offset + 8)),
      additionals: new Array(b.readUInt16BE(buf, offset + 10))
    }
  },
  encodingLength () {
    return 12
  }
})

const runknown = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(runknown.encodingLength(data))
    if (!offset) offset = 0

    const dLen = data.length
    b.writeUInt16BE(buf, dLen, offset)
    b.copy(data, buf, offset + 2, 0, dLen)

    runknown.encode.bytes = dLen + 2
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const len = b.readUInt16BE(buf, offset)
    const data = buf.slice(offset + 2, offset + 2 + len)
    runknown.decode.bytes = len + 2
    return data
  },
  encodingLength (data) {
    return data.length + 2
  }
})

const rns = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rns.encodingLength(data))
    if (!offset) offset = 0

    name.encode(data, buf, offset + 2)
    b.writeUInt16BE(buf, name.encode.bytes, offset)
    rns.encode.bytes = name.encode.bytes + 2
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const len = b.readUInt16BE(buf, offset)
    const dd = name.decode(buf, offset + 2)

    rns.decode.bytes = len + 2
    return dd
  },
  encodingLength (data) {
    return name.encodingLength(data) + 2
  }
})

const rsoa = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rsoa.encodingLength(data))
    if (!offset) offset = 0

    const oldOffset = offset
    offset += 2
    name.encode(data.mname, buf, offset)
    offset += name.encode.bytes
    name.encode(data.rname, buf, offset)
    offset += name.encode.bytes
    b.writeUInt32BE(buf, data.serial || 0, offset)
    offset += 4
    b.writeUInt32BE(buf, data.refresh || 0, offset)
    offset += 4
    b.writeUInt32BE(buf, data.retry || 0, offset)
    offset += 4
    b.writeUInt32BE(buf, data.expire || 0, offset)
    offset += 4
    b.writeUInt32BE(buf, data.minimum || 0, offset)
    offset += 4

    b.writeUInt16BE(buf, offset - oldOffset - 2, oldOffset)
    rsoa.encode.bytes = offset - oldOffset
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const oldOffset = offset

    const data = {}
    offset += 2
    data.mname = name.decode(buf, offset)
    offset += name.decode.bytes
    data.rname = name.decode(buf, offset)
    offset += name.decode.bytes
    data.serial = b.readUInt32BE(buf, offset)
    offset += 4
    data.refresh = b.readUInt32BE(buf, offset)
    offset += 4
    data.retry = b.readUInt32BE(buf, offset)
    offset += 4
    data.expire = b.readUInt32BE(buf, offset)
    offset += 4
    data.minimum = b.readUInt32BE(buf, offset)
    offset += 4

    rsoa.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    return 22 + name.encodingLength(data.mname) + name.encodingLength(data.rname)
  }
})

const rtxt = codec({
  encode (data, buf, offset) {
    if (!Array.isArray(data)) data = [data]
    for (let i = 0; i < data.length; i++) {
      if (typeof data[i] === 'string') {
        data[i] = b.from(data[i])
      }
      if (!b.isU8Arr(data[i])) {
        throw new Error('Must be a Buffer')
      }
    }

    if (!buf) buf = new Uint8Array(rtxt.encodingLength(data))
    if (!offset) offset = 0

    const oldOffset = offset
    offset += 2

    data.forEach(function (d) {
      buf[offset++] = d.length
      b.copy(d, buf, offset, 0, d.length)
      offset += d.length
    })

    b.writeUInt16BE(buf, offset - oldOffset - 2, oldOffset)
    rtxt.encode.bytes = offset - oldOffset
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    let remaining = b.readUInt16BE(buf, offset)
    offset += 2

    const data = []
    while (remaining > 0) {
      const len = buf[offset++]
      --remaining
      if (remaining < len) {
        throw new Error('Buffer overflow')
      }
      data.push(buf.slice(offset, offset + len))
      offset += len
      remaining -= len
    }

    rtxt.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    if (!Array.isArray(data)) data = [data]
    let length = 2
    data.forEach(function (buf) {
      if (typeof buf === 'string') {
        length += b.bytelength(buf) + 1
      } else {
        length += buf.length + 1
      }
    })
    return length
  }
})

const rnull = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rnull.encodingLength(data))
    if (!offset) offset = 0

    if (typeof data === 'string') data = b.from(data)
    if (!data) data = new Uint8Array(0)

    const oldOffset = offset
    offset += 2

    const len = data.length
    b.copy(data, buf, offset, 0, len)
    offset += len

    b.writeUInt16BE(buf, offset - oldOffset - 2, oldOffset)
    rnull.encode.bytes = offset - oldOffset
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const len = b.readUInt16BE(buf, offset)

    offset += 2

    const data = buf.slice(offset, offset + len)
    offset += len

    rnull.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    if (!data) return 2
    return (b.isU8Arr(data) ? data.length : b.bytelength(data)) + 2
  }
})

const rhinfo = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rhinfo.encodingLength(data))
    if (!offset) offset = 0

    const oldOffset = offset
    offset += 2
    string.encode(data.cpu, buf, offset)
    offset += string.encode.bytes
    string.encode(data.os, buf, offset)
    offset += string.encode.bytes
    b.writeUInt16BE(buf, offset - oldOffset - 2, oldOffset)
    rhinfo.encode.bytes = offset - oldOffset
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const oldOffset = offset

    const data = {}
    offset += 2
    data.cpu = string.decode(buf, offset)
    offset += string.decode.bytes
    data.os = string.decode(buf, offset)
    offset += string.decode.bytes
    rhinfo.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    return string.encodingLength(data.cpu) + string.encodingLength(data.os) + 2
  }
})

const rptr = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rptr.encodingLength(data))
    if (!offset) offset = 0

    name.encode(data, buf, offset + 2)
    b.writeUInt16BE(buf, name.encode.bytes, offset)
    rptr.encode.bytes = name.encode.bytes + 2
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const data = name.decode(buf, offset + 2)
    rptr.decode.bytes = name.decode.bytes + 2
    return data
  },
  encodingLength (data) {
    return name.encodingLength(data) + 2
  }
})

const rsrv = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rsrv.encodingLength(data))
    if (!offset) offset = 0

    b.writeUInt16BE(buf, data.priority || 0, offset + 2)
    b.writeUInt16BE(buf, data.weight || 0, offset + 4)
    b.writeUInt16BE(buf, data.port || 0, offset + 6)
    name.encode(data.target, buf, offset + 8)

    const len = name.encode.bytes + 6
    b.writeUInt16BE(buf, len, offset)

    rsrv.encode.bytes = len + 2
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const len = b.readUInt16BE(buf, offset)

    const data = {}
    data.priority = b.readUInt16BE(buf, offset + 2)
    data.weight = b.readUInt16BE(buf, offset + 4)
    data.port = b.readUInt16BE(buf, offset + 6)
    data.target = name.decode(buf, offset + 8)

    rsrv.decode.bytes = len + 2
    return data
  },
  encodingLength (data) {
    return 8 + name.encodingLength(data.target)
  }
})

const rcaa = codec({
  encode (data, buf, offset) {
    const len = rcaa.encodingLength(data)

    if (!buf) buf = new Uint8Array(rcaa.encodingLength(data))
    if (!offset) offset = 0

    if (data.issuerCritical) {
      data.flags = rcaa.ISSUER_CRITICAL
    }

    b.writeUInt16BE(buf, len - 2, offset)
    offset += 2
    buf[offset] = data.flags || 0
    offset += 1
    string.encode(data.tag, buf, offset)
    offset += string.encode.bytes
    b.write(buf, data.value, offset)
    offset += b.bytelength(data.value)

    rcaa.encode.bytes = len
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const len = b.readUInt16BE(buf, offset)
    offset += 2

    const oldOffset = offset
    const data = {}
    data.flags = buf[offset]
    offset += 1
    data.tag = string.decode(buf, offset)
    offset += string.decode.bytes
    data.value = toUtf8(buf, offset, oldOffset + len)

    data.issuerCritical = !!(data.flags & rcaa.ISSUER_CRITICAL)

    rcaa.decode.bytes = len + 2

    return data
  },
  encodingLength (data) {
    return string.encodingLength(data.tag) + string.encodingLength(data.value) + 2
  }
})

rcaa.ISSUER_CRITICAL = 1 << 7

const rmx = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rmx.encodingLength(data))
    if (!offset) offset = 0

    const oldOffset = offset
    offset += 2
    b.writeUInt16BE(buf, data.preference || 0, offset)
    offset += 2
    name.encode(data.exchange, buf, offset)
    offset += name.encode.bytes

    b.writeUInt16BE(buf, offset - oldOffset - 2, oldOffset)
    rmx.encode.bytes = offset - oldOffset
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const oldOffset = offset

    const data = {}
    offset += 2
    data.preference = b.readUInt16BE(buf, offset)
    offset += 2
    data.exchange = name.decode(buf, offset)
    offset += name.decode.bytes

    rmx.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    return 4 + name.encodingLength(data.exchange)
  }
})

const ra = codec({
  encode (host, buf, offset) {
    if (!buf) buf = new Uint8Array(ra.encodingLength(host))
    if (!offset) offset = 0

    b.writeUInt16BE(buf, 4, offset)
    offset += 2
    ip.v4.encode(host, buf, offset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    offset += 2
    const host = ip.v4.decode(buf, offset)
    return host
  },
  bytes: 6
})

const raaaa = codec({
  encode (host, buf, offset) {
    if (!buf) buf = new Uint8Array(raaaa.encodingLength(host))
    if (!offset) offset = 0

    b.writeUInt16BE(buf, 16, offset)
    offset += 2
    ip.v6.encode(host, buf, offset)
    raaaa.encode.bytes = 18
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    offset += 2
    const host = ip.v6.decode(buf, offset)
    raaaa.decode.bytes = 18
    return host
  },
  bytes: 18
})

const alloc = size => new Uint8Array(size)

// EDNS option fields, by option code. `decode(data)` reads the OPTION-DATA bytes and returns the fields
// to add next to `data`; it throws when the data does not have the expected layout, in which case the
// option keeps only `data`. `encode(option)` builds the OPTION-DATA bytes from those fields.
const u16List = data => {
  if (data.length % 2) throw new Error('odd length')
  const list = []
  for (let i = 0; i < data.length; i += 2) list.push(b.readUInt16BE(data, i))
  return list
}
const fromU16List = list => {
  const out = new Uint8Array(list.length * 2)
  list.forEach((n, i) => b.writeUInt16BE(out, n, i * 2))
  return out
}
const nameField = (data, key) => {
  const value = name.decode(data, 0)
  if (name.decode.bytes !== data.length) throw new Error('trailing data')
  return { [key]: value }
}
const algorithmList = {
  decode: data => ({ algorithms: Array.from(data) }),
  encode: option => Uint8Array.from(option.algorithms || [])
}
const tag = {
  // draft-bellis-dnsop-edns-tags: a 16-bit tag
  decode: data => {
    if (data.length !== 2) throw new Error('bad length')
    return { tag: b.readUInt16BE(data, 0) }
  },
  encode: option => fromU16List([option.tag])
}
const mqtype = {
  // RFC 10029: a list of 16-bit QTYPEs
  decode: data => ({ qtypes: u16List(data).map(t => types.toString(t)) }),
  encode: option => fromU16List((option.qtypes || []).map(t => typeof t === 'number' ? t : types.toType(t)))
}

const OPTION_FIELDS = {
  5: algorithmList, // DAU (RFC 6975)
  6: algorithmList, // DHU
  7: algorithmList, // N3U
  8: { // CLIENT_SUBNET (RFC 7871)
    decode: data => {
      if (data.length < 4) throw new Error('too short')
      const family = b.readUInt16BE(data, 0)
      const padded = new Uint8Array(family === 1 ? 4 : 16)
      padded.set(data.subarray(4, 4 + padded.length))
      return { family, sourcePrefixLength: data[2], scopePrefixLength: data[3], ip: ip.decode(padded) }
    },
    // note: do IP math before calling
    encode: option => {
      const spl = option.sourcePrefixLength || 0
      const ipBuf = ip.encode(option.ip, alloc)
      const ipLen = Math.ceil(spl / 8)
      const out = new Uint8Array(4 + ipLen)
      b.writeUInt16BE(out, option.family || ip.familyOf(option.ip, alloc), 0)
      out[2] = spl
      out[3] = option.scopePrefixLength || 0
      out.set(ipBuf.subarray(0, ipLen), 4)
      return out
    }
  },
  9: { // EXPIRE (RFC 7314); empty in queries
    decode: data => {
      if (data.length === 0) return {}
      if (data.length !== 4) throw new Error('bad length')
      return { expire: b.readUInt32BE(data, 0) }
    },
    encode: option => {
      if (typeof option.expire !== 'number') return new Uint8Array(0)
      const out = new Uint8Array(4)
      b.writeUInt32BE(out, option.expire, 0)
      return out
    }
  },
  10: { // COOKIE (RFC 7873): 8-byte client cookie, then an 8 to 32-byte server cookie
    decode: data => {
      if (data.length < 8) throw new Error('too short')
      const fields = { clientCookie: data.slice(0, 8) }
      if (data.length > 8) fields.serverCookie = data.slice(8)
      return fields
    },
    encode: option => {
      const server = option.serverCookie || new Uint8Array(0)
      const out = new Uint8Array(8 + server.length)
      out.set(option.clientCookie)
      out.set(server, 8)
      return out
    }
  },
  11: { // TCP_KEEPALIVE (RFC 7828), in units of 100 ms; empty in queries
    decode: data => {
      if (data.length === 0) return {}
      if (data.length !== 2) throw new Error('bad length')
      return { timeout: b.readUInt16BE(data, 0) }
    },
    encode: option => typeof option.timeout === 'number' && option.timeout ? fromU16List([option.timeout]) : new Uint8Array(0)
  },
  12: { // PADDING (RFC 7830)
    decode: data => ({ length: data.length }),
    encode: option => new Uint8Array(option.length || 0)
  },
  13: { // CHAIN (RFC 7901)
    decode: data => nameField(data, 'closestTrustPoint'),
    encode: option => name.encode(option.closestTrustPoint)
  },
  14: { // KEY_TAG (RFC 8145)
    decode: data => ({ tags: u16List(data) }),
    encode: option => fromU16List(option.tags)
  },
  15: { // EDE (RFC 8914): INFO-CODE, then optional UTF-8 EXTRA-TEXT
    decode: data => {
      if (data.length < 2) throw new Error('too short')
      return { infoCode: b.readUInt16BE(data, 0), extraText: new TextDecoder().decode(data.subarray(2)) }
    },
    encode: option => {
      const text = b.from(option.extraText || '')
      const out = new Uint8Array(2 + text.length)
      b.writeUInt16BE(out, option.infoCode || 0, 0)
      out.set(text, 2)
      return out
    }
  },
  16: tag, // CLIENT_TAG
  17: tag, // SERVER_TAG
  18: { // REPORT_CHANNEL (RFC 9567)
    decode: data => nameField(data, 'agentDomain'),
    encode: option => name.encode(option.agentDomain)
  },
  19: { // ZONEVERSION (RFC 9660); empty in queries
    decode: data => {
      if (data.length === 0) return {}
      if (data.length < 2) throw new Error('too short')
      const fields = { labelCount: data[0], versionType: data[1], version: data.slice(2) }
      // type 0: SOA serial
      if (fields.versionType === 0 && fields.version.length === 4) fields.serial = b.readUInt32BE(data, 2)
      return fields
    },
    encode: option => {
      if (option.versionType === undefined) return new Uint8Array(0)
      let version = option.version
      if (!version && typeof option.serial === 'number') {
        version = new Uint8Array(4)
        b.writeUInt32BE(version, option.serial, 0)
      }
      version = version || new Uint8Array(0)
      const out = new Uint8Array(2 + version.length)
      out[0] = option.labelCount || 0
      out[1] = option.versionType
      out.set(version, 2)
      return out
    }
  },
  20: mqtype, // MQTYPE_QUERY
  21: mqtype // MQTYPE_RESPONSE
}

function optionData (option, code) {
  if (option.data) return option.data
  const fields = OPTION_FIELDS[code]
  // Options carried only as bytes (NSID, ...) are empty without `data`, e.g. an NSID request
  if (!fields) return new Uint8Array(0)
  return fields.encode(option)
}

const roption = codec({
  encode (option, buf, offset) {
    if (!buf) buf = new Uint8Array(roption.encodingLength(option))
    if (!offset) offset = 0

    const code = optioncodes.toCode(option.code)
    const data = optionData(option, code)
    b.writeUInt16BE(buf, code, offset)
    b.writeUInt16BE(buf, data.length, offset + 2)
    b.copy(data, buf, offset + 4, 0, data.length)

    roption.encode.bytes = data.length + 4
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const option = {}
    option.code = b.readUInt16BE(buf, offset)
    option.type = optioncodes.toString(option.code)
    const len = b.readUInt16BE(buf, offset + 2)
    option.data = buf.slice(offset + 4, offset + 4 + len)

    const fields = OPTION_FIELDS[option.code]
    if (fields) {
      try {
        Object.assign(option, fields.decode(option.data))
      } catch (err) {
        // Malformed OPTION-DATA: keep only `data`
      }
    }

    roption.decode.bytes = len + 4
    return option
  },
  encodingLength (option) {
    return 4 + optionData(option, optioncodes.toCode(option.code)).length
  }
})

const ropt = codec({
  encode (options, buf, offset) {
    if (!buf) buf = new Uint8Array(ropt.encodingLength(options))
    if (!offset) offset = 0
    const oldOffset = offset

    const rdlen = encodingLengthList(options, roption)
    b.writeUInt16BE(buf, rdlen, offset)
    offset = encodeList(options, roption, buf, offset + 2)

    ropt.encode.bytes = offset - oldOffset
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset

    const options = []
    let rdlen = b.readUInt16BE(buf, offset)
    offset += 2
    let o = 0
    while (rdlen > 0) {
      options[o++] = roption.decode(buf, offset)
      offset += roption.decode.bytes
      rdlen -= roption.decode.bytes
    }
    ropt.decode.bytes = offset - oldOffset
    return options
  },
  encodingLength (options) {
    return 2 + encodingLengthList(options || [], roption)
  }
})

const rdnskey = codec({
  encode (key, buf, offset) {
    if (!buf) buf = new Uint8Array(rdnskey.encodingLength(key))
    if (!offset) offset = 0
    const oldOffset = offset

    const keydata = key.key
    if (!b.isU8Arr(keydata)) {
      throw new Error('Key must be a Buffer')
    }

    offset += 2 // Leave space for length
    b.writeUInt16BE(buf, key.flags, offset)
    offset += 2
    buf[offset] = rdnskey.PROTOCOL_DNSSEC
    offset += 1
    buf[offset] = key.algorithm
    offset += 1
    b.copy(keydata, buf, offset, 0, keydata.length)
    offset += keydata.length

    rdnskey.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rdnskey.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset

    const key = {}
    const length = b.readUInt16BE(buf, offset)
    offset += 2
    key.flags = b.readUInt16BE(buf, offset)
    offset += 2
    if (buf[offset] !== rdnskey.PROTOCOL_DNSSEC) {
      throw new Error('Protocol must be 3')
    }
    offset += 1
    key.algorithm = buf[offset]
    offset += 1
    key.key = buf.slice(offset, oldOffset + length + 2)
    offset += key.key.length
    rdnskey.decode.bytes = offset - oldOffset
    return key
  },
  encodingLength (key) {
    return 6 + b.bytelength(key.key)
  }
})

rdnskey.PROTOCOL_DNSSEC = 3
rdnskey.ZONE_KEY = 0x80
rdnskey.SECURE_ENTRYPOINT = 0x8000

// Key tag of a DNSKEY / CDNSKEY / KEY / RKEY (RFC 4034, appendix B), as used by DS and RRSIG.
// `protocol` defaults to 3, as DNSKEY data does not carry it.
export function keyTag (key) {
  const rdata = new Uint8Array(4 + key.key.length)
  b.writeUInt16BE(rdata, key.flags, 0)
  rdata[2] = key.protocol === undefined ? rdnskey.PROTOCOL_DNSSEC : key.protocol
  rdata[3] = key.algorithm
  rdata.set(key.key, 4)

  if (key.algorithm === 1) {
    // RSA/MD5 (appendix B.1): the 16 bits above the least significant 8 bits of the modulus
    return rdata.length < 7 ? 0 : (rdata[rdata.length - 3] << 8) | rdata[rdata.length - 2]
  }
  let ac = 0
  for (let i = 0; i < rdata.length; i++) {
    ac += (i & 1) ? rdata[i] : rdata[i] << 8
  }
  ac += (ac >> 16) & 0xffff
  return ac & 0xffff
}
rdnskey.keyTag = keyTag

const rrrsig = codec({
  encode (sig, buf, offset) {
    if (!buf) buf = new Uint8Array(rrrsig.encodingLength(sig))
    if (!offset) offset = 0
    const oldOffset = offset

    const signature = sig.signature
    if (!b.isU8Arr(signature)) {
      throw new Error('Signature must be a Buffer')
    }

    offset += 2 // Leave space for length
    b.writeUInt16BE(buf, types.toType(sig.typeCovered), offset)
    offset += 2
    buf[offset] = sig.algorithm
    offset += 1
    buf[offset] = sig.labels
    offset += 1
    b.writeUInt32BE(buf, sig.originalTTL, offset)
    offset += 4
    b.writeUInt32BE(buf, sig.expiration, offset)
    offset += 4
    b.writeUInt32BE(buf, sig.inception, offset)
    offset += 4
    b.writeUInt16BE(buf, sig.keyTag, offset)
    offset += 2
    name.encode(sig.signersName, buf, offset)
    offset += name.encode.bytes
    b.copy(signature, buf, offset, 0, signature.length)
    offset += signature.length

    rrrsig.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rrrsig.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset

    const sig = {}
    const length = b.readUInt16BE(buf, offset)
    offset += 2
    sig.typeCovered = types.toString(b.readUInt16BE(buf, offset))
    offset += 2
    sig.algorithm = buf[offset]
    offset += 1
    sig.labels = buf[offset]
    offset += 1
    sig.originalTTL = b.readUInt32BE(buf, offset)
    offset += 4
    sig.expiration = b.readUInt32BE(buf, offset)
    offset += 4
    sig.inception = b.readUInt32BE(buf, offset)
    offset += 4
    sig.keyTag = b.readUInt16BE(buf, offset)
    offset += 2
    sig.signersName = name.decode(buf, offset)
    offset += name.decode.bytes
    sig.signature = buf.slice(offset, oldOffset + length + 2)
    offset += sig.signature.length
    rrrsig.decode.bytes = offset - oldOffset
    return sig
  },
  encodingLength (sig) {
    return 20 +
      name.encodingLength(sig.signersName) +
      b.bytelength(sig.signature)
  }
})
const rrp = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rrp.encodingLength(data))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2 // Leave space for length
    name.encode(data.mbox || '.', buf, offset)
    offset += name.encode.bytes
    name.encode(data.txt || '.', buf, offset)
    offset += name.encode.bytes
    rrp.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rrp.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset

    const data = {}
    offset += 2
    data.mbox = name.decode(buf, offset) || '.'
    offset += name.decode.bytes
    data.txt = name.decode(buf, offset) || '.'
    offset += name.decode.bytes
    rrp.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    return 2 + name.encodingLength(data.mbox || '.') + name.encodingLength(data.txt || '.')
  }
})

const typebitmap = codec({
  encode (typelist, buf, offset) {
    if (!buf) buf = new Uint8Array(typebitmap.encodingLength(typelist))
    if (!offset) offset = 0
    const oldOffset = offset

    const typesByWindow = []
    for (let i = 0; i < typelist.length; i++) {
      const typeid = types.toType(typelist[i])
      if (typesByWindow[typeid >> 8] === undefined) {
        typesByWindow[typeid >> 8] = []
      }
      typesByWindow[typeid >> 8][(typeid >> 3) & 0x1F] |= 1 << (7 - (typeid & 0x7))
    }

    for (let i = 0; i < typesByWindow.length; i++) {
      if (typesByWindow[i] !== undefined) {
        const windowBuf = b.from(typesByWindow[i])
        buf[offset] = i
        offset += 1
        buf[offset] = windowBuf.length
        offset += 1
        b.copy(windowBuf, buf, offset, 0, windowBuf.length)
        offset += windowBuf.length
      }
    }

    typebitmap.encode.bytes = offset - oldOffset
    return buf
  },
  decode (buf, offset, length) {
    if (!offset) offset = 0
    const oldOffset = offset

    const typelist = []
    while (offset - oldOffset < length) {
      const window = buf[offset]
      offset += 1
      const windowLength = buf[offset]
      offset += 1
      for (let i = 0; i < windowLength; i++) {
        const b = buf[offset + i]
        for (let j = 0; j < 8; j++) {
          if (b & (1 << (7 - j))) {
            const typeid = types.toString((window << 8) | (i << 3) | j)
            typelist.push(typeid)
          }
        }
      }
      offset += windowLength
    }

    typebitmap.decode.bytes = offset - oldOffset
    return typelist
  },
  encodingLength (typelist) {
    const extents = []
    for (let i = 0; i < typelist.length; i++) {
      const typeid = types.toType(typelist[i])
      extents[typeid >> 8] = Math.max(extents[typeid >> 8] || 0, typeid & 0xFF)
    }

    let len = 0
    for (let i = 0; i < extents.length; i++) {
      if (extents[i] !== undefined) {
        len += 2 + Math.ceil((extents[i] + 1) / 8)
      }
    }

    return len
  }
})

const rnsec = codec({
  encode (record, buf, offset) {
    if (!buf) buf = new Uint8Array(rnsec.encodingLength(record))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2 // Leave space for length
    name.encode(record.nextDomain, buf, offset)
    offset += name.encode.bytes
    typebitmap.encode(record.rrtypes, buf, offset)
    offset += typebitmap.encode.bytes

    rnsec.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rnsec.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset

    const record = {}
    const length = b.readUInt16BE(buf, offset)
    offset += 2
    record.nextDomain = name.decode(buf, offset)
    offset += name.decode.bytes
    record.rrtypes = typebitmap.decode(buf, offset, length - (offset - oldOffset))
    offset += typebitmap.decode.bytes

    rnsec.decode.bytes = offset - oldOffset
    return record
  },
  encodingLength (record) {
    return 2 +
      name.encodingLength(record.nextDomain) +
      typebitmap.encodingLength(record.rrtypes)
  }
})

const rnsec3 = codec({
  encode (record, buf, offset) {
    if (!buf) buf = new Uint8Array(rnsec3.encodingLength(record))
    if (!offset) offset = 0
    const oldOffset = offset

    const salt = record.salt
    if (!b.isU8Arr(salt)) {
      throw new Error('salt must be a Buffer')
    }

    const nextDomain = record.nextDomain
    if (!b.isU8Arr(nextDomain)) {
      throw new Error('nextDomain must be a Buffer')
    }

    offset += 2 // Leave space for length
    buf[offset] = record.algorithm
    offset += 1
    buf[offset] = record.flags
    offset += 1
    b.writeUInt16BE(buf, record.iterations, offset)
    offset += 2
    buf[offset] = salt.length
    offset += 1
    b.copy(salt, buf, offset, 0, salt.length)
    offset += salt.length
    buf[offset] = nextDomain.length
    offset += 1
    b.copy(nextDomain, buf, offset, 0, nextDomain.length)
    offset += nextDomain.length
    typebitmap.encode(record.rrtypes, buf, offset)
    offset += typebitmap.encode.bytes

    rnsec3.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rnsec3.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset

    const record = {}
    const length = b.readUInt16BE(buf, offset)
    offset += 2
    record.algorithm = buf[offset]
    offset += 1
    record.flags = buf[offset]
    offset += 1
    record.iterations = b.readUInt16BE(buf, offset)
    offset += 2
    const saltLength = buf[offset]
    offset += 1
    record.salt = buf.slice(offset, offset + saltLength)
    offset += saltLength
    const hashLength = buf[offset]
    offset += 1
    record.nextDomain = buf.slice(offset, offset + hashLength)
    offset += hashLength
    record.rrtypes = typebitmap.decode(buf, offset, length - (offset - oldOffset))
    offset += typebitmap.decode.bytes

    rnsec3.decode.bytes = offset - oldOffset
    return record
  },
  encodingLength (record) {
    return 8 +
      record.salt.length +
      record.nextDomain.length +
      typebitmap.encodingLength(record.rrtypes)
  }
})

const rds = codec({
  encode (digest, buf, offset) {
    if (!buf) buf = new Uint8Array(rds.encodingLength(digest))
    if (!offset) offset = 0
    const oldOffset = offset

    const digestdata = digest.digest
    if (!b.isU8Arr(digestdata)) {
      throw new Error('Digest must be a Buffer')
    }

    offset += 2 // Leave space for length
    b.writeUInt16BE(buf, digest.keyTag, offset)
    offset += 2
    buf[offset] = digest.algorithm
    offset += 1
    buf[offset] = digest.digestType
    offset += 1
    b.copy(digestdata, buf, offset, 0, digestdata.length)
    offset += digestdata.length

    rds.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rds.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset

    const digest = {}
    const length = b.readUInt16BE(buf, offset)
    offset += 2
    digest.keyTag = b.readUInt16BE(buf, offset)
    offset += 2
    digest.algorithm = buf[offset]
    offset += 1
    digest.digestType = buf[offset]
    offset += 1
    digest.digest = buf.slice(offset, oldOffset + length + 2)
    offset += digest.digest.length
    rds.decode.bytes = offset - oldOffset
    return digest
  },
  encodingLength (digest) {
    return 6 + b.bytelength(digest.digest)
  }
})

const rsshfp = codec({
  encode (record, buf, offset) {
    if (!buf) buf = new Uint8Array(rsshfp.encodingLength(record))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2 // The function call starts with the offset pointer at the RDLENGTH field, not the RDATA one
    buf[offset] = record.algorithm
    offset += 1
    buf[offset] = record.hash
    offset += 1

    const fingerprintLength = b.hexLength(record.fingerprint)
    const expectedLength = getFingerprintLengthForHashType(record.hash)
    if (expectedLength !== undefined && fingerprintLength !== expectedLength) {
      throw new Error(`Invalid length of fingerprint "${record.fingerprint}" for hashType=${record.hash}: ${fingerprintLength} != ${expectedLength}`)
    }
    b.writeHex(buf, record.fingerprint, offset, offset += fingerprintLength)
    rsshfp.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rsshfp.encode.bytes - 2, oldOffset)

    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset

    const record = {}
    const length = b.readUInt16BE(buf, offset)
    offset += 2 // Account for the RDLENGTH field
    record.algorithm = buf[offset]
    offset += 1
    record.hash = buf[offset]
    offset += 1

    // The fingerprint fills the rest of RDATA whatever the hash type (RFC 4255, 3.1)
    const end = oldOffset + 2 + length
    record.fingerprint = b.toHex(buf, offset, end)
    offset = end
    rsshfp.decode.bytes = offset - oldOffset
    return record
  },
  encodingLength (record) {
    return 4 + b.hexLength(record.fingerprint)
  }
})
function getFingerprintLengthForHashType (hashType) {
  if (hashType === 1) return 20
  if (hashType === 2) return 32
  // Other hash types are unassigned: their length is unknown, so it is not checked
}
rsshfp.getFingerprintLengthForHashType = getFingerprintLengthForHashType

// Reads the RDLENGTH at `offset` and returns the offset just past the RDATA,
// throwing when the RDATA would run past the end of the buffer.
function rdataEnd (buf, offset) {
  const end = offset + 2 + b.readUInt16BE(buf, offset)
  if (end > buf.length) throw new Error('RDATA overflows the buffer')
  return end
}

function expectEnd (offset, end, what) {
  if (offset !== end) throw new Error(`${what}: RDATA length mismatch (${offset} != ${end})`)
}

const rnaptr = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rnaptr.encodingLength(data))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2
    b.writeUInt16BE(buf, data.order || 0, offset)
    offset += 2
    b.writeUInt16BE(buf, data.preference || 0, offset)
    offset += 2
    string.encode(data.flags, buf, offset)
    offset += string.encode.bytes
    string.encode(data.services, buf, offset)
    offset += string.encode.bytes
    string.encode(data.regexp, buf, offset)
    offset += string.encode.bytes
    name.encode(data.replacement, buf, offset)
    offset += name.encode.bytes

    rnaptr.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rnaptr.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)

    const data = {}
    offset += 2
    data.order = b.readUInt16BE(buf, offset)
    offset += 2
    data.preference = b.readUInt16BE(buf, offset)
    offset += 2
    data.flags = string.decode(buf, offset)
    offset += string.decode.bytes
    data.services = string.decode(buf, offset)
    offset += string.decode.bytes
    data.regexp = string.decode(buf, offset)
    offset += string.decode.bytes
    data.replacement = name.decode(buf, offset)
    offset += name.decode.bytes
    expectEnd(offset, end, 'NAPTR')

    rnaptr.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    return 6 +
      string.encodingLength(data.flags) +
      string.encodingLength(data.services) +
      string.encodingLength(data.regexp) +
      name.encodingLength(data.replacement)
  }
})

// TLSA (RFC 6698) and SMIMEA (RFC 8162) share the same RDATA format
const rtlsa = codec({
  encode (cert, buf, offset) {
    if (!buf) buf = new Uint8Array(rtlsa.encodingLength(cert))
    if (!offset) offset = 0
    const oldOffset = offset

    const certdata = cert.certificate
    if (!b.isU8Arr(certdata)) {
      throw new Error('Certificate must be a Buffer')
    }

    offset += 2
    buf[offset++] = cert.usage
    buf[offset++] = cert.selector
    buf[offset++] = cert.matchingType
    b.copy(certdata, buf, offset, 0, certdata.length)
    offset += certdata.length

    rtlsa.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rtlsa.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)
    if (end - offset < 5) throw new Error('TLSA: RDATA too short')

    offset += 2
    const cert = {}
    cert.usage = buf[offset++]
    cert.selector = buf[offset++]
    cert.matchingType = buf[offset++]
    cert.certificate = buf.slice(offset, end)

    rtlsa.decode.bytes = end - oldOffset
    return cert
  },
  encodingLength (cert) {
    return 5 + b.bytelength(cert.certificate)
  }
})

// URI (RFC 7553): the target is the rest of RDATA, not a <character-string>
const ruri = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(ruri.encodingLength(data))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2
    b.writeUInt16BE(buf, data.priority || 0, offset)
    offset += 2
    b.writeUInt16BE(buf, data.weight || 0, offset)
    offset += 2
    offset += b.write(buf, data.target, offset)

    ruri.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, ruri.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)
    if (end - offset < 6) throw new Error('URI: RDATA too short')

    offset += 2
    const data = {}
    data.priority = b.readUInt16BE(buf, offset)
    offset += 2
    data.weight = b.readUInt16BE(buf, offset)
    offset += 2
    data.target = toUtf8(buf, offset, end)

    ruri.decode.bytes = end - oldOffset
    return data
  },
  encodingLength (data) {
    return 6 + b.bytelength(data.target)
  }
})

// OPENPGPKEY (RFC 7929): the whole RDATA is the transferable public key
const ropenpgpkey = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(ropenpgpkey.encodingLength(data))
    if (!offset) offset = 0

    if (!b.isU8Arr(data.key)) {
      throw new Error('Key must be a Buffer')
    }
    b.writeUInt16BE(buf, data.key.length, offset)
    b.copy(data.key, buf, offset + 2, 0, data.key.length)

    ropenpgpkey.encode.bytes = data.key.length + 2
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const end = rdataEnd(buf, offset)

    const data = { key: buf.slice(offset + 2, end) }
    ropenpgpkey.decode.bytes = end - offset
    return data
  },
  encodingLength (data) {
    return 2 + data.key.length
  }
})

const rnsec3param = codec({
  encode (record, buf, offset) {
    if (!buf) buf = new Uint8Array(rnsec3param.encodingLength(record))
    if (!offset) offset = 0
    const oldOffset = offset

    const salt = record.salt
    if (!b.isU8Arr(salt)) {
      throw new Error('salt must be a Buffer')
    }

    offset += 2
    buf[offset++] = record.algorithm
    buf[offset++] = record.flags
    b.writeUInt16BE(buf, record.iterations, offset)
    offset += 2
    buf[offset++] = salt.length
    b.copy(salt, buf, offset, 0, salt.length)
    offset += salt.length

    rnsec3param.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rnsec3param.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)
    if (end - offset < 7) throw new Error('NSEC3PARAM: RDATA too short')

    offset += 2
    const record = {}
    record.algorithm = buf[offset++]
    record.flags = buf[offset++]
    record.iterations = b.readUInt16BE(buf, offset)
    offset += 2
    const saltLength = buf[offset++]
    record.salt = buf.slice(offset, offset + saltLength)
    offset += saltLength
    expectEnd(offset, end, 'NSEC3PARAM')

    rnsec3param.decode.bytes = offset - oldOffset
    return record
  },
  encodingLength (record) {
    return 7 + record.salt.length
  }
})

// ZONEMD (RFC 8976)
const rzonemd = codec({
  encode (record, buf, offset) {
    if (!buf) buf = new Uint8Array(rzonemd.encodingLength(record))
    if (!offset) offset = 0
    const oldOffset = offset

    const digest = record.digest
    if (!b.isU8Arr(digest)) {
      throw new Error('Digest must be a Buffer')
    }

    offset += 2
    b.writeUInt32BE(buf, record.serial, offset)
    offset += 4
    buf[offset++] = record.scheme
    buf[offset++] = record.algorithm
    b.copy(digest, buf, offset, 0, digest.length)
    offset += digest.length

    rzonemd.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rzonemd.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)
    if (end - offset < 8) throw new Error('ZONEMD: RDATA too short')

    offset += 2
    const record = {}
    record.serial = b.readUInt32BE(buf, offset)
    offset += 4
    record.scheme = buf[offset++]
    record.algorithm = buf[offset++]
    record.digest = buf.slice(offset, end)

    rzonemd.decode.bytes = end - oldOffset
    return record
  },
  encodingLength (record) {
    return 8 + record.digest.length
  }
})

// CSYNC (RFC 7477)
const rcsync = codec({
  encode (record, buf, offset) {
    if (!buf) buf = new Uint8Array(rcsync.encodingLength(record))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2
    b.writeUInt32BE(buf, record.serial, offset)
    offset += 4
    b.writeUInt16BE(buf, record.flags || 0, offset)
    offset += 2
    typebitmap.encode(record.rrtypes, buf, offset)
    offset += typebitmap.encode.bytes

    rcsync.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rcsync.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)
    if (end - offset < 8) throw new Error('CSYNC: RDATA too short')

    offset += 2
    const record = {}
    record.serial = b.readUInt32BE(buf, offset)
    offset += 4
    record.flags = b.readUInt16BE(buf, offset)
    offset += 2
    record.rrtypes = typebitmap.decode(buf, offset, end - offset)
    offset += typebitmap.decode.bytes
    expectEnd(offset, end, 'CSYNC')

    rcsync.decode.bytes = offset - oldOffset
    return record
  },
  encodingLength (record) {
    return 8 + typebitmap.encodingLength(record.rrtypes)
  }
})

// LOC (RFC 1876). Values are kept as on the wire:
//   size / horizontalPrecision / verticalPrecision : one byte, mantissa (high nibble) and power of ten (low nibble), in cm
//   latitude / longitude : thousandths of an arc second, offset by 2^31 (2^31 is the equator / prime meridian)
//   altitude : cm, offset by 100000 m (10000000 is sea level)
const rloc = codec({
  encode (record, buf, offset) {
    if (!buf) buf = new Uint8Array(rloc.encodingLength(record))
    if (!offset) offset = 0

    b.writeUInt16BE(buf, 16, offset)
    offset += 2
    buf[offset++] = record.version || 0
    buf[offset++] = record.size
    buf[offset++] = record.horizontalPrecision
    buf[offset++] = record.verticalPrecision
    b.writeUInt32BE(buf, record.latitude, offset)
    b.writeUInt32BE(buf, record.longitude, offset + 4)
    b.writeUInt32BE(buf, record.altitude, offset + 8)

    rloc.encode.bytes = 18
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const end = rdataEnd(buf, offset)
    offset += 2
    const version = buf[offset]
    if (version !== 0) throw new Error(`LOC: unsupported version ${version}`)
    expectEnd(offset + 16, end, 'LOC')

    const record = {
      version,
      size: buf[offset + 1],
      horizontalPrecision: buf[offset + 2],
      verticalPrecision: buf[offset + 3],
      latitude: b.readUInt32BE(buf, offset + 4),
      longitude: b.readUInt32BE(buf, offset + 8),
      altitude: b.readUInt32BE(buf, offset + 12)
    }
    rloc.decode.bytes = 18
    return record
  },
  bytes: 18
})

// SVCB / HTTPS (RFC 9460). `params` is an object keyed by SvcParamKey name, in wire order:
//   mandatory: ['alpn', ...]  alpn: ['h2', ...]  'no-default-alpn': true  port: 443
//   ipv4hint: ['192.0.2.1', ...]  ech: Uint8Array  ipv6hint: ['2001:db8::1', ...]
//   dohpath: '/dns-query{?dns}' (RFC 9461)  ohttp: true (RFC 9540)
// Keys without a known format are named keyNNNNN and hold the raw value as a Uint8Array.
const SVC_PARAM_KEYS = ['mandatory', 'alpn', 'no-default-alpn', 'port', 'ipv4hint', 'ech', 'ipv6hint', 'dohpath', 'ohttp']

function svcParamKeyToString (key) {
  return SVC_PARAM_KEYS[key] || `key${key}`
}

function svcParamKeyToNumber (key) {
  const known = SVC_PARAM_KEYS.indexOf(key)
  if (known !== -1) return known
  const generic = /^key(\d+)$/.exec(key)
  if (generic) return parseInt(generic[1], 10)
  throw new Error(`Unknown SvcParamKey "${key}"`)
}

function svcParamValueEncode (key, value) {
  switch (key) {
    case 'mandatory': {
      const out = new Uint8Array(value.length * 2)
      value.forEach((k, i) => b.writeUInt16BE(out, svcParamKeyToNumber(k), i * 2))
      return out
    }
    case 'alpn': {
      const ids = value.map(id => b.from(id))
      const out = new Uint8Array(ids.reduce((sum, id) => sum + id.length + 1, 0))
      let offset = 0
      for (const id of ids) {
        out[offset++] = id.length
        out.set(id, offset)
        offset += id.length
      }
      return out
    }
    case 'no-default-alpn':
    case 'ohttp':
      return new Uint8Array(0)
    case 'port': {
      const out = new Uint8Array(2)
      b.writeUInt16BE(out, value, 0)
      return out
    }
    case 'ipv4hint': {
      const out = new Uint8Array(value.length * 4)
      value.forEach((host, i) => ip.v4.encode(host, out, i * 4))
      return out
    }
    case 'ipv6hint': {
      const out = new Uint8Array(value.length * 16)
      value.forEach((host, i) => ip.v6.encode(host, out, i * 16))
      return out
    }
    case 'dohpath':
      return b.from(value)
  }
  if (!b.isU8Arr(value)) throw new Error(`SvcParam ${key} must be a Buffer`)
  return value
}

function svcParamValueDecode (key, buf, start, end) {
  const len = end - start
  switch (key) {
    case 'mandatory': {
      if (len === 0 || len % 2) throw new Error('SVCB: invalid mandatory length')
      const keys = []
      for (let o = start; o < end; o += 2) keys.push(svcParamKeyToString(b.readUInt16BE(buf, o)))
      return keys
    }
    case 'alpn': {
      if (len === 0) throw new Error('SVCB: empty alpn')
      const ids = []
      for (let o = start; o < end;) {
        const idLen = buf[o++]
        if (idLen === 0 || o + idLen > end) throw new Error('SVCB: invalid alpn-id')
        ids.push(toUtf8(buf, o, o + idLen))
        o += idLen
      }
      return ids
    }
    case 'no-default-alpn':
    case 'ohttp':
      if (len !== 0) throw new Error(`SVCB: ${key} must be empty`)
      return true
    case 'port':
      if (len !== 2) throw new Error('SVCB: invalid port length')
      return b.readUInt16BE(buf, start)
    case 'ipv4hint': {
      if (len === 0 || len % 4) throw new Error('SVCB: invalid ipv4hint length')
      const hosts = []
      for (let o = start; o < end; o += 4) hosts.push(ip.v4.decode(buf, o))
      return hosts
    }
    case 'ipv6hint': {
      if (len === 0 || len % 16) throw new Error('SVCB: invalid ipv6hint length')
      const hosts = []
      for (let o = start; o < end; o += 16) hosts.push(ip.v6.decode(buf, o))
      return hosts
    }
    case 'dohpath':
      return toUtf8(buf, start, end)
  }
  return buf.slice(start, end)
}

function svcParamsToWire (params) {
  return Object.keys(params || {})
    .map(key => ({ key: svcParamKeyToNumber(key), value: svcParamValueEncode(key, params[key]) }))
    .sort((x, y) => x.key - y.key)
}

const rsvcb = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rsvcb.encodingLength(data))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2
    b.writeUInt16BE(buf, data.priority || 0, offset)
    offset += 2
    name.encode(data.targetName, buf, offset)
    offset += name.encode.bytes
    for (const { key, value } of svcParamsToWire(data.params)) {
      b.writeUInt16BE(buf, key, offset)
      b.writeUInt16BE(buf, value.length, offset + 2)
      buf.set(value, offset + 4)
      offset += 4 + value.length
    }

    rsvcb.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rsvcb.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)

    offset += 2
    const data = {}
    data.priority = b.readUInt16BE(buf, offset)
    offset += 2
    data.targetName = name.decode(buf, offset)
    offset += name.decode.bytes
    data.params = {}

    let lastKey = -1
    while (offset < end) {
      if (offset + 4 > end) throw new Error('SVCB: truncated SvcParam')
      const keyNum = b.readUInt16BE(buf, offset)
      const len = b.readUInt16BE(buf, offset + 2)
      offset += 4
      if (keyNum <= lastKey) throw new Error('SVCB: SvcParamKeys must be in strictly increasing order')
      if (offset + len > end) throw new Error('SVCB: SvcParamValue overflows RDATA')
      lastKey = keyNum
      const key = svcParamKeyToString(keyNum)
      data.params[key] = svcParamValueDecode(key, buf, offset, offset + len)
      offset += len
    }
    expectEnd(offset, end, 'SVCB')

    rsvcb.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    return 4 + name.encodingLength(data.targetName) +
      svcParamsToWire(data.params).reduce((sum, { value }) => sum + 4 + value.length, 0)
  }
})

// Field kinds for records with a fixed sequence of fields (see fieldsCodec)
const FIELD_KINDS = {
  u8: {
    length: () => 1,
    encode: (v, buf, o) => { buf[o] = v || 0; return 1 },
    decode: (buf, o) => [buf[o], 1]
  },
  u16: {
    length: () => 2,
    encode: (v, buf, o) => { b.writeUInt16BE(buf, v || 0, o); return 2 },
    decode: (buf, o) => [b.readUInt16BE(buf, o), 2]
  },
  u32: {
    length: () => 4,
    encode: (v, buf, o) => { b.writeUInt32BE(buf, v || 0, o); return 4 },
    decode: (buf, o) => [b.readUInt32BE(buf, o), 4]
  },
  u48: {
    length: () => 6,
    encode: (v, buf, o) => {
      b.writeUInt16BE(buf, Math.floor((v || 0) / 0x100000000), o)
      b.writeUInt32BE(buf, (v || 0) % 0x100000000, o + 2)
      return 6
    },
    decode: (buf, o) => [b.readUInt16BE(buf, o) * 0x100000000 + b.readUInt32BE(buf, o + 2), 6]
  },
  type: {
    length: () => 2,
    encode: (v, buf, o) => { b.writeUInt16BE(buf, types.toType(v), o); return 2 },
    decode: (buf, o) => [types.toString(b.readUInt16BE(buf, o)), 2]
  },
  name: {
    length: v => name.encodingLength(v),
    encode: (v, buf, o) => { name.encode(v, buf, o); return name.encode.bytes },
    decode: (buf, o) => [name.decode(buf, o), name.decode.bytes]
  },
  string: {
    length: v => string.encodingLength(v),
    encode: (v, buf, o) => { string.encode(v, buf, o); return string.encode.bytes },
    decode: (buf, o) => [string.decode(buf, o), string.decode.bytes]
  },
  ipv4: {
    length: () => 4,
    encode: (v, buf, o) => { ip.v4.encode(v, buf, o); return 4 },
    decode: (buf, o) => [ip.v4.decode(buf, o), 4]
  },
  // 64-bit identifier written as four 16-bit hex groups (NID / L64, RFC 6742)
  id64: {
    length: () => 8,
    encode: (v, buf, o) => { b.writeHex(buf, v.replace(/:/g, ''), o, o + 8); return 8 },
    decode: (buf, o) => [b.toHex(buf, o, o + 8).match(/.{4}/g).join(':'), 8]
  },
  // Buffer preceded by its 16-bit length (TKEY / TSIG)
  bytes16: {
    length: v => 2 + v.length,
    encode: (v, buf, o) => { b.writeUInt16BE(buf, v.length, o); buf.set(v, o + 2); return 2 + v.length },
    decode: (buf, o) => {
      const len = b.readUInt16BE(buf, o)
      return [buf.slice(o + 2, o + 2 + len), 2 + len]
    }
  },
  // Buffer filling the rest of RDATA; must be the last field
  rest: {
    length: v => v.length,
    encode: (v, buf, o) => { buf.set(v, o); return v.length },
    decode: (buf, o, end) => [buf.slice(o, end), end - o]
  }
}

function fieldsCodec (typeName, fields) {
  const enc = codec({
    encode (data, buf, offset) {
      if (!buf) buf = new Uint8Array(enc.encodingLength(data))
      if (!offset) offset = 0
      const oldOffset = offset

      offset += 2
      for (const [key, kind] of fields) {
        const value = data[key]
        if ((kind === 'rest' || kind === 'bytes16') && !b.isU8Arr(value)) {
          throw new Error(`${typeName}: ${key} must be a Buffer`)
        }
        offset += FIELD_KINDS[kind].encode(value, buf, offset)
      }

      enc.encode.bytes = offset - oldOffset
      b.writeUInt16BE(buf, enc.encode.bytes - 2, oldOffset)
      return buf
    },
    decode (buf, offset) {
      if (!offset) offset = 0
      const oldOffset = offset
      const end = rdataEnd(buf, offset)

      offset += 2
      const data = {}
      for (const [key, kind] of fields) {
        const [value, bytes] = FIELD_KINDS[kind].decode(buf, offset, end)
        offset += bytes
        if (offset > end) throw new Error(`${typeName}: RDATA too short`)
        data[key] = value
      }
      expectEnd(offset, end, typeName)

      enc.decode.bytes = offset - oldOffset
      return data
    },
    encodingLength (data) {
      return 2 + fields.reduce((sum, [key, kind]) => sum + FIELD_KINDS[kind].length(data[key]), 0)
    }
  })
  return enc
}

const rafsdb = fieldsCodec('AFSDB', [['subtype', 'u16'], ['hostname', 'name']]) // RFC 1183
const rrt = fieldsCodec('RT', [['preference', 'u16'], ['host', 'name']]) // RFC 1183
const rpx = fieldsCodec('PX', [['preference', 'u16'], ['map822', 'name'], ['mapx400', 'name']]) // RFC 2163
const rminfo = fieldsCodec('MINFO', [['rmailbx', 'name'], ['emailbx', 'name']]) // RFC 1035
const rcert = fieldsCodec('CERT', [['certType', 'u16'], ['keyTag', 'u16'], ['algorithm', 'u8'], ['certificate', 'rest']]) // RFC 4398
const rdhcid = fieldsCodec('DHCID', [['data', 'rest']]) // RFC 4701, opaque
const rnid = fieldsCodec('NID', [['preference', 'u16'], ['nodeId', 'id64']]) // RFC 6742
const rl32 = fieldsCodec('L32', [['preference', 'u16'], ['locator', 'ipv4']])
const rl64 = fieldsCodec('L64', [['preference', 'u16'], ['locator', 'id64']])
const rlp = fieldsCodec('LP', [['preference', 'u16'], ['fqdn', 'name']])
const rdsync = fieldsCodec('DSYNC', [['rrtype', 'type'], ['scheme', 'u8'], ['port', 'u16'], ['target', 'name']]) // RFC 9859
const rtkey = fieldsCodec('TKEY', [ // RFC 2930
  ['algorithm', 'name'], ['inception', 'u32'], ['expiration', 'u32'], ['mode', 'u16'], ['error', 'u16'],
  ['key', 'bytes16'], ['other', 'bytes16']
])
const rtsig = fieldsCodec('TSIG', [ // RFC 8945
  ['algorithm', 'name'], ['timeSigned', 'u48'], ['fudge', 'u16'], ['mac', 'bytes16'],
  ['originalId', 'u16'], ['error', 'u16'], ['other', 'bytes16']
])

// EUI48 / EUI64 (RFC 7043): data is the address as hyphen-separated hex, e.g. '00-00-5e-00-53-2a'
function euiCodec (typeName, size) {
  const enc = codec({
    encode (address, buf, offset) {
      if (!buf) buf = new Uint8Array(enc.encodingLength(address))
      if (!offset) offset = 0
      const hex = address.replace(/-/g, '')
      if (hex.length !== size * 2) throw new Error(`${typeName}: address must have ${size} octets`)
      b.writeUInt16BE(buf, size, offset)
      b.writeHex(buf, hex, offset + 2, offset + 2 + size)
      return buf
    },
    decode (buf, offset) {
      if (!offset) offset = 0
      expectEnd(offset + 2 + size, rdataEnd(buf, offset), typeName)
      return b.toHex(buf, offset + 2, offset + 2 + size).match(/../g).join('-')
    },
    bytes: size + 2
  })
  return enc
}
const reui48 = euiCodec('EUI48', 6)
const reui64 = euiCodec('EUI64', 8)

// APL (RFC 3123): data is a list of
//   { family: 1, prefix: 24, negation: false, address: '192.0.2.0' }
// The address is a string for IPv4 (1) and IPv6 (2); other families keep the raw AFDPART as `data`.
const APL_ADDRESS_LENGTH = { 1: 4, 2: 16 }
function aplAfdPart (item) {
  if (!APL_ADDRESS_LENGTH[item.family]) return item.data
  const full = new Uint8Array(APL_ADDRESS_LENGTH[item.family])
  if (item.family === 1) ip.v4.encode(item.address, full, 0)
  else ip.v6.encode(item.address, full, 0)
  let len = full.length
  while (len > 0 && full[len - 1] === 0) len-- // trailing zero octets are omitted
  return full.slice(0, len)
}

const rapl = codec({
  encode (items, buf, offset) {
    if (!buf) buf = new Uint8Array(rapl.encodingLength(items))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2
    for (const item of items) {
      const afd = aplAfdPart(item)
      b.writeUInt16BE(buf, item.family, offset)
      buf[offset + 2] = item.prefix
      buf[offset + 3] = (item.negation ? 0x80 : 0) | afd.length
      buf.set(afd, offset + 4)
      offset += 4 + afd.length
    }

    rapl.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rapl.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)

    offset += 2
    const items = []
    while (offset < end) {
      if (offset + 4 > end) throw new Error('APL: truncated item')
      const item = {
        family: b.readUInt16BE(buf, offset),
        prefix: buf[offset + 2],
        negation: (buf[offset + 3] & 0x80) !== 0
      }
      const afdLength = buf[offset + 3] & 0x7f
      offset += 4
      if (offset + afdLength > end) throw new Error('APL: AFDPART overflows RDATA')
      const addressLength = APL_ADDRESS_LENGTH[item.family]
      if (addressLength) {
        if (afdLength > addressLength) throw new Error('APL: AFDPART too long')
        const full = new Uint8Array(addressLength)
        full.set(buf.subarray(offset, offset + afdLength))
        item.address = item.family === 1 ? ip.v4.decode(full, 0) : ip.v6.decode(full, 0)
      } else {
        item.data = buf.slice(offset, offset + afdLength)
      }
      offset += afdLength
      items.push(item)
    }

    rapl.decode.bytes = offset - oldOffset
    return items
  },
  encodingLength (items) {
    return 2 + items.reduce((sum, item) => sum + 4 + aplAfdPart(item).length, 0)
  }
})

// Gateway / relay shared by IPSECKEY (RFC 4025) and AMTRELAY (RFC 8777):
//   type 0: none (null), 1: IPv4 string, 2: IPv6 string, 3: domain name
const gateway = {
  length (type, value) {
    switch (type) {
      case 0: return 0
      case 1: return 4
      case 2: return 16
      case 3: return name.encodingLength(value)
    }
    throw new Error(`Unknown gateway type ${type}`)
  },
  encode (type, value, buf, offset) {
    switch (type) {
      case 1: ip.v4.encode(value, buf, offset); break
      case 2: ip.v6.encode(value, buf, offset); break
      case 3: name.encode(value, buf, offset); break
    }
    return gateway.length(type, value)
  },
  decode (type, buf, offset) {
    switch (type) {
      case 0: return [null, 0]
      case 1: return [ip.v4.decode(buf, offset), 4]
      case 2: return [ip.v6.decode(buf, offset), 16]
      case 3: return [name.decode(buf, offset), name.decode.bytes]
    }
    throw new Error(`Unknown gateway type ${type}`)
  }
}

// IPSECKEY (RFC 4025)
const ripseckey = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(ripseckey.encodingLength(data))
    if (!offset) offset = 0
    const oldOffset = offset

    const publicKey = data.publicKey || new Uint8Array(0)
    offset += 2
    buf[offset++] = data.precedence
    buf[offset++] = data.gatewayType
    buf[offset++] = data.algorithm
    offset += gateway.encode(data.gatewayType, data.gateway, buf, offset)
    buf.set(publicKey, offset)
    offset += publicKey.length

    ripseckey.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, ripseckey.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)
    if (end - offset < 5) throw new Error('IPSECKEY: RDATA too short')

    offset += 2
    const data = {
      precedence: buf[offset],
      gatewayType: buf[offset + 1],
      algorithm: buf[offset + 2]
    }
    offset += 3
    const [gw, gwBytes] = gateway.decode(data.gatewayType, buf, offset)
    offset += gwBytes
    if (offset > end) throw new Error('IPSECKEY: gateway overflows RDATA')
    data.gateway = gw
    data.publicKey = buf.slice(offset, end)

    ripseckey.decode.bytes = end - oldOffset
    return data
  },
  encodingLength (data) {
    return 5 + gateway.length(data.gatewayType, data.gateway) + (data.publicKey ? data.publicKey.length : 0)
  }
})

// AMTRELAY (RFC 8777)
const ramtrelay = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(ramtrelay.encodingLength(data))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2
    buf[offset++] = data.precedence
    buf[offset++] = (data.discoveryOptional ? 0x80 : 0) | data.relayType
    offset += gateway.encode(data.relayType, data.relay, buf, offset)

    ramtrelay.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, ramtrelay.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)
    if (end - offset < 4) throw new Error('AMTRELAY: RDATA too short')

    offset += 2
    const data = {
      precedence: buf[offset],
      discoveryOptional: (buf[offset + 1] & 0x80) !== 0,
      relayType: buf[offset + 1] & 0x7f
    }
    offset += 2
    const [relay, relayBytes] = gateway.decode(data.relayType, buf, offset)
    data.relay = relay
    offset += relayBytes
    expectEnd(offset, end, 'AMTRELAY')

    ramtrelay.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    return 4 + gateway.length(data.relayType, data.relay)
  }
})

// HIP (RFC 8005)
const rhip = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rhip.encodingLength(data))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2
    buf[offset++] = data.hit.length
    buf[offset++] = data.algorithm
    b.writeUInt16BE(buf, data.publicKey.length, offset)
    offset += 2
    buf.set(data.hit, offset)
    offset += data.hit.length
    buf.set(data.publicKey, offset)
    offset += data.publicKey.length
    for (const server of data.rendezvousServers || []) {
      name.encode(server, buf, offset)
      offset += name.encode.bytes
    }

    rhip.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rhip.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)
    if (end - offset < 6) throw new Error('HIP: RDATA too short')

    offset += 2
    const hitLength = buf[offset]
    const data = { algorithm: buf[offset + 1] }
    const pkLength = b.readUInt16BE(buf, offset + 2)
    offset += 4
    if (offset + hitLength + pkLength > end) throw new Error('HIP: HIT / public key overflow RDATA')
    data.hit = buf.slice(offset, offset + hitLength)
    offset += hitLength
    data.publicKey = buf.slice(offset, offset + pkLength)
    offset += pkLength
    data.rendezvousServers = []
    while (offset < end) {
      data.rendezvousServers.push(name.decode(buf, offset))
      offset += name.decode.bytes
    }
    expectEnd(offset, end, 'HIP')

    rhip.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    return 6 + data.hit.length + data.publicKey.length +
      (data.rendezvousServers || []).reduce((sum, server) => sum + name.encodingLength(server), 0)
  }
})

// KEY (RFC 2535 / RFC 3445) and RKEY: like DNSKEY, but the protocol octet is not fixed to 3
const rkey = fieldsCodec('KEY', [['flags', 'u16'], ['protocol', 'u8'], ['algorithm', 'u8'], ['key', 'rest']])
const rtalink = fieldsCodec('TALINK', [['previous', 'name'], ['next', 'name']])
const rnsap = fieldsCodec('NSAP', [['address', 'rest']]) // RFC 1706, binary NSAP
const rgpos = fieldsCodec('GPOS', [['longitude', 'string'], ['latitude', 'string'], ['altitude', 'string']]) // RFC 1712
const rdoa = fieldsCodec('DOA', [ // draft-durand-doa-over-dns
  ['enterprise', 'u32'], ['type', 'u32'], ['location', 'u8'], ['mediaType', 'string'], ['data', 'rest']
])
const rsink = fieldsCodec('SINK', [['coding', 'u8'], ['subcoding', 'u8'], ['data', 'rest']]) // draft-eastlake-kitchen-sink
// Opaque RDATA kept as { data }: EID / NIMLOC (Nimrod), HHIT / BRID (RFC 9886)
const reid = fieldsCodec('EID', [['data', 'rest']])
const rnimloc = fieldsCodec('NIMLOC', [['data', 'rest']])
const rhhit = fieldsCodec('HHIT', [['data', 'rest']])
const rbrid = fieldsCodec('BRID', [['data', 'rest']])

// X25 (RFC 1183): data is the PSDN address string
const rx25 = codec({
  encode (address, buf, offset) {
    if (!buf) buf = new Uint8Array(rx25.encodingLength(address))
    if (!offset) offset = 0
    string.encode(address, buf, offset + 2)
    b.writeUInt16BE(buf, string.encode.bytes, offset)
    rx25.encode.bytes = string.encode.bytes + 2
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const end = rdataEnd(buf, offset)
    const address = string.decode(buf, offset + 2)
    expectEnd(offset + 2 + string.decode.bytes, end, 'X25')
    rx25.decode.bytes = end - offset
    return address
  },
  encodingLength (address) {
    return 2 + string.encodingLength(address)
  }
})

// ISDN (RFC 1183): { address, subaddress } where subaddress is optional
const risdn = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(risdn.encodingLength(data))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2
    string.encode(data.address, buf, offset)
    offset += string.encode.bytes
    if (data.subaddress !== undefined) {
      string.encode(data.subaddress, buf, offset)
      offset += string.encode.bytes
    }

    risdn.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, risdn.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)

    offset += 2
    const data = { address: string.decode(buf, offset) }
    offset += string.decode.bytes
    if (offset < end) {
      data.subaddress = string.decode(buf, offset)
      offset += string.decode.bytes
    }
    expectEnd(offset, end, 'ISDN')

    risdn.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    return 2 + string.encodingLength(data.address) +
      (data.subaddress !== undefined ? string.encodingLength(data.subaddress) : 0)
  }
})

// Bitmap where bit N (most significant bit first) means number N is present:
// the WKS port bitmap (RFC 1035) and the NXT type bitmap (RFC 2535)
function bitsToList (buf, start, end) {
  const list = []
  for (let o = start; o < end; o++) {
    for (let bit = 0; bit < 8; bit++) {
      if (buf[o] & (0x80 >> bit)) list.push((o - start) * 8 + bit)
    }
  }
  return list
}

function listToBits (list) {
  const max = list.length ? Math.max(...list) : -1
  const bits = new Uint8Array((max >> 3) + 1)
  for (const n of list) bits[n >> 3] |= 0x80 >> (n & 7)
  return max === -1 ? new Uint8Array(0) : bits
}

// WKS (RFC 1035): { address: '192.0.2.1', protocol: 6, ports: [25, 80] }
const rwks = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rwks.encodingLength(data))
    if (!offset) offset = 0

    const bits = listToBits(data.ports || [])
    b.writeUInt16BE(buf, 5 + bits.length, offset)
    ip.v4.encode(data.address, buf, offset + 2)
    buf[offset + 6] = data.protocol
    buf.set(bits, offset + 7)

    rwks.encode.bytes = 7 + bits.length
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const end = rdataEnd(buf, offset)
    if (end - offset < 7) throw new Error('WKS: RDATA too short')

    const data = {
      address: ip.v4.decode(buf, offset + 2),
      protocol: buf[offset + 6],
      ports: bitsToList(buf, offset + 7, end)
    }
    rwks.decode.bytes = end - offset
    return data
  },
  encodingLength (data) {
    return 7 + listToBits(data.ports || []).length
  }
})

// NXT (RFC 2535): { nextDomain, rrtypes } with the pre-NSEC type bitmap (types 1-127)
const rnxt = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(rnxt.encodingLength(data))
    if (!offset) offset = 0
    const oldOffset = offset

    offset += 2
    name.encode(data.nextDomain, buf, offset)
    offset += name.encode.bytes
    const bits = listToBits(data.rrtypes.map(t => types.toType(t)))
    buf.set(bits, offset)
    offset += bits.length

    rnxt.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, rnxt.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)

    offset += 2
    const data = { nextDomain: name.decode(buf, offset) }
    offset += name.decode.bytes
    if (offset > end) throw new Error('NXT: next domain overflows RDATA')
    data.rrtypes = bitsToList(buf, offset, end).map(t => types.toString(t))

    rnxt.decode.bytes = end - oldOffset
    return data
  },
  encodingLength (data) {
    return 2 + name.encodingLength(data.nextDomain) + listToBits(data.rrtypes.map(t => types.toType(t))).length
  }
})

// A6 (RFC 2874): { prefixLength, suffix: '::1:2:3:4', prefixName }
// suffix is an IPv6 address whose first prefixLength bits are zero; prefixName is omitted when prefixLength is 0.
const ra6 = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(ra6.encodingLength(data))
    if (!offset) offset = 0
    const oldOffset = offset

    const skip = data.prefixLength >> 3
    const address = new Uint8Array(16)
    ip.v6.encode(data.suffix, address, 0)
    offset += 2
    buf[offset++] = data.prefixLength
    buf.set(address.subarray(skip), offset)
    offset += 16 - skip
    if (data.prefixLength > 0) {
      name.encode(data.prefixName, buf, offset)
      offset += name.encode.bytes
    }

    ra6.encode.bytes = offset - oldOffset
    b.writeUInt16BE(buf, ra6.encode.bytes - 2, oldOffset)
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const oldOffset = offset
    const end = rdataEnd(buf, offset)

    offset += 2
    const prefixLength = buf[offset++]
    if (prefixLength > 128) throw new Error('A6: prefix length over 128')
    const skip = prefixLength >> 3
    if (offset + 16 - skip > end) throw new Error('A6: address suffix overflows RDATA')
    const address = new Uint8Array(16)
    address.set(buf.subarray(offset, offset + 16 - skip), skip)
    offset += 16 - skip
    const data = { prefixLength, suffix: ip.v6.decode(address, 0) }
    if (prefixLength > 0) {
      data.prefixName = name.decode(buf, offset)
      offset += name.decode.bytes
    }
    expectEnd(offset, end, 'A6')

    ra6.decode.bytes = offset - oldOffset
    return data
  },
  encodingLength (data) {
    return 3 + 16 - (data.prefixLength >> 3) + (data.prefixLength > 0 ? name.encodingLength(data.prefixName) : 0)
  }
})

// ATMA (ATM Forum af-dans-0152.000): { format, address }
//   format 0 (AESA): address is 40 hex digits; format 1 (E.164): address is the digit string;
//   other formats: address is hex
const ratma = codec({
  encode (data, buf, offset) {
    if (!buf) buf = new Uint8Array(ratma.encodingLength(data))
    if (!offset) offset = 0

    buf[offset + 2] = data.format
    let len
    if (data.format === 1) {
      len = b.write(buf, data.address, offset + 3)
    } else {
      len = b.hexLength(data.address)
      b.writeHex(buf, data.address, offset + 3, offset + 3 + len)
    }
    b.writeUInt16BE(buf, len + 1, offset)

    ratma.encode.bytes = len + 3
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0
    const end = rdataEnd(buf, offset)
    if (end - offset < 3) throw new Error('ATMA: RDATA too short')

    const format = buf[offset + 2]
    const data = {
      format,
      address: format === 1 ? toUtf8(buf, offset + 3, end) : b.toHex(buf, offset + 3, end)
    }
    ratma.decode.bytes = end - offset
    return data
  },
  encodingLength (data) {
    return 3 + (data.format === 1 ? b.bytelength(data.address) : b.hexLength(data.address))
  }
})

function renc (type) {
  switch (type.toUpperCase()) {
    case 'A': return ra
    case 'PTR': return rptr
    case 'CNAME': return rptr
    case 'DNAME': return rptr
    case 'TXT': return rtxt
    case 'NULL': return rnull
    case 'AAAA': return raaaa
    case 'SRV': return rsrv
    case 'HINFO': return rhinfo
    case 'CAA': return rcaa
    case 'NS': return rns
    case 'SOA': return rsoa
    case 'MX': return rmx
    case 'OPT': return ropt
    case 'DNSKEY': return rdnskey
    case 'RRSIG': return rrrsig
    case 'RP': return rrp
    case 'NSEC': return rnsec
    case 'NSEC3': return rnsec3
    case 'SSHFP': return rsshfp
    case 'DS': return rds
    case 'CDS': return rds
    case 'TA': return rds
    case 'DLV': return rds
    case 'CDNSKEY': return rdnskey
    case 'NAPTR': return rnaptr
    case 'TLSA': return rtlsa
    case 'SMIMEA': return rtlsa
    case 'URI': return ruri
    case 'OPENPGPKEY': return ropenpgpkey
    case 'NSEC3PARAM': return rnsec3param
    case 'ZONEMD': return rzonemd
    case 'CSYNC': return rcsync
    case 'LOC': return rloc
    case 'SVCB': return rsvcb
    case 'HTTPS': return rsvcb
    case 'MD': return rptr
    case 'MF': return rptr
    case 'MB': return rptr
    case 'MG': return rptr
    case 'MR': return rptr
    case 'NSAP-PTR': return rptr
    case 'MINFO': return rminfo
    case 'AFSDB': return rafsdb
    case 'RT': return rrt
    case 'KX': return rmx
    case 'PX': return rpx
    case 'CERT': return rcert
    case 'APL': return rapl
    case 'DHCID': return rdhcid
    case 'IPSECKEY': return ripseckey
    case 'HIP': return rhip
    case 'EUI48': return reui48
    case 'EUI64': return reui64
    case 'NID': return rnid
    case 'L32': return rl32
    case 'L64': return rl64
    case 'LP': return rlp
    case 'AMTRELAY': return ramtrelay
    case 'DSYNC': return rdsync
    case 'TKEY': return rtkey
    case 'TSIG': return rtsig
    case 'SPF': return rtxt
    case 'AVC': return rtxt
    case 'NINFO': return rtxt
    case 'RESINFO': return rtxt
    case 'WALLET': return rtxt
    case 'SIG': return rrrsig
    case 'KEY': return rkey
    case 'RKEY': return rkey
    case 'TALINK': return rtalink
    case 'WKS': return rwks
    case 'X25': return rx25
    case 'ISDN': return risdn
    case 'NSAP': return rnsap
    case 'GPOS': return rgpos
    case 'A6': return ra6
    case 'NXT': return rnxt
    case 'ATMA': return ratma
    case 'DOA': return rdoa
    case 'SINK': return rsink
    case 'EID': return reid
    case 'NIMLOC': return rnimloc
    case 'HHIT': return rhhit
    case 'BRID': return rbrid
  }
  return runknown
}

export const answer = codec({
  encode (a, buf, offset) {
    if (!buf) buf = new Uint8Array(answer.encodingLength(a))
    if (!offset) offset = 0

    const oldOffset = offset

    name.encode(a.name, buf, offset)
    offset += name.encode.bytes

    b.writeUInt16BE(buf, types.toType(a.type), offset)

    if (a.type.toUpperCase() === 'OPT') {
      if (a.name !== '.') {
        throw new Error('OPT name must be root.')
      }
      b.writeUInt16BE(buf, a.udpPayloadSize || 4096, offset + 2)
      buf[offset + 4] = a.extendedRcode || 0
      buf[offset + 5] = a.ednsVersion || 0
      b.writeUInt16BE(buf, a.flags || 0, offset + 6)

      offset += 8
      ropt.encode(a.options || [], buf, offset)
      offset += ropt.encode.bytes
    } else {
      let klass = classes.toClass(a.class === undefined ? 'IN' : a.class)
      if (a.flush) klass |= FLUSH_MASK // the 1st bit of the class is the flush bit
      b.writeUInt16BE(buf, klass, offset + 2)
      b.writeUInt32BE(buf, a.ttl || 0, offset + 4)

      offset += 8
      const enc = renc(a.type)
      enc.encode(a.data, buf, offset)
      offset += enc.encode.bytes
    }

    answer.encode.bytes = offset - oldOffset
    return buf
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const a = {}
    const oldOffset = offset

    a.name = name.decode(buf, offset)
    offset += name.decode.bytes
    if (offset + 10 > buf.length) throw new Error('Cannot decode record (buffer overflow)')
    a.type = types.toString(b.readUInt16BE(buf, offset))
    if (a.type === 'OPT') {
      a.udpPayloadSize = b.readUInt16BE(buf, offset + 2)
      a.extendedRcode = buf[offset + 4]
      a.ednsVersion = buf[offset + 5]
      a.flags = b.readUInt16BE(buf, offset + 6)
      a.flag_do = ((a.flags >> 15) & 0x1) === 1
      a.options = ropt.decode(buf, offset + 8)
      offset += 8 + ropt.decode.bytes
    } else {
      const klass = b.readUInt16BE(buf, offset + 2)
      a.ttl = b.readUInt32BE(buf, offset + 4)

      a.class = classes.toString(klass & NOT_FLUSH_MASK)
      a.flush = !!(klass & FLUSH_MASK)

      // A malformed RDATA must not make the whole packet undecodable: keep the
      // raw bytes in `data` and the reason in `dataError`, then skip by RDLENGTH.
      const rdataOffset = offset + 8
      const end = rdataEnd(buf, rdataOffset)
      const enc = renc(a.type)
      try {
        a.data = enc.decode(buf, rdataOffset)
        expectEnd(rdataOffset + enc.decode.bytes, end, a.type)
      } catch (err) {
        if (enc === runknown) throw err
        a.data = runknown.decode(buf, rdataOffset)
        a.dataError = err.message
      }
      offset = end
    }

    answer.decode.bytes = offset - oldOffset
    return a
  },
  encodingLength (a) {
    const data = (a.data !== null && a.data !== undefined) ? a.data : a.options
    return name.encodingLength(a.name) + 8 + renc(a.type).encodingLength(data)
  }
})

export const question = codec({
  encode (q, buf, offset) {
    if (!buf) buf = new Uint8Array(question.encodingLength(q))
    if (!offset) offset = 0

    const oldOffset = offset

    name.encode(q.name, buf, offset)
    offset += name.encode.bytes

    b.writeUInt16BE(buf, types.toType(q.type), offset)
    offset += 2

    b.writeUInt16BE(buf, classes.toClass(q.class === undefined ? 'IN' : q.class), offset)
    offset += 2

    question.encode.bytes = offset - oldOffset
    return q
  },
  decode (buf, offset) {
    if (!offset) offset = 0

    const oldOffset = offset
    const q = {}

    q.name = name.decode(buf, offset)
    offset += name.decode.bytes
    if (offset + 4 > buf.length) throw new Error('Cannot decode question (buffer overflow)')

    q.type = types.toString(b.readUInt16BE(buf, offset))
    offset += 2

    q.class = classes.toString(b.readUInt16BE(buf, offset))
    offset += 2

    const qu = !!(q.class & QU_MASK)
    if (qu) q.class &= NOT_QU_MASK

    question.decode.bytes = offset - oldOffset
    return q
  },
  encodingLength (q) {
    return name.encodingLength(q.name) + 4
  }
})

export {
  rsoa as soa,
  rtxt as txt,
  rnull as null,
  runknown as unknown,
  rns as ns,
  rhinfo as hinfo,
  rptr as ptr,
  rptr as cname,
  rptr as dname,
  rsrv as srv,
  rcaa as caa,
  rmx as mx,
  ra as a,
  raaaa as aaaa,
  roption as option,
  ropt as opt,
  rdnskey as dnskey,
  rrrsig as rrsig,
  rrp as rp,
  rnsec as nsec,
  rnsec3 as nsec3,
  rds as ds,
  rsshfp as sshfp,
  rnaptr as naptr,
  rtlsa as tlsa,
  rtlsa as smimea,
  ruri as uri,
  ropenpgpkey as openpgpkey,
  rnsec3param as nsec3param,
  rzonemd as zonemd,
  rcsync as csync,
  rloc as loc,
  rsvcb as svcb,
  rsvcb as https,
  rminfo as minfo,
  rafsdb as afsdb,
  rrt as rt,
  rmx as kx,
  rpx as px,
  rcert as cert,
  rapl as apl,
  rdhcid as dhcid,
  ripseckey as ipseckey,
  rhip as hip,
  reui48 as eui48,
  reui64 as eui64,
  rnid as nid,
  rl32 as l32,
  rl64 as l64,
  rlp as lp,
  ramtrelay as amtrelay,
  rdsync as dsync,
  rtkey as tkey,
  rtsig as tsig,
  rrrsig as sig,
  rkey as key,
  rkey,
  rtalink as talink,
  rwks as wks,
  rx25 as x25,
  risdn as isdn,
  rnsap as nsap,
  rgpos as gpos,
  ra6 as a6,
  rnxt as nxt,
  ratma as atma,
  rdoa as doa,
  rsink as sink,
  reid as eid,
  rnimloc as nimloc,
  rhhit as hhit,
  rbrid as brid,
  renc as enc
}

export const AUTHORITATIVE_ANSWER = 1 << 10
export const TRUNCATED_RESPONSE = 1 << 9
export const RECURSION_DESIRED = 1 << 8
export const RECURSION_AVAILABLE = 1 << 7
export const AUTHENTIC_DATA = 1 << 5
export const CHECKING_DISABLED = 1 << 4
export const DNSSEC_OK = 1 << 15

export const packet = {
  encode: function (result, buf, offset) {
    const allocing = !buf

    if (allocing) buf = new Uint8Array(encodingLength(result))
    if (!offset) offset = 0

    const oldOffset = offset

    if (!result.questions) result.questions = []
    if (!result.answers) result.answers = []
    if (!result.authorities) result.authorities = []
    if (!result.additionals) result.additionals = []

    header.encode(result, buf, offset)
    offset += header.encode.bytes

    offset = encodeList(result.questions, question, buf, offset)
    offset = encodeList(result.answers, answer, buf, offset)
    offset = encodeList(result.authorities, answer, buf, offset)
    offset = encodeList(result.additionals, answer, buf, offset)

    packet.encode.bytes = offset - oldOffset

    // just a quick sanity check
    if (allocing && encode.bytes !== buf.length) {
      return buf.slice(0, encode.bytes)
    }

    return buf
  },
  // options.partial: when a record cannot be decoded, return the records decoded so far instead of
  // throwing. The sections are cut at that point and `error` says where and why (the header itself
  // must still be complete).
  decode: function (buf, offset, options) {
    if (!offset) offset = 0

    const oldOffset = offset
    const result = header.decode(buf, offset)
    offset += header.decode.bytes

    const sections = [['questions', question], ['answers', answer], ['authorities', answer], ['additionals', answer]]
    const counts = {}
    for (const [key] of sections) counts[key] = result[key].length
    for (let s = 0; s < sections.length && !result.error; s++) {
      const [key, enc] = sections[s]
      const list = result[key]
      for (let i = 0; i < list.length; i++) {
        try {
          list[i] = enc.decode(buf, offset)
          offset += enc.decode.bytes
        } catch (err) {
          if (!options || !options.partial) throw err
          list.length = i
          for (const [rest] of sections.slice(s + 1)) result[rest].length = 0
          result.error = { section: key, index: i, message: err.message, counts }
          break
        }
      }
    }

    // RCODE with the 8 upper bits that EDNS keeps in the OPT record (RFC 6891)
    const opt = result.additionals.find(a => a.type === 'OPT')
    result.fullRcode = opt
      ? rcodes.toString((opt.extendedRcode << 4) | (result.flags & 0xf))
      : result.rcode

    packet.decode.bytes = offset - oldOffset

    return result
  },
  encodingLength: function (result) {
    return header.encodingLength(result) +
      encodingLengthList(result.questions || [], question) +
      encodingLengthList(result.answers || [], answer) +
      encodingLengthList(result.authorities || [], answer) +
      encodingLengthList(result.additionals || [], answer)
  }
}
packet.encode.bytes = 0
packet.decode.bytes = 0

function sanitizeSingle (input, type) {
  if (input.questions) {
    throw new Error('Only one .question object expected instead of a .questions array!')
  }
  const sanitized = Object.assign({
    type
  }, input)
  if (sanitized.question) {
    sanitized.questions = [sanitized.question]
    delete sanitized.question
  }
  return sanitized
}

export const query = {
  encode: function (result, buf, offset) {
    buf = packet.encode(sanitizeSingle(result, 'query'), buf, offset)
    query.encode.bytes = packet.encode.bytes
    return buf
  },
  decode: function (buf, offset) {
    const res = packet.decode(buf, offset)
    query.decode.bytes = packet.decode.bytes
    if (res.questions) {
      res.question = res.questions[0]
      delete res.questions
    }
    return res
  },
  encodingLength: function (result) {
    return packet.encodingLength(sanitizeSingle(result, 'query'))
  }
}
query.encode.bytes = 0
query.decode.bytes = 0

export const response = {
  encode: function (result, buf, offset) {
    buf = packet.encode(sanitizeSingle(result, 'response'), buf, offset)
    response.encode.bytes = packet.encode.bytes
    return buf
  },
  decode: function (buf, offset) {
    const res = packet.decode(buf, offset)
    response.decode.bytes = packet.decode.bytes
    if (res.questions) {
      res.question = res.questions[0]
      delete res.questions
    }
    return res
  },
  encodingLength: function (result) {
    return packet.encodingLength(sanitizeSingle(result, 'response'))
  }
}
response.encode.bytes = 0
response.decode.bytes = 0

export const encode = packet.encode
export const decode = packet.decode
export const encodingLength = packet.encodingLength

export function streamEncode (result) {
  const buf = encode(result)
  const combine = new Uint8Array(2 + buf.byteLength)
  b.writeUInt16BE(combine, buf.byteLength)
  b.copy(buf, combine, 2, 0, buf.length)
  streamEncode.bytes = combine.byteLength
  return combine
}
streamEncode.bytes = 0

export function streamDecode (sbuf) {
  const len = b.readUInt16BE(sbuf, 0)
  if (sbuf.byteLength < len + 2) {
    // not enough data
    return null
  }
  const result = decode(sbuf.slice(2))
  streamDecode.bytes = decode.bytes
  return result
}
streamDecode.bytes = 0

export function encodingLengthList (list, enc) {
  let len = 0
  for (let i = 0; i < list.length; i++) len += enc.encodingLength(list[i])
  return len
}

export function encodeList (list, enc, buf, offset) {
  for (let i = 0; i < list.length; i++) {
    enc.encode(list[i], buf, offset)
    offset += enc.encode.bytes
  }
  return offset
}

export function decodeList (list, enc, buf, offset) {
  for (let i = 0; i < list.length; i++) {
    list[i] = enc.decode(buf, offset)
    offset += enc.decode.bytes
  }
  return offset
}
