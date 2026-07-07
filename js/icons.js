/**
 * CIQ Symbol Registry (js/icons.js)
 * SF Symbols 風の自前 outline SVG レジストリ。外部アイコンセットに依存しない。
 * currentColor / 24px / stroke 1.8。`<span data-icon="name">` を SVG に展開。
 */

const ICON_PATHS = {
  'chevron-down': 'M7.2 9.4 12 14.2l4.8-4.8',
  'chevron-left': 'M14.6 6.6 9.2 12l5.4 5.4',
  'chevron-right': 'M9.4 6.6 14.8 12l-5.4 5.4',
  'arrow-left': ['M19 12H5.5', 'M11.2 5.8 5 12l6.2 6.2'],
  'arrow-right': ['M5 12h13.5', 'M12.8 5.8 19 12l-6.2 6.2'],
  'arrow-up-right-from-square': ['M8 6.2h9.8V16', 'M17.6 6.4 7.2 16.8', 'M5 8.5v10.2c0 .8.6 1.3 1.4 1.3h10.1'],
  'arrow-right-to-bracket': ['M4 12h10.4', 'M9.8 6.5 15.3 12l-5.5 5.5', 'M18.8 5.5v13'],
  'right-from-bracket': ['M10 5.5H6.3c-.8 0-1.3.6-1.3 1.4v10.2c0 .8.5 1.4 1.3 1.4H10', 'M14 7l5 5-5 5', 'M19 12H9.2'],
  'right-to-bracket': ['M14 5.5h3.7c.8 0 1.3.6 1.3 1.4v10.2c0 .8-.5 1.4-1.3 1.4H14', 'M10 7l5 5-5 5', 'M15 12H5.2'],
  'home': ['M4.2 10.4 12 4l7.8 6.4', 'M6.2 9.6v9.2c0 .8.6 1.4 1.4 1.4h8.8c.8 0 1.4-.6 1.4-1.4V9.6', 'M9.8 20v-6.1h4.4V20'],
  'xmark': 'M17 7 7 17M7 7l10 10',
  'plus': 'M12 5.8v12.4M5.8 12h12.4',
  'minus': 'M5.8 12h12.4',
  'check': 'M5.5 12.5 9.7 16.5 18.5 7.5',
  'check-double': ['M3.8 12.6 7.1 15.9 13 9.8', 'M10.2 13.4l2.7 2.5 7.3-8.1'],
  'rotate': ['M18.8 8.2A7.7 7.7 0 1 1 12 4.3c2.3 0 4.2 1 5.6 2.5', 'M18.8 3.8v4.6h-4.6'],
  'rotate-right': ['M18.8 8.2A7.7 7.7 0 1 1 12 4.3c2.3 0 4.2 1 5.6 2.5', 'M18.8 3.8v4.6h-4.6'],
  'rotate-left': ['M5.2 8.2A7.7 7.7 0 1 0 12 4.3c-2.3 0-4.2 1-5.6 2.5', 'M5.2 3.8v4.6h4.6'],

  'circle': 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z',
  'circle-check': ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'M8.5 12.3l2.4 2.4 4.9-5.2'],
  'check-circle': ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'M8.5 12.3l2.4 2.4 4.9-5.2'],
  'circle-xmark': ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'M14.8 9.2l-5.6 5.6M9.2 9.2l5.6 5.6'],
  'circle-info': ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'M12 11.2v4.4M12 8.2h.01'],
  'circle-question': ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'M9.5 9.7a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.9M12 16.8h.01'],
  'circle-plus': ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'M12 8.5v7M8.5 12h7'],
  'circle-exclamation': ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'M12 7.8v5.7M12 16.5h.01'],
  'triangle-exclamation': ['M11 4.8c.5-.9 1.5-.9 2 0l7 12.2c.5.9-.1 2-1.1 2H5.1c-1 0-1.6-1.1-1.1-2z', 'M12 9.2v4.4M12 16.4h.01'],
  'ban': ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'M6.6 6.6l10.8 10.8'],
  'lock': ['M6.2 10.5h11.6c.9 0 1.5.6 1.5 1.5v6.5c0 .9-.6 1.5-1.5 1.5H6.2c-.9 0-1.5-.6-1.5-1.5V12c0-.9.6-1.5 1.5-1.5z', 'M8.2 10.5V8.2a3.8 3.8 0 0 1 7.6 0v2.3'],
  'unlock': ['M6.2 10.5h11.6c.9 0 1.5.6 1.5 1.5v6.5c0 .9-.6 1.5-1.5 1.5H6.2c-.9 0-1.5-.6-1.5-1.5V12c0-.9.6-1.5 1.5-1.5z', 'M8.2 10.5V8.2a3.8 3.8 0 0 1 7.2-1.7'],
  'shield-halved': ['M12 3.3c2 1.5 4 2.2 6.3 2.4v5.7c0 4.1-2.4 7-6.3 9.2-3.9-2.2-6.3-5.1-6.3-9.2V5.7c2.3-.2 4.3-.9 6.3-2.4z', 'M12 4.2v15.3'],
  'flag-checkered': ['M5.2 20.5V4.3', 'M5.2 5.2c2.2-1 4.4 1 6.6 0s4.4-1 6.9 0v8.2c-2.5-1-4.7 0-6.9 0s-4.4-1-6.6 0', 'M8.5 4.6v8.5M12 5.2v8M15.4 4.5v8.5'],
  'wifi': ['M4.7 10.3a10.6 10.6 0 0 1 14.6 0', 'M8 13.5a5.8 5.8 0 0 1 8 0', 'M10.8 16.7a1.8 1.8 0 0 1 2.4 0'],

  'copy': ['M9 8.3h8.7c.8 0 1.3.5 1.3 1.3v8.7c0 .8-.5 1.3-1.3 1.3H9c-.8 0-1.3-.5-1.3-1.3V9.6c0-.8.5-1.3 1.3-1.3z', 'M5 15.7V5.8c0-.8.5-1.3 1.3-1.3h9.9'],
  'download': ['M5 18.5h14', 'M12 4.5v10.7', 'M7.8 11l4.2 4.2 4.2-4.2'],
  'trash': ['M5 6.8h14', 'M9 6.8V5.2c0-.7.5-1.2 1.2-1.2h3.6c.7 0 1.2.5 1.2 1.2v1.6', 'M7 8.9l.7 10c.1.8.6 1.3 1.4 1.3h5.8c.8 0 1.3-.5 1.4-1.3l.7-10', 'M10 11.2v5.7M14 11.2v5.7'],
  'pen': ['M5 17.8 6.1 13 16.4 2.7c.7-.7 1.7-.7 2.4 0l2.5 2.5c.7.7.7 1.7 0 2.4L11 17.9z', 'M14.8 4.3l4.9 4.9', 'M5 17.8 3.9 21l3.2-1.1'],
  'pen-to-square': ['M5.6 5.5h8.7', 'M18.5 11.2v7.2c0 .9-.6 1.5-1.5 1.5H5.6c-.9 0-1.5-.6-1.5-1.5V7c0-.9.6-1.5 1.5-1.5', 'M9 15.2l1.1-4.1 7-7c.7-.7 1.7-.7 2.4 0l.4.4c.7.7.7 1.7 0 2.4l-7 7z', 'M15.6 5.6l2.8 2.8'],
  'file-pen': ['M6.5 3.8h7l4 4v4.4', 'M13.5 3.8v4h4', 'M6.5 3.8c-.8 0-1.4.6-1.4 1.4v13.6c0 .8.6 1.4 1.4 1.4h5.2', 'M12.8 18.8l.8-3.1 4.8-4.8c.6-.6 1.5-.6 2.1 0s.6 1.5 0 2.1l-4.8 4.8z'],
  'floppy-disk': ['M5.2 4.2h11.3l2.3 2.3v12.3c0 .8-.6 1.4-1.4 1.4H5.2c-.8 0-1.4-.6-1.4-1.4V5.6c0-.8.6-1.4 1.4-1.4z', 'M8 4.2v5h7.5v-5', 'M7.6 20.2v-6.4h8.8v6.4'],
  'paper-plane': ['M20.5 4 4.1 11.2c-.9.4-.8 1.7.2 1.9l6.3 1.3 1.3 6.3c.2 1 1.5 1.1 1.9.2z', 'M10.7 14.3 20.5 4'],
  'send': ['M20.5 4 4.1 11.2c-.9.4-.8 1.7.2 1.9l6.3 1.3 1.3 6.3c.2 1 1.5 1.1 1.9.2z', 'M10.7 14.3 20.5 4'],
  'save': ['M5.2 4.2h11.3l2.3 2.3v12.3c0 .8-.6 1.4-1.4 1.4H5.2c-.8 0-1.4-.6-1.4-1.4V5.6c0-.8.6-1.4 1.4-1.4z', 'M8 4.2v5h7.5v-5', 'M7.6 20.2v-6.4h8.8v6.4'],
  'share-from-square': ['M6.2 9.5v8.6c0 .8.6 1.4 1.4 1.4h8.8c.8 0 1.4-.6 1.4-1.4V9.5', 'M12 15.5V4.8', 'M8.4 8.5 12 4.8l3.6 3.7'],
  'key': ['M9.4 14.6a4.2 4.2 0 1 1 3-3', 'M12.2 11.8 20 4', 'M17.2 6.8l2 2M14.9 9.1l1.5 1.5'],

  'user': ['M12 12.2a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4z', 'M5.2 20.2c.7-3.6 3.2-5.4 6.8-5.4s6.1 1.8 6.8 5.4'],
  'users': ['M10.3 12.1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M3.8 20c.7-3.2 3-4.9 6.5-4.9 2.2 0 4 .7 5.1 2', 'M16 12a3 3 0 1 0-.2-6', 'M16.5 15.3c2.2.2 3.7 1.6 4.2 4'],
  'user-plus': ['M10.3 12.1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M3.8 20c.7-3.2 3-4.9 6.5-4.9 1.8 0 3.3.5 4.4 1.4', 'M18 8.4v5.2M15.4 11h5.2'],
  'user-xmark': ['M10.3 12.1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M3.8 20c.7-3.2 3-4.9 6.5-4.9 1.8 0 3.3.5 4.4 1.4', 'M16 8.8l4.2 4.2M20.2 8.8 16 13'],
  'user-check': ['M10.3 12.1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M3.8 20c.7-3.2 3-4.9 6.5-4.9 1.8 0 3.3.5 4.4 1.4', 'M15.4 11.6l2 2 4-4.4'],
  'user-clock': ['M10 12.1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M3.8 20c.7-3.2 3-4.9 6.2-4.9', 'M18 19.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M18 13.5V16l1.7 1'],
  'user-shield': ['M9.8 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M3.8 20c.6-2.8 2.4-4.4 5.3-4.8', 'M17 10.2c1.4 1 2.8 1.4 4.4 1.5v3.1c0 2.5-1.6 4.3-4.4 5.5-2.8-1.2-4.4-3-4.4-5.5v-3.1c1.6-.1 3-.5 4.4-1.5z'],
  'user-slash': ['M10.3 12.1a3.5 3.5 0 0 0 3.1-5.1', 'M5.4 18.8c1-2.4 2.9-3.7 5.7-3.7 1.2 0 2.3.2 3.2.7', 'M3.5 3.5l17 17'],
  'crown': ['M4 8.2l3.3 7.4h9.4L20 8.2l-5 3.6-3-6.6-3 6.6z', 'M7.2 18.8h9.6'],
  'address-book': ['M6 4h10.5c.8 0 1.4.6 1.4 1.4v13.2c0 .8-.6 1.4-1.4 1.4H6c-.8 0-1.4-.6-1.4-1.4V5.4C4.6 4.6 5.2 4 6 4z', 'M19.5 7.5h1.3M19.5 12h1.3M19.5 16.5h1.3', 'M11 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M7.7 15.8c.5-1.8 1.7-2.8 3.3-2.8s2.8 1 3.3 2.8'],
  'fingerprint': ['M12 11.4c0 2.7-.3 5.3-1 7.8', 'M8.4 18c.5-1.8.7-4 .7-6.6a2.9 2.9 0 0 1 5.8 0c0 1.8-.1 3.5-.4 5.2', 'M6 15.2c.2-1.4.3-2.7.3-3.8a5.7 5.7 0 0 1 11.4 0c0 2.2-.2 4.2-.6 6', 'M4.2 10.2a7.8 7.8 0 0 1 15.6 1.2'],

  'envelope': ['M4.8 6h14.4c.9 0 1.5.6 1.5 1.5v9c0 .9-.6 1.5-1.5 1.5H4.8c-.9 0-1.5-.6-1.5-1.5v-9c0-.9.6-1.5 1.5-1.5z', 'M4.3 8l7.7 5 7.7-5'],
  'envelope-circle-check': ['M4.4 7h10.4c.8 0 1.3.5 1.3 1.3v6.4c0 .8-.5 1.3-1.3 1.3H4.4c-.8 0-1.3-.5-1.3-1.3V8.3c0-.8.5-1.3 1.3-1.3z', 'M3.8 9l5.8 3.7 5.8-3.7', 'M16.2 20a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z', 'M14.3 15.6l1.3 1.3 2.6-2.9'],
  'envelope-circle-xmark': ['M4.4 7h10.4c.8 0 1.3.5 1.3 1.3v6.4c0 .8-.5 1.3-1.3 1.3H4.4c-.8 0-1.3-.5-1.3-1.3V8.3c0-.8.5-1.3 1.3-1.3z', 'M3.8 9l5.8 3.7 5.8-3.7', 'M16.2 20a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z', 'M14.4 14.2l3.6 3.6M18 14.2l-3.6 3.6'],
  'comment': ['M5.2 5.4h13.6c.8 0 1.4.6 1.4 1.4v8.1c0 .8-.6 1.4-1.4 1.4H9.5L5.2 20v-3.7c-.8 0-1.4-.6-1.4-1.4V6.8c0-.8.6-1.4 1.4-1.4z'],
  'message': ['M5.2 5.4h13.6c.8 0 1.4.6 1.4 1.4v8.1c0 .8-.6 1.4-1.4 1.4H9.5L5.2 20v-3.7c-.8 0-1.4-.6-1.4-1.4V6.8c0-.8.6-1.4 1.4-1.4z'],
  'paperclip': ['M8.2 12.7l5.6-5.6a3.2 3.2 0 0 1 4.5 4.5l-6.8 6.8a4.8 4.8 0 0 1-6.8-6.8l7.1-7.1', 'M9.9 14.4l6-6'],

  'file-lines': ['M6.5 3.8h7l4 4v11c0 .8-.6 1.4-1.4 1.4H6.5c-.8 0-1.4-.6-1.4-1.4V5.2c0-.8.6-1.4 1.4-1.4z', 'M13.5 3.8v4h4', 'M8 11.8h8M8 15h8M8 8.7h2.6'],
  'file-pdf': ['M6.5 3.8h7l4 4v11c0 .8-.6 1.4-1.4 1.4H6.5c-.8 0-1.4-.6-1.4-1.4V5.2c0-.8.6-1.4 1.4-1.4z', 'M13.5 3.8v4h4', 'M8 14.5h2.2c1.2 0 1.9-.7 1.9-1.7s-.7-1.7-1.9-1.7H8v5.8', 'M13.6 11.1v5.8h1.2c1.6 0 2.6-1.1 2.6-2.9s-1-2.9-2.6-2.9z'],
  'file-csv': ['M6.5 3.8h7l4 4v11c0 .8-.6 1.4-1.4 1.4H6.5c-.8 0-1.4-.6-1.4-1.4V5.2c0-.8.6-1.4 1.4-1.4z', 'M13.5 3.8v4h4', 'M8 13.2c.2-1 1-1.5 2-1.5M8 15.6c.2 1 1 1.5 2 1.5M12.1 12.1h2.4M12.1 14.4h2.4M12.1 16.8h2.4'],
  'file-image': ['M6.5 3.8h7l4 4v11c0 .8-.6 1.4-1.4 1.4H6.5c-.8 0-1.4-.6-1.4-1.4V5.2c0-.8.6-1.4 1.4-1.4z', 'M13.5 3.8v4h4', 'M8 16l2.6-2.6 2 2 1.6-1.7 2.8 3.1', 'M9.4 10.7h.01'],
  'file-export': ['M6.5 3.8h7l4 4v11c0 .8-.6 1.4-1.4 1.4H6.5c-.8 0-1.4-.6-1.4-1.4V5.2c0-.8.6-1.4 1.4-1.4z', 'M13.5 3.8v4h4', 'M9 14h8', 'M14.2 11.2 17 14l-2.8 2.8'],
  'folder-open': ['M4.5 6.5h5l1.7 2h8.3c.8 0 1.4.6 1.4 1.4v.9', 'M3.7 10.8h16.8c.8 0 1.2.6 1 1.4l-1.6 5.9c-.2.8-.8 1.3-1.6 1.3H5.1c-.8 0-1.4-.5-1.6-1.3l-1-3.8V7.9c0-.8.6-1.4 1.4-1.4z'],
  'spell-check': ['M5 17 8.5 7l3.5 10', 'M6.4 13h4.2', 'M13 15l2.4 2.4L20 12'],

  'chart-column': ['M4 19.5h16', 'M7 16v-4.8M12 16V7.8M17 16v-7'],
  'chart-bar': ['M4 19.5h16', 'M7 16v-4.8M12 16V7.8M17 16v-7'],
  'chart-pie': ['M12 4a8 8 0 1 0 8 8h-8z', 'M12 4v8h8'],
  'magnifying-glass-chart': ['M11 17.2a6.2 6.2 0 1 0 0-12.4 6.2 6.2 0 0 0 0 12.4z', 'M16 16l4.2 4.2', 'M8 13v-2.6M11 13V8.5M14 13v-3.4'],
  'list': ['M8 7h11M8 12h11M8 17h11', 'M4.5 7h.01M4.5 12h.01M4.5 17h.01'],
  'list-ol': ['M9 7h10M9 12h10M9 17h10', 'M4.5 5.8v3M3.8 8.8h1.4M3.8 14.2c0-1.4 2.1-1.2 2.1-2.6 0-.6-.5-1-1.1-1-.5 0-.9.2-1.2.6M3.6 17.2h1.5c.6 0 1 .4 1 1s-.4 1-1 1H3.6'],
  'list-check': ['M10 7h10M10 12h10M10 17h10', 'M3.8 7l1.4 1.4L7.5 6M3.8 12l1.4 1.4 2.3-2.4M3.8 17l1.4 1.4 2.3-2.4'],
  'list-check-alt': ['M10 7h10M10 12h10M10 17h10', 'M3.8 7l1.4 1.4L7.5 6M3.8 12l1.4 1.4 2.3-2.4M3.8 17l1.4 1.4 2.3-2.4'],
  'hashtag': ['M7.8 4.5 6.4 19.5M17.6 4.5l-1.4 15', 'M4.5 9h15M4.5 15h15'],
  'ranking-star': ['M8 20h8M10 20v-5h4v5', 'M12 4.2l1.2 3 3.1.2-2.4 2 .7 3-2.6-1.6-2.6 1.6.7-3-2.4-2 3.1-.2z'],
  'percent': ['M18.5 5.5l-13 13', 'M7.2 8.3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M16.8 18.7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'],
  'trophy': ['M7 4.5h10v4.6a5 5 0 0 1-10 0z', 'M7 7H4.8a2.3 2.3 0 0 0 0 4.6H7', 'M17 7h2.2a2.3 2.3 0 0 1 0 4.6H17', 'M12 14.2v3.4M8.8 20h6.4M10 17.6h4'],

  'gear': ['M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6z', 'M12 3.5v2M12 18.5v2M5.9 5.9l1.4 1.4M16.7 16.7l1.4 1.4M3.5 12h2M18.5 12h2M5.9 18.1l1.4-1.4M16.7 7.3l1.4-1.4'],
  'gauge': ['M4.5 15.5a8 8 0 1 1 15 0', 'M12 13.2l4.2-5', 'M12 14.8h.01'],
  'wrench': ['M14 6.2a4.3 4.3 0 0 1 5.4-1.4l-3.1 3.1 2 2 3.1-3.1A4.3 4.3 0 0 1 15 12.2l-6.8 6.8a2.2 2.2 0 1 1-3.1-3.1z'],
  'sliders': ['M6 5v14M12 5v14M18 5v14', 'M3.8 9h4.4M9.8 15h4.4M15.8 11h4.4'],
  'users-gear': ['M9.7 12a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z', 'M3.7 19.6c.6-3 2.8-4.5 6-4.5', 'M17.4 16.8a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4z', 'M17.4 9.2v1.1M17.4 17.9V19M14.4 11l.8.8M19.6 16.2l.8.8M14.4 17l.8-.8M19.6 11.8l.8-.8'],

  'calendar': ['M7.5 4.2v3M16.5 4.2v3', 'M5.5 6h13c.8 0 1.4.6 1.4 1.4v11.1c0 .8-.6 1.4-1.4 1.4h-13c-.8 0-1.4-.6-1.4-1.4V7.4c0-.8.6-1.4 1.4-1.4z', 'M4.2 10h15.6'],
  'calendar-days': ['M7.5 4.2v3M16.5 4.2v3', 'M5.5 6h13c.8 0 1.4.6 1.4 1.4v11.1c0 .8-.6 1.4-1.4 1.4h-13c-.8 0-1.4-.6-1.4-1.4V7.4c0-.8.6-1.4 1.4-1.4z', 'M4.2 10h15.6M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01'],
  'clock': ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'M12 7.4V12l3 2.2'],
  'clock-rotate-left': ['M5.1 8.3A8 8 0 1 1 4 12', 'M5.1 4.4v3.9H9', 'M12 7.5V12l3 2.2'],
  'play': 'M8.2 5.8v12.4L18 12z',
  'stop': 'M7 7h10v10H7z',
  'history': ['M5.1 8.3A8 8 0 1 1 4 12', 'M5.1 4.4v3.9H9', 'M12 7.5V12l3 2.2'],
  'hourglass': ['M7 4.5h10M7 19.5h10', 'M8 4.5v3.2c0 1.4.8 2.6 2.1 3.3L12 12l1.9-1c1.3-.7 2.1-1.9 2.1-3.3V4.5', 'M8 19.5v-3.2c0-1.4.8-2.6 2.1-3.3L12 12l1.9 1c1.3.7 2.1 1.9 2.1 3.3v3.2'],

  'school': ['M3.5 9.5 12 5l8.5 4.5-8.5 4.5z', 'M6.5 11.2v4.2c0 2 2.5 3.5 5.5 3.5s5.5-1.5 5.5-3.5v-4.2', 'M19 10.5v5.7'],
  'graduation-cap': ['M3.5 9.5 12 5l8.5 4.5-8.5 4.5z', 'M6.5 11.2v4.2c0 2 2.5 3.5 5.5 3.5s5.5-1.5 5.5-3.5v-4.2', 'M20.5 10v5.5'],
  'tower-broadcast': ['M9.2 9.5 4.5 13h4.7l5.6 4.2V6.8z', 'M17.1 9.2a4.2 4.2 0 0 1 0 5.6', 'M19.7 6.7a7.8 7.8 0 0 1 0 10.6'],

  'qrcode': ['M4.5 4.5h5v5h-5zM14.5 4.5h5v5h-5zM4.5 14.5h5v5h-5z', 'M14.5 14.5h2v2h-2zM18.5 14.5h1v5h-5v-1M12.5 12.5h2M12.5 16.5h1.5M16.5 12.5h3'],
  'camera': ['M4.8 7.4h3.4l1.6-2h4.4l1.6 2h3.4c.9 0 1.5.6 1.5 1.5v8.4c0 .9-.6 1.5-1.5 1.5H4.8c-.9 0-1.5-.6-1.5-1.5V8.9c0-.9.6-1.5 1.5-1.5z', 'M12 16a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z'],
  'cloud-arrow-up': ['M8 18.2H6.6a4.2 4.2 0 0 1-.3-8.4A6.1 6.1 0 0 1 18 11.3h.6a3.4 3.4 0 0 1 0 6.8H16', 'M12 19.5V10', 'M8.8 13.2 12 10l3.2 3.2'],
  'box-open': ['M4.5 8.2 12 4.5l7.5 3.7-7.5 3.7z', 'M4.5 8.2v7.6l7.5 3.7 7.5-3.7V8.2', 'M12 11.9v7.6', 'M7.6 10l-3.1 2.1 7.5 3.7 7.5-3.7-3.1-2.1'],
  'inbox': ['M5.5 5h13l2.1 8v5.1c0 .8-.6 1.4-1.4 1.4H4.8c-.8 0-1.4-.6-1.4-1.4V13z', 'M3.8 13h5.1l1.2 2h3.8l1.2-2h5.1'],
  'map-location-dot': ['M12 20.5s6.1-5.3 6.1-10.3a6.1 6.1 0 1 0-12.2 0c0 5 6.1 10.3 6.1 10.3z', 'M12 12.4a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z'],
  'map-pin': ['M12 20.5s6.1-5.3 6.1-10.3a6.1 6.1 0 1 0-12.2 0c0 5 6.1 10.3 6.1 10.3z', 'M12 12.4a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z'],
  'door-open': ['M6.4 20V5.6c0-.8.6-1.4 1.4-1.4h6.6c.8 0 1.4.6 1.4 1.4V20', 'M10.2 20V4.2l7.4 1.5V20', 'M13.8 12h.01M4 20h16'],
  'door-closed': ['M6.4 20V5.6c0-.8.6-1.4 1.4-1.4h8.4c.8 0 1.4.6 1.4 1.4V20', 'M13.6 12h.01M4 20h16'],
  'ghost': ['M6 19.5V10a6 6 0 0 1 12 0v9.5l-2-1.6-2 1.6-2-1.6-2 1.6-2-1.6z', 'M9.4 10.2h.01M14.6 10.2h.01'],
  'keyboard': ['M4.8 6.8h14.4c.9 0 1.5.6 1.5 1.5v7.4c0 .9-.6 1.5-1.5 1.5H4.8c-.9 0-1.5-.6-1.5-1.5V8.3c0-.9.6-1.5 1.5-1.5z', 'M7 10h.01M10 10h.01M13 10h.01M16 10h.01M17 14H7'],
  'table-cells-large': ['M4.5 4.5h15v15h-15z', 'M9.5 4.5v15M14.5 4.5v15M4.5 9.5h15M4.5 14.5h15'],
  'th': ['M4.5 4.5h15v15h-15z', 'M9.5 4.5v15M14.5 4.5v15M4.5 9.5h15M4.5 14.5h15'],
  'arrows-rotate': ['M6.2 8.5A7 7 0 0 1 18 6.2', 'M18 3.4v2.8h-2.8', 'M17.8 15.5A7 7 0 0 1 6 17.8', 'M6 20.6v-2.8h2.8'],
  'circle-notch': 'M20 12a8 8 0 1 1-5.5-7.6',
  'book-open': ['M12 7.5v12', 'M4.8 5.2h4.9c1.3 0 2.3 1 2.3 2.3v12c0-1.2-1-2.1-2.3-2.1H4.8c-.8 0-1.3-.5-1.3-1.3V6.5c0-.8.5-1.3 1.3-1.3z', 'M19.2 5.2h-4.9c-1.3 0-2.3 1-2.3 2.3v12c0-1.2 1-2.1 2.3-2.1h4.9c.8 0 1.3-.5 1.3-1.3V6.5c0-.8-.5-1.3-1.3-1.3z'],
  'scroll': ['M7 19.5h10.5c1.1 0 2-.9 2-2v-1.2H9v1.2a2 2 0 1 1-4 0V6.5a2 2 0 1 1 4 0v9.8', 'M9 6.5c0-1.1.9-2 2-2h6.5c1.1 0 2 .9 2 2v9.8'],
  'id-badge': ['M7 4.5h10v15H7z', 'M10 8h4', 'M12 14a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z', 'M9.3 17c.4-1.3 1.3-2 2.7-2s2.3.7 2.7 2'],
  'check-badge': ['M12 20a8 8 0 1 1 8-8 8 8 0 0 1-8 8z', 'M8.5 12.3l2.4 2.4 4.9-5.2'],
};

const ICON_ALIASES = {
  'arrow-up-right-from-square': 'arrow-up-right-from-square',
  'check-circle': 'check-circle',
  'circle-check': 'circle-check',
  'circle-xmark': 'circle-xmark',
  'circle-exclamation': 'circle-exclamation',
  'circle-info': 'circle-info',
  'circle-question': 'circle-question',
  'circle-notch': 'spinner',
  'spinner-border': 'spinner',
  'spinner': 'spinner',
  'xmark': 'xmark',
};

/**
 * SVGアイコン要素を作成する。CIQ Symbol名のみを受け付ける。
 */
function createIcon(nameOrClass, opts = {}) {
  const name = normalizeIconName(nameOrClass);
  const { size = 24, className = '', title } = opts;
  const combinedClassName = [extractExtraIconClasses(nameOrClass), className].filter(Boolean).join(' ');
  if (name === 'spinner' || name === 'circle-notch' || name === 'spinner-border') {
    const wrap = document.createElement('span');
    wrap.className = 'spinner';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', title || '読み込み中');
    if (combinedClassName) wrap.classList.add(...combinedClassName.split(/\s+/).filter(Boolean));
    return wrap;
  }

  const data = ICON_PATHS[name] || ICON_PATHS['circle-question'];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-1 -1 26 26');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', title ? 'false' : 'true');
  svg.setAttribute('data-ciq-icon', name);
  svg.setAttribute('data-ciq-symbol-style', 'sf-like');
  if (title) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = title;
    svg.appendChild(t);
  }
  if (combinedClassName) svg.setAttribute('class', combinedClassName);

  if (!ICON_PATHS[name]) svg.setAttribute('data-missing-icon', String(nameOrClass || ''));
  const paths = Array.isArray(data) ? data : [data];
  paths.forEach((d) => {
    if (!d) return;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  });
  return svg;
}

function normalizeIconName(nameOrClass) {
  if (!nameOrClass) return '';
  const raw = String(nameOrClass).trim();
  return ICON_ALIASES[raw] || raw;
}

function extractExtraIconClasses(nameOrClass) {
  return '';
}

window.__createSvgIcon = createIcon;
window.createIcon = createIcon;
window.normalizeIconName = normalizeIconName;
window.ICON_PATHS = ICON_PATHS;

/**
 * 指定ルート内の [data-icon] を SVG アイコンに展開する。
 */
function replaceIcons(root = document.body) {
  const nodes = root.querySelectorAll('[data-icon]:not([data-icon-ready])');
  nodes.forEach((node) => {
    const name = node.getAttribute('data-icon');
    if (!name) return;
    if (node.querySelector('svg, .spinner')) {
      node.setAttribute('data-icon-ready', 'true');
      return;
    }
    const sizeAttr = node.getAttribute('data-icon-size');
    const opts = {};
    if (sizeAttr === 'sm') opts.size = 16;
    else if (sizeAttr === 'lg') opts.size = 28;
    else if (sizeAttr === 'xl') opts.size = 32;
    const ariaLabel = node.getAttribute('aria-label');
    if (ariaLabel) opts.title = ariaLabel;
    node.textContent = '';
    node.appendChild(createIcon(name, opts));
    node.setAttribute('data-icon-ready', 'true');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => replaceIcons(document.documentElement));
} else {
  replaceIcons(document.documentElement);
}

const iconObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    m.addedNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      if (node.matches && node.matches('[data-icon]:not([data-icon-ready])')) {
        replaceIcons(node.parentElement || document.body);
      } else if (node.querySelectorAll && node.querySelectorAll('[data-icon]:not([data-icon-ready])').length) {
        replaceIcons(node);
      }
    });
  }
});

if (document.body) {
  iconObserver.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    iconObserver.observe(document.body, { childList: true, subtree: true });
  });
}
