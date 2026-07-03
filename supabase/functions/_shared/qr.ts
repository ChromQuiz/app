import QRCode from 'npm:qrcode@1.5.4';

export async function makeQrSvg(value: string) {
  return QRCode.toString(value, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
  });
}
