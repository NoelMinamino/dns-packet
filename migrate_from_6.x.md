# Migrating from dns-packet 6.x to @noelminamino/dns-packet 7

[日本語](migrate_from_6.x.ja.md)

This guide is for code that uses `@leichtgewicht/dns-packet` 6.0.x or `@dnsquery/dns-packet` 6.1.x.
The API (`encode`, `decode`, the packet layout, flags, `streamEncode` / `streamDecode`) is the same.
What changes is **how the RDATA of many record types is returned**, and a few things around it.

## At a glance

| | You need to change it if… |
| --- | --- |
| [Package name / URL](#1-package-name-and-import) | always |
| [Records decoded into objects](#2-more-record-types-are-decoded-into-objects) | you read `rr.data` bytes of SVCB/HTTPS, TLSA, NAPTR, CDS, LOC, … yourself |
| [Type names](#3-every-iana-type-has-a-name) | you branch on an `UNKNOWN_` string, such as `rr.type === 'UNKNOWN_65'` or `startsWith('UNKNOWN_')` (a table that only renames types keeps working) |
| [Malformed RDATA](#4-malformed-rdata-no-longer-breaks-the-whole-packet) | you rely on `decode()` throwing for one bad record |
| [EDNS option names](#5-edns-options-have-names-and-fields-710) | you compare an option's `type` with `'OPTION_15'` … `'OPTION_26'` (checking `code` keeps working) |
| [Escaped names, code names](#6-escaped-names-new-code-names-and-helpers-710) | you handle names with unusual bytes, or compare `'OPCODE_6'` / `'RCODE_11'` |
| [Node.js 22+](#7-nodejs-22-or-later) | you run it on Node.js older than 22 |
| [Presentation format](#8-new-zone-file-text-for-any-record) | never (optional, but it can replace your own formatter) |

## 1. Package name and import

```js
// before
import * as dnsPacket from '@leichtgewicht/dns-packet'          // or '@dnsquery/dns-packet'
import * as dnsPacket from 'https://esm.sh/@leichtgewicht/dns-packet'

// after
import * as dnsPacket from '@noelminamino/dns-packet'
import * as dnsPacket from 'https://esm.sh/@noelminamino/dns-packet@7.1.0'   // pin the version
```

`npm install @noelminamino/dns-packet`. CommonJS (`require`) still works. Sub-paths are the same
(`@noelminamino/dns-packet/types.js`, `…/rcodes.js`, …), plus the new `…/presentation.js`.

## 2. More record types are decoded into objects

In 6.x only about 20 types were decoded; every other type came back as the raw RDATA (`Uint8Array`).
In 7, every IANA type that has a defined RDATA format is decoded. If you parsed those bytes yourself,
read the fields instead (or skip parsing entirely and use [`rdataToString`](#8-new-zone-file-text-for-any-record)).

```js
// before: HTTPS was type "UNKNOWN_65" and data was the raw RDATA
const view = new DataView(rr.data.buffer, rr.data.byteOffset)
const priority = view.getUint16(0)
// … 100 lines of SvcParam parsing …

// after
rr.type   // 'HTTPS'
rr.data   // { priority: 1, targetName: '.', params: { alpn: ['h2', 'h3'], ipv4hint: ['192.0.2.1'] } }
```

Types that are now objects (field names follow the RFCs; see the [README](README.md#supported-record-types) for each):

| Types | `data` in 7 |
| --- | --- |
| SVCB, HTTPS | `{ priority, targetName, params: { mandatory, alpn, 'no-default-alpn', port, ipv4hint, ech, ipv6hint, dohpath, ohttp, keyNNNNN } }` |
| TLSA, SMIMEA | `{ usage, selector, matchingType, certificate }` |
| NAPTR | `{ order, preference, flags, services, regexp, replacement }` |
| CDS, TA, DLV / CDNSKEY | same as DS `{ keyTag, algorithm, digestType, digest }` / DNSKEY `{ flags, algorithm, key }` |
| KEY, RKEY / SIG | `{ flags, protocol, algorithm, key }` / same as RRSIG |
| SSHFP | `{ algorithm, hash, fingerprint }` (6.0.x: raw bytes) |
| LOC | `{ version, size, horizontalPrecision, verticalPrecision, latitude, longitude, altitude }` (wire values) |
| URI | `{ priority, weight, target }` |
| NSEC3PARAM, ZONEMD, CSYNC | `{ algorithm, flags, iterations, salt }`, `{ serial, scheme, algorithm, digest }`, `{ serial, flags, rrtypes }` |
| OPENPGPKEY, DHCID | `{ key }`, `{ data }` |
| CERT, APL, IPSECKEY, HIP, AMTRELAY | `{ certType, keyTag, algorithm, certificate }`, `[{ family, prefix, negation, address }]`, `{ precedence, gatewayType, algorithm, gateway, publicKey }`, `{ algorithm, hit, publicKey, rendezvousServers }`, `{ precedence, discoveryOptional, relayType, relay }` |
| AFSDB, RT, KX, PX, LP, MINFO, TALINK | names with a preference/subtype, e.g. KX `{ preference, exchange }` |
| MD, MF, MB, MG, MR, NSAP-PTR | a name string, like PTR |
| EUI48, EUI64 / X25 | a string: `'00-00-5e-00-53-2a'` / `'311061700956'` |
| NID, L32, L64, DSYNC | `{ preference, nodeId }`, `{ preference, locator }`, `{ preference, locator }`, `{ rrtype, scheme, port, target }` |
| TKEY, TSIG | every field, e.g. TSIG `{ algorithm, timeSigned, fudge, mac, originalId, error, other }` |
| WKS, ISDN, NSAP, GPOS, A6, NXT, ATMA, DOA, SINK | structured (see README) |
| SPF, AVC, NINFO, RESINFO, WALLET | an array of `Uint8Array` strings, like TXT |
| EID, NIMLOC, HHIT, BRID | `{ data }` (kept opaque) |

Encoding takes the same shapes, so `encode()` now works for these types too.

## 3. Every IANA type has a name

6.x named only 44 types; the rest were `'UNKNOWN_<number>'` — including SVCB (`UNKNOWN_64`),
HTTPS (`UNKNOWN_65`), SMIMEA, OPENPGPKEY, CSYNC, ZONEMD, URI, EUI48 … Worse, `toType('HTTPS')`
returned `0`, so `encode({ questions: [{ type: 'HTTPS', … }] })` sent a query for type 0.

In 7, `rr.type` is `'HTTPS'` from the start. Whether your code needs a change depends on how it uses the name:

| Code written for 6.x | Result in 7 | Change needed? |
| --- | --- | --- |
| `TYPE_ALIAS[rr.type] \|\| rr.type` (a table that renames types) | `'HTTPS'` | **No.** The lookup misses and `rr.type` is used as is. The table is now unused; removing it is optional |
| `rr.type === 'UNKNOWN_65'` | `false` | **Yes.** Compare with `'HTTPS'` |
| `rr.type.startsWith('UNKNOWN_')` to parse raw bytes of unknown types | `false` | **Yes.** Registered types no longer take that branch, and their `data` is [an object](#2-more-record-types-are-decoded-into-objects) |

```js
// needs a change: branching on an UNKNOWN_ string
if (rr.type === 'UNKNOWN_65') showHttpsPanel(rr)   // never matches in 7

// after
if (rr.type === 'HTTPS') showHttpsPanel(rr)
```

To convert between names and numbers, use `types.js`:

```js
import * as types from '@noelminamino/dns-packet/types.js'
types.toString(65)                            // 'HTTPS'
types.toType('HTTPS')                         // 65
types.toType('TYPE65280')                     // 65280 (RFC 3597 form is accepted)
```

Only numbers that IANA has not assigned are still `'UNKNOWN_<number>'`.

## 4. Malformed RDATA no longer breaks the whole packet

In 6.x one bad record (for example a DNSKEY with protocol ≠ 3, or an SSHFP with an unknown hash type
in 6.1.x) made `decode()` throw, and you got nothing. In 7 that record keeps its raw RDATA and the
reason, and the rest of the packet decodes normally.

```js
const packet = dnsPacket.decode(buf)        // no longer throws for a bad RDATA
for (const rr of packet.answers) {
  if (rr.dataError) {
    console.warn(rr.type, rr.dataError)     // e.g. 'SVCB: SvcParamKeys must be in strictly increasing order'
    // rr.data is the raw RDATA (Uint8Array)
  }
}
```

`decode()` still throws when the packet structure itself is broken (truncated header, bad name, …).

## 5. EDNS options have names and fields (7.1.0)

Every EDNS option registered with IANA now has a name in `type`. In 6.x and 7.0, the codes from 15 up
were `'OPTION_<code>'`. Several options also get their contents as fields, next to `data`.

| `code` | `type` in 6.x / 7.0 | `type` in 7.1 | New fields |
| --- | --- | --- | --- |
| 15 | `OPTION_15` | `EDE` | `infoCode`, `extraText` |
| 16, 17 | `OPTION_16`, `OPTION_17` | `CLIENT_TAG`, `SERVER_TAG` | `tag` |
| 18 | `OPTION_18` | `REPORT_CHANNEL` | `agentDomain` |
| 19 | `OPTION_19` | `ZONEVERSION` | `labelCount`, `versionType`, `version`, `serial` |
| 20, 21 | `OPTION_20`, `OPTION_21` | `MQTYPE_QUERY`, `MQTYPE_RESPONSE` | `qtypes` |
| 22–26 | `OPTION_22` … | `EDE_EXTRA_TEXT_LANGUAGE` … `STRUCTURED_DNS_ERROR` | — |
| 5–7, 9, 10, 13 | (already named) | unchanged | `algorithms`, `expire`, `clientCookie` / `serverCookie`, `closestTrustPoint` |

`code` and `data` are unchanged, so code that tells options apart by `code` and reads `data` keeps
working. Only a comparison with an `OPTION_` string stops matching:

```js
// needs a change
if (option.type === 'OPTION_15') { /* EDE */ }

// keeps working (and now the fields are there too)
if (option.code === 15) {
  option.infoCode     // 18
  option.extraText    // 'blocked by policy'
}
```

Unusual option contents are handled as before: an unassigned EDE `infoCode` is returned like any other,
and an option whose data is too short or has a bad length keeps only `code`, `type` and `data`
without throwing.

## 6. Escaped names, new code names and helpers (7.1.0)

**Names.** Domain names are now strings in master-file form (RFC 1035 section 5.1). Ordinary names are
unchanged; only labels with unusual bytes look different, and they no longer lose their label boundaries:

| Labels on the wire | 6.x / 7.0 | 7.1 |
| --- | --- | --- |
| `a.b` (one label with a dot), `example` | `'a.b.example'` (looks like 3 labels) | `'a\\.b.example'` |
| NUL byte, `example`, `com` (NSEC "black lies") | `'\u0000.example.com'` | `'\\000.example.com'` |
| space, backslash, bytes that are not UTF-8 | raw characters | `\032`, `\\`, `\DDD` (as written in the name) |

`encode()` reads the same escapes, so decoded names encode back to the same bytes. If you un-escaped
NUL bytes yourself (for example `name.replace(/\u0000/g, '\\000')`), that is no longer needed.

**Code names.** Like the EDNS options, numbers that now have IANA names change from the generic form:
OPCODE 6 `'OPCODE_6'` → `'DSO'`, RCODE 11 `'RCODE_11'` → `'DSOTYPENI'`, and class 254 `'UNKNOWN_254'` → `'NONE'`.
Compare numbers, or the new names.

**New, nothing to change:** `keyTag(dnskey)` computes the key tag used by DS and RRSIG;
`decode(buf, 0, { partial: true })` returns the records decoded before a broken one, with `packet.error`;
`packet.fullRcode` includes the EDNS upper bits (`'BADCOOKIE'`, …), while `rcode` stays the header value.

## 7. Node.js 22 or later

`engines` is now `>=22` (6.x said `>=6`). Browsers and esm.sh are not affected.

## 8. New: zone-file text for any record

If you wrote your own "RDATA to text" function, `rdataToString` / `rrToString` can replace it.

```js
import { decode, rdataToString, rrToString } from '@noelminamino/dns-packet'

const rr = decode(buf).answers[0]
rrToString(rr)        // 'example.com. 300 IN HTTPS 1 . alpn="h2,h3" ipv4hint=192.0.2.1'
rdataToString(rr)     // '1 . alpn="h2,h3" ipv4hint=192.0.2.1'
```

| Option | Default | Effect |
| --- | --- | --- |
| `trailingDot` | `true` | names in RDATA end with `.` (`mail.example.com.`) |
| `utf8` | `false` | show UTF-8 text as is (`"日本語"`) instead of `"\230\151\165…"` |

Records without a known format, and records with `dataError`, are written as `\# <length> <hex>` (RFC 3597).

## What you do not need to change

- `encode` / `decode` / `encodingLength` / `streamEncode` / `streamDecode` / `query` / `response` and the
  packet layout (`id`, `flags`, `questions`, `answers`, `authorities`, `additionals`).
- `data` of the types 6.x already decoded: A, AAAA, NS, CNAME, DNAME, PTR, MX, SOA, SRV, TXT, NULL,
  HINFO, CAA, RP, DNSKEY, RRSIG, NSEC, NSEC3, DS, OPT (and SSHFP from 6.1.x).
- Unregistered types: `type` is `'UNKNOWN_<n>'` and `data` is a `Uint8Array`, as before.
- `rcodes`, `opcodes`, `classes`; `optioncodes` except the new names for codes 15 and up.
- EDNS options: `code` and `data`, and the fields of `CLIENT_SUBNET`, `TCP_KEEPALIVE`, `PADDING`, `KEY_TAG`.

## Example: ldns.jp

[ldns.jp](https://ldns.jp/) moved three pages from `@leichtgewicht/dns-packet` 6.0.3 to 7.0.0. Each page
had an alias table, per-type parsers and an 870-line `formatRecordData`. After the move it is:

```js
import * as dnsPacket from 'https://esm.sh/@noelminamino/dns-packet@7.0.0'
import * as dnsTypes from 'https://esm.sh/@noelminamino/dns-packet@7.0.0/types.js'

function displayType (type) {
  if (typeof type === 'number') type = dnsTypes.toString(type)
  return type.startsWith('UNKNOWN_') ? `TYPE${type.slice(8)}` : type
}

function formatRecordData (rr) {
  if (rr.type === 'OPT') return formatOptSummary(rr)          // page-specific EDNS summary
  return dnsPacket.rdataToString(rr, { trailingDot: false, utf8: true })
}
```

About 1,100–1,200 lines were removed from each page. The visible differences were all fixes:
TXT strings are quoted (`"v=spf1 …" "…"`) so string boundaries are no longer lost, APL gets its
address family (`1:192.0.2.0/24`), SVCB shows `dohpath=` instead of `key7=`, HIP shows its
rendezvous servers, NXT lists its types, and so on.

## Checklist

- [ ] Change the package name / esm.sh URL (pin `@7.1.0`).
- [ ] Search for `UNKNOWN_`; where an `UNKNOWN_` string is used as a condition, use the type name (`'HTTPS'`, …).
      A table that only renames types keeps working (it becomes unused; removing it is optional).
- [ ] Search for code that reads `rr.data` as bytes (`instanceof Uint8Array`, `DataView`, `data[0]`) for
      the types in [section 2](#2-more-record-types-are-decoded-into-objects); read the fields or use `rdataToString`.
- [ ] Where you caught `decode()` errors to detect bad records, check `rr.dataError` instead.
- [ ] Search for `OPTION_` in EDNS option handling; compare `option.code` (or the new names) instead.
- [ ] Search for `OPCODE_6`, `RCODE_11`, `UNKNOWN_254`, and for code that escapes NUL bytes in names.
- [ ] Node.js 22+ on servers.
