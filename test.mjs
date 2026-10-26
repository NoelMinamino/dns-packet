import tape, { test } from 'tape'
import * as packet from './index.mjs'
import * as rcodes from './rcodes.mjs'
import * as opcodes from './opcodes.mjs'
import * as optioncodes from './optioncodes.mjs'
import * as types from './types.mjs'
import { rdataToString, rrToString, toBase32Hex, toBase64 } from './presentation.mjs'
import { decode as toUtf8 } from 'utf8-codec'
import { write, toHex, bytelength, writeHex, hexLength } from './buffer_utils.mjs'

tape('unknown', function (t) {
  testEncoder(t, packet.unknown, Buffer.from('hello world'))
  t.end()
})

tape('txt', function (t) {
  testEncoder(t, packet.txt, [])
  testEncoder(t, packet.txt, ['hello world'])
  testEncoder(t, packet.txt, ['hello', 'world'])
  testEncoder(t, packet.txt, [Buffer.from([0, 1, 2, 3, 4, 5])])
  testEncoder(t, packet.txt, ['a', 'b', Buffer.from([0, 1, 2, 3, 4, 5])])
  testEncoder(t, packet.txt, ['', Buffer.allocUnsafe(0)])
  t.end()
})

tape('txt-scalar-string', function (t) {
  const buf = packet.txt.encode('hi')
  const val = packet.txt.decode(buf)
  t.equal(val.length, 1, 'array length')
  t.ok(compare(t, val[0], Buffer.from('hi')), 'streamDecoded type match')
  t.end()
})

tape('txt-scalar-buffer', function (t) {
  const data = Buffer.from([0, 1, 2, 3, 4, 5])
  const buf = packet.txt.encode(data)
  const val = packet.txt.decode(buf)
  t.equal(val.length, 1, 'array length')
  t.ok(compare(t, val[0], data), 'data')
  t.end()
})

tape('txt-invalid-data', function (t) {
  t.throws(function () { packet.txt.encode(null) }, 'null')
  t.throws(function () { packet.txt.encode(undefined) }, 'undefined')
  t.throws(function () { packet.txt.encode(10) }, 'number')
  t.end()
})

tape('null', function (t) {
  testEncoder(t, packet.null, Buffer.from([0, 1, 2, 3, 4, 5]))
  t.end()
})

tape('hinfo', function (t) {
  testEncoder(t, packet.hinfo, { cpu: 'intel', os: 'best one' })
  t.end()
})

tape('ptr', function (t) {
  testEncoder(t, packet.ptr, 'hello.world.com')
  t.end()
})

tape('cname', function (t) {
  testEncoder(t, packet.cname, 'hello.cname.world.com')
  t.end()
})

tape('dname', function (t) {
  testEncoder(t, packet.dname, 'hello.dname.world.com')
  t.end()
})

tape('srv', function (t) {
  testEncoder(t, packet.srv, { port: 9999, target: 'hello.world.com' })
  testEncoder(t, packet.srv, { port: 9999, target: 'hello.world.com', priority: 42, weight: 10 })
  t.end()
})

tape('caa', function (t) {
  testEncoder(t, packet.caa, { flags: 128, tag: 'issue', value: 'letsencrypt.org', issuerCritical: true })
  testEncoder(t, packet.caa, { tag: 'issue', value: 'letsencrypt.org', issuerCritical: true })
  testEncoder(t, packet.caa, { tag: 'issue', value: 'letsencrypt.org' })
  t.end()
})

tape('mx', function (t) {
  testEncoder(t, packet.mx, { preference: 10, exchange: 'mx.hello.world.com' })
  testEncoder(t, packet.mx, { exchange: 'mx.hello.world.com' })
  t.end()
})

tape('ns', function (t) {
  testEncoder(t, packet.ns, 'ns.world.com')
  t.end()
})

tape('soa', function (t) {
  testEncoder(t, packet.soa, {
    mname: 'hello.world.com',
    rname: 'root.hello.world.com',
    serial: 2018010400,
    refresh: 14400,
    retry: 3600,
    expire: 604800,
    minimum: 3600
  })
  t.end()
})

tape('sshfp', function (t) {
  testEncoder(t, packet.sshfp, {
    algorithm: 1,
    hash: 1,
    fingerprint: 'a108c9f834354d5b37af988141c9294822f5bc00'
  })
  testEncoder(t, packet.sshfp, {
    algorithm: 1,
    hash: 2,
    fingerprint: 'a108c9f834354d5b37af988141c9294822f5bc00afa0dfafa2dfa1dfafa5dfa1'
  })
  t.end()
})

tape('a', function (t) {
  testEncoder(t, packet.a, '127.0.0.1')
  t.end()
})

tape('aaaa', function (t) {
  testEncoder(t, packet.aaaa, 'fe80::1')
  t.end()
})

tape('query', function (t) {
  testEncoder(t, packet, {
    type: 'query',
    questions: [{
      type: 'A',
      name: 'hello.a.com'
    }, {
      type: 'SRV',
      name: 'hello.srv.com'
    }]
  })

  testEncoder(t, packet, {
    type: 'query',
    id: 42,
    questions: [{
      type: 'A',
      class: 'IN',
      name: 'hello.a.com'
    }, {
      type: 'SRV',
      name: 'hello.srv.com'
    }]
  })

  testEncoder(t, packet, {
    type: 'query',
    id: 42,
    questions: [{
      type: 'A',
      class: 'CH',
      name: 'hello.a.com'
    }, {
      type: 'SRV',
      name: 'hello.srv.com'
    }]
  })

  t.end()
})

tape('response', function (t) {
  testEncoder(t, packet, {
    type: 'response',
    answers: [{
      type: 'A',
      class: 'IN',
      flush: true,
      name: 'hello.a.com',
      data: '127.0.0.1'
    }]
  })

  testEncoder(t, packet, {
    type: 'response',
    flags: packet.TRUNCATED_RESPONSE,
    answers: [{
      type: 'A',
      class: 'IN',
      name: 'hello.a.com',
      data: '127.0.0.1'
    }, {
      type: 'SRV',
      class: 'IN',
      name: 'hello.srv.com',
      data: {
        port: 9090,
        target: 'hello.target.com'
      }
    }, {
      type: 'CNAME',
      class: 'IN',
      name: 'hello.cname.com',
      data: 'hello.other.domain.com'
    }]
  })

  testEncoder(t, packet, {
    type: 'response',
    id: 100,
    flags: 0,
    additionals: [{
      type: 'AAAA',
      name: 'hello.a.com',
      data: 'fe80::1'
    }, {
      type: 'PTR',
      name: 'hello.ptr.com',
      data: 'hello.other.ptr.com'
    }, {
      type: 'SRV',
      name: 'hello.srv.com',
      ttl: 42,
      data: {
        port: 9090,
        target: 'hello.target.com'
      }
    }],
    answers: [{
      type: 'NULL',
      name: 'hello.null.com',
      data: Buffer.from([1, 2, 3, 4, 5])
    }]
  })

  testEncoder(t, packet, {
    type: 'response',
    answers: [{
      type: 'TXT',
      name: 'emptytxt.com',
      data: ''
    }]
  })

  t.end()
})

tape('rcode', function (t) {
  const errors = ['NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP', 'REFUSED', 'YXDOMAIN', 'YXRRSET', 'NXRRSET', 'NOTAUTH', 'NOTZONE', 'RCODE_11', 'RCODE_12', 'RCODE_13', 'RCODE_14', 'RCODE_15']
  for (const i in errors) {
    const code = rcodes.toRcode(errors[i])
    t.ok(errors[i] === rcodes.toString(code), 'rcode conversion from/to string matches: ' + rcodes.toString(code))
  }

  const ops = ['QUERY', 'IQUERY', 'STATUS', 'OPCODE_3', 'NOTIFY', 'UPDATE', 'OPCODE_6', 'OPCODE_7', 'OPCODE_8', 'OPCODE_9', 'OPCODE_10', 'OPCODE_11', 'OPCODE_12', 'OPCODE_13', 'OPCODE_14', 'OPCODE_15']
  for (const j in ops) {
    const ocode = opcodes.toOpcode(ops[j])
    t.ok(ops[j] === opcodes.toString(ocode), 'opcode conversion from/to string matches: ' + opcodes.toString(ocode))
  }

  const buf = packet.encode({
    type: 'response',
    id: 45632,
    flags: 0x8480,
    answers: [{
      type: 'A',
      name: 'hello.example.net',
      data: '127.0.0.1'
    }]
  })
  const val = packet.decode(buf)
  t.ok(val.type === 'response', 'decode type')
  t.ok(val.opcode === 'QUERY', 'decode opcode')
  t.ok(val.flag_qr === true, 'decode flag_qr')
  t.ok(val.flag_aa === true, 'decode flag_aa')
  t.ok(val.flag_tc === false, 'decode flag_tc')
  t.ok(val.flag_rd === false, 'decode flag_rd')
  t.ok(val.flag_ra === true, 'decode flag_ra')
  t.ok(val.flag_z === false, 'decode flag_z')
  t.ok(val.flag_ad === false, 'decode flag_ad')
  t.ok(val.flag_cd === false, 'decode flag_cd')
  t.ok(val.rcode === 'NOERROR', 'decode rcode')
  t.end()
})

tape('name_encoding', function (t) {
  let data = 'foo.example.com'
  const buf = Buffer.allocUnsafe(255)
  let offset = 0
  packet.name.encode(data, buf, offset)
  t.ok(packet.name.encode.bytes === 17, 'name encoding length matches')
  let dd = packet.name.decode(buf, offset)
  t.ok(data === dd, 'encode/decode matches')
  offset += packet.name.encode.bytes

  data = 'com'
  packet.name.encode(data, buf, offset)
  t.ok(packet.name.encode.bytes === 5, 'name encoding length matches')
  dd = packet.name.decode(buf, offset)
  t.ok(data === dd, 'encode/decode matches')
  offset += packet.name.encode.bytes

  data = 'example.com.'
  packet.name.encode(data, buf, offset)
  t.ok(packet.name.encode.bytes === 13, 'name encoding length matches')
  dd = packet.name.decode(buf, offset)
  t.ok(data.slice(0, -1) === dd, 'encode/decode matches')
  offset += packet.name.encode.bytes

  data = '.'
  packet.name.encode(data, buf, offset)
  t.ok(packet.name.encode.bytes === 1, 'name encoding length matches')
  dd = packet.name.decode(buf, offset)
  t.ok(data === dd, 'encode/decode matches')
  t.end()
})

tape('name_decoding', function (t) {
  // The two most significant bits of a valid label header must be either both zero or both one
  t.throws(function () { packet.name.decode(Buffer.from([0x80])) }, /Cannot decode name \(bad label\)$/)
  t.throws(function () { packet.name.decode(Buffer.from([0xb0])) }, /Cannot decode name \(bad label\)$/)

  // Ensure there's enough buffer to read
  t.throws(function () { packet.name.decode(Buffer.from([])) }, /Cannot decode name \(buffer overflow\)$/)
  t.throws(function () { packet.name.decode(Buffer.from([0x01, 0x00])) }, /Cannot decode name \(buffer overflow\)$/)
  t.throws(function () { packet.name.decode(Buffer.from([0x01])) }, /Cannot decode name \(buffer overflow\)$/)
  t.throws(function () { packet.name.decode(Buffer.from([0xc0])) }, /Cannot decode name \(buffer overflow\)$/)

  // Allow only pointers backwards
  t.throws(function () { packet.name.decode(Buffer.from([0xc0, 0x00])) }, /Cannot decode name \(bad pointer\)$/)
  t.throws(function () { packet.name.decode(Buffer.from([0xc0, 0x01])) }, /Cannot decode name \(bad pointer\)$/)

  // A name can be only 253 characters (when connected with dots)
  const maxLength = Buffer.alloc(255)
  maxLength.fill(Buffer.from([0x01, 0x61]), 0, 254)
  t.ok(packet.name.decode(maxLength) === new Array(127).fill('a').join('.'))

  const tooLong = Buffer.alloc(256)
  tooLong.fill(Buffer.from([0x01, 0x61]))
  t.throws(function () { packet.name.decode(tooLong) }, /Cannot decode name \(name too long\)$/)

  // Ensure jumps don't reset the total length counter
  const tooLongWithJump = Buffer.alloc(403)
  tooLongWithJump.fill(Buffer.from([0x01, 0x61]), 0, 200)
  tooLongWithJump.fill(Buffer.from([0x01, 0x61]), 201, 401)
  tooLongWithJump.set([0xc0, 0x00], 401)
  t.throws(function () { packet.name.decode(tooLongWithJump, 201) }, /Cannot decode name \(name too long\)$/)

  // Ensure a jump to a null byte doesn't add extra dots
  t.ok(packet.name.decode(Buffer.from([0x00, 0x01, 0x61, 0xc0, 0x00]), 1) === 'a')

  // Ensure deeply nested pointers don't cause "Maximum call stack size exceeded" errors
  const buf = Buffer.alloc(16386)
  for (let i = 0; i < 16384; i += 2) {
    buf.writeUInt16BE(0xc000 | i, i + 2)
  }
  t.ok(packet.name.decode(buf, 16384) === '.')

  t.end()
})

tape('stream', function (t) {
  const val = {
    type: 'query',
    id: 45632,
    flags: 0x8480,
    answers: [{
      type: 'A',
      name: 'test2.example.net',
      data: '198.51.100.1'
    }]
  }
  const buf = packet.streamEncode(val)
  const val2 = packet.streamDecode(buf)

  t.same(buf.length, packet.streamEncode.bytes, 'streamEncode.bytes was set correctly')
  t.ok(compare(t, val2.type, val.type), 'streamDecoded type match')
  t.ok(compare(t, val2.id, val.id), 'streamDecoded id match')
  t.ok(parseInt(val2.flags) === parseInt(val.flags & 0x7FFF), 'streamDecoded flags match')
  const answer = val.answers[0]
  const answer2 = val2.answers[0]
  t.ok(compare(t, answer.type, answer2.type), 'streamDecoded RR type match')
  t.ok(compare(t, answer.name, answer2.name), 'streamDecoded RR name match')
  t.ok(compare(t, answer.data, answer2.data), 'streamDecoded RR rdata match')
  t.end()
})

tape('opt', function (t) {
  const val = {
    type: 'query',
    questions: [{
      type: 'A',
      name: 'hello.a.com'
    }],
    additionals: [{
      type: 'OPT',
      name: '.',
      udpPayloadSize: 1024
    }]
  }
  testEncoder(t, packet, val)
  let buf = packet.encode(val)
  let val2 = packet.decode(buf)
  const additional1 = val.additionals[0]
  let additional2 = val2.additionals[0]
  t.ok(compare(t, additional1.name, additional2.name), 'name matches')
  t.ok(compare(t, additional1.udpPayloadSize, additional2.udpPayloadSize), 'udp payload size matches')
  t.ok(compare(t, 0, additional2.flags), 'flags match')
  additional1.flags = packet.DNSSEC_OK
  additional1.extendedRcode = 0x80
  additional1.options = [{
    code: 'CLIENT_SUBNET', // edns-client-subnet, see RFC 7871
    ip: 'fe80::',
    sourcePrefixLength: 64
  }, {
    code: 8, // still ECS
    ip: '5.6.0.0',
    sourcePrefixLength: 16,
    scopePrefixLength: 16
  }, {
    code: 'padding',
    length: 31
  }, {
    code: 'TCP_KEEPALIVE'
  }, {
    code: 'tcp_keepalive',
    timeout: 150
  }, {
    code: 'KEY_TAG',
    tags: [1, 82, 987]
  }]
  buf = packet.encode(val)
  val2 = packet.decode(buf)
  additional2 = val2.additionals[0]
  t.ok(compare(t, 1 << 15, additional2.flags), 'DO bit set in flags')
  t.ok(compare(t, true, additional2.flag_do), 'DO bit set')
  t.ok(compare(t, additional1.extendedRcode, additional2.extendedRcode), 'extended rcode matches')
  t.ok(compare(t, 8, additional2.options[0].code))
  t.ok(compare(t, 'fe80::', additional2.options[0].ip))
  t.ok(compare(t, 64, additional2.options[0].sourcePrefixLength))
  t.ok(compare(t, '5.6.0.0', additional2.options[1].ip))
  t.ok(compare(t, 16, additional2.options[1].sourcePrefixLength))
  t.ok(compare(t, 16, additional2.options[1].scopePrefixLength))
  t.ok(compare(t, additional1.options[2].length, additional2.options[2].data.length))
  t.ok(compare(t, additional1.options[3].timeout, undefined))
  t.ok(compare(t, additional1.options[4].timeout, additional2.options[4].timeout))
  t.ok(compare(t, additional1.options[5].tags, additional2.options[5].tags))
  t.end()
})

tape('dnskey', function (t) {
  testEncoder(t, packet.dnskey, {
    flags: packet.dnskey.SECURE_ENTRYPOINT | packet.dnskey.ZONE_KEY,
    algorithm: 1,
    key: Buffer.from([0, 1, 2, 3, 4, 5])
  })
  t.end()
})

tape('rrsig', function (t) {
  const testRRSIG = {
    typeCovered: 'A',
    algorithm: 1,
    labels: 2,
    originalTTL: 3600,
    expiration: 1234,
    inception: 1233,
    keyTag: 2345,
    signersName: 'foo.com',
    signature: Buffer.from([0, 1, 2, 3, 4, 5])
  }
  testEncoder(t, packet.rrsig, testRRSIG)

  // Check the signature length is correct with extra junk at the end
  const buf = Buffer.allocUnsafe(packet.rrsig.encodingLength(testRRSIG) + 4)
  packet.rrsig.encode(testRRSIG, buf)
  const val2 = packet.rrsig.decode(buf)
  t.ok(compare(t, testRRSIG, val2))

  t.end()
})

tape('rrp', function (t) {
  testEncoder(t, packet.rp, {
    mbox: 'foo.bar.com',
    txt: 'baz.bar.com'
  })
  testEncoder(t, packet.rp, {
    mbox: 'foo.bar.com'
  })
  testEncoder(t, packet.rp, {
    txt: 'baz.bar.com'
  })
  testEncoder(t, packet.rp, {})
  t.end()
})

tape('nsec', function (t) {
  testEncoder(t, packet.nsec, {
    nextDomain: 'foo.com',
    rrtypes: ['A', 'DNSKEY', 'CAA', 'DLV']
  })
  testEncoder(t, packet.nsec, {
    nextDomain: 'foo.com',
    rrtypes: ['TXT'] // 16
  })
  testEncoder(t, packet.nsec, {
    nextDomain: 'foo.com',
    rrtypes: ['TKEY'] // 249
  })
  testEncoder(t, packet.nsec, {
    nextDomain: 'foo.com',
    rrtypes: ['RRSIG', 'NSEC']
  })
  testEncoder(t, packet.nsec, {
    nextDomain: 'foo.com',
    rrtypes: ['TXT', 'RRSIG']
  })
  testEncoder(t, packet.nsec, {
    nextDomain: 'foo.com',
    rrtypes: ['TXT', 'NSEC']
  })

  // Test with the sample NSEC from https://tools.ietf.org/html/rfc4034#section-4.3
  const sampleNSEC = new Uint8Array(Buffer.from('003704686f7374076578616d706c6503636f6d00' +
      '0006400100000003041b000000000000000000000000000000000000000000000' +
      '000000020', 'hex'))
  const decoded = packet.nsec.decode(sampleNSEC)
  t.ok(compare(t, decoded, {
    nextDomain: 'host.example.com',
    rrtypes: ['A', 'MX', 'RRSIG', 'NSEC', 'UNKNOWN_1234']
  }))
  const reencoded = packet.nsec.encode(decoded)
  t.same(sampleNSEC.length, reencoded.length)
  t.same(sampleNSEC, reencoded)
  t.end()
})

tape('nsec3', function (t) {
  testEncoder(t, packet.nsec3, {
    algorithm: 1,
    flags: 0,
    iterations: 257,
    salt: Buffer.from([42, 42, 42]),
    nextDomain: Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]),
    rrtypes: ['A', 'DNSKEY', 'CAA', 'DLV']
  })
  t.end()
})

tape('ds', function (t) {
  testEncoder(t, packet.ds, {
    keyTag: 1234,
    algorithm: 1,
    digestType: 1,
    digest: Buffer.from([0, 1, 2, 3, 4, 5])
  })
  t.end()
})

tape('unpack', function (t) {
  const buf = Buffer.from([
    0x00, 0x79,
    0xde, 0xad, 0x85, 0x00, 0x00, 0x01, 0x00, 0x01,
    0x00, 0x02, 0x00, 0x02, 0x02, 0x6f, 0x6a, 0x05,
    0x62, 0x61, 0x6e, 0x67, 0x6a, 0x03, 0x63, 0x6f,
    0x6d, 0x00, 0x00, 0x01, 0x00, 0x01, 0xc0, 0x0c,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x0e, 0x10,
    0x00, 0x04, 0x81, 0xfa, 0x0b, 0xaa, 0xc0, 0x0f,
    0x00, 0x02, 0x00, 0x01, 0x00, 0x00, 0x0e, 0x10,
    0x00, 0x05, 0x02, 0x63, 0x6a, 0xc0, 0x0f, 0xc0,
    0x0f, 0x00, 0x02, 0x00, 0x01, 0x00, 0x00, 0x0e,
    0x10, 0x00, 0x02, 0xc0, 0x0c, 0xc0, 0x3a, 0x00,
    0x01, 0x00, 0x01, 0x00, 0x00, 0x0e, 0x10, 0x00,
    0x04, 0x45, 0x4d, 0x9b, 0x9c, 0xc0, 0x0c, 0x00,
    0x1c, 0x00, 0x01, 0x00, 0x00, 0x0e, 0x10, 0x00,
    0x10, 0x20, 0x01, 0x04, 0x18, 0x00, 0x00, 0x50,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0xf9
  ])
  const val = packet.streamDecode(buf)
  const answer = val.answers[0]
  const authority = val.authorities[1]
  t.ok(val.rcode === 'NOERROR', 'decode rcode')
  t.ok(compare(t, answer.type, 'A'), 'streamDecoded RR type match')
  t.ok(compare(t, answer.name, 'oj.bangj.com'), 'streamDecoded RR name match')
  t.ok(compare(t, answer.data, '129.250.11.170'), 'streamDecoded RR rdata match')
  t.ok(compare(t, authority.type, 'NS'), 'streamDecoded RR type match')
  t.ok(compare(t, authority.name, 'bangj.com'), 'streamDecoded RR name match')
  t.ok(compare(t, authority.data, 'oj.bangj.com'), 'streamDecoded RR rdata match')
  t.end()
})

tape('optioncodes', function (t) {
  const opts = [
    [0, 'OPTION_0'],
    [1, 'LLQ'],
    [2, 'UL'],
    [3, 'NSID'],
    [4, 'OPTION_4'],
    [5, 'DAU'],
    [6, 'DHU'],
    [7, 'N3U'],
    [8, 'CLIENT_SUBNET'],
    [9, 'EXPIRE'],
    [10, 'COOKIE'],
    [11, 'TCP_KEEPALIVE'],
    [12, 'PADDING'],
    [13, 'CHAIN'],
    [14, 'KEY_TAG'],
    [26946, 'DEVICEID'],
    [65535, 'OPTION_65535'],
    [64000, 'OPTION_64000'],
    [65002, 'OPTION_65002'],
    [-1, null]
  ]
  for (const [code, str] of opts) {
    const s = optioncodes.toString(code)
    t.ok(compare(t, s, str), `${code} => ${str}`)
    t.ok(compare(t, optioncodes.toCode(s), code), `${str} => ${code}`)
  }
  t.ok(compare(t, optioncodes.toCode('INVALIDINVALID'), -1))
  t.end()
})

tape('packet exported codec', function (t) {
  const input = {
    type: 'query',
    questions: [{
      type: 'A',
      name: 'hello.a.com',
      class: 'IN'
    }]
  }
  packet.encode.bytes = 0
  t.equals(packet.packet.encode.bytes, 0)
  t.equals(packet.packet.encode.bytes, packet.encode.bytes)
  const buf = packet.packet.encode(input)
  t.equals(packet.packet.encode.bytes, 29)
  t.equals(packet.packet.encode.bytes, packet.encode.bytes)
  t.deepEqual(
    buf,
    packet.encode(input)
  )
  packet.decode.bytes = 0
  t.equals(packet.packet.decode.bytes, 0)
  t.equals(packet.packet.decode.bytes, packet.decode.bytes)
  const obj = packet.packet.decode(buf)
  t.equals(packet.packet.decode.bytes, 29)
  t.equals(packet.packet.decode.bytes, packet.decode.bytes)
  t.deepEqual(
    obj,
    packet.decode(buf)
  )
  t.end()
})

tape('single query error with multiple questions', function (t) {
  t.throws(() => {
    packet.query.encode({
      questions: []
    })
  }, /Only one .question object expected instead of a .questions array!/)
  t.end()
})

tape('single query -> response encoding', function (t) {
  const question = {
    type: 'A',
    name: 'hello.a.com',
    class: 'IN'
  }
  const length = packet.query.encodingLength({ question })
  t.equals(length, 29)
  t.equals(packet.query.encode.bytes, 0)
  const queryBytes = packet.query.encode({
    question
  })
  const decodedQuestion = packet.decode(queryBytes)
  t.equals(packet.query.encode.bytes, length)
  t.equal(decodedQuestion.type, 'query')
  t.deepEqual(decodedQuestion.questions, [question])
  t.equals(packet.query.decode.bytes, 0)
  decodedQuestion.question = decodedQuestion.questions[0]
  delete decodedQuestion.questions

  t.deepEqual(packet.query.decode(queryBytes), decodedQuestion)
  const responseBytes = packet.encode({
    type: 'response',
    questions: [question]
  })
  const decodedResponse = packet.response.decode(responseBytes)
  t.equal(packet.response.encodingLength(decodedResponse), length)
  t.equals(packet.response.decode.bytes, length)
  t.deepEqual(decodedResponse.question, question)
  t.deepEqual(packet.response.encode(decodedResponse), responseBytes)
  t.end()
})

test('buffer utf8', function (sub) {
  for (const [index, fixture] of [
    // '', // empty
    'basic: hi',
    'japanese: 日本語',
    'mixed: 日本語 hi',
    'min 1 byte: \x00',
    'odd 1 byte: \x4c',
    'max 1 byte: \x7f',
    'min 2 byte: \x80',
    'odd 2 byte: \xd941',
    'max 2 byte: \x7fff',
    'min 3 byte: \x8000',
    'odd 3 byte: \xa158',
    'max 3 byte: \xffff',
    `4 byte: ${String.fromCodePoint(100000)}`
  ].entries()) {
    sub.test(`fixture #${index}`, t => {
      const check = Buffer.from(fixture)
      const checkHex = check.toString('hex')
      const len = check.length
      t.equals(bytelength(fixture), len, `fixture ${fixture} length`)
      const buf = new Uint8Array(len)
      t.equals(write(buf, fixture, 0), len, 'write.num')
      t.equals(toHex(buf, 0, len), checkHex, `write: ${fixture}`)
      t.equals(check.compare(Buffer.from(writeHex(buf, checkHex, 0, hexLength(checkHex)))), 0)
      t.equals(toUtf8(check, 0, check.length), check.toString(), `toUtf8: ${fixture}`)
      t.end()
    })
  }

  sub.test('surrogate pairs', function (t) {
    [
      [0xd821, 0xdea0],
      [0xd800, 0xdc00],
      [0xd801, 0xdc01],
      [0xddff, 0xdfff],
      [0xd821, 0x0000],
      [0xd821, 0xd821, 0xdea0]
    ].forEach(function (bytes, index) {
      const str = String.fromCharCode(...bytes)
      const buf = new Uint8Array(bytelength(str))
      const check = Buffer.from(str)
      t.equal(buf.length, check.length)
      write(buf, str, 0)
      t.equal(toHex(buf, 0, buf.length), check.toString('hex'), `#${index} [${bytes}].toHex() ... ${check.toString('hex')}`)
      t.equal(toUtf8(buf, 0, buf.length), check.toString(), `#${index} [${bytes}].toUtf8`)
    })
    t.end()
  })

  sub.test('all code points', function (t) {
    const blockSize = 2048
    const blocks = 65536 / blockSize
    let code = 0
    for (let block = 0; block < blocks; block += 1) {
      const expected = {}
      const actual = {}
      for (let i = 0; i < blockSize; i += 1, code += 1) {
        const str = String.fromCharCode(code)
        const buf = new Uint8Array(bytelength(str))
        write(buf, str, 0)
        const exp = Buffer.from(str)
        expected[code] = exp.toString('hex')
        actual[code] = toHex(buf, 0, buf.length)
      }
      t.same(actual, expected)
    }
    t.end()
  })
})

tape('types', function (t) {
  t.same(types.toString(65), 'HTTPS')
  t.same(types.toString(64), 'SVCB')
  t.same(types.toString(53), 'SMIMEA')
  t.same(types.toString(65280), 'UNKNOWN_65280')
  t.same(types.toType('https'), 65)
  t.same(types.toType('NSAP-PTR'), 23)
  t.same(types.toType('*'), 255)
  t.same(types.toType('TYPE65280'), 65280)
  t.same(types.toType('UNKNOWN_1234'), 1234)
  t.same(types.toType('NOT-A-TYPE'), 0)
  for (let i = 0; i < 65536; i++) {
    if (types.toType(types.toString(i)) !== i) {
      t.fail(`toType(toString(${i})) round trip`)
      break
    }
  }
  t.end()
})

tape('sshfp with unassigned hash type', function (t) {
  testEncoder(t, packet.sshfp, { algorithm: 4, hash: 3, fingerprint: 'a108c9f8' })
  t.end()
})

tape('naptr', function (t) {
  testEncoder(t, packet.naptr, {
    order: 100,
    preference: 10,
    flags: 's',
    services: 'SIP+D2U',
    regexp: '!^.*$!sip:customer-service@example.com!',
    replacement: '_sip._udp.example.com'
  })
  testEncoder(t, packet.naptr, {
    order: 1,
    preference: 2,
    flags: '',
    services: '',
    regexp: '',
    replacement: '.'
  })
  t.end()
})

tape('tlsa / smimea', function (t) {
  const val = { usage: 3, selector: 1, matchingType: 1, certificate: Buffer.from('0123456789abcdef0123456789abcdef', 'hex') }
  testEncoder(t, packet.tlsa, val)
  testEncoder(t, packet.smimea, val)
  t.end()
})

tape('uri', function (t) {
  testEncoder(t, packet.uri, { priority: 10, weight: 1, target: 'ftp://ftp1.example.com/public' })
  testEncoder(t, packet.uri, { priority: 0, weight: 0, target: '' })
  t.end()
})

tape('openpgpkey', function (t) {
  testEncoder(t, packet.openpgpkey, { key: Buffer.from([0x99, 0x01, 0x0d, 0x04]) })
  t.end()
})

tape('nsec3param', function (t) {
  testEncoder(t, packet.nsec3param, { algorithm: 1, flags: 0, iterations: 10, salt: Buffer.from('aabbccdd', 'hex') })
  testEncoder(t, packet.nsec3param, { algorithm: 1, flags: 0, iterations: 0, salt: Buffer.alloc(0) })
  t.end()
})

tape('zonemd', function (t) {
  testEncoder(t, packet.zonemd, { serial: 2018031900, scheme: 1, algorithm: 1, digest: Buffer.alloc(48, 0xab) })
  t.end()
})

tape('csync', function (t) {
  testEncoder(t, packet.csync, { serial: 66, flags: 3, rrtypes: ['A', 'NS', 'AAAA'] })
  t.end()
})

tape('loc', function (t) {
  // RFC 1876: cambridge-net.kei.com. LOC 42 21 54 N 71 06 18 W -24m 30m
  const val = {
    version: 0,
    size: 0x33,
    horizontalPrecision: 0x16,
    verticalPrecision: 0x13,
    latitude: 2 ** 31 + (42 * 3600 + 21 * 60 + 54) * 1000,
    longitude: 2 ** 31 - (71 * 3600 + 6 * 60 + 18) * 1000,
    altitude: 10000000 - 2400
  }
  testEncoder(t, packet.loc, val)
  const buf = packet.loc.encode(val)
  buf[2] = 1
  t.throws(() => packet.loc.decode(buf), /unsupported version/)
  t.end()
})

tape('svcb', function (t) {
  testEncoder(t, packet.svcb, { priority: 0, targetName: 'foo.example.com', params: {} })
  testEncoder(t, packet.https, { priority: 1, targetName: '.', params: { alpn: ['h2'] } })
  testEncoder(t, packet.svcb, {
    priority: 1,
    targetName: 'svc.example.com',
    params: {
      mandatory: ['alpn', 'port'],
      alpn: ['h2', 'h3'],
      'no-default-alpn': true,
      port: 8443,
      ipv4hint: ['192.0.2.1', '192.0.2.2'],
      ech: Buffer.from('0123456789abcdef', 'hex'),
      ipv6hint: ['2001:db8::1'],
      dohpath: '/dns-query{?dns}',
      ohttp: true,
      key65000: Buffer.from('abc')
    }
  })
  t.end()
})

tape('svcb RFC 9460 test vector (D.2, Figure 7)', function (t) {
  const wire = Buffer.from(
    '0030' + // RDLENGTH
    '0010' + // priority 16
    '03666f6f076578616d706c65036f726700' + // foo.example.org.
    '0000000400010004' + // mandatory=alpn,ipv4hint
    '000100090268320568332d3139' + // alpn=h2,h3-19
    '00040004c0000201', // ipv4hint=192.0.2.1
    'hex')
  t.same(packet.svcb.decode(wire), {
    priority: 16,
    targetName: 'foo.example.org',
    params: { mandatory: ['alpn', 'ipv4hint'], alpn: ['h2', 'h3-19'], ipv4hint: ['192.0.2.1'] }
  })
  // Keys are written in increasing order regardless of the object key order
  const encoded = packet.svcb.encode({
    priority: 16,
    targetName: 'foo.example.org',
    params: { ipv4hint: ['192.0.2.1'], alpn: ['h2', 'h3-19'], mandatory: ['alpn', 'ipv4hint'] }
  })
  t.same(toHex(encoded, 0, encoded.length), toHex(wire, 0, wire.length))
  t.end()
})

tape('malformed rdata is kept as raw bytes', function (t) {
  const buf = Buffer.from(packet.encode({
    type: 'response',
    answers: [
      { type: 'HTTPS', name: 'a.example', data: { priority: 1, targetName: '.', params: { alpn: ['h2'], port: 443 } } },
      { type: 'A', name: 'b.example', data: '192.0.2.1' }
    ]
  }))
  const decoded = packet.decode(buf)
  t.same(decoded.answers[0].type, 'HTTPS')
  t.same(decoded.answers[0].data.params, { alpn: ['h2'], port: 443 })
  t.same(decoded.answers[0].dataError, undefined)

  // Swap the two SvcParams (alpn: 7 bytes, port: 6 bytes) so that the keys are out of order
  const params = 12 + 11 + 10 + 2 + 1 // header, owner, type/class/ttl/rdlength, priority, target
  const swapped = Buffer.concat([buf.subarray(params + 7, params + 13), buf.subarray(params, params + 7)])
  swapped.copy(buf, params)
  const broken = packet.decode(buf)
  t.ok(broken.answers[0].data instanceof Uint8Array, 'raw rdata is returned')
  t.same(broken.answers[0].data.length, 2 + 1 + 13)
  t.match(broken.answers[0].dataError, /increasing order/)
  t.same(broken.answers[1].data, '192.0.2.1', 'following records still decode')
  t.end()
})

tape('new record types round trip through packet', function (t) {
  const answers = [
    { type: 'HTTPS', name: 'example.com', ttl: 300, class: 'IN', flush: false, data: { priority: 1, targetName: '.', params: { alpn: ['h2', 'h3'] } } },
    { type: 'TLSA', name: '_443._tcp.example.com', ttl: 300, class: 'IN', flush: false, data: { usage: 3, selector: 1, matchingType: 1, certificate: Buffer.alloc(32, 1) } },
    { type: 'CDS', name: 'example.com', ttl: 300, class: 'IN', flush: false, data: { keyTag: 12345, algorithm: 13, digestType: 2, digest: Buffer.alloc(32, 2) } },
    { type: 'URI', name: '_http._tcp.example.com', ttl: 300, class: 'IN', flush: false, data: { priority: 10, weight: 1, target: 'https://example.com/' } }
  ]
  const decoded = packet.decode(packet.encode({ type: 'response', answers }))
  t.same(decoded.answers.map(a => a.type), ['HTTPS', 'TLSA', 'CDS', 'URI'])
  t.ok(compare(t, answers, decoded.answers), 'decoded answers match')
  t.end()
})

// Encodes the records into a packet and decodes them again, as they would arrive off the wire
function roundTrip (answers) {
  return packet.decode(packet.encode({
    type: 'response',
    answers: answers.map(a => ({ name: 'example.com', ttl: 300, ...a }))
  })).answers
}

function presentation (answer, options) {
  return rdataToString(roundTrip([answer])[0], options)
}

tape('presentation: base64 / base32hex', function (t) {
  t.same(toBase64(Buffer.from('')), '')
  t.same(toBase64(Buffer.from('f')), 'Zg==')
  t.same(toBase64(Buffer.from('fo')), 'Zm8=')
  t.same(toBase64(Buffer.from('foobar')), 'Zm9vYmFy')
  // RFC 4648 section 10
  t.same(toBase32Hex(Buffer.from('foobar')), 'CPNMUOJ1E8')
  t.same(toBase32Hex(Buffer.from('f')), 'CO')
  t.end()
})

tape('presentation: names and common types', function (t) {
  t.same(presentation({ type: 'A', data: '192.0.2.1' }), '192.0.2.1')
  t.same(presentation({ type: 'NS', data: 'ns1.example.com' }), 'ns1.example.com.')
  t.same(presentation({ type: 'NS', data: 'ns1.example.com' }, { trailingDot: false }), 'ns1.example.com')
  t.same(presentation({ type: 'MX', data: { preference: 10, exchange: 'mail.example.com' } }), '10 mail.example.com.')
  t.same(presentation({
    type: 'SOA',
    data: { mname: 'ns1.example.com', rname: 'hostmaster.example.com', serial: 2026102601, refresh: 7200, retry: 3600, expire: 1209600, minimum: 300 }
  }), 'ns1.example.com. hostmaster.example.com. 2026102601 7200 3600 1209600 300')
  t.same(presentation({ type: 'SRV', data: { priority: 10, weight: 60, port: 5060, target: '.' } }), '10 60 5060 .')
  t.same(presentation({ type: 'CAA', data: { flags: 0, tag: 'issue', value: 'letsencrypt.org' } }), '0 issue "letsencrypt.org"')
  t.end()
})

tape('presentation: character-strings', function (t) {
  t.same(presentation({ type: 'TXT', data: ['v=spf1 -all', 'say "hi" \\ bye', ''] }), '"v=spf1 -all" "say \\"hi\\" \\\\ bye" ""')
  t.same(presentation({ type: 'TXT', data: [Buffer.from([0x00, 0x41, 0x7f])] }), '"\\000A\\127"')
  t.same(presentation({ type: 'TXT', data: ['日本'] }), '"\\230\\151\\165\\230\\156\\172"')
  t.same(presentation({ type: 'TXT', data: ['日本'] }, { utf8: true }), '"日本"')
  // An invalid UTF-8 sequence is still escaped with utf8: true
  t.same(presentation({ type: 'TXT', data: [Buffer.from([0xe6, 0x97])] }, { utf8: true }), '"\\230\\151"')
  t.same(presentation({ type: 'SPF', data: ['v=spf1 -all'] }), '"v=spf1 -all"')
  t.same(presentation({ type: 'HINFO', data: { cpu: 'INTEL-386', os: 'Linux' } }), '"INTEL-386" "Linux"')
  t.same(presentation({
    type: 'NAPTR',
    data: { order: 100, preference: 10, flags: 'S', services: 'SIP+D2U', regexp: '!^.*$!sip:info@example.com!', replacement: '_sip._udp.example.com' }
  }), '100 10 "S" "SIP+D2U" "!^.*$!sip:info@example.com!" _sip._udp.example.com.')
  t.same(presentation({ type: 'URI', data: { priority: 10, weight: 1, target: 'https://www.example.com/' } }), '10 1 "https://www.example.com/"')
  t.end()
})

tape('presentation: DNSSEC', function (t) {
  t.same(presentation({ type: 'DS', data: { keyTag: 60485, algorithm: 5, digestType: 1, digest: Buffer.from('2bb183af5f22588179a53b0a98631fad1a292118', 'hex') } }),
    '60485 5 1 2BB183AF5F22588179A53B0A98631FAD1A292118') // RFC 4034 section 5.4
  t.same(presentation({ type: 'CDS', data: { keyTag: 0, algorithm: 0, digestType: 0, digest: Buffer.from([0]) } }), '0 0 0 00') // RFC 8078 delete
  t.same(presentation({ type: 'DNSKEY', data: { flags: 257, algorithm: 13, key: Buffer.from('foobar') } }), '257 3 13 Zm9vYmFy')
  t.same(presentation({ type: 'KEY', data: { flags: 256, protocol: 1, algorithm: 8, key: Buffer.from('f') } }), '256 1 8 Zg==')
  t.same(presentation({
    type: 'NSEC3',
    data: { algorithm: 1, flags: 1, iterations: 12, salt: Buffer.from('aabbccdd', 'hex'), nextDomain: Buffer.from('foobar'), rrtypes: ['A', 'RRSIG'] }
  }), '1 1 12 AABBCCDD CPNMUOJ1E8 A RRSIG')
  t.same(presentation({ type: 'NSEC3PARAM', data: { algorithm: 1, flags: 0, iterations: 0, salt: Buffer.alloc(0) } }), '1 0 0 -')
  t.same(presentation({ type: 'NSEC', data: { nextDomain: 'host.example.com', rrtypes: ['A', 'MX', 'RRSIG', 'NSEC', 'TYPE1234'] } }),
    'host.example.com. A MX RRSIG NSEC TYPE1234') // RFC 4034 section 4.3
  t.same(presentation({ type: 'SSHFP', data: { algorithm: 4, hash: 2, fingerprint: 'a108c9f834354d5b37af988141c9294822f5bc00afa0dfafa2dfa1dfafa5dfa1' } }),
    '4 2 a108c9f834354d5b37af988141c9294822f5bc00afa0dfafa2dfa1dfafa5dfa1')
  t.end()
})

tape('presentation: SVCB / HTTPS', function (t) {
  // RFC 9460 appendix D.2, Figure 7 (keys are printed in wire order)
  t.same(presentation({
    type: 'SVCB',
    data: { priority: 16, targetName: 'foo.example.org', params: { alpn: ['h2', 'h3-19'], mandatory: ['ipv4hint', 'alpn'], ipv4hint: ['192.0.2.1'] } }
  }), '16 foo.example.org. mandatory=ipv4hint,alpn alpn="h2,h3-19" ipv4hint=192.0.2.1')
  t.same(presentation({ type: 'HTTPS', data: { priority: 0, targetName: 'cdn.example.net', params: {} } }), '0 cdn.example.net.')
  t.same(presentation({
    type: 'HTTPS',
    data: { priority: 1, targetName: '.', params: { 'no-default-alpn': true, port: 8443, ech: Buffer.from('foobar'), ipv6hint: ['2001:db8::1'], dohpath: '/q{?dns}', key65000: Buffer.from('a"b') } }
  }), '1 . no-default-alpn port=8443 ech="Zm9vYmFy" ipv6hint=2001:db8::1 dohpath="/q{?dns}" key65000="a\\"b"')
  t.end()
})

tape('presentation: other types', function (t) {
  // RFC 1876 section 4: 42 21 54 N 71 06 18 W -24m 30m
  t.same(presentation({
    type: 'LOC',
    data: {
      size: 0x33,
      horizontalPrecision: 0x16,
      verticalPrecision: 0x13,
      latitude: 2 ** 31 + (42 * 3600 + 21 * 60 + 54) * 1000,
      longitude: 2 ** 31 - (71 * 3600 + 6 * 60 + 18) * 1000,
      altitude: 10000000 - 2400
    }
  }), '42 21 54.000 N 71 6 18.000 W -24.00m 30.00m 10000.00m 10.00m')
  // RFC 3123 section 4
  t.same(presentation({
    type: 'APL',
    data: [{ family: 1, prefix: 21, negation: false, address: '192.168.32.0' }, { family: 1, prefix: 28, negation: true, address: '192.168.38.0' }]
  }), '1:192.168.32.0/21 !1:192.168.38.0/28')
  t.same(presentation({ type: 'WKS', data: { address: '192.0.2.1', protocol: 6, ports: [25, 80] } }), '192.0.2.1 6 25 80')
  t.same(presentation({ type: 'IPSECKEY', data: { precedence: 10, gatewayType: 0, algorithm: 2, gateway: null, publicKey: Buffer.from('f') } }), '10 0 2 . Zg==')
  t.same(presentation({ type: 'IPSECKEY', data: { precedence: 10, gatewayType: 3, algorithm: 2, gateway: 'gw.example.com', publicKey: Buffer.from('f') } }), '10 3 2 gw.example.com. Zg==')
  t.same(presentation({ type: 'AMTRELAY', data: { precedence: 10, discoveryOptional: true, relayType: 1, relay: '203.0.113.15' } }), '10 1 1 203.0.113.15')
  t.same(presentation({ type: 'AMTRELAY', data: { precedence: 0, discoveryOptional: false, relayType: 0, relay: null } }), '0 0 0 .')
  t.same(presentation({ type: 'HIP', data: { algorithm: 2, hit: Buffer.from('2001', 'hex'), publicKey: Buffer.from('f'), rendezvousServers: ['rvs.example.com'] } }), '2 2001 Zg== rvs.example.com.')
  t.same(presentation({ type: 'EUI64', data: '00-00-5e-ef-10-00-00-2a' }), '00-00-5e-ef-10-00-00-2a')
  t.same(presentation({ type: 'NID', data: { preference: 10, nodeId: '0014:4fff:ff20:8b37' } }), '10 0014:4fff:ff20:8b37')
  t.same(presentation({ type: 'DSYNC', data: { rrtype: 'CDS', scheme: 1, port: 5359, target: 'dsync.example.net' } }), 'CDS 1 5359 dsync.example.net.')
  t.same(presentation({ type: 'A6', data: { prefixLength: 0, suffix: '2001:db8::1' } }), '0 2001:db8::1')
  t.same(presentation({ type: 'A6', data: { prefixLength: 64, suffix: '::1:2:3:4', prefixName: 'prefix.example.com' } }), '64 ::1:2:3:4 prefix.example.com.')
  t.same(presentation({ type: 'ATMA', data: { format: 1, address: '15551234567' } }), '+15551234567')
  t.same(presentation({ type: 'CERT', data: { certType: 1, keyTag: 12345, algorithm: 8, certificate: Buffer.from('f') } }), 'PKIX 12345 8 Zg==')
  t.same(presentation({ type: 'HHIT', data: { data: Buffer.from('0102', 'hex') } }), '\\# 2 0102')
  t.same(presentation({ type: 'TSIG', class: 'ANY', ttl: 0, data: { algorithm: 'hmac-sha256', timeSigned: 1761436800, fudge: 300, mac: Buffer.from('f'), originalId: 1, error: 0, other: Buffer.alloc(0) } }),
    'hmac-sha256. 1761436800 300 1 Zg== 1 0 0')
  t.end()
})

tape('presentation: unknown and malformed rdata, rrToString', function (t) {
  const [unknown] = roundTrip([{ type: 'TYPE65280', data: Buffer.from('0102', 'hex') }])
  t.same(unknown.type, 'UNKNOWN_65280')
  t.same(rdataToString(unknown), '\\# 2 0102')
  t.same(rrToString(unknown), 'example.com. 300 IN TYPE65280 \\# 2 0102')
  t.same(rrToString(roundTrip([{ type: 'NULL', data: Buffer.alloc(0) }])[0]), 'example.com. 300 IN NULL \\# 0')

  t.same(rrToString(roundTrip([{ type: 'MX', data: { preference: 10, exchange: 'mail.example.com' } }])[0]),
    'example.com. 300 IN MX 10 mail.example.com.')

  // A record whose RDATA could not be decoded keeps its raw bytes
  t.same(rdataToString({ type: 'HTTPS', name: 'example.com', data: Buffer.from('0001', 'hex'), dataError: 'broken' }), '\\# 2 0001')

  const opt = packet.decode(packet.encode({
    type: 'response',
    additionals: [{ type: 'OPT', name: '.', udpPayloadSize: 1232, flags: packet.DNSSEC_OK, options: [{ code: 10, data: Buffer.from('0102030405060708', 'hex') }] }]
  })).additionals[0]
  t.same(rrToString(opt), '. 32768 CLASS1232 OPT \\# 12 000a00080102030405060708')
  t.end()
})

function wireHex (rpacket, val) {
  const buf = rpacket.encode(val)
  return toHex(buf, 0, buf.length)
}

tape('name based records: minfo / afsdb / rt / kx / px / lp', function (t) {
  testEncoder(t, packet.minfo, { rmailbx: 'admin.example.com', emailbx: 'errors.example.com' })
  testEncoder(t, packet.afsdb, { subtype: 1, hostname: 'afsdb.example.com' })
  testEncoder(t, packet.rt, { preference: 10, host: 'relay.example.com' })
  testEncoder(t, packet.kx, { preference: 10, exchange: 'kx.example.com' })
  testEncoder(t, packet.px, { preference: 10, map822: 'map822.example.com', mapx400: 'mapx400.example.com' })
  testEncoder(t, packet.lp, { preference: 10, fqdn: 'l64-subnet.example.com' })
  t.end()
})

tape('cert / dhcid', function (t) {
  testEncoder(t, packet.cert, { certType: 1, keyTag: 12345, algorithm: 8, certificate: Buffer.from('0123456789', 'hex') })
  testEncoder(t, packet.dhcid, { data: Buffer.from('000101a0b1c2d3', 'hex') })
  t.end()
})

tape('apl', function (t) {
  // RFC 3123 section 4: 1:192.168.32.0/21 !1:192.168.38.0/28
  const items = [
    { family: 1, prefix: 21, negation: false, address: '192.168.32.0' },
    { family: 1, prefix: 28, negation: true, address: '192.168.38.0' }
  ]
  t.same(wireHex(packet.apl, items), '000e' + '00011503c0a820' + '00011c83c0a826')
  t.same(packet.apl.decode(packet.apl.encode(items)), items)
  testEncoder(t, packet.apl, [
    { family: 2, prefix: 32, negation: false, address: '2001:db8::' },
    { family: 1, prefix: 0, negation: false, address: '0.0.0.0' },
    { family: 3, prefix: 8, negation: false, data: Buffer.from([0xab]) }
  ])
  testEncoder(t, packet.apl, [])
  t.end()
})

tape('ipseckey', function (t) {
  const publicKey = Buffer.from('0102030405', 'hex')
  testEncoder(t, packet.ipseckey, { precedence: 10, gatewayType: 0, algorithm: 2, gateway: null, publicKey })
  testEncoder(t, packet.ipseckey, { precedence: 10, gatewayType: 1, algorithm: 2, gateway: '192.0.2.38', publicKey })
  testEncoder(t, packet.ipseckey, { precedence: 10, gatewayType: 2, algorithm: 2, gateway: '2001:db8::1', publicKey })
  testEncoder(t, packet.ipseckey, { precedence: 10, gatewayType: 3, algorithm: 2, gateway: 'gw.example.com', publicKey })
  testEncoder(t, packet.ipseckey, { precedence: 10, gatewayType: 1, algorithm: 0, gateway: '192.0.2.38', publicKey: Buffer.alloc(0) })
  t.end()
})

tape('hip', function (t) {
  const val = {
    algorithm: 2,
    hit: Buffer.from('200100107b1a74df365639cc39f1d578', 'hex'),
    publicKey: Buffer.from('0102030405060708', 'hex'),
    rendezvousServers: ['rvs1.example.com', 'rvs2.example.com']
  }
  testEncoder(t, packet.hip, val)
  t.same(packet.hip.decode(packet.hip.encode(val)).rendezvousServers, val.rendezvousServers)
  testEncoder(t, packet.hip, { ...val, rendezvousServers: [] })
  t.end()
})

tape('eui48 / eui64', function (t) {
  // RFC 7043 section 3.2 / 4.2
  t.same(wireHex(packet.eui48, '00-00-5e-00-53-2a'), '000600005e00532a')
  t.same(wireHex(packet.eui64, '00-00-5e-ef-10-00-00-2a'), '000800005eef1000002a')
  testEncoder(t, packet.eui48, '00-00-5e-00-53-2a')
  testEncoder(t, packet.eui64, '00-00-5e-ef-10-00-00-2a')
  t.throws(() => packet.eui48.encode('00-00-5e'), /6 octets/)
  t.end()
})

tape('nid / l32 / l64', function (t) {
  // RFC 6742 section 2
  t.same(wireHex(packet.nid, { preference: 10, nodeId: '0014:4fff:ff20:8b37' }), '000a' + '000a00144fffff208b37')
  testEncoder(t, packet.nid, { preference: 10, nodeId: '0014:4fff:ff20:8b37' })
  testEncoder(t, packet.l32, { preference: 10, locator: '10.1.2.0' })
  testEncoder(t, packet.l64, { preference: 10, locator: '2001:0db8:1414:1414' })
  t.end()
})

tape('amtrelay', function (t) {
  testEncoder(t, packet.amtrelay, { precedence: 0, discoveryOptional: false, relayType: 0, relay: null })
  testEncoder(t, packet.amtrelay, { precedence: 10, discoveryOptional: true, relayType: 1, relay: '203.0.113.15' })
  testEncoder(t, packet.amtrelay, { precedence: 10, discoveryOptional: false, relayType: 2, relay: '2001:db8::15' })
  testEncoder(t, packet.amtrelay, { precedence: 128, discoveryOptional: false, relayType: 3, relay: 'amtrelays.example.com' })
  t.same(wireHex(packet.amtrelay, { precedence: 10, discoveryOptional: true, relayType: 1, relay: '203.0.113.15' }), '00060a81cb00710f')
  t.end()
})

tape('dsync', function (t) {
  testEncoder(t, packet.dsync, { rrtype: 'CDS', scheme: 1, port: 5359, target: 'dsync.example.net' })
  t.same(packet.dsync.decode(packet.dsync.encode({ rrtype: 'CSYNC', scheme: 1, port: 53, target: '.' })).rrtype, 'CSYNC')
  t.end()
})

tape('tkey / tsig', function (t) {
  testEncoder(t, packet.tkey, {
    algorithm: 'gss-tsig',
    inception: 1761436800,
    expiration: 1761523200,
    mode: 3,
    error: 0,
    key: Buffer.from('00112233', 'hex'),
    other: Buffer.alloc(0)
  })
  const tsig = {
    algorithm: 'hmac-sha256',
    timeSigned: 0x123456789a, // needs more than 32 bits
    fudge: 300,
    mac: Buffer.alloc(32, 7),
    originalId: 0x1234,
    error: 18,
    other: Buffer.from('000000000001', 'hex')
  }
  testEncoder(t, packet.tsig, tsig)
  t.same(packet.tsig.decode(packet.tsig.encode(tsig)).timeSigned, 0x123456789a)
  t.end()
})

tape('medium priority types round trip through packet', function (t) {
  const answers = [
    { type: 'AFSDB', data: { subtype: 1, hostname: 'afsdb.example.com' } },
    { type: 'APL', data: [{ family: 1, prefix: 24, negation: false, address: '192.0.2.0' }] },
    { type: 'IPSECKEY', data: { precedence: 10, gatewayType: 3, algorithm: 2, gateway: 'gw.example.com', publicKey: Buffer.alloc(4, 1) } },
    { type: 'EUI48', data: '00-00-5e-00-53-2a' },
    { type: 'NSAP-PTR', data: 'nsap.example.com' },
    { type: 'MB', data: 'mb.example.com' },
    { type: 'TSIG', data: { algorithm: 'hmac-sha256', timeSigned: 1761436800, fudge: 300, mac: Buffer.alloc(32), originalId: 1, error: 0, other: Buffer.alloc(0) } }
  ].map(a => ({ name: 'example.com', ttl: 300, class: 'IN', flush: false, ...a }))
  const decoded = packet.decode(packet.encode({ type: 'response', answers }))
  t.same(decoded.answers.map(a => a.type), answers.map(a => a.type))
  t.same(decoded.answers.map(a => a.dataError), answers.map(() => undefined))
  t.ok(compare(t, answers, decoded.answers), 'decoded answers match')
  t.end()
})

tape('malformed medium priority rdata is kept as raw bytes', function (t) {
  const buf = Buffer.from(packet.encode({
    type: 'response',
    answers: [{ type: 'EUI48', name: 'x', data: '00-00-5e-00-53-2a' }]
  }))
  // Claim one more RDATA byte than EUI48 has, and append it
  const rdlength = 12 + 3 + 8
  buf.writeUInt16BE(7, rdlength)
  const decoded = packet.decode(Buffer.concat([buf, Buffer.from([0xff])]))
  t.ok(decoded.answers[0].data instanceof Uint8Array)
  t.same(decoded.answers[0].data.length, 7)
  t.match(decoded.answers[0].dataError, /length mismatch/)
  t.end()
})

tape('txt-like records: spf / avc / ninfo / resinfo / wallet', function (t) {
  for (const type of ['SPF', 'AVC', 'NINFO', 'RESINFO', 'WALLET']) {
    t.same(packet.enc(type), packet.txt, `${type} uses the TXT codec`)
  }
  t.end()
})

tape('sig / key / rkey', function (t) {
  t.same(packet.sig, packet.rrsig)
  testEncoder(t, packet.key, { flags: 256, protocol: 3, algorithm: 8, key: Buffer.from('0102030405', 'hex') })
  // KEY / RKEY may use protocols other than 3, unlike DNSKEY
  testEncoder(t, packet.rkey, { flags: 0, protocol: 1, algorithm: 8, key: Buffer.from('0102', 'hex') })
  t.end()
})

tape('talink', function (t) {
  testEncoder(t, packet.talink, { previous: 'prev.example.com', next: 'next.example.com' })
  t.end()
})

tape('wks', function (t) {
  const val = { address: '192.0.2.1', protocol: 6, ports: [25, 80] }
  t.same(wireHex(packet.wks, val), '0010' + 'c0000201' + '06' + '0000004000000000000080')
  t.same(packet.wks.decode(packet.wks.encode(val)), val)
  testEncoder(t, packet.wks, { address: '192.0.2.1', protocol: 17, ports: [] })
  t.end()
})

tape('x25 / isdn', function (t) {
  testEncoder(t, packet.x25, '311061700956')
  testEncoder(t, packet.isdn, { address: '150862028003217', subaddress: '004' })
  testEncoder(t, packet.isdn, { address: '150862028003217' })
  t.same(packet.isdn.decode(packet.isdn.encode({ address: '1' })), { address: '1' })
  t.end()
})

tape('nsap / gpos', function (t) {
  testEncoder(t, packet.nsap, { address: Buffer.from('47000580005a0000000001e133ffffff00016100', 'hex') })
  testEncoder(t, packet.gpos, { longitude: '-32.6882', latitude: '116.8652', altitude: '10.0' })
  t.end()
})

tape('a6', function (t) {
  // RFC 2874 examples
  testEncoder(t, packet.a6, { prefixLength: 0, suffix: '2345:c1:ca11:1:1234:5678:9abc:def0' })
  const val = { prefixLength: 64, suffix: '::1:2:3:4', prefixName: 'prefix.example.com' }
  t.same(wireHex(packet.a6, val).slice(0, 2 * 11), '001d' + '40' + '0001000200030004')
  t.same(packet.a6.decode(packet.a6.encode(val)), val)
  t.same(packet.a6.decode(packet.a6.encode({ prefixLength: 128, suffix: '::', prefixName: 'p.example' })),
    { prefixLength: 128, suffix: '::', prefixName: 'p.example' })
  t.end()
})

tape('nxt', function (t) {
  // RFC 2535 section 5.2: big.foo.tld. NXT medium.foo.tld. A MX SIG NXT
  const val = { nextDomain: 'medium.foo.tld', rrtypes: ['A', 'MX', 'SIG', 'NXT'] }
  const hex = wireHex(packet.nxt, val)
  t.same(hex.slice(-8), '40010082')
  t.same(packet.nxt.decode(packet.nxt.encode(val)), val)
  t.end()
})

tape('atma', function (t) {
  testEncoder(t, packet.atma, { format: 0, address: '47000580ffde0000000000000000000000000001' })
  testEncoder(t, packet.atma, { format: 1, address: '15551234567' })
  t.same(wireHex(packet.atma, { format: 1, address: '123' }), '000401313233')
  t.end()
})

tape('doa / sink / opaque records', function (t) {
  testEncoder(t, packet.doa, { enterprise: 0, type: 1, location: 2, mediaType: 'image/gif', data: Buffer.from('47494638', 'hex') })
  testEncoder(t, packet.sink, { coding: 1, subcoding: 0, data: Buffer.from('0102', 'hex') })
  for (const codec of [packet.eid, packet.nimloc, packet.hhit, packet.brid]) {
    testEncoder(t, codec, { data: Buffer.from('0123456789', 'hex') })
  }
  t.end()
})

tape('low priority types round trip through packet', function (t) {
  const answers = [
    { type: 'SPF', data: [Buffer.from('v=spf1 -all')] },
    { type: 'KEY', data: { flags: 256, protocol: 3, algorithm: 8, key: Buffer.alloc(4, 1) } },
    { type: 'WKS', data: { address: '192.0.2.1', protocol: 6, ports: [25] } },
    { type: 'ISDN', data: { address: '150862028003217', subaddress: '004' } },
    { type: 'A6', data: { prefixLength: 64, suffix: '::1:2:3:4', prefixName: 'prefix.example.com' } },
    { type: 'NXT', data: { nextDomain: 'next.example.com', rrtypes: ['A', 'SIG', 'NXT'] } },
    { type: 'ATMA', data: { format: 1, address: '15551234567' } },
    { type: 'HHIT', data: { data: Buffer.alloc(8, 2) } }
  ].map(a => ({ name: 'example.com', ttl: 300, class: 'IN', flush: false, ...a }))
  const decoded = packet.decode(packet.encode({ type: 'response', answers }))
  t.same(decoded.answers.map(a => a.type), answers.map(a => a.type))
  t.same(decoded.answers.map(a => a.dataError), answers.map(() => undefined))
  t.ok(compare(t, answers, decoded.answers), 'decoded answers match')
  t.end()
})

function testEncoder (t, rpacket, val) {
  const buf = rpacket.encode(val)
  const val2 = rpacket.decode(buf)

  t.same(buf.length, rpacket.encode.bytes, 'encode.bytes was set correctly')
  t.same(buf.length, rpacket.encodingLength(val), 'encoding length matches')
  t.ok(compare(t, val, val2), 'decoded object match')

  const buf2 = rpacket.encode(val2)
  const val3 = rpacket.decode(buf2)

  t.same(buf2.length, rpacket.encode.bytes, 'encode.bytes was set correctly on re-encode')
  t.same(buf2.length, rpacket.encodingLength(val), 'encoding length matches on re-encode')

  t.ok(compare(t, val, val3), 'decoded object match on re-encode')
  t.ok(compare(t, val2, val3), 're-encoded decoded object match on re-encode')

  const bigger = Buffer.allocUnsafe(buf2.length + 10)

  const buf3 = rpacket.encode(val, bigger, 10)
  const val4 = rpacket.decode(buf3, 10)

  t.ok(buf3 === bigger, 'echoes buffer on external buffer')
  t.same(rpacket.encode.bytes, buf.length, 'encode.bytes is the same on external buffer')
  t.ok(compare(t, val, val4), 'decoded object match on external buffer')
}

function compare (t, a, b) {
  if (a instanceof Uint8Array) return toHex(a, 0, a.length) === toHex(b, 0, b.length)
  if (typeof a === 'object' && a && b) {
    const keys = Object.keys(a)
    for (let i = 0; i < keys.length; i++) {
      if (!compare(t, a[keys[i]], b[keys[i]])) {
        return false
      }
    }
  } else if (Array.isArray(b) && !Array.isArray(a)) {
    // TXT always decode as array
    return a.toString() === b[0].toString()
  } else {
    return a === b
  }
  return true
}
