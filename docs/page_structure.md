# Page Structure

## Authenticated Pages

- `index.html`: login, project creation, and project join.
- `admin.html`: main admin dashboard.
- `judge.html`: question overview and scorer navigation.
- `question.html`: per-question scoring.
- `conflict.html`: admin conflict resolution.
- `checkin.html`: event-day QR check-in.

## Public Participant Pages

- `entry.html`: participant entry form.
- `entry_list.html`: public participant list.
- `edit.html`: participant entry edit.
- `cancel.html`: cancellation.
- `late.html`: late notice.
- `disclosure.html`: score disclosure.
- `terms.html`: participation terms.

## Script Pairing

Most pages have a matching script in `js/`, for example:

- `entry.html` -> `js/entry.js`
- `entry_list.html` -> `js/entry_list.js`
- `disclosure.html` -> `js/disclosure.js`
- `question.html` -> `js/question.js`

Shared helpers live in `js/shared.js`, `js/ui.js`, `js/config.js`, `js/supabase_client.js`, and `js/supabase_api.js`.

## Wording Rules

- Use "エントリー" for registration.
- Use "当日受付" for event-day check-in.
- Use "受付番号" only for participant numbers.
- Use "成績照会" consistently for result disclosure.
