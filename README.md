# @noelminamino/dns-packet
[![](https://img.shields.io/npm/v/@noelminamino/dns-packet.svg?style=flat)](https://www.npmjs.org/package/@noelminamino/dns-packet) [![](https://img.shields.io/npm/dm/@noelminamino/dns-packet.svg)](https://www.npmjs.org/package/@noelminamino/dns-packet) [![Tests](https://github.com/NoelMinamino/dns-packet/actions/workflows/test.yml/badge.svg)](https://github.com/NoelMinamino/dns-packet/actions/workflows/test.yml)

An [abstract-encoding](https://github.com/mafintosh/abstract-encoding) compliant module for encoding / decoding DNS packets. Lifted out of [multicast-dns](https://github.com/mafintosh/multicast-dns) as a separate module.

**This is a fork** of [dns-packet][] that comes with typescript types, javascript modules and does
not use Node.js primitives. Works well in browsers/react-native.

[dns-packet]: https://github.com/mafintosh/dns-packet

> **@noelminamino/dns-packet** は [@dnsquery/dns-packet](https://github.com/dnsquery/dns-packet) の fork です。
> [ldns.jp](https://ldns.jp/) のために、IANA の全 RR タイプのデコードとゾーンファイル形式の出力に対応しています。
>
> ```js
> import * as dnsPacket from "https://esm.sh/@noelminamino/dns-packet@7.0.0"
> ```
>
> 6.x からの移行: [English](migrate_from_6.x.md) / [日本語](migrate_from_6.x.ja.md)

```
npm install @noelminamino/dns-packet
```

## UDP Usage

``` js
import * as dnsPacket from '@noelminamino/dns-packet'
import dgram from 'dgram'

const socket = dgram.createSocket('udp4')

const buf = dnsPacket.encode({
  type: 'query',
  id: 1,
  flags: dnsPacket.RECURSION_DESIRED,
  questions: [{
    type: 'A',
    name: 'google.com'
  }]
})

socket.on('message', message => {
  console.log(dnsPacket.decode(message)) // prints out a response from google dns
})

socket.send(buf, 0, buf.length, 53, '8.8.8.8')
```

Also see [the UDP example](examples/udp.js).

## TCP, TLS, HTTPS

While DNS has traditionally been used over a datagram transport, it is increasingly being carried over TCP for larger responses commonly including DNSSEC responses and TLS or HTTPS for enhanced security. See below examples on how to use `dns-packet` to wrap DNS packets in these protocols:

- [TCP](examples/tcp.js)
- [DNS over TLS](examples/tls.js)
- [DNS over HTTPS](examples/doh.js)

## API

#### `var buf = packets.encode(packet, [buf], [offset])`

Encodes a DNS packet into a buffer containing a UDP payload.

#### `var packet = packets.decode(buf, [offset])`

Decode a DNS packet from a buffer containing a UDP payload.

#### `var buf = packets.streamEncode(packet, [buf], [offset])`

Encodes a DNS packet into a buffer containing a TCP payload.

#### `var packet = packets.streamDecode(buf, [offset])`

Decode a DNS packet from a buffer containing a TCP payload.

#### `var len = packets.encodingLength(packet)`

Returns how many bytes are needed to encode the DNS packet

## Packets

Packets look like this

``` js
{
  type: 'query|response',
  id: optionalIdNumber,
  flags: optionalBitFlags,
  questions: [...],
  answers: [...],
  additionals: [...],
  authorities: [...]
}
```

The bit flags available are

``` js
import {
  RECURSION_DESIRED,
  RECURSION_AVAILABLE,
  TRUNCATED_RESPONSE,
  AUTHORITATIVE_ANSWER,
  AUTHENTIC_DATA,
  CHECKING_DISABLED
} from '@noelminamino/dns-packet'
```

To use more than one flag bitwise-or them together

``` js
var flags = packet.RECURSION_DESIRED | packet.RECURSION_AVAILABLE
```

And to check for a flag use bitwise-and

``` js
var isRecursive = message.flags & packet.RECURSION_DESIRED
```

A question looks like this

``` js
{
  type: 'A', // or SRV, AAAA, etc
  class: 'IN', // one of IN, CS, CH, HS, ANY. Default: IN
  name: 'google.com' // which record are you looking for
}
```

And an answer, additional, or authority looks like this

``` js
{
  type: 'A', // or SRV, AAAA, etc
  class: 'IN', // one of IN, CS, CH, HS
  name: 'google.com', // which name is this record for
  ttl: optionalTimeToLiveInSeconds,
  (record specific data, see below)
}
```

## Presentation format

`rdataToString` and `rrToString` write a decoded record in presentation (zone file) format,
following RFC 1035 and the RFC of each record type.

``` js
import { decode, rdataToString, rrToString } from '@noelminamino/dns-packet'

const answer = decode(buf).answers[0]
rdataToString(answer) // '10 mail.example.com.'
rrToString(answer) // 'example.com. 300 IN MX 10 mail.example.com.'
```

Options:

- `trailingDot` (default `true`): write domain names inside RDATA as absolute names ending with `.`
- `utf8` (default `false`): keep valid UTF-8 text in quoted strings instead of `\DDD` escapes

Records without a known format, and records whose RDATA could not be decoded (see
[Malformed RDATA](#malformed-rdata)), are written in the RFC 3597 form `\# <length> <hex>`.
`OPT` is written that way too, with the UDP payload size as `CLASS<n>`.

## Supported record types

#### `A`

``` js
{
  data: 'IPv4 address' // fx 127.0.0.1
}
```

#### `AAAA`

``` js
{
  data: 'IPv6 address' // fx fe80::1
}
```

#### `CAA`

``` js
{
  flags: 128, // octet
  tag: 'issue|issuewild|iodef',
  value: 'ca.example.net',
  issuerCritical: false
}
```

#### `CNAME`

``` js
{
  data: 'cname.to.another.record'
}
```

#### `DNAME`

``` js
{
  data: 'dname.to.another.record'
}
```

#### `DNSKEY` / `CDNSKEY`

``` js
{
  flags: 257, // 16 bits
  algorithm: 1, // octet
  key: Buffer
}
```

#### `DS` / `CDS` / `TA` / `DLV`

``` js
{
  keyTag: 12345,
  algorithm: 8,
  digestType: 1,
  digest: Buffer
}
```

#### `HINFO`

``` js
{
  data: {
    cpu: 'cpu info',
    os: 'os info'
  }
}
```

#### `MX`

``` js
{
  preference: 10,
  exchange: 'mail.example.net'
}
```

#### `NS`

``` js
{
  data: nameServer
}
```

#### `NSEC`

``` js
{
  nextDomain: 'a.domain',
  rrtypes: ['A', 'TXT', 'RRSIG']
}
```

#### `NSEC3`

``` js
{
  algorithm: 1,
  flags: 0,
  iterations: 2,
  salt: Buffer,
  nextDomain: Buffer, // Hashed per RFC5155
  rrtypes: ['A', 'TXT', 'RRSIG']
}
```

#### `NULL`

``` js
{
  data: Buffer('any binary data')
}
```

#### `OPT`

[EDNS0](https://tools.ietf.org/html/rfc6891) options.

``` js
{
  type: 'OPT',
  name: '.',
  udpPayloadSize: 4096,
  flags: packet.DNSSEC_OK,
  options: [{
    // pass in any code/data for generic EDNS0 options
    code: 12,
    data: Buffer.alloc(31)
  }, {
    // Several EDNS0 options have enhanced support
    code: 'PADDING',
    length: 31,
  }, {
    code: 'CLIENT_SUBNET',
    family: 2, // 1 for IPv4, 2 for IPv6
    sourcePrefixLength: 64, // used to truncate IP address
    scopePrefixLength: 0,
    ip: 'fe80::',
  }, {
    code: 'TCP_KEEPALIVE',
    timeout: 150 // increments of 100ms.  This means 15s.
  }, {
    code: 'KEY_TAG',
    tags: [1, 2, 3],
  }]
}
```

The options `PADDING`, `CLIENT_SUBNET`, `TCP_KEEPALIVE` and `KEY_TAG` support enhanced de/encoding. See [optionscodes.js](https://github.com/mafintosh/dns-packet/blob/master/optioncodes.js) for all supported option codes. If the `data` property is present on a option, it takes precedence. On decoding, `data` will always be defined.

#### `PTR`

``` js
{
  data: 'points.to.another.record'
}
```

#### `RP`

``` js
{
  mbox: 'admin.example.com',
  txt: 'txt.example.com'
}
```

#### `SSHFP`

``` js
{
  algorithm: 1,
  hash: 1,
  fingerprint: 'A108C9F834354D5B37AF988141C9294822F5BC00'
}
````

#### `RRSIG`

``` js
{
  typeCovered: 'A',
  algorithm: 8,
  labels: 1,
  originalTTL: 3600,
  expiration: timestamp,
  inception: timestamp,
  keyTag: 12345,
  signersName: 'a.name',
  signature: Buffer
}
```

#### `SOA`

``` js
{
  data:
    {
      mname: domainName,
      rname: mailbox,
      serial: zoneSerial,
      refresh: refreshInterval,
      retry: retryInterval,
      expire: expireInterval,
      minimum: minimumTTL
    }
}
```

#### `SRV`

``` js
{
  data: {
    port: servicePort,
    target: serviceHostName,
    priority: optionalServicePriority,
    weight: optionalServiceWeight
  }
}
```

#### `TXT`

``` js
{
  data: 'text' || Buffer || [ Buffer || 'text' ]
}
```

When encoding, scalar values are converted to an array and strings are converted to UTF-8 encoded Buffers. When decoding, the return value will always be an array of Buffer.

`SPF`, `AVC`, `NINFO`, `RESINFO` and `WALLET` use the same format as `TXT`.

#### `A6`

``` js
{
  prefixLength: 64,
  suffix: '::1:2:3:4', // IPv6 address whose first prefixLength bits are zero
  prefixName: 'prefix.example.com' // omitted when prefixLength is 0
}
```

#### `ATMA`

``` js
{ format: 0, address: '47000580ffde0000000000000000000000000001' } // AESA, hex
{ format: 1, address: '15551234567' } // E.164, digits
```

#### `DOA` / `SINK`

``` js
{ enterprise: 0, type: 1, location: 2, mediaType: 'image/gif', data: Buffer } // DOA
{ coding: 1, subcoding: 0, data: Buffer } // SINK
```

#### `EID` / `NIMLOC` / `HHIT` / `BRID`

Kept opaque.

``` js
{
  data: Buffer
}
```

#### `GPOS`

``` js
{
  longitude: '-32.6882',
  latitude: '116.8652',
  altitude: '10.0'
}
```

#### `KEY` / `RKEY` / `SIG`

`KEY` and `RKEY` look like `DNSKEY`, but `protocol` may be any value. `SIG` uses the `RRSIG` format.

``` js
{
  flags: 256,
  protocol: 3,
  algorithm: 8,
  key: Buffer
}
```

#### `NSAP`

``` js
{
  address: Buffer
}
```

#### `NXT`

``` js
{
  nextDomain: 'medium.foo.tld',
  rrtypes: ['A', 'MX', 'SIG', 'NXT']
}
```

#### `TALINK`

``` js
{
  previous: 'prev.example.com',
  next: 'next.example.com'
}
```

#### `WKS`

``` js
{
  address: '192.0.2.1',
  protocol: 6,
  ports: [25, 80]
}
```

#### `X25` / `ISDN`

``` js
'311061700956' // X25
{ address: '150862028003217', subaddress: '004' } // ISDN, subaddress is optional
```

#### `AFSDB` / `RT` / `KX` / `PX` / `LP`

``` js
{ subtype: 1, hostname: 'afsdb.example.com' } // AFSDB
{ preference: 10, host: 'relay.example.com' } // RT
{ preference: 10, exchange: 'kx.example.com' } // KX (same as MX)
{ preference: 10, map822: 'map822.example.com', mapx400: 'mapx400.example.com' } // PX
{ preference: 10, fqdn: 'l64-subnet.example.com' } // LP
```

#### `MD` / `MF` / `MB` / `MG` / `MR` / `NSAP-PTR` / `MINFO`

`MD`, `MF`, `MB`, `MG`, `MR` and `NSAP-PTR` hold a domain name string like `PTR`.

``` js
{ rmailbx: 'admin.example.com', emailbx: 'errors.example.com' } // MINFO
```

#### `AMTRELAY`

``` js
{
  precedence: 10,
  discoveryOptional: true,
  relayType: 1, // 0: none, 1: IPv4, 2: IPv6, 3: domain name
  relay: '203.0.113.15' // null when relayType is 0
}
```

#### `APL`

``` js
[
  { family: 1, prefix: 21, negation: false, address: '192.168.32.0' },
  { family: 2, prefix: 32, negation: true, address: '2001:db8::' },
  { family: 3, prefix: 8, negation: false, data: Buffer } // other families keep the raw AFDPART
]
```

#### `CERT`

``` js
{
  certType: 1,
  keyTag: 12345,
  algorithm: 8,
  certificate: Buffer
}
```

#### `DHCID`

``` js
{
  data: Buffer // the whole RDATA, opaque (RFC 4701)
}
```

#### `DSYNC`

``` js
{
  rrtype: 'CDS',
  scheme: 1,
  port: 5359,
  target: 'dsync.example.net'
}
```

#### `EUI48` / `EUI64`

``` js
{
  data: '00-00-5e-00-53-2a' // EUI64: '00-00-5e-ef-10-00-00-2a'
}
```

#### `HIP`

``` js
{
  algorithm: 2,
  hit: Buffer,
  publicKey: Buffer,
  rendezvousServers: ['rvs.example.com']
}
```

#### `IPSECKEY`

``` js
{
  precedence: 10,
  gatewayType: 3, // 0: none, 1: IPv4, 2: IPv6, 3: domain name
  algorithm: 2,
  gateway: 'gw.example.com', // null when gatewayType is 0
  publicKey: Buffer
}
```

#### `NID` / `L32` / `L64`

``` js
{ preference: 10, nodeId: '0014:4fff:ff20:8b37' } // NID
{ preference: 10, locator: '10.1.2.0' } // L32
{ preference: 10, locator: '2001:0db8:1414:1414' } // L64
```

#### `TKEY` / `TSIG`

``` js
{ algorithm: 'gss-tsig', inception: 1761436800, expiration: 1761523200, mode: 3, error: 0, key: Buffer, other: Buffer } // TKEY
{ algorithm: 'hmac-sha256', timeSigned: 1761436800, fudge: 300, mac: Buffer, originalId: 4660, error: 0, other: Buffer } // TSIG
```

#### `CSYNC`

``` js
{
  serial: 66,
  flags: 3,
  rrtypes: ['A', 'NS', 'AAAA']
}
```

#### `LOC`

Values are kept as on the wire (RFC 1876). This is `42 21 54.000 N 71 6 18.000 W -24.00m 30.00m 10000.00m 10.00m`:

``` js
{
  version: 0,
  size: 0x33, // mantissa (high nibble) and power of ten (low nibble), in cm
  horizontalPrecision: 0x16,
  verticalPrecision: 0x13,
  latitude: 0x89172dd0, // thousandths of an arc second, 2^31 is the equator
  longitude: 0x70be15f0, // thousandths of an arc second, 2^31 is the prime meridian
  altitude: 0x00988d20 // cm, 10000000 is sea level
}
```

#### `NAPTR`

``` js
{
  order: 100,
  preference: 10,
  flags: 's',
  services: 'SIP+D2U',
  regexp: '!^.*$!sip:customer-service@example.com!',
  replacement: '_sip._udp.example.com'
}
```

#### `NSEC3PARAM`

``` js
{
  algorithm: 1,
  flags: 0,
  iterations: 0,
  salt: Buffer
}
```

#### `OPENPGPKEY`

``` js
{
  key: Buffer
}
```

#### `SVCB` / `HTTPS`

`params` is keyed by SvcParamKey name. Keys are written in increasing key order when encoding.
Keys without a known format are named `keyNNNNN` and hold the raw value.

``` js
{
  priority: 1,
  targetName: '.',
  params: {
    mandatory: ['alpn'],
    alpn: ['h2', 'h3'],
    'no-default-alpn': true,
    port: 443,
    ipv4hint: ['192.0.2.1'],
    ech: Buffer,
    ipv6hint: ['2001:db8::1'],
    dohpath: '/dns-query{?dns}',
    ohttp: true,
    key65000: Buffer
  }
}
```

#### `TLSA` / `SMIMEA`

``` js
{
  usage: 3,
  selector: 1,
  matchingType: 1,
  certificate: Buffer
}
```

#### `URI`

``` js
{
  priority: 10,
  weight: 1,
  target: 'https://www.example.com/'
}
```

#### `ZONEMD`

``` js
{
  serial: 2018031900,
  scheme: 1,
  algorithm: 1,
  digest: Buffer
}
```

### Malformed RDATA

When the RDATA of a known record type cannot be decoded, the record is still returned with the
raw RDATA bytes in `data` and the reason in `dataError`, and the rest of the packet keeps decoding.

Other record types are decoded as a raw `Buffer`. Their type is `UNKNOWN_<number>` when not
registered with IANA; `types.toType()` also accepts the RFC 3597 form `TYPE<number>`.

If you need another record type, open an issue and we'll try to add it.

## License

MIT
