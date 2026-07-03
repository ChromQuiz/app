/**
 * CIQ Icon Registry (js/icons.js)
 * Lucide 風 outline SVG アイコンレジストリ。Font Awesome を完全置換。
 * currentColor / 24px / stroke 2。`<span data-icon="name">` を SVG に展開。
 */

const ICON_PATHS = {
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  'arrow-right-to-bracket': 'M10 12H3M9 5l7 7-7 7M21 5v14',
  'right-from-bracket': 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  'right-to-bracket': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  'home': 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  'xmark': 'M18 6 6 18M6 6l12 12',
  'plus': 'M12 5v14M5 12h14',
  'minus': 'M5 12h14',
  'check': 'M20 6 9 17l-5-5',
  'check-double': 'M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16',
  'rotate': 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5',
  'rotate-right': 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5',
  'rotate-left': 'M3 12a9 9 0 1 0 9-9c-2.52 0-4.93 1-6.74 2.74L3 8M3 3v5h5',

  'circle-check': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M9 12l2 2 4-4'],
  'check-circle': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M9 12l2 2 4-4'],
  'circle-xmark': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M15 9l-6 6M9 9l6 6'],
  'circle-info': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 16v-4M12 8h.01'],
  'circle-question': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01'],
  'circle-plus': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 8v8M8 12h8'],
  'circle-exclamation': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 8v4M12 16h.01'],
  'triangle-exclamation': 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  'ban': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M4 4l16 16'],
  'lock': 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
  'unlock': 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 9.9-1',
  'shield-halved': 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  'flag-checkered': 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22V15',
  'wifi': 'M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0M12 20h.01',

  'copy': ['M20 14h-7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2z', 'M9 20H6a2 2 0 0 1-2-2V9'],
  'download': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  'trash': 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  'pen': 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  'pen-to-square': ['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z'],
  'file-pen': 'M18 10h-3a2 2 0 0 1-2-2V3M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l6 6v3M13.4 12.6 19 18l-3 1-1 3-5.6-5.4',
  'floppy-disk': 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
  'paper-plane': 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  'send': 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  'save': 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8M7 3v5h8',
  'share-from-square': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5-5 5 5M12 5v12',
  'key': 'M15.5 7.5a3.5 3.5 0 1 0-5 5 3.5 3.5 0 0 0 5-5zM11 12 3 20M3 16v4h4',

  'user': 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M16 3.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  'users': 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  'user-plus': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM19 8v6M22 11h-6',
  'user-xmark': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM17 8l4 4M21 8l-4 4',
  'user-check': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 11l2 2 4-4',
  'user-clock': 'M19 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75 M9 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM15 8h.01M12 2v4',
  'user-shield': 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  'crown': 'M2 4l3 12h14l3-12-6 7-4-7-4 7z',
  'address-book': 'M16 2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12M20 6v4M20 14v4M9 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 17h.01',
  'fingerprint': 'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4M9 18a14 14 0 0 0 .83-4M14.26 5.74A4 4 0 0 0 8 8c0 1.06.13 2.65.42 4.5M2 12c0-2.64.99-5.05 2.62-6.88M19 12c0 1.97-.27 4.27-.7 6.42',

  'envelope': ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 7-10 5L2 7'],
  'envelope-circle-check': ['M21 8a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M9 21H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11'],
  'envelope-circle-xmark': ['M21 8a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M9 21H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11'],
  'comment': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'message': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'paperclip': 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',

  'file-lines': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6M16 13H8M16 17H8M10 9H8'],
  'file-pdf': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6M9 15h6M9 15v3M12 15v3'],
  'file-csv': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
  'file-image': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6M8 13l2 2 3-3 5 5'],
  'file-export': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6M19 12H9M16 9l3 3-3 3'],
  'folder-open': 'M6 14l1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2',
  'spell-check': 'M12 16l4-4 3 3L22 5M2 7l4 10M4 5l4 10M3 11h4',

  'chart-column': 'M3 3v18h18M7 16V11M12 16V7M17 16v-3',
  'chart-bar': 'M3 3v18h18M7 16V11M12 16V7M17 16v-3',
  'chart-pie': ['M21.21 15.89A10 10 0 1 1 8 2.83', 'M22 12A10 10 0 0 0 12 2v10z'],
  'magnifying-glass-chart': ['M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM21 21l-4.3-4.3', 'M8 11h6M11 8v6'],
  'list': 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  'list-ol': 'M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  'list-check': 'M3 5l2 2 4-4M3 13l2 2 4-4M11 6h10M11 13h10M11 20h10',
  'list-check-alt': ['M3 5l2 2 4-4M3 13l2 2 4-4', 'M11 6h10M11 13h10M11 20h10'],
  'hashtag': 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
  'ranking-star': 'M12 2v8M8 6l4-4 4 4M3 10l18 0M5 18l2 4M19 18l-2 4',
  'percent': 'M19 5 5 19M6.5 6.5h.01M17.5 17.5h.01',
  'trophy': 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z',

  'gear': 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  'gauge': 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM13.4 10.6 19 5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  'wrench': 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  'sliders': 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  'users-gear': 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM14.7 14.7l3.6-3.6M19.5 11.5h.01M21.7 13.7l-1 1M21 17h.01',

  'calendar': ['M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', ''],
  'calendar-days': ['M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M3 14h18'],
  'clock': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 7v5l3 3'],
  'clock-rotate-left': 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l3 3',
  'play': 'M5 3l14 9-14 9V3z',
  'stop': 'M5 3h14v18H5z',
  'history': 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l3 3',
  'hourglass': 'M5 22h14M5 2h14M17 22v-4a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v4M7 2v4a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V2',

  'school': 'M14 22v-4a2 2 0 0 0-4 0v4M18 22V8M12 2 2 9l10 7 10-7z M6 12v5c0 1 2 3 6 3s6-2 6-3v-5',
  'graduation-cap': 'M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c0 1 2 3 6 3s6-2 6-3v-5',
  'tower-broadcast': 'M11 5 6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M22 5a10 10 0 0 1 0 14',

  'qrcode': 'M3 3v6h6V3H3z M3 15v6h6v-6H3z M15 3v6h6V3h-6z M15 15v6h6v-6h-6z',
  'camera': ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M12 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  'cloud-arrow-up': 'M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 16.2M12 12v13M8 17l4-4 4 4',
  'box-open': 'M12.89 1.45 8 11l4 9 8-9-3.11-9.55a1 1 0 0 0-1.79 0zM8 11 3 14l5 6 4-9zM16 11l5 3-5 6-4-9z',
  'inbox': 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  'map-location-dot': ['M12 21s-6-5.686-6-10a6 6 0 0 1 12 0c0 4.314-6 10-6 10z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  'map-pin': ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  'door-open': 'M13 4h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6M3 22h18M3 2h18M13 2v20M16 12h.01',
  'door-closed': 'M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14M2 20h20M12 12h.01',
  'ghost': 'M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 3 3 2-2 2 2 3-3 3 3V10a8 8 0 0 0-8-8z',
  'keyboard': 'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h.01M16 14h.01',
  'table-cells-large': 'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',
  'th': 'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',
  'user-slash': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 0 0 4 4M22 2 2 22',
  'arrows-rotate': 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5',
  'circle-notch': 'M21 12a9 9 0 1 1-6.219-8.56',
  'book-open': 'M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  'scroll': 'M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4M19 17V5a2 2 0 0 0-2-2H4',
  'id-badge': ['M6 4h12v16H6z', 'M9 8h6M12 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4z'],
  'check-badge': 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
};

/**
 * SVGアイコン要素を作成する。FA class 文字列と icon name の両方を受け付ける。
 */
function createIcon(nameOrClass, opts = {}) {
  const name = normalizeIconName(nameOrClass);
  const { size = 24, className = '', title } = opts;
  if (name === 'spinner' || name === 'circle-notch' || name === 'spinner-border') {
    const wrap = document.createElement('span');
    wrap.className = 'spinner';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', title || '読み込み中');
    if (className) wrap.classList.add(...className.split(/\s+/).filter(Boolean));
    return wrap;
  }

  const data = ICON_PATHS[name];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', title ? 'false' : 'true');
  if (title) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = title;
    svg.appendChild(t);
  }
  if (className) svg.setAttribute('class', className);

  if (data == null) {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', '2'); r.setAttribute('y', '2');
    r.setAttribute('width', '20'); r.setAttribute('height', '20');
    r.setAttribute('rx', '2');
    svg.appendChild(r);
  } else {
    const paths = Array.isArray(data) ? data : [data];
    paths.forEach((d) => {
      if (!d) return;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
  }
  return svg;
}

function normalizeIconName(nameOrClass) {
  if (!nameOrClass) return '';
  const faMatch = String(nameOrClass).match(/fa-([a-z0-9-]+)/);
  if (faMatch) return faMatch[1];
  return String(nameOrClass);
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
