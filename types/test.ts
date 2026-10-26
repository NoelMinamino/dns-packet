/* tslint:disable:no-duplicate-imports */
import * as dnsPacket from '@noelminamino/dns-packet';
import { Answer, Codec, UnknownCodec } from '@noelminamino/dns-packet';

dnsPacket.decode(dnsPacket.encode({
  id: 1,
  type: 'query',
  questions: [
    {
      name: 'test',
      type: 'A'
    },
    {
      name: 'foo',
      type: 'boo'
    }
  ]
}));

const num: number[] = [
  dnsPacket.AUTHENTIC_DATA,
  dnsPacket.AUTHORITATIVE_ANSWER,
  dnsPacket.CHECKING_DISABLED,
  dnsPacket.DNSSEC_OK,
  dnsPacket.RECURSION_AVAILABLE,
  dnsPacket.RECURSION_DESIRED,
  dnsPacket.TRUNCATED_RESPONSE,
  dnsPacket.dnskey.PROTOCOL_DNSSEC,
  dnsPacket.dnskey.ZONE_KEY,
  dnsPacket.dnskey.SECURE_ENTRYPOINT,
  dnsPacket.encodingLength({}),
  dnsPacket.encodingLengthList([], dnsPacket.a)
];

const codec: Array<Codec<any>> = [
  dnsPacket.a,
  dnsPacket.aaaa,
  dnsPacket.answer,
  dnsPacket.caa,
  dnsPacket.cname,
  dnsPacket.dname,
  dnsPacket.dnskey,
  dnsPacket.ds,
  dnsPacket.hinfo,
  dnsPacket.mx,
  dnsPacket.name,
  dnsPacket.ns,
  dnsPacket.sshfp,
  dnsPacket.nsec,
  dnsPacket.nsec3,
  dnsPacket.null,
  dnsPacket.opt,
  dnsPacket.option,
  dnsPacket.ptr,
  dnsPacket.question,
  dnsPacket.rp,
  dnsPacket.rrsig,
  dnsPacket.soa,
  dnsPacket.srv,
  dnsPacket.txt,
  dnsPacket.unknown
];

const unknownCodecs: UnknownCodec[] = [
  dnsPacket.unknown,
  dnsPacket.enc('hello')
];

dnsPacket.decode(new Uint8Array([])); // $ExpectType Packet
dnsPacket.decodeList([], dnsPacket.a, new Uint8Array(0)); // $ExpectType Packet[]
dnsPacket.streamDecode(new Uint8Array(0)); // $ExpectType Packet | null
dnsPacket.streamEncode({}); // $ExpectType Uint8Array

const httpsAnswer: Answer = {
  type: 'HTTPS',
  name: 'example.com',
  data: { priority: 1, targetName: '.', params: { alpn: ['h2', 'h3'], port: 443, key65000: new Uint8Array(1) } }
};
const tlsaAnswer: Answer = {
  type: 'TLSA',
  name: '_443._tcp.example.com',
  data: { usage: 3, selector: 1, matchingType: 1, certificate: new Uint8Array(32) }
};
dnsPacket.svcb.decode(new Uint8Array(0)); // $ExpectType SvcbData
dnsPacket.naptr.decode(new Uint8Array(0)); // $ExpectType NaptrData
const aplAnswer: Answer = {
  type: 'APL',
  name: 'example.com',
  data: [{ family: 1, prefix: 24, negation: false, address: '192.0.2.0' }]
};
const ipseckeyAnswer: Answer = {
  type: 'IPSECKEY',
  name: 'example.com',
  data: { precedence: 10, gatewayType: 0, algorithm: 2, gateway: null, publicKey: new Uint8Array(0) }
};
dnsPacket.tsig.decode(new Uint8Array(0)); // $ExpectType TsigData
dnsPacket.eui48.decode(new Uint8Array(0)); // $ExpectType string
const wksAnswer: Answer = {
  type: 'WKS',
  name: 'example.com',
  data: { address: '192.0.2.1', protocol: 6, ports: [25, 80] }
};
const spfAnswer: Answer = { type: 'SPF', name: 'example.com', data: 'v=spf1 -all' };
dnsPacket.a6.decode(new Uint8Array(0)); // $ExpectType A6Data
dnsPacket.hhit.decode(new Uint8Array(0)); // $ExpectType OpaqueData
