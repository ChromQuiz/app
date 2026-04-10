/**
 * CIQ the 13th 採点システム - メール送信専用GAS (Web App用)
 * 
 * ======================================================================
 * 【使い方】
 * 1. GAS（Google Apps Script）の新規プロジェクトを作成し、このコードを貼り付けます。
 * 2. 「デプロイ」>「新しいデプロイ」を選択。
 * 3. 種類の選択から「ウェブアプリ」を選ぶ。
 * 4. 実行するユーザーを「自分」、アクセスできるユーザーを「全員(匿名ユーザーを含む)」に設定してデプロイ。
 * 5. 発行されたウェブアプリのURLをコピーする。
 * 6. CIQシステム管理画面の「GAS（メール送信 API）連携設定」にそのURLを貼り付けて保存する。
 * ======================================================================
 */

function doGet(e) {
  const p = e.parameter;
  const action = p.action;

  try {
    if (action === 'entryMail') {
      sendEntryMail(p.projectName, p.email, p.familyName, p.firstName, p.entryNumber, p.pw, p.uuid);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'ignored' })).setMimeType(ContentService.MimeType.JSON);
}

function sendEntryMail(projectNameStr, email, familyName, firstName, entryNumberStr, pwStr, uuid) {
  if (!email) return;
  
  const projectName = projectNameStr || '大会';
  const entryNumber = String(entryNumberStr).padStart(3, '0');
  
  // UUIDからQRコード画像を生成
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(uuid)}`;
  const qrBlob = UrlFetchApp.fetch(qrUrl).getBlob().setName('QRcode.png');

  const subject = `${projectName} エントリー受付完了のお知らせ`;
  const body = `${familyName} ${firstName} 様

${projectName} へのエントリーを受け付けました。

━━━━━━━━━━━━━━━━━━━━━
■ あなたの受付番号：${entryNumber}
■ 開示/キャンセル用PW：${pwStr}
━━━━━━━━━━━━━━━━━━━━━

※ 開示/キャンセル用パスワードは、大会後にご自身の得点を確認する際、または事前キャンセルする際に必要です。再発行は行えませんので、本メールを大切に保管してください。

【当日の受付について】
添付のQRコードは、大会当日の受付時に使用します。
本メールの添付画像をスマートフォンに保存してご提示いただくか、印刷してお持ちください。

それでは、大会当日にお会いできることを楽しみにしております。

${projectName} 実行委員会
`;

  // メール送信
  GmailApp.sendEmail(email, subject, body, {
    attachments: [qrBlob]
  });
}
