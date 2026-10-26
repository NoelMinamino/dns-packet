# Unreleased

- Requires Node.js 22 or later (20 is end-of-life); CI tests Node.js 22 and 24.
- Dev: replace standard (ESLint 8) with neostandard (ESLint 10), and dtslint with tsc and exact type
    assertions in types/test.ts; update c8 and TypeScript; override tape's glob so npm install shows
    no deprecation warnings.

# Version 6.5.0-nm.0 - 2026-10-26 (@noelminamino/dns-packet)

- Feature: presentation.mjs with rdataToString() / rrToString() (also exported from the package root),
    writing every supported record type in presentation (zone file) format. Options: trailingDot, utf8.
- Fix: EDNS options given as raw data were encoded as zeros (the data was never copied).

# Version 6.4.0-nm.0 - 2026-10-26 (@noelminamino/dns-packet)

- Feature: Decode/encode SIG, KEY, RKEY, TALINK, WKS, X25, ISDN, NSAP, GPOS, A6, NXT, ATMA, DOA and SINK.
- Feature: SPF, AVC, NINFO, RESINFO and WALLET use the TXT codec.
- Feature: EID, NIMLOC, HHIT and BRID are returned as { data } (opaque).

# Version 6.3.0-nm.0 - 2026-10-26 (@noelminamino/dns-packet)

- Feature: Decode/encode CERT, APL, DHCID, IPSECKEY, HIP, EUI48, EUI64, AFSDB, RT, KX, PX, MINFO,
    MD/MF/MB/MG/MR/NSAP-PTR, NID, L32, L64, LP, AMTRELAY, DSYNC, TKEY and TSIG.

# Version 6.2.0-nm.0 - 2026-10-26 (@noelminamino/dns-packet)

- Feature: All IANA-registered RR type names in types.mjs; toType() accepts RFC 3597 TYPE<number>.
- Feature: Decode/encode SVCB, HTTPS, TLSA, SMIMEA, NAPTR, URI, OPENPGPKEY, NSEC3PARAM, ZONEMD, CSYNC and LOC.
- Feature: CDS, TA and DLV use the DS codec; CDNSKEY uses the DNSKEY codec.
- Feature: A record whose RDATA cannot be decoded keeps the raw bytes in data and the reason in dataError
    instead of making the whole packet fail.
- Fix: SSHFP decoding no longer throws on unassigned hash types; the fingerprint is the rest of RDATA.

# Version 6.0.0 - 2022-05-31

- Breaking: Node.js Buffer is not used by the library anymore and Uint8Array instances will be returned
    by default instead of it.

# Version 5.4.0 - 2022-05-27

- Feature: Adding dedicated packet codec
- Feature: Adding dedicated query/response codec as multiple queries are only theoretically supported.

# Version 5.3.0 - 2022-05-22

- Refactor: ESM module support

# Version 5.2.0 - 2019-02-21

- Feature: Added support for de/encoding certain OPT options.

# Version 5.1.0 - 2019-01-22

- Feature: Added support for the RP record type.

# Version 5.0.0 - 2018-06-01

- Breaking: Node.js 6.0.0 or greater is now required.
- Feature: Added support for DNSSEC record types.

# Version 4.1.0 - 2018-02-11

- Feature: Added support for the MX record type.

# Version 4.0.0 - 2018-02-04

- Feature: Added `streamEncode` and `streamDecode` methods for encoding TCP packets.
- Breaking: Changed the decoded value of TXT records to an array of Buffers. This is to accomodate DNS-SD records which rely on the individual strings record being separated.
- Breaking: Renamed the `flag_trunc` and `flag_auth` to `flag_tc` and `flag_aa` to match the names of these in the dns standards.

# Version 3.0.0 - 2018-01-12

- Breaking: The `class` option has been changed from integer to string.

# Version 2.0.0 - 2018-01-11

- Breaking: Converted module to ES2015, now requires Node.js 4.0 or greater
