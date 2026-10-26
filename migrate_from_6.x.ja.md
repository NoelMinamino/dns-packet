# dns-packet 6.x から @noelminamino/dns-packet 7 への移行

[English](migrate_from_6.x.md)

`@leichtgewicht/dns-packet` 6.0.x や `@dnsquery/dns-packet` 6.1.x を使っているコード向けの移行ガイドです。
API（`encode`、`decode`、パケットの構造、フラグ、`streamEncode` / `streamDecode`）は同じです。
変わるのは**多くのレコード型の RDATA の返し方**と、その周辺のいくつかの点です。

## 早見表

| | 変更が必要なのは… |
| --- | --- |
| [パッケージ名・URL](#1-パッケージ名と-import) | 必ず |
| [オブジェクトで返る型が増えた](#2-オブジェクトで返る型が増えた) | SVCB/HTTPS、TLSA、NAPTR、CDS、LOC などの `rr.data` をバイト列として自分で解析している場合 |
| [型名](#3-iana-の全型に名前が付いた) | `rr.type === 'UNKNOWN_65'` や `startsWith('UNKNOWN_')` のように `UNKNOWN_` の文字列を条件にしている場合（名前を直す対応表は残しても動く） |
| [壊れた RDATA](#4-壊れた-rdata-があってもパケット全体は失敗しない) | 1 レコードの不正で `decode()` が例外を投げることに頼っている場合 |
| [EDNS オプション名](#5-edns-オプションに名前とフィールドが付いた710) | オプションの `type` を `'OPTION_15'`〜`'OPTION_26'` の文字列と比較している場合（`code` で判定していれば動く） |
| [名前のエスケープ・コード名](#6-名前のエスケープコード名補助関数710) | 特殊な文字を含む名前を扱っている、または `'OPCODE_6'` / `'RCODE_11'` と比較している場合 |
| [Node.js 22 以上](#7-nodejs-22-以上) | Node.js 22 未満で動かしている場合 |
| [ゾーンファイル形式の文字列化](#8-新機能レコードをゾーンファイル形式の文字列に) | 不要（任意。ただし自前の整形処理を置き換えられる） |

## 1. パッケージ名と import

```js
// 変更前
import * as dnsPacket from '@leichtgewicht/dns-packet'          // または '@dnsquery/dns-packet'
import * as dnsPacket from 'https://esm.sh/@leichtgewicht/dns-packet'

// 変更後
import * as dnsPacket from '@noelminamino/dns-packet'
import * as dnsPacket from 'https://esm.sh/@noelminamino/dns-packet@7.1.0'   // 版を固定する
```

`npm install @noelminamino/dns-packet` でインストールします。CommonJS（`require`）もそのまま使えます。
サブパス（`@noelminamino/dns-packet/types.js`、`…/rcodes.js` など）も同じで、新たに `…/presentation.js` が加わりました。

## 2. オブジェクトで返る型が増えた

6.x でデコードされるのは約 20 型だけで、それ以外の型は RDATA の生バイト列（`Uint8Array`）のまま返っていました。
7 では、RDATA の形式が定められている IANA の型はすべてデコードされます。そのバイト列を自分で解析していた場合は、
フィールドを読むように書き換えてください（あるいは解析をやめて [`rdataToString`](#8-新機能レコードをゾーンファイル形式の文字列に) を使います）。

```js
// 変更前: HTTPS は "UNKNOWN_65" という型で、data は RDATA の生バイト列だった
const view = new DataView(rr.data.buffer, rr.data.byteOffset)
const priority = view.getUint16(0)
// … SvcParam の解析が 100 行 …

// 変更後
rr.type   // 'HTTPS'
rr.data   // { priority: 1, targetName: '.', params: { alpn: ['h2', 'h3'], ipv4hint: ['192.0.2.1'] } }
```

オブジェクトで返るようになった型（フィールド名は各 RFC に合わせています。詳細は [README](README.md#supported-record-types)）:

| 型 | 7 での `data` |
| --- | --- |
| SVCB, HTTPS | `{ priority, targetName, params: { mandatory, alpn, 'no-default-alpn', port, ipv4hint, ech, ipv6hint, dohpath, ohttp, keyNNNNN } }` |
| TLSA, SMIMEA | `{ usage, selector, matchingType, certificate }` |
| NAPTR | `{ order, preference, flags, services, regexp, replacement }` |
| CDS, TA, DLV / CDNSKEY | DS と同じ `{ keyTag, algorithm, digestType, digest }` / DNSKEY と同じ `{ flags, algorithm, key }` |
| KEY, RKEY / SIG | `{ flags, protocol, algorithm, key }` / RRSIG と同じ |
| SSHFP | `{ algorithm, hash, fingerprint }`（6.0.x では生バイト列） |
| LOC | `{ version, size, horizontalPrecision, verticalPrecision, latitude, longitude, altitude }`（通信上の値のまま） |
| URI | `{ priority, weight, target }` |
| NSEC3PARAM, ZONEMD, CSYNC | `{ algorithm, flags, iterations, salt }`、`{ serial, scheme, algorithm, digest }`、`{ serial, flags, rrtypes }` |
| OPENPGPKEY, DHCID | `{ key }`、`{ data }` |
| CERT, APL, IPSECKEY, HIP, AMTRELAY | `{ certType, keyTag, algorithm, certificate }`、`[{ family, prefix, negation, address }]`、`{ precedence, gatewayType, algorithm, gateway, publicKey }`、`{ algorithm, hit, publicKey, rendezvousServers }`、`{ precedence, discoveryOptional, relayType, relay }` |
| AFSDB, RT, KX, PX, LP, MINFO, TALINK | 優先度やサブタイプ付きの名前。例: KX `{ preference, exchange }` |
| MD, MF, MB, MG, MR, NSAP-PTR | PTR と同じく名前の文字列 |
| EUI48, EUI64 / X25 | 文字列: `'00-00-5e-00-53-2a'` / `'311061700956'` |
| NID, L32, L64, DSYNC | `{ preference, nodeId }`、`{ preference, locator }`、`{ preference, locator }`、`{ rrtype, scheme, port, target }` |
| TKEY, TSIG | 全フィールド。例: TSIG `{ algorithm, timeSigned, fudge, mac, originalId, error, other }` |
| WKS, ISDN, NSAP, GPOS, A6, NXT, ATMA, DOA, SINK | 構造化（README を参照） |
| SPF, AVC, NINFO, RESINFO, WALLET | TXT と同じく `Uint8Array` の配列 |
| EID, NIMLOC, HHIT, BRID | `{ data }`（中身は解析しない） |

エンコードも同じ形を受け付けるので、これらの型も `encode()` で作れるようになりました。

## 3. IANA の全型に名前が付いた

6.x で名前があったのは 44 型だけで、残りは `'UNKNOWN_<番号>'` でした。SVCB（`UNKNOWN_64`）、
HTTPS（`UNKNOWN_65`）、SMIMEA、OPENPGPKEY、CSYNC、ZONEMD、URI、EUI48 なども含まれます。さらに
`toType('HTTPS')` が `0` を返すため、`encode({ questions: [{ type: 'HTTPS', … }] })` は型 0 の問い合わせを送っていました。

7 では `rr.type` が最初から `'HTTPS'` になります。コードによって、そのまま動くものと直す必要があるものに分かれます。

| 6.x のときの書き方 | 7 での結果 | 対応 |
| --- | --- | --- |
| `TYPE_ALIAS[rr.type] \|\| rr.type`（名前を直す対応表） | `'HTTPS'` | **不要**。表を引いても見つからず `rr.type` がそのまま使われる。表は使われなくなるので、消すかどうかは任意 |
| `rr.type === 'UNKNOWN_65'` | `false` | **必要**。`rr.type === 'HTTPS'` にする |
| `rr.type.startsWith('UNKNOWN_')` で「未知の型なら生バイトを解析」 | `false` | **必要**。登録済みの型はこの分岐に入らず、`data` も[オブジェクト](#2-オブジェクトで返る型が増えた)になっている |

```js
// 変更が必要な例: UNKNOWN_ の文字列で分岐している
if (rr.type === 'UNKNOWN_65') showHttpsPanel(rr)   // 7 では一致しない

// 変更後
if (rr.type === 'HTTPS') showHttpsPanel(rr)
```

型名と番号を変換したいときは `types.js` を使えます。

```js
import * as types from '@noelminamino/dns-packet/types.js'
types.toString(65)                            // 'HTTPS'
types.toType('HTTPS')                         // 65
types.toType('TYPE65280')                     // 65280（RFC 3597 の書き方も受け付ける）
```

`'UNKNOWN_<番号>'` になるのは、IANA が割り当てていない番号だけです。

## 4. 壊れた RDATA があってもパケット全体は失敗しない

6.x では、レコードが 1 つでも不正だと（例: protocol が 3 以外の DNSKEY、6.1.x では未知のハッシュ種別の SSHFP）
`decode()` が例外を投げ、何も得られませんでした。7 ではそのレコードだけ生の RDATA と理由を持ち、
残りのレコードは通常どおりデコードされます。

```js
const packet = dnsPacket.decode(buf)        // RDATA の不正では例外を投げない
for (const rr of packet.answers) {
  if (rr.dataError) {
    console.warn(rr.type, rr.dataError)     // 例: 'Protocol must be 3'
    // rr.data は生の RDATA（Uint8Array）
  }
}
```

ヘッダーが短い、名前が壊れているなど、パケットの構造そのものが壊れている場合は、これまでどおり `decode()` が例外を投げます。

## 5. EDNS オプションに名前とフィールドが付いた（7.1.0）

IANA に登録されている EDNS オプションには、すべて `type` に名前が付くようになりました。6.x と 7.0 では、
15 番以降は `'OPTION_<番号>'` でした。いくつかのオプションは、中身もフィールドに分けて `data` と一緒に返します。

| `code` | 6.x / 7.0 の `type` | 7.1 の `type` | 追加されるフィールド |
| --- | --- | --- | --- |
| 15 | `OPTION_15` | `EDE` | `infoCode`、`extraText` |
| 16, 17 | `OPTION_16`、`OPTION_17` | `CLIENT_TAG`、`SERVER_TAG` | `tag` |
| 18 | `OPTION_18` | `REPORT_CHANNEL` | `agentDomain` |
| 19 | `OPTION_19` | `ZONEVERSION` | `labelCount`、`versionType`、`version`、`serial` |
| 20, 21 | `OPTION_20`、`OPTION_21` | `MQTYPE_QUERY`、`MQTYPE_RESPONSE` | `qtypes` |
| 22〜26 | `OPTION_22` … | `EDE_EXTRA_TEXT_LANGUAGE` … `STRUCTURED_DNS_ERROR` | なし |
| 5〜7, 9, 10, 13 | （名前は以前から付いている） | 変更なし | `algorithms`、`expire`、`clientCookie` / `serverCookie`、`closestTrustPoint` |

`code` と `data` は変わらないので、オプションを `code` で見分けて `data` を読むコードはそのまま動きます。
一致しなくなるのは `OPTION_` の文字列と比較している場合だけです。

```js
// 変更が必要
if (option.type === 'OPTION_15') { /* EDE */ }

// そのまま動く（しかもフィールドが追加される）
if (option.code === 15) {
  option.infoCode     // 18
  option.extraText    // 'blocked by policy'
}
```

想定外の中身の扱いはこれまでと同じです。未割り当ての EDE の `infoCode` もほかと同じように返し、
データが短すぎる・長さがおかしいオプションは例外を投げず、`code`、`type`、`data` だけを返します。

## 6. 名前のエスケープ・コード名・補助関数（7.1.0）

**名前**：ドメイン名はゾーンファイルの書き方（RFC 1035 5.1 節）の文字列になりました。普通の名前は変わりません。
特殊な文字を含むラベルだけ表記が変わり、ラベルの区切りが失われなくなります。

| 通信上のラベル | 6.x / 7.0 | 7.1 |
| --- | --- | --- |
| `a.b`（ドットを含む 1 つのラベル）、`example` | `'a.b.example'`（3 ラベルに見える） | `'a\\.b.example'` |
| NUL、`example`、`com`（NSEC の black lies） | `'\u0000.example.com'` | `'\\000.example.com'` |
| 空白、バックスラッシュ、UTF-8 でないバイト | 生の文字 | 名前の中で `\032`、`\\`、`\DDD` と表記 |

`encode()` も同じエスケープを読むので、デコードした名前はエンコードすると元のバイト列に戻ります。
NUL を自前で置き換えていた処理（`name.replace(/\u0000/g, '\\000')` など）は不要になります。

**コード名**：EDNS オプションと同じく、IANA の名前が付いた番号は表記が変わります。
OPCODE 6 は `'OPCODE_6'` → `'DSO'`、RCODE 11 は `'RCODE_11'` → `'DSOTYPENI'`、クラス 254 は `'UNKNOWN_254'` → `'NONE'`。
番号か新しい名前で比較してください。

**新機能（変更不要）**：`keyTag(dnskey)` で DS や RRSIG が使うキータグを計算できます。
`decode(buf, 0, { partial: true })` は壊れたレコードの手前までを `packet.error` 付きで返します。
`packet.fullRcode` は EDNS の上位ビットを含む RCODE（`'BADCOOKIE'` など）で、`rcode` はこれまでどおりヘッダーの値です。

## 7. Node.js 22 以上

`engines` が `>=22` になりました（6.x は `>=6`）。ブラウザや esm.sh での利用には影響しません。

## 8. 新機能：レコードをゾーンファイル形式の文字列に

「RDATA を文字列にする」処理を自前で書いていた場合は、`rdataToString` / `rrToString` で置き換えられます。

```js
import { decode, rdataToString, rrToString } from '@noelminamino/dns-packet'

const rr = decode(buf).answers[0]
rrToString(rr)        // 'example.com. 300 IN HTTPS 1 . alpn="h2,h3" ipv4hint=192.0.2.1'
rdataToString(rr)     // '1 . alpn="h2,h3" ipv4hint=192.0.2.1'
```

| オプション | 既定値 | 効果 |
| --- | --- | --- |
| `trailingDot` | `true` | RDATA 中の名前の末尾に `.` を付ける（`mail.example.com.`） |
| `utf8` | `false` | UTF-8 の文字をそのまま出す（`"日本語"`）。既定では `"\230\151\165…"` とエスケープする |

形式の定まっていない型と、`dataError` が付いたレコードは `\# <長さ> <16進>`（RFC 3597）で出力します。

## 変更しなくてよいもの

- `encode` / `decode` / `encodingLength` / `streamEncode` / `streamDecode` / `query` / `response`、
  およびパケットの構造（`id`、`flags`、`questions`、`answers`、`authorities`、`additionals`）。
- 6.x からデコードされていた型の `data`: A、AAAA、NS、CNAME、DNAME、PTR、MX、SOA、SRV、TXT、NULL、
  HINFO、CAA、RP、DNSKEY、RRSIG、NSEC、NSEC3、DS、OPT（6.1.x からは SSHFP も）。
- IANA 未割り当ての型: これまでどおり `type` は `'UNKNOWN_<番号>'`、`data` は `Uint8Array`。
- `rcodes`、`opcodes`、`classes`。`optioncodes` も 15 番以降に名前が付いた点以外は同じ。
- EDNS オプションの `code` と `data`、および `CLIENT_SUBNET`、`TCP_KEEPALIVE`、`PADDING`、`KEY_TAG` のフィールド。

## 移行例: ldns.jp

[ldns.jp](https://ldns.jp/) は 3 つのページを `@leichtgewicht/dns-packet` 6.0.3 から 7.0.0 に移行しました。
各ページには型名の対応表、型ごとの解析処理、870 行の `formatRecordData` がありましたが、移行後はこうなりました。

```js
import * as dnsPacket from 'https://esm.sh/@noelminamino/dns-packet@7.0.0'
import * as dnsTypes from 'https://esm.sh/@noelminamino/dns-packet@7.0.0/types.js'

function displayType (type) {
  if (typeof type === 'number') type = dnsTypes.toString(type)
  return type.startsWith('UNKNOWN_') ? `TYPE${type.slice(8)}` : type
}

function formatRecordData (rr) {
  if (rr.type === 'OPT') return formatOptSummary(rr)          // ページ独自の EDNS 要約表示
  return dnsPacket.rdataToString(rr, { trailingDot: false, utf8: true })
}
```

各ページで約 1,100〜1,200 行を削除できました。表示の変化はすべて修正にあたるもので、たとえば TXT が
引用符付き（`"v=spf1 …" "…"`）になって文字列の区切りが失われなくなった、APL にアドレスファミリが付いた
（`1:192.0.2.0/24`）、SVCB が `key7=` ではなく `dohpath=` と表示される、HIP にランデブーサーバーが出る、
NXT にタイプ一覧が出る、などです。

## チェックリスト

- [ ] パッケージ名・esm.sh の URL を変更する（`@7.1.0` で版を固定）。
- [ ] `UNKNOWN_` を検索し、`UNKNOWN_` の文字列を条件にしている箇所を型名（`'HTTPS'` など）に置き換える。
      名前を直すだけの対応表は残しても動く（不要になるので消すかは任意）。
- [ ] [2 章](#2-オブジェクトで返る型が増えた)の型について、`rr.data` をバイト列として読んでいる箇所
      （`instanceof Uint8Array`、`DataView`、`data[0]` など）を検索し、フィールドを読むか `rdataToString` を使う。
- [ ] 不正なレコードを `decode()` の例外で検出していた箇所は、`rr.dataError` を見るように変える。
- [ ] EDNS オプションの処理で `OPTION_` を検索し、`option.code`（または新しい名前）で判定するように変える。
- [ ] `OPCODE_6`、`RCODE_11`、`UNKNOWN_254` や、名前の NUL を自前でエスケープしている処理を検索する。
- [ ] サーバーで動かす場合は Node.js 22 以上にする。
