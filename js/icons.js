/**
 * CIQ Icon Registry — Lucide adapter
 *
 * The app keeps its existing CIQ logical icon names in HTML/JS and maps them
 * to bundled Lucide SVG node data. No external runtime request is required.
 *
 * Lucide static data: lucide-static@1.24.0, ISC License.
 * Source: https://github.com/lucide-icons/lucide
 */

const LUCIDE_LICENSE = "ISC License\n\nCopyright (c) 2026 Lucide Icons and Contributors\n\nPermission to use, copy, modify, and/or distribute this software for any\npurpose with or without fee is hereby granted, provided that the above\ncopyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\" AND THE AUTHOR DISCLAIMS ALL WARRANTIES\nWITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF\nMERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR\nANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES\nWHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN\nACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF\nOR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.\n\n---\n\nThe following Lucide icons are derived from the Feather project:\n\nairplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out\n\nThe MIT License (MIT) (for the icons listed above)\n\nCopyright (c) 2013-present Cole Bemis\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n";

const LUCIDE_ICON_NODES = {
  "arrow-left": [
    [
      "path",
      {
        "d": "m12 19-7-7 7-7"
      }
    ],
    [
      "path",
      {
        "d": "M19 12H5"
      }
    ]
  ],
  "arrow-right": [
    [
      "path",
      {
        "d": "M5 12h14"
      }
    ],
    [
      "path",
      {
        "d": "m12 5 7 7-7 7"
      }
    ]
  ],
  "badge-check": [
    [
      "path",
      {
        "d": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
      }
    ],
    [
      "path",
      {
        "d": "m9 12 2 2 4-4"
      }
    ]
  ],
  "badge-percent": [
    [
      "path",
      {
        "d": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
      }
    ],
    [
      "path",
      {
        "d": "m15 9-6 6"
      }
    ],
    [
      "path",
      {
        "d": "M9 9h.01"
      }
    ],
    [
      "path",
      {
        "d": "M15 15h.01"
      }
    ]
  ],
  "ban": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "M4.929 4.929 19.07 19.071"
      }
    ]
  ],
  "book-open": [
    [
      "path",
      {
        "d": "M12 7v14"
      }
    ],
    [
      "path",
      {
        "d": "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"
      }
    ]
  ],
  "calendar": [
    [
      "path",
      {
        "d": "M8 2v4"
      }
    ],
    [
      "path",
      {
        "d": "M16 2v4"
      }
    ],
    [
      "rect",
      {
        "width": "18",
        "height": "18",
        "x": "3",
        "y": "4",
        "rx": "2"
      }
    ],
    [
      "path",
      {
        "d": "M3 10h18"
      }
    ]
  ],
  "calendar-days": [
    [
      "path",
      {
        "d": "M8 2v4"
      }
    ],
    [
      "path",
      {
        "d": "M16 2v4"
      }
    ],
    [
      "rect",
      {
        "width": "18",
        "height": "18",
        "x": "3",
        "y": "4",
        "rx": "2"
      }
    ],
    [
      "path",
      {
        "d": "M3 10h18"
      }
    ],
    [
      "path",
      {
        "d": "M8 14h.01"
      }
    ],
    [
      "path",
      {
        "d": "M12 14h.01"
      }
    ],
    [
      "path",
      {
        "d": "M16 14h.01"
      }
    ],
    [
      "path",
      {
        "d": "M8 18h.01"
      }
    ],
    [
      "path",
      {
        "d": "M12 18h.01"
      }
    ],
    [
      "path",
      {
        "d": "M16 18h.01"
      }
    ]
  ],
  "check": [
    [
      "path",
      {
        "d": "M20 6 9 17l-5-5"
      }
    ]
  ],
  "check-check": [
    [
      "path",
      {
        "d": "M18 6 7 17l-5-5"
      }
    ],
    [
      "path",
      {
        "d": "m22 10-7.5 7.5L13 16"
      }
    ]
  ],
  "chevron-down": [
    [
      "path",
      {
        "d": "m6 9 6 6 6-6"
      }
    ]
  ],
  "chevron-left": [
    [
      "path",
      {
        "d": "m15 18-6-6 6-6"
      }
    ]
  ],
  "chevron-right": [
    [
      "path",
      {
        "d": "m9 18 6-6-6-6"
      }
    ]
  ],
  "circle": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ]
  ],
  "circle-alert": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "line",
      {
        "x1": "12",
        "x2": "12",
        "y1": "8",
        "y2": "12"
      }
    ],
    [
      "line",
      {
        "x1": "12",
        "x2": "12.01",
        "y1": "16",
        "y2": "16"
      }
    ]
  ],
  "circle-check": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "m9 12 2 2 4-4"
      }
    ]
  ],
  "circle-percent": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "m15 9-6 6"
      }
    ],
    [
      "path",
      {
        "d": "M9 9h.01"
      }
    ],
    [
      "path",
      {
        "d": "M15 15h.01"
      }
    ]
  ],
  "circle-plus": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "M8 12h8"
      }
    ],
    [
      "path",
      {
        "d": "M12 8v8"
      }
    ]
  ],
  "circle-question-mark": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
      }
    ],
    [
      "path",
      {
        "d": "M12 17h.01"
      }
    ]
  ],
  "circle-x": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "m15 9-6 6"
      }
    ],
    [
      "path",
      {
        "d": "m9 9 6 6"
      }
    ]
  ],
  "clock": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "M12 6v6l4 2"
      }
    ]
  ],
  "cloud-upload": [
    [
      "path",
      {
        "d": "M12 13v8"
      }
    ],
    [
      "path",
      {
        "d": "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"
      }
    ],
    [
      "path",
      {
        "d": "m8 17 4-4 4 4"
      }
    ]
  ],
  "copy": [
    [
      "rect",
      {
        "width": "14",
        "height": "14",
        "x": "8",
        "y": "8",
        "rx": "2",
        "ry": "2"
      }
    ],
    [
      "path",
      {
        "d": "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
      }
    ]
  ],
  "crown": [
    [
      "path",
      {
        "d": "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"
      }
    ],
    [
      "path",
      {
        "d": "M5 21h14"
      }
    ]
  ],
  "door-closed": [
    [
      "path",
      {
        "d": "M10 12h.01"
      }
    ],
    [
      "path",
      {
        "d": "M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"
      }
    ],
    [
      "path",
      {
        "d": "M2 20h20"
      }
    ]
  ],
  "download": [
    [
      "path",
      {
        "d": "M12 15V3"
      }
    ],
    [
      "path",
      {
        "d": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
      }
    ],
    [
      "path",
      {
        "d": "m7 10 5 5 5-5"
      }
    ]
  ],
  "ellipsis": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "1"
      }
    ],
    [
      "circle",
      {
        "cx": "19",
        "cy": "12",
        "r": "1"
      }
    ],
    [
      "circle",
      {
        "cx": "5",
        "cy": "12",
        "r": "1"
      }
    ]
  ],
  "file-image": [
    [
      "path",
      {
        "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
      }
    ],
    [
      "path",
      {
        "d": "M14 2v5a1 1 0 0 0 1 1h5"
      }
    ],
    [
      "circle",
      {
        "cx": "10",
        "cy": "12",
        "r": "2"
      }
    ],
    [
      "path",
      {
        "d": "m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"
      }
    ]
  ],
  "file-output": [
    [
      "path",
      {
        "d": "M4.226 20.925A2 2 0 0 0 6 22h12a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.127"
      }
    ],
    [
      "path",
      {
        "d": "M14 2v5a1 1 0 0 0 1 1h5"
      }
    ],
    [
      "path",
      {
        "d": "m5 11-3 3"
      }
    ],
    [
      "path",
      {
        "d": "m5 17-3-3h10"
      }
    ]
  ],
  "file-pen-line": [
    [
      "path",
      {
        "d": "M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z"
      }
    ],
    [
      "path",
      {
        "d": "M14.487 7.858A1 1 0 0 1 14 7V2"
      }
    ],
    [
      "path",
      {
        "d": "M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516"
      }
    ],
    [
      "path",
      {
        "d": "M8 18h1"
      }
    ]
  ],
  "file-spreadsheet": [
    [
      "path",
      {
        "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
      }
    ],
    [
      "path",
      {
        "d": "M14 2v5a1 1 0 0 0 1 1h5"
      }
    ],
    [
      "path",
      {
        "d": "M8 13h2"
      }
    ],
    [
      "path",
      {
        "d": "M14 13h2"
      }
    ],
    [
      "path",
      {
        "d": "M8 17h2"
      }
    ],
    [
      "path",
      {
        "d": "M14 17h2"
      }
    ]
  ],
  "file-text": [
    [
      "path",
      {
        "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
      }
    ],
    [
      "path",
      {
        "d": "M14 2v5a1 1 0 0 0 1 1h5"
      }
    ],
    [
      "path",
      {
        "d": "M10 9H8"
      }
    ],
    [
      "path",
      {
        "d": "M16 13H8"
      }
    ],
    [
      "path",
      {
        "d": "M16 17H8"
      }
    ]
  ],
  "file-type": [
    [
      "path",
      {
        "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
      }
    ],
    [
      "path",
      {
        "d": "M14 2v5a1 1 0 0 0 1 1h5"
      }
    ],
    [
      "path",
      {
        "d": "M11 18h2"
      }
    ],
    [
      "path",
      {
        "d": "M12 12v6"
      }
    ],
    [
      "path",
      {
        "d": "M9 13v-.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v.5"
      }
    ]
  ],
  "flag": [
    [
      "path",
      {
        "d": "M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"
      }
    ]
  ],
  "folder-open": [
    [
      "path",
      {
        "d": "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
      }
    ]
  ],
  "gauge": [
    [
      "path",
      {
        "d": "m12 14 4-4"
      }
    ],
    [
      "path",
      {
        "d": "M3.34 19a10 10 0 1 1 17.32 0"
      }
    ]
  ],
  "ghost": [
    [
      "path",
      {
        "d": "M9 10h.01"
      }
    ],
    [
      "path",
      {
        "d": "M15 10h.01"
      }
    ],
    [
      "path",
      {
        "d": "M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"
      }
    ]
  ],
  "hash": [
    [
      "line",
      {
        "x1": "4",
        "x2": "20",
        "y1": "9",
        "y2": "9"
      }
    ],
    [
      "line",
      {
        "x1": "4",
        "x2": "20",
        "y1": "15",
        "y2": "15"
      }
    ],
    [
      "line",
      {
        "x1": "10",
        "x2": "8",
        "y1": "3",
        "y2": "21"
      }
    ],
    [
      "line",
      {
        "x1": "16",
        "x2": "14",
        "y1": "3",
        "y2": "21"
      }
    ]
  ],
  "history": [
    [
      "path",
      {
        "d": "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
      }
    ],
    [
      "path",
      {
        "d": "M3 3v5h5"
      }
    ],
    [
      "path",
      {
        "d": "M12 7v5l4 2"
      }
    ]
  ],
  "hourglass": [
    [
      "path",
      {
        "d": "M5 22h14"
      }
    ],
    [
      "path",
      {
        "d": "M5 2h14"
      }
    ],
    [
      "path",
      {
        "d": "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"
      }
    ],
    [
      "path",
      {
        "d": "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"
      }
    ]
  ],
  "house": [
    [
      "path",
      {
        "d": "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"
      }
    ],
    [
      "path",
      {
        "d": "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      }
    ]
  ],
  "inbox": [
    [
      "polyline",
      {
        "points": "22 12 16 12 14 15 10 15 8 12 2 12"
      }
    ],
    [
      "path",
      {
        "d": "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
      }
    ]
  ],
  "info": [
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "10"
      }
    ],
    [
      "path",
      {
        "d": "M12 16v-4"
      }
    ],
    [
      "path",
      {
        "d": "M12 8h.01"
      }
    ]
  ],
  "keyboard": [
    [
      "path",
      {
        "d": "M10 8h.01"
      }
    ],
    [
      "path",
      {
        "d": "M12 12h.01"
      }
    ],
    [
      "path",
      {
        "d": "M14 8h.01"
      }
    ],
    [
      "path",
      {
        "d": "M16 12h.01"
      }
    ],
    [
      "path",
      {
        "d": "M18 8h.01"
      }
    ],
    [
      "path",
      {
        "d": "M6 8h.01"
      }
    ],
    [
      "path",
      {
        "d": "M7 16h10"
      }
    ],
    [
      "path",
      {
        "d": "M8 12h.01"
      }
    ],
    [
      "rect",
      {
        "width": "20",
        "height": "16",
        "x": "2",
        "y": "4",
        "rx": "2"
      }
    ]
  ],
  "list": [
    [
      "path",
      {
        "d": "M3 5h.01"
      }
    ],
    [
      "path",
      {
        "d": "M3 12h.01"
      }
    ],
    [
      "path",
      {
        "d": "M3 19h.01"
      }
    ],
    [
      "path",
      {
        "d": "M8 5h13"
      }
    ],
    [
      "path",
      {
        "d": "M8 12h13"
      }
    ],
    [
      "path",
      {
        "d": "M8 19h13"
      }
    ]
  ],
  "loader-circle": [
    [
      "path",
      {
        "d": "M21 12a9 9 0 1 1-6.219-8.56"
      }
    ]
  ],
  "lock": [
    [
      "rect",
      {
        "width": "18",
        "height": "11",
        "x": "3",
        "y": "11",
        "rx": "2",
        "ry": "2"
      }
    ],
    [
      "path",
      {
        "d": "M7 11V7a5 5 0 0 1 10 0v4"
      }
    ]
  ],
  "log-in": [
    [
      "path",
      {
        "d": "m10 17 5-5-5-5"
      }
    ],
    [
      "path",
      {
        "d": "M15 12H3"
      }
    ],
    [
      "path",
      {
        "d": "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"
      }
    ]
  ],
  "log-out": [
    [
      "path",
      {
        "d": "m16 17 5-5-5-5"
      }
    ],
    [
      "path",
      {
        "d": "M21 12H9"
      }
    ],
    [
      "path",
      {
        "d": "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
      }
    ]
  ],
  "mail": [
    [
      "path",
      {
        "d": "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"
      }
    ],
    [
      "rect",
      {
        "x": "2",
        "y": "4",
        "width": "20",
        "height": "16",
        "rx": "2"
      }
    ]
  ],
  "mail-check": [
    [
      "path",
      {
        "d": "M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"
      }
    ],
    [
      "path",
      {
        "d": "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
      }
    ],
    [
      "path",
      {
        "d": "m16 19 2 2 4-4"
      }
    ]
  ],
  "mail-x": [
    [
      "path",
      {
        "d": "M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"
      }
    ],
    [
      "path",
      {
        "d": "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
      }
    ],
    [
      "path",
      {
        "d": "m17 17 4 4"
      }
    ],
    [
      "path",
      {
        "d": "m21 17-4 4"
      }
    ]
  ],
  "map-pin": [
    [
      "path",
      {
        "d": "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
      }
    ],
    [
      "circle",
      {
        "cx": "12",
        "cy": "10",
        "r": "3"
      }
    ]
  ],
  "menu": [
    [
      "path",
      {
        "d": "M4 5h16"
      }
    ],
    [
      "path",
      {
        "d": "M4 12h16"
      }
    ],
    [
      "path",
      {
        "d": "M4 19h16"
      }
    ]
  ],
  "minus": [
    [
      "path",
      {
        "d": "M5 12h14"
      }
    ]
  ],
  "paperclip": [
    [
      "path",
      {
        "d": "m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"
      }
    ]
  ],
  "pen": [
    [
      "path",
      {
        "d": "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
      }
    ]
  ],
  "percent": [
    [
      "line",
      {
        "x1": "19",
        "x2": "5",
        "y1": "5",
        "y2": "19"
      }
    ],
    [
      "circle",
      {
        "cx": "6.5",
        "cy": "6.5",
        "r": "2.5"
      }
    ],
    [
      "circle",
      {
        "cx": "17.5",
        "cy": "17.5",
        "r": "2.5"
      }
    ]
  ],
  "plus": [
    [
      "path",
      {
        "d": "M5 12h14"
      }
    ],
    [
      "path",
      {
        "d": "M12 5v14"
      }
    ]
  ],
  "qr-code": [
    [
      "rect",
      {
        "width": "5",
        "height": "5",
        "x": "3",
        "y": "3",
        "rx": "1"
      }
    ],
    [
      "rect",
      {
        "width": "5",
        "height": "5",
        "x": "16",
        "y": "3",
        "rx": "1"
      }
    ],
    [
      "rect",
      {
        "width": "5",
        "height": "5",
        "x": "3",
        "y": "16",
        "rx": "1"
      }
    ],
    [
      "path",
      {
        "d": "M21 16h-3a2 2 0 0 0-2 2v3"
      }
    ],
    [
      "path",
      {
        "d": "M21 21v.01"
      }
    ],
    [
      "path",
      {
        "d": "M12 7v3a2 2 0 0 1-2 2H7"
      }
    ],
    [
      "path",
      {
        "d": "M3 12h.01"
      }
    ],
    [
      "path",
      {
        "d": "M12 3h.01"
      }
    ],
    [
      "path",
      {
        "d": "M12 16v.01"
      }
    ],
    [
      "path",
      {
        "d": "M16 12h1"
      }
    ],
    [
      "path",
      {
        "d": "M21 12v.01"
      }
    ],
    [
      "path",
      {
        "d": "M12 21v-1"
      }
    ]
  ],
  "refresh-cw": [
    [
      "path",
      {
        "d": "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"
      }
    ],
    [
      "path",
      {
        "d": "M21 3v5h-5"
      }
    ],
    [
      "path",
      {
        "d": "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"
      }
    ],
    [
      "path",
      {
        "d": "M8 16H3v5"
      }
    ]
  ],
  "rotate-ccw": [
    [
      "path",
      {
        "d": "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
      }
    ],
    [
      "path",
      {
        "d": "M3 3v5h5"
      }
    ]
  ],
  "rotate-cw": [
    [
      "path",
      {
        "d": "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
      }
    ],
    [
      "path",
      {
        "d": "M21 3v5h-5"
      }
    ]
  ],
  "save": [
    [
      "path",
      {
        "d": "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
      }
    ],
    [
      "path",
      {
        "d": "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"
      }
    ],
    [
      "path",
      {
        "d": "M7 3v4a1 1 0 0 0 1 1h7"
      }
    ]
  ],
  "scroll-text": [
    [
      "path",
      {
        "d": "M15 12h-5"
      }
    ],
    [
      "path",
      {
        "d": "M15 8h-5"
      }
    ],
    [
      "path",
      {
        "d": "M19 17V5a2 2 0 0 0-2-2H4"
      }
    ],
    [
      "path",
      {
        "d": "M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"
      }
    ]
  ],
  "send": [
    [
      "path",
      {
        "d": "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"
      }
    ],
    [
      "path",
      {
        "d": "m21.854 2.147-10.94 10.939"
      }
    ]
  ],
  "settings": [
    [
      "path",
      {
        "d": "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
      }
    ],
    [
      "circle",
      {
        "cx": "12",
        "cy": "12",
        "r": "3"
      }
    ]
  ],
  "share": [
    [
      "path",
      {
        "d": "M12 2v13"
      }
    ],
    [
      "path",
      {
        "d": "m16 6-4-4-4 4"
      }
    ],
    [
      "path",
      {
        "d": "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"
      }
    ]
  ],
  "shield-half": [
    [
      "path",
      {
        "d": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
      }
    ],
    [
      "path",
      {
        "d": "M12 22V2"
      }
    ]
  ],
  "spell-check": [
    [
      "path",
      {
        "d": "m6 16 6-12 6 12"
      }
    ],
    [
      "path",
      {
        "d": "M8 12h8"
      }
    ],
    [
      "path",
      {
        "d": "m16 20 2 2 4-4"
      }
    ]
  ],
  "square-arrow-up-right": [
    [
      "path",
      {
        "d": "M15 15V9H9"
      }
    ],
    [
      "path",
      {
        "d": "m9 15 6-6"
      }
    ],
    [
      "rect",
      {
        "x": "3",
        "y": "3",
        "width": "18",
        "height": "18",
        "rx": "2"
      }
    ]
  ],
  "square-pen": [
    [
      "path",
      {
        "d": "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
      }
    ],
    [
      "path",
      {
        "d": "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"
      }
    ]
  ],
  "table-cells-split": [
    [
      "path",
      {
        "d": "M12 15V9"
      }
    ],
    [
      "path",
      {
        "d": "M3 15h18"
      }
    ],
    [
      "path",
      {
        "d": "M3 9h18"
      }
    ],
    [
      "rect",
      {
        "width": "18",
        "height": "18",
        "x": "3",
        "y": "3",
        "rx": "2"
      }
    ]
  ],
  "trash-2": [
    [
      "path",
      {
        "d": "M10 11v6"
      }
    ],
    [
      "path",
      {
        "d": "M14 11v6"
      }
    ],
    [
      "path",
      {
        "d": "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
      }
    ],
    [
      "path",
      {
        "d": "M3 6h18"
      }
    ],
    [
      "path",
      {
        "d": "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
      }
    ]
  ],
  "triangle": [
    [
      "path",
      {
        "d": "M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
      }
    ]
  ],
  "triangle-alert": [
    [
      "path",
      {
        "d": "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
      }
    ],
    [
      "path",
      {
        "d": "M12 9v4"
      }
    ],
    [
      "path",
      {
        "d": "M12 17h.01"
      }
    ]
  ],
  "trophy": [
    [
      "path",
      {
        "d": "M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978"
      }
    ],
    [
      "path",
      {
        "d": "M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978"
      }
    ],
    [
      "path",
      {
        "d": "M18 9h1.5a1 1 0 0 0 0-5H18"
      }
    ],
    [
      "path",
      {
        "d": "M4 22h16"
      }
    ],
    [
      "path",
      {
        "d": "M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"
      }
    ],
    [
      "path",
      {
        "d": "M6 9H4.5a1 1 0 0 1 0-5H6"
      }
    ]
  ],
  "user": [
    [
      "path",
      {
        "d": "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
      }
    ],
    [
      "circle",
      {
        "cx": "12",
        "cy": "7",
        "r": "4"
      }
    ]
  ],
  "user-check": [
    [
      "path",
      {
        "d": "m16 11 2 2 4-4"
      }
    ],
    [
      "path",
      {
        "d": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
      }
    ],
    [
      "circle",
      {
        "cx": "9",
        "cy": "7",
        "r": "4"
      }
    ]
  ],
  "user-cog": [
    [
      "path",
      {
        "d": "M10 15H6a4 4 0 0 0-4 4v2"
      }
    ],
    [
      "path",
      {
        "d": "m14.305 16.53.923-.382"
      }
    ],
    [
      "path",
      {
        "d": "m15.228 13.852-.923-.383"
      }
    ],
    [
      "path",
      {
        "d": "m16.852 12.228-.383-.923"
      }
    ],
    [
      "path",
      {
        "d": "m16.852 17.772-.383.924"
      }
    ],
    [
      "path",
      {
        "d": "m19.148 12.228.383-.923"
      }
    ],
    [
      "path",
      {
        "d": "m19.53 18.696-.382-.924"
      }
    ],
    [
      "path",
      {
        "d": "m20.772 13.852.924-.383"
      }
    ],
    [
      "path",
      {
        "d": "m20.772 16.148.924.383"
      }
    ],
    [
      "circle",
      {
        "cx": "18",
        "cy": "15",
        "r": "3"
      }
    ],
    [
      "circle",
      {
        "cx": "9",
        "cy": "7",
        "r": "4"
      }
    ]
  ],
  "user-plus": [
    [
      "path",
      {
        "d": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
      }
    ],
    [
      "circle",
      {
        "cx": "9",
        "cy": "7",
        "r": "4"
      }
    ],
    [
      "line",
      {
        "x1": "19",
        "x2": "19",
        "y1": "8",
        "y2": "14"
      }
    ],
    [
      "line",
      {
        "x1": "22",
        "x2": "16",
        "y1": "11",
        "y2": "11"
      }
    ]
  ],
  "user-x": [
    [
      "path",
      {
        "d": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
      }
    ],
    [
      "circle",
      {
        "cx": "9",
        "cy": "7",
        "r": "4"
      }
    ],
    [
      "line",
      {
        "x1": "17",
        "x2": "22",
        "y1": "8",
        "y2": "13"
      }
    ],
    [
      "line",
      {
        "x1": "22",
        "x2": "17",
        "y1": "8",
        "y2": "13"
      }
    ]
  ],
  "wifi": [
    [
      "path",
      {
        "d": "M12 20h.01"
      }
    ],
    [
      "path",
      {
        "d": "M2 8.82a15 15 0 0 1 20 0"
      }
    ],
    [
      "path",
      {
        "d": "M5 12.859a10 10 0 0 1 14 0"
      }
    ],
    [
      "path",
      {
        "d": "M8.5 16.429a5 5 0 0 1 7 0"
      }
    ]
  ],
  "x": [
    [
      "path",
      {
        "d": "M18 6 6 18"
      }
    ],
    [
      "path",
      {
        "d": "m6 6 12 12"
      }
    ]
  ]
};

const ICON_ALIASES = {
  "arrow-left": "arrow-left",
  "arrow-right": "arrow-right",
  "arrow-right-to-bracket": "log-in",
  "arrow-up-right-from-square": "square-arrow-up-right",
  "arrows-rotate": "refresh-cw",
  "badge-percent": "badge-percent",
  "ban": "ban",
  "book-open": "book-open",
  "calendar": "calendar",
  "calendar-days": "calendar-days",
  "check": "check",
  "check-badge": "badge-check",
  "check-circle": "circle-check",
  "check-double": "check-check",
  "chevron-down": "chevron-down",
  "chevron-left": "chevron-left",
  "chevron-right": "chevron-right",
  "circle": "circle",
  "circle-alert": "circle-alert",
  "circle-check": "circle-check",
  "circle-exclamation": "circle-alert",
  "circle-info": "info",
  "circle-notch": "loader-circle",
  "circle-percent": "circle-percent",
  "circle-plus": "circle-plus",
  "circle-question": "circle-question-mark",
  "circle-xmark": "circle-x",
  "clock": "clock",
  "clock-rotate-left": "history",
  "cloud-arrow-up": "cloud-upload",
  "copy": "copy",
  "crown": "crown",
  "door-closed": "door-closed",
  "download": "download",
  "ellipsis": "ellipsis",
  "envelope": "mail",
  "envelope-circle-check": "mail-check",
  "envelope-circle-xmark": "mail-x",
  "file-csv": "file-spreadsheet",
  "file-export": "file-output",
  "file-image": "file-image",
  "file-lines": "file-text",
  "file-pdf": "file-type",
  "file-pen": "file-pen-line",
  "flag-checkered": "flag",
  "floppy-disk": "save",
  "folder-open": "folder-open",
  "gauge": "gauge",
  "gear": "settings",
  "ghost": "ghost",
  "hashtag": "hash",
  "history": "history",
  "home": "house",
  "hourglass": "hourglass",
  "inbox": "inbox",
  "keyboard": "keyboard",
  "line-3-horizontal": "menu",
  "list": "list",
  "lock": "lock",
  "map-pin": "map-pin",
  "minus": "minus",
  "paper-plane": "send",
  "paperclip": "paperclip",
  "pen": "pen",
  "pen-to-square": "square-pen",
  "percent": "percent",
  "plus": "plus",
  "qrcode": "qr-code",
  "ranking-star": "trophy",
  "right-from-bracket": "log-out",
  "rotate": "refresh-cw",
  "rotate-left": "rotate-ccw",
  "rotate-right": "rotate-cw",
  "scroll": "scroll-text",
  "share-from-square": "share",
  "shield-halved": "shield-half",
  "spell-check": "spell-check",
  "spinner": "loader-circle",
  "spinner-border": "loader-circle",
  "table-cells-large": "table-cells-split",
  "trash": "trash-2",
  "triangle": "triangle",
  "triangle-exclamation": "triangle-alert",
  "user": "user",
  "user-check": "user-check",
  "user-plus": "user-plus",
  "user-xmark": "user-x",
  "users-gear": "user-cog",
  "wifi": "wifi",
  "xmark": "x"
};

function normalizeIconName(nameOrClass) {
  if (!nameOrClass) return '';
  const raw = String(nameOrClass).trim();
  return ICON_ALIASES[raw] || raw;
}

function createIcon(nameOrClass, opts = {}) {
  const normalized = normalizeIconName(nameOrClass);
  const logicalName = String(nameOrClass || '').trim();
  const { size = 24, className = '', title } = opts;
  const isSpinner = normalized === 'loader-circle';

  if (isSpinner) {
    const wrap = document.createElement('span');
    wrap.className = 'spinner';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', title || '読み込み中');
    if (className) wrap.classList.add(...String(className).split(/\s+/).filter(Boolean));
    return wrap;
  }

  const nodeData = LUCIDE_ICON_NODES[normalized] || LUCIDE_ICON_NODES['circle-question-mark'];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', title ? 'false' : 'true');
  svg.setAttribute('data-ciq-icon', logicalName || normalized);
  svg.setAttribute('data-lucide', normalized);
  if (title) {
    const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleEl.textContent = title;
    svg.appendChild(titleEl);
  }
  if (className) svg.setAttribute('class', className);
  if (!LUCIDE_ICON_NODES[normalized]) svg.setAttribute('data-missing-icon', logicalName || normalized);

  nodeData.forEach(([tag, attrs]) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      el.setAttribute(key, String(value));
    });
    svg.appendChild(el);
  });
  return svg;
}

window.__createSvgIcon = createIcon;
window.createIcon = createIcon;
window.normalizeIconName = normalizeIconName;
window.LUCIDE_ICON_NODES = LUCIDE_ICON_NODES;
window.CIQ_ICON_ALIASES = ICON_ALIASES;
window.CIQ_ICON_LICENSE = LUCIDE_LICENSE;

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
    const svg = createIcon(name, opts);
    node.textContent = '';
    node.appendChild(svg);
    node.setAttribute('data-icon-ready', 'true');
  });
}

document.addEventListener('DOMContentLoaded', () => replaceIcons());
window.replaceIcons = replaceIcons;
