# Features

## Administration

- Project creation and settings.
- Entry period and disclosure period controls.
- Participant list management.
- Waitlist promotion handling.
- Terms and participant email notification settings.
- Project reset.

## Participant Flow

- Email-verified entry.
- Public entry list.
- Entry edit, cancellation, late notice, and score disclosure.
- Event-day check-in by scanning a two-dimensional code.

## Answer Workflow

- Answer sheet PDF generation.
- Scanned PDF upload.
- ArUco-based alignment and entry-number reading.
- Private answer page and answer cell storage.
- Model answer setup.

## Judging

- Per-question scorer assignment.
- Independent scoring votes.
- Conflict detection and admin resolution.
- Final results, ranking, streak tie-breaks, CSV output, and graded PDF output.

## Names

- エントリーネーム is a public nickname used only on the public entry list (`entry_list.html`). It is collected at entry and is editable from `my.html` and admin.
- Check-in, judging, conflict, scan lists, and 成績照会 identify contestants by 受付番号 (plus 所属・学年 for 成績照会). Real names are RSA-encrypted PII and are decrypted only in the admin browser with the project key (analytics, result CSV with separate 姓/名 columns, 参加者名簿CSV).
- Entry forms state that real names are used on the day and in the record book; there is no per-person opt-in.

## External Services

- Supabase Database/Auth/Storage/Realtime/Edge Functions.
- Brevo-first email delivery through Edge Functions, with SES fallback support.
