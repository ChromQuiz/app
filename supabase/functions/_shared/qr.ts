import QRCode from 'npm:qrcode@1.5.4';

// 二次元コードを粗く(=離れていても・速く読める)するための設定。
//  - 値を大文字にする: 大文字・数字・「-」「.」だけの文字列は「英数字モード」で符号化され、
//    小文字を含む通常のモードより約3割少ないデータ量で済む。受付コード(qr_token.ts)は 20 文字の大文字なので、
//    英数字モードの version 1(21×21)・誤り訂正 M の上限(20 文字)にちょうど収まる。
//  - 誤り訂正レベルは M: 受付コードが短く、version 1 に収まる範囲で、汚れ・映り込み・欠けに強くする(L より復元できる量が多い)。
//    レベルを上げると version が上がる(Q だと 16 文字まで)ので、M が version 1 に収まる最大。
export async function makeQrSvg(value: string) {
  return QRCode.toString(String(value).toUpperCase(), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
  });
}
