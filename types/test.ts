import * as dnsPacket from '@noelminamino/dns-packet';
import { A6Data, Answer, OptionData, Codec, NaptrData, OpaqueData, Packet, SvcbData, TsigData, UnknownCodec } from '@noelminamino/dns-packet';

// Fails to compile unless the value's type is exactly Expected (replaces dtslint's $ExpectType)
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const expectType = <Expected>() => <Actual>(value: Actual & (Exact<Expected, Actual> extends true ? unknown : 'type mismatch')) => value;

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

expectType<Packet>()(dnsPacket.decode(new Uint8Array([])));
expectType<Packet[]>()(dnsPacket.decodeList([], dnsPacket.a, new Uint8Array(0)));
expectType<Packet | null>()(dnsPacket.streamDecode(new Uint8Array(0)));
expectType<Uint8Array>()(dnsPacket.streamEncode({}));

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
expectType<SvcbData>()(dnsPacket.svcb.decode(new Uint8Array(0)));
expectType<NaptrData>()(dnsPacket.naptr.decode(new Uint8Array(0)));
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
expectType<TsigData>()(dnsPacket.tsig.decode(new Uint8Array(0)));
expectType<string>()(dnsPacket.eui48.decode(new Uint8Array(0)));
const wksAnswer: Answer = {
  type: 'WKS',
  name: 'example.com',
  data: { address: '192.0.2.1', protocol: 6, ports: [25, 80] }
};
const spfAnswer: Answer = { type: 'SPF', name: 'example.com', data: 'v=spf1 -all' };
expectType<A6Data>()(dnsPacket.a6.decode(new Uint8Array(0)));
expectType<OpaqueData>()(dnsPacket.hhit.decode(new Uint8Array(0)));
expectType<string>()(dnsPacket.rrToString(httpsAnswer));
expectType<string>()(dnsPacket.rdataToString(tlsaAnswer, { trailingDot: false, utf8: true }));
const ednsOptions: OptionData[] = [
  { code: 'EDE', infoCode: 18, extraText: 'blocked' },
  { code: 'COOKIE', clientCookie: new Uint8Array(8) },
  { code: 'MQTYPE_QUERY', qtypes: ['AAAA', 'HTTPS'] },
  { code: 'ZONEVERSION', labelCount: 2, versionType: 0, serial: 1 }
];
