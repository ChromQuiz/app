import QRCode from 'npm:qrcode@1.5.4';

// 二次元コードを粗く(=離れていても・速く読める)するための設定。
//  - 値を大文字にする: 大文字・数字・「-」「.」だけの文字列は「英数字モード」で符号化され、
//    小文字を含む通常のモードより約3割少ないデータ量で済む(トークンは 76 文字で version 3・29×29)。
//    検証側(qr_token.ts)は小文字に揃えて比較するため、大文字でも通る。
//  - 誤り訂正レベルは L: 画面に映す用途で汚れや欠けが少ないので、冗長分を減らして細かさを抑える。
export async function makeQrSvg(value: string) {
  return QRCode.toString(String(value).toUpperCase(), {
    type: 'svg',
    errorCorrectionLevel: 'L',
    margin: 2,
    width: 360,
  });
}
