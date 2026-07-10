/**
 * CIQ Symbol Registry v2 (js/icons.js)
 * SF Symbols のデザイン言語を参考にした自前 SVG レジストリ。外部アイコンセットに依存しない。
 * `<span data-icon="name">` を SVG に展開。
 *
 * v2 共通規格:
 * - グリッド 24x24 / viewBox "-1 -1 26 26"（ストロークのはみ出しマージン）
 * - stroke ICON_STROKE_WIDTH / currentColor / round cap / round join
 * - 円形アイコン: 中心(12,12) 半径8.25 で統一
 * - 角丸コンテナ(file/envelope/lock等): 角丸半径2 で統一
 * - シェブロン・矢印の羽: 開き角90°・羽長5.1〜5.75 で統一
 * - user系: 頭 = 円(r3.4〜3.65)、肩 = 開いた円弧、の比率を共有
 * - バッジ付き複合アイコン: バッジ円 r4.3 を右下(17.25,16.75)に配置し親シェイプ側を短縮
 */

const ICON_STROKE_WIDTH = 1.7;

function iconPath(d, opts = {}) {
  return { d, ...opts };
}

function filledIcon(...paths) {
  return { paths: paths.flat().filter(Boolean).map((item) => (typeof item === 'string' ? iconPath(item) : item)) };
}

function evenOdd(d) {
  return iconPath(d, { fillRule: 'evenodd' });
}

function disk(cx, cy, r) {
  return `M${cx} ${cy}m-${r} 0a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 -${r * 2} 0`;
}

function ring(cx, cy, outer, inner) {
  return evenOdd(`${disk(cx, cy, outer)}${disk(cx, cy, inner)}`);
}

function rr(x, y, w, h, r) {
  const x2 = x + w;
  const y2 = y + h;
  return `M${x + r} ${y}H${x2 - r}a${r} ${r} 0 0 1 ${r} ${r}V${y2 - r}a${r} ${r} 0 0 1 -${r} ${r}H${x + r}a${r} ${r} 0 0 1 -${r}-${r}V${y + r}a${r} ${r} 0 0 1 ${r}-${r}z`;
}

function cap(x1, y1, x2, y2, width) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy * width / 2;
  const py = ux * width / 2;
  const r = width / 2;
  // 周回は反時計回りのため端部アークは sweep=0（外側に凸）。sweep=1 だと魚尾状に凹む。
  return `M${(x1 + px).toFixed(2)} ${(y1 + py).toFixed(2)}L${(x2 + px).toFixed(2)} ${(y2 + py).toFixed(2)}a${r} ${r} 0 0 0 ${(px * -2).toFixed(2)} ${(py * -2).toFixed(2)}L${(x1 - px).toFixed(2)} ${(y1 - py).toFixed(2)}a${r} ${r} 0 0 0 ${(px * 2).toFixed(2)} ${(py * 2).toFixed(2)}z`;
}

function dot(cx, cy, r = 1) {
  return disk(cx, cy, r);
}

// ---- C1 コアマーク（filled-surface 再設計マスター） ----
// 主ステム厚 2.3 / 端点フルラウンド / シェブロン・矢印の開き角90° / 光学中心 y≈11.9
// マーク単体はエンクロージャ内白抜きより太め（周囲に黒面が無く軽く見えるための光学補正）

const MARK = {
  stem: 2.3,
  chevronArm: 5.15,
};

function markChevron(dir) {
  const a = MARK.chevronArm;
  const w = MARK.stem;
  if (dir === 'down') {
    return [cap(6.85, 9.45, 12, 14.6, w), cap(12, 14.6, 17.15, 9.45, w)];
  }
  const vx = dir === 'right' ? 14.55 : 9.45;
  const sx = dir === 'right' ? vx - a : vx + a;
  return [cap(sx, 12 - a, vx, 12, w), cap(vx, 12, sx, 12 + a, w)];
}

function markArrow(dir) {
  // dir: 1=right / -1=left。シャフト＋角丸三角ヘッド。先端は+0.3オーバーシュート。
  const m = (x) => +(12 + dir * (x - 12)).toFixed(2);
  const s = dir === 1 ? 1 : 0;
  const head = `M${m(15.24)} 8.52L${m(19.62)} 11.41A.7 .7 0 0 ${s} ${m(19.62)} 12.59L${m(15.24)} 15.48A.8 .8 0 0 ${s} ${m(14)} 14.81L${m(14)} 9.19A.8 .8 0 0 ${s} ${m(15.24)} 8.52z`;
  return [cap(m(4.8), 12, m(15.3), 12, 2.2), head];
}

function markX() {
  // plus より一回り小さい対角スパン（SF の xmark 比率）
  return [cap(7.11, 7.01, 16.89, 16.79, MARK.stem), cap(16.89, 7.01, 7.11, 16.79, MARK.stem)];
}

function markPlus() {
  return [rr(10.85, 4.7, 2.3, 14.6, 1.15), rr(4.7, 10.85, 14.6, 2.3, 1.15)];
}

function markMinus() {
  return rr(4.7, 10.85, 14.6, 2.3, 1.15);
}

function markMenu() {
  return [rr(4, 5.35, 16, 2.3, 1.15), rr(4, 10.85, 16, 2.3, 1.15), rr(4, 16.35, 16, 2.3, 1.15)];
}

function markEllipsis() {
  // r1.85: 16px でドットがサブピクセル化しない下限
  return [disk(5.4, 12, 1.85), disk(12, 12, 1.85), disk(18.6, 12, 1.85)];
}

// ベクトル小道具（bentBar / roundedTri / 回転頭で共用）
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const vUnit = (v) => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
const vAdd = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];

function bentBar(P0, P1, P2, w0, w1, f) {
  // 2セグメント折れバーの一体面（起筆→関節→終筆）。丸端・関節外側は丸ジョイント・内角は小フィレット。
  // C1 check 原器（checkSurface）と C3 clock/history の針で共用する原器数学。
  // w0/w1: 起点側/終点側の半幅, f: 内角フィレット量。曲がり方向は cross(u1,u2)<0 を前提。
  const u1 = vUnit(vSub(P1, P0));
  const u2 = vUnit(vSub(P2, P1));
  const n1 = [-u1[1], u1[0]];
  const n2 = [-u2[1], u2[0]];
  const T0 = vAdd(P0, n1, -w0);
  const B0 = vAdd(P0, n1, w0);
  const Bv1 = vAdd(P1, n1, w0);
  const Bv2 = vAdd(P1, n2, w0);
  const T2 = vAdd(P2, n2, -w1);
  const B2 = vAdd(P2, n2, w1);
  // 関節の内角: 上側エッジ同士の交点 + 小フィレット
  const det = -u1[0] * u2[1] + u2[0] * u1[1];
  const bx = T2[0] - T0[0];
  const by = T2[1] - T0[1];
  const t = (-bx * u2[1] + u2[0] * by) / det;
  const C = vAdd(T0, u1, t);
  const Ca = vAdd(C, u1, -f);
  const Cb = vAdd(C, u2, f);
  const n = (v) => `${v[0].toFixed(2)} ${v[1].toFixed(2)}`;
  const r0 = w0.toFixed(2);
  const r1 = w1.toFixed(2);
  return `M${n(T0)}L${n(Ca)}Q${n(C)} ${n(Cb)}L${n(T2)}A${r1} ${r1} 0 0 1 ${n(B2)}L${n(Bv2)}A${r0} ${r0} 0 0 1 ${n(Bv1)}L${n(B0)}A${r0} ${r0} 0 0 1 ${n(T0)}z`;
}

function checkSurface({ s = 1, dx = 0, dy = 0, trim = 0 } = {}) {
  // チェックの面ジェネレータ（bentBar のC1原器プリセット）。
  // 起筆2.4→終筆2.2の微テーパー。trim は起筆側短腕の短縮量（check-double の分離用）。
  const pt = (x, y) => [x * s + dx, y * s + dy];
  let P0 = pt(4.8, 12.5);
  const P1 = pt(9.6, 17.0);
  const P2 = pt(19.2, 6.7);
  if (trim) P0 = vAdd(P0, vUnit(vSub(P1, P0)), trim * s);
  return bentBar(P0, P1, P2, 1.2 * s, 1.1 * s, 0.55 * s);
}

function markHashtag() {
  // 縦バーは約5°の左傾斜。4本交差で黒密度が上がるため厚みは主ステム-0.2
  return [
    cap(9.6, 4.95, 8.4, 19.05, 2.1),
    cap(15.6, 4.95, 14.4, 19.05, 2.1),
    cap(5.15, 8.6, 18.85, 8.6, 2.1),
    cap(5.15, 15.4, 18.85, 15.4, 2.1),
  ];
}

function markPercent() {
  // solid disk 案を採用: 16px 実ピクセル比較でリングの穴はグレー化して負け（レビューギャラリーで確認済み）
  return [
    disk(7.0, 7.0, 2.55),
    disk(17.0, 17.0, 2.55),
    cap(17.55, 4.6, 6.45, 19.4, 2.1),
  ];
}

function markHome() {
  // solid シルエット（屋根+本体の一体面）+ 白抜きドア。内部線ゼロ、シルエット勝負。
  return evenOdd(
    'M11.25 4.5A1.2 1.2 0 0 1 12.75 4.5L19.1 9.61A.8 .8 0 0 1 19.4 10.24V18.5A1.6 1.6 0 0 1 17.8 20.1H6.2A1.6 1.6 0 0 1 4.6 18.5V10.24A.8 .8 0 0 1 4.9 9.61Z'
    + rr(10.3, 14.7, 3.4, 6.2, 1.7),
  );
}

// ---- C2 ステータス・エンクロージャ（filled-surface）----
// エンクロージャ: solid disk r9.0 / ring 外r9.0・穴r7.0（均一肉厚2.0・光学補正なし）/ 中心(12,12)
// 白抜きマークは evenodd で面から彫る。白最小幅 1.5（黒地への白の滲み込みを見込み C1 の1.4より+0.1）。
// 白抜き原器則: C1 マークを幾何0.55〜0.60倍、ステム厚は縮小せず 1.8〜2.0 帯に再設定。
// !・?・i は正式原器（taperBar / arcBand / dot 構成）。C4 以降のカテゴリでも再利用する。

function taperBar(x, y1, y2, w1, w2) {
  // 丸端の縦バー（微テーパー対応）。感嘆符・i の幹。
  const a1 = w1 / 2;
  const a2 = w2 / 2;
  return `M${(x - a1).toFixed(2)} ${y1}A${a1.toFixed(2)} ${a1.toFixed(2)} 0 0 1 ${(x + a1).toFixed(2)} ${y1}L${(x + a2).toFixed(2)} ${y2}A${a2.toFixed(2)} ${a2.toFixed(2)} 0 0 1 ${(x - a2).toFixed(2)} ${y2}z`;
}

function crossOutline(cx, cy, len, w, rotDeg = 0) {
  // 自己交差しない一筆書きの十字アウトライン（evenodd 白抜き用。C1 plus/xmark と同比率）。
  // rotDeg=45 で xmark 形。先端はフルラウンド。
  const a = w / 2;
  const L = len / 2;
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rot = ([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos];
  const pts = [
    [-a, -L + a], [a, -L + a],
    [a, -a], [L - a, -a], [L - a, a],
    [a, a], [a, L - a], [-a, L - a],
    [-a, a], [-L + a, a], [-L + a, -a],
    [-a, -a],
  ].map(rot);
  const n = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  const A = `A${a.toFixed(2)} ${a.toFixed(2)} 0 0 1 `;
  return `M${n(pts[0])}${A}${n(pts[1])}L${n(pts[2])}L${n(pts[3])}${A}${n(pts[4])}L${n(pts[5])}L${n(pts[6])}${A}${n(pts[7])}L${n(pts[8])}L${n(pts[9])}${A}${n(pts[10])}L${n(pts[11])}z`;
}

function arcBand(cx, cy, rMid, w, a1Deg, a2Deg) {
  // 円弧の帯（? のボウル+短フック / C3 回転弧の原器）。両端フルラウンド。
  // a2 > a1 で時計回り、a2 < a1 で反時計回り（rotate-left / history 用）。
  const cw = a2Deg >= a1Deg;
  const rO = rMid + w / 2;
  const rI = rMid - w / 2;
  const capR = (w / 2).toFixed(2);
  const rad = (d) => (d * Math.PI) / 180;
  const pt = (r, aDeg) => [cx + r * Math.cos(rad(aDeg)), cy + r * Math.sin(rad(aDeg))];
  const n = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  const large = Math.abs(a2Deg - a1Deg) > 180 ? 1 : 0;
  const So = pt(rO, a1Deg);
  const Eo = pt(rO, a2Deg);
  const Ei = pt(rI, a2Deg);
  const Si = pt(rI, a1Deg);
  const s1 = cw ? 1 : 0;
  const s0 = cw ? 0 : 1;
  return `M${n(So)}A${rO.toFixed(2)} ${rO.toFixed(2)} 0 ${large} ${s1} ${n(Eo)}A${capR} ${capR} 0 0 ${s1} ${n(Ei)}A${rI.toFixed(2)} ${rI.toFixed(2)} 0 ${large} ${s0} ${n(Si)}A${capR} ${capR} 0 0 ${s1} ${n(So)}z`;
}

function sealShape(cx, cy, rMean, amp, lobes) {
  // スカラップシール（check-badge）。r(θ)=rMean+amp·cos(lobes·θ) を細分サンプリング。
  const steps = lobes * 10;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = rMean + amp * Math.cos(lobes * t);
    d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`;
  }
  return d + 'z';
}

function warnTriangle() {
  // 警告三角: 幅19×高16（x2.5〜21.5 横長例外幅）。apex r1.7 / 底角 r1.6。
  // 視覚重心は下寄り（セントロイド y≈14.3）のため、白マークは y≈13.0 を中心に置く。
  return 'M10.54 6.06A1.7 1.7 0 0 1 13.46 6.06L19.93 16.96A1.75 1.75 0 0 1 18.43 19.6H5.57A1.75 1.75 0 0 1 4.07 16.96z';
}

// C1 check 原器の白抜き変換: 幾何0.57倍・(12,12)中心 + 光学ナッジ(+0.15,-0.1)
const C2_WHITE_CHECK = { s: 0.57, dx: 5.31, dy: 5.06 };
const CIRCLE_CHECK_ICON = filledIcon(evenOdd(disk(12, 12, 9) + checkSurface(C2_WHITE_CHECK)));

// ---- C3 回転・時間（filled-surface）----
// 回転弧: 中心(12,12)・中線半径7.8・弧厚2.2（C1 arrow シャフト同厚）。
// 矢印頭: C1 markArrow の系譜（角丸三角）を弧端に接線配置し、弧端キャップを頭の内部に隠して一体面化。
// 針: bentBar 原器（=checkSurface と同一数学）。calendar 白抜きは C2 規格（白最小幅1.5 / ドット r1.05）。

function roundedTri(a, b, c, ra, rb, rc) {
  // 3頂点＋角半径の角丸三角形（回転矢印頭）。頂点順が反時計回りなら自動で入れ替える。
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (cross < 0) { const tb = b; b = c; c = tb; const tr = rb; rb = rc; rc = tr; }
  const pts = [a, b, c];
  const rs = [ra, rb, rc];
  const entry = [];
  const exit = [];
  for (let i = 0; i < 3; i++) {
    const P = pts[i];
    const uPrev = vUnit(vSub(pts[(i + 2) % 3], P));
    const uNext = vUnit(vSub(pts[(i + 1) % 3], P));
    const cos = uPrev[0] * uNext[0] + uPrev[1] * uNext[1];
    const half = Math.acos(Math.max(-1, Math.min(1, cos))) / 2;
    const t = rs[i] / Math.tan(half);
    entry.push(vAdd(P, uPrev, t));
    exit.push(vAdd(P, uNext, t));
  }
  const n = (v) => `${v[0].toFixed(2)} ${v[1].toFixed(2)}`;
  let d = `M${n(exit[0])}`;
  for (let i = 1; i <= 3; i++) {
    const j = i % 3;
    d += `L${n(entry[j])}A${rs[j].toFixed(2)} ${rs[j].toFixed(2)} 0 0 1 ${n(exit[j])}`;
  }
  return d + 'z';
}

function roundedPolygon(pts, radii) {
  // 角丸多角形（可変半径・N点、roundedTri の一般化）。
  // 頂点順は自動補正（画面時計回りへ）。凹頂点はフィレットの sweep を反転して内向きに丸める。
  // C4 file-image の山型・book-open のページ・folder-open の二層・copy のL字・penShape で共用。
  let p = pts.slice();
  let rs = (Array.isArray(radii) ? radii : pts.map(() => radii)).slice();
  let area = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    area += p[i][0] * q[1] - q[0] * p[i][1];
  }
  if (area < 0) { p.reverse(); rs.reverse(); }
  const n = p.length;
  const entry = [];
  const exit = [];
  const sweep = [];
  for (let i = 0; i < n; i++) {
    const P = p[i];
    const prev = p[(i - 1 + n) % n];
    const next = p[(i + 1) % n];
    const uPrev = vUnit(vSub(prev, P));
    const uNext = vUnit(vSub(next, P));
    const cos = uPrev[0] * uNext[0] + uPrev[1] * uNext[1];
    const half = Math.acos(Math.max(-1, Math.min(1, cos))) / 2;
    const t = rs[i] / Math.tan(half);
    entry.push(vAdd(P, uPrev, t));
    exit.push(vAdd(P, uNext, t));
    const v1 = vSub(P, prev);
    const v2 = vSub(next, P);
    sweep.push(v1[0] * v2[1] - v1[1] * v2[0] > 0 ? 1 : 0);
  }
  const f = (v) => `${v[0].toFixed(2)} ${v[1].toFixed(2)}`;
  let d = `M${f(exit[0])}`;
  for (let i = 1; i <= n; i++) {
    const j = i % n;
    d += `L${f(entry[j])}A${rs[j].toFixed(2)} ${rs[j].toFixed(2)} 0 0 ${sweep[j]} ${f(exit[j])}`;
  }
  return `${d}z`;
}

const ROT = { r: 7.8, w: 2.2, headLen: 4.2, headBack: 1.2, headHalf: 2.9 };

function rotHead(aDeg, ccw) {
  // 弧端の接線方向に置く矢印頭。base を弧端より手前に置き、弧のキャップを頭内部に隠す。
  const rad = (aDeg * Math.PI) / 180;
  const nrm = [Math.cos(rad), Math.sin(rad)];
  const tan = ccw ? [nrm[1], -nrm[0]] : [-nrm[1], nrm[0]];
  const E = [12 + ROT.r * nrm[0], 12 + ROT.r * nrm[1]];
  const base = vAdd(E, tan, -ROT.headBack);
  const tip = vAdd(E, tan, ROT.headLen);
  return roundedTri(vAdd(base, nrm, ROT.headHalf), tip, vAdd(base, nrm, -ROT.headHalf), 0.7, 0.6, 0.7);
}

function rotateArc(dir) {
  // dir=1: 時計回り（rotate/rotate-right）/ dir=-1: 反時計回り（rotate-left・history の弧）
  if (dir === 1) return [arcBand(12, 12, ROT.r, ROT.w, 5, 288), rotHead(295, false)];
  return [arcBand(12, 12, ROT.r, ROT.w, 175, -108), rotHead(-115, true)];
}

function clockHands(kind, s = 1, w = 1.9, joint = [12, 12.1]) {
  // 針は bentBar 原器。kind: 'two'（12時+2時・採用）/ '1010'（不採用: 白抜きのV字針が circle-check と酷似）
  const rel = kind === 'two'
    ? [[0, -5.2], [3.3, 2.05]]
    : [[-2.0, -3.46], [5.02, -2.9]];
  const P0 = vAdd(joint, rel[0], s);
  const P2 = vAdd(joint, rel[1], s);
  return bentBar(P0, joint, P2, (w / 2) * s, (w / 2) * s, 0.4 * s);
}

function hourglassBody() {
  return 'M7.9 5.7H16.1C15.9 9.1 13.15 10.3 13.05 12 13.15 13.7 15.9 14.9 16.1 18.3H7.9C8.1 14.9 10.85 13.7 10.95 12 10.85 10.3 8.1 9.1 7.9 5.7z';
}

function calendarBody(extraCuts = '') {
  // solid 角丸本体 + 白ヘッダー溝1.6（全幅で上帯を分離）。extraCuts に日付ドット等の白抜きを追加。
  return evenOdd(rr(4.1, 5.6, 15.8, 14.6, 2.4) + 'M4.1 9.3H19.9V10.9H4.1z' + extraCuts);
}

function calendarPins() {
  return [rr(6.9, 3.4, 2.1, 4.4, 1.05), rr(15.0, 3.4, 2.1, 4.4, 1.05)];
}

function calDots(count) {
  // 日付ドット（白 r1.05）。4=2×2（間隔広め）/ 5=3+2
  if (count === 4) {
    return dot(9.2, 13.7, 1.05) + dot(14.8, 13.7, 1.05) + dot(9.2, 17.3, 1.05) + dot(14.8, 17.3, 1.05);
  }
  return dot(7.9, 13.9, 1.05) + dot(12, 13.9, 1.05) + dot(16.1, 13.9, 1.05)
    + dot(7.9, 17.4, 1.05) + dot(12, 17.4, 1.05);
}

const ROTATE_ICON = filledIcon(rotateArc(1));
const HISTORY_ICON = filledIcon(rotateArc(-1), clockHands('two', 0.8, 1.95));

// ---- C4 ドキュメント・編集（filled-surface）----
// pageFill: file族の基底原器。solid ページ x5.7〜18.3 × y3.6〜20.4・角丸r2.2・右上フォールド4.6（単純斜めカット、SF .fill 文法）。
// file族（lines/pdf/csv/image/pen）と floppy はこの外形ジェネレータを厳密に共有する。
// 白抜きは C2 規格（白最小幅1.5・ドットr1.05）。前背面の分離は白ギャップ1.5 を座標に焼き込む。
// penShape は pen / file-pen / pen-to-square 共有の正式原器（ニブ+白ギャップ+丸尻胴体 = ペンの解剖）。

const FOLD_FR = 0.8; // フォールド/カット角のフィレット半径
const FOLD_T = FOLD_FR / Math.tan((67.5 * Math.PI) / 180); // 135°角のフィレットオフセット ≈0.33
const FOLD_D = FOLD_T * Math.SQRT1_2;

function pageOutline(x0, y0, x1, y1, r, fold) {
  // 右上フォールドカット付き角丸矩形（pageFill / floppy 外形で共用）
  const ax = x1 - fold;
  const by = y0 + fold;
  return `M${(x0 + r).toFixed(2)} ${y0}`
    + `L${(ax - FOLD_T).toFixed(2)} ${y0}A${FOLD_FR} ${FOLD_FR} 0 0 1 ${(ax + FOLD_D).toFixed(2)} ${(y0 + FOLD_D).toFixed(2)}`
    + `L${(x1 - FOLD_D).toFixed(2)} ${(by - FOLD_D).toFixed(2)}A${FOLD_FR} ${FOLD_FR} 0 0 1 ${x1} ${(by + FOLD_T).toFixed(2)}`
    + `L${x1} ${(y1 - r).toFixed(2)}A${r} ${r} 0 0 1 ${(x1 - r).toFixed(2)} ${y1}`
    + `L${(x0 + r).toFixed(2)} ${y1}A${r} ${r} 0 0 1 ${x0} ${(y1 - r).toFixed(2)}`
    + `L${x0} ${(y0 + r).toFixed(2)}A${r} ${r} 0 0 1 ${(x0 + r).toFixed(2)} ${y0}z`;
}

function pageFill() {
  return pageOutline(5.7, 3.6, 18.3, 20.4, 2.2, 4.6);
}

function pageFillCutBR() {
  // file-pen 用: pageFill と同一外形の右下を、ペン軸に平行な対角線で切除。
  // ペン軸 x+y=33.2・ペン半幅1.4・クリアランス1.5 → カット線 x+y=29.1（右辺 y10.8 / 底辺 x8.7 で交差）。
  const x0 = 5.7, y0 = 3.6, x1 = 18.3, y1 = 20.4, r = 2.2, fold = 4.6;
  const ax = x1 - fold;
  const by = y0 + fold;
  return `M${(x0 + r).toFixed(2)} ${y0}`
    + `L${(ax - FOLD_T).toFixed(2)} ${y0}A${FOLD_FR} ${FOLD_FR} 0 0 1 ${(ax + FOLD_D).toFixed(2)} ${(y0 + FOLD_D).toFixed(2)}`
    + `L${(x1 - FOLD_D).toFixed(2)} ${(by - FOLD_D).toFixed(2)}A${FOLD_FR} ${FOLD_FR} 0 0 1 ${x1} ${(by + FOLD_T).toFixed(2)}`
    + `L${x1} ${(10.8 - FOLD_T).toFixed(2)}A${FOLD_FR} ${FOLD_FR} 0 0 1 ${(x1 - FOLD_D).toFixed(2)} ${(10.8 + FOLD_D).toFixed(2)}`
    + `L${(8.7 + FOLD_D).toFixed(2)} ${(y1 - FOLD_D).toFixed(2)}A${FOLD_FR} ${FOLD_FR} 0 0 1 ${(8.7 - FOLD_T).toFixed(2)} ${y1}`
    + `L${(x0 + r).toFixed(2)} ${y1}A${r} ${r} 0 0 1 ${x0} ${(y1 - r).toFixed(2)}`
    + `L${x0} ${(y0 + r).toFixed(2)}A${r} ${r} 0 0 1 ${(x0 + r).toFixed(2)} ${y0}z`;
}

function penShape(tip, tail, hw, nibLen, gap) {
  // ペン原器: ニブ（先端三角）+ 胴体（丸尻バンド）の2ピース。境界の白ギャップが「ペン先」を示す。
  const u = vUnit(vSub(tail, tip));
  const perp = [-u[1], u[0]];
  const at = (d, o) => vAdd(vAdd(tip, u, d), perp, o);
  const len = Math.hypot(tail[0] - tip[0], tail[1] - tip[1]);
  const nw = hw * 0.92;
  const nib = roundedPolygon([tip, at(nibLen, -nw), at(nibLen, nw)], [0.45, 0.4, 0.4]);
  const b0 = nibLen + gap;
  const body = roundedPolygon(
    [at(b0, -hw), at(b0, hw), at(len, hw), at(len, -hw)],
    [0.4, 0.4, hw, hw],
  );
  return [nib, body];
}

function paperclipPaths() {
  // ゼムクリップ位相（外U+内Uの3ラン・2ベンド、開口は同じ側=上）。帯厚2.0・帯間白1.5。
  // ローカル座標（クリップ軸=縦・開口=上）で組み、45°回転して開口を右上へ向ける。
  const cx = 3.875, cy = 0.65; // ローカル重心
  const c = Math.SQRT1_2;
  const pt = (lx, ly) => [12 + c * ((lx - cx) - (ly - cy)), 12 + c * ((lx - cx) + (ly - cy))];
  const w = 2.0;
  return [
    cap(...pt(0, -6.6), ...pt(0, 4.4), w),          // 外ラン（開口側から下へ）
    arcBand(...pt(3.5, 4.4), 3.5, w, 225, 45),      // 下ベンド（大・r3.5）
    cap(...pt(7.0, 4.4), ...pt(7.0, -4.8), w),      // 外ラン（戻り）
    arcBand(...pt(5.25, -4.8), 1.75, w, 45, -135),  // 上ベンド（小・r1.75）
    cap(...pt(3.5, -4.8), ...pt(3.5, 2.4), w),      // 内ラン（終端）
  ];
}

const FLOPPY_ICON = filledIcon(evenOdd(
  pageOutline(4.7, 4.7, 19.3, 19.3, 2.0, 3.2)
  + rr(9.0, 4.0, 5.8, 5.2, 0.9)   // シャッター窓（上辺開放）
  + rr(7.9, 13.6, 8.2, 7.0, 1.1), // ラベル窓（底辺開放）
));

// ---- C5 入出力・転送（filled-surface）----
// 「コンテナ × 矢印」の二項文法。矢印 = C1 markArrow 比率の単一アウトライン（arrowOutline）。
// コンテナ = C4 開放バンド文法（帯厚2.0〜2.2・開放端フルラウンド・外r2.2/内r0.9）。クリアランス1.5。
// 役割分離: share = 矢印が箱の中心から「真上」へ抜ける / external = 矢印が右上角から「右上45°」へ逃げる。

function arrowOutline(tail, tip, shaftW, headW, headLen) {
  // C1 markArrow 比率の単一アウトライン矢印（シャフト+ヘッド一体・自己交差なし）。
  // evenodd の白抜き（cloud）にもそのまま使える。角丸はヘッド長に比例（C1 基準: 6.5）。
  const u = vUnit(vSub(tip, tail));
  const perp = [-u[1], u[0]];
  const base = vAdd(tip, u, -headLen);
  const hw = headW / 2;
  const sw = shaftW / 2;
  const k = headLen / 6.5;
  return roundedPolygon(
    [tip,
      vAdd(base, perp, hw), vAdd(base, perp, sw),
      vAdd(tail, perp, sw), vAdd(tail, perp, -sw),
      vAdd(base, perp, -sw), vAdd(base, perp, -hw)],
    [0.7 * k, 0.8 * k, 0.35, sw, sw, 0.35, 0.8 * k],
  );
}

// ブラケット ]（ログイン受け）: コの字バンド・開口左。腕の自由端はフルラウンドで左へ膨らむ。
const BRACKET_IN_ICON = filledIcon(
  'M12.2 4.4L18.4 4.4A2.2 2.2 0 0 1 20.6 6.6L20.6 17.4A2.2 2.2 0 0 1 18.4 19.6L12.2 19.6A1 1 0 0 1 12.2 17.6L17.7 17.6A0.9 0.9 0 0 0 18.6 16.7L18.6 7.3A0.9 0.9 0 0 0 17.7 6.4L12.2 6.4A1 1 0 0 1 12.2 4.4z',
  // 入る: 先端(15.9,12)がブラケット内側で終わる（内壁との白 2.7 = 16px で約1.7px）
  arrowOutline([2.9, 12], [15.9, 12], 2.0, 7.7, 5.85),
);

// ---- C6 人物（filled-surface）----
// personFill 原器: 頭 disk r3.6 @(12,7.7) + 肩ドーム（rx7.3/ry6.7・底y20.2）。頭肩間隙1.3（SF person.fill 文法）。
// 肩はサンプリング構築とし、バッジ切除（円押し出し）・slash切断（半平面クリップ）を数値的に適用する。
// バッジマークは C1 原器比率（位置・スケールは plus/xmark/check の3キーで完全共通）。

function loopToPath(pts) {
  return 'M' + pts.map((p, i) => `${i ? 'L' : ''}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('') + 'z';
}

function clipHalfplane(pts, f) {
  // Sutherland–Hodgman: f(p)>=0 の半平面で閉ループを切る（凸クリップ）
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function pushOutOfDisk(pts, cx, cy, r) {
  // クリアランス円の内側に入る点を円周へ放射押し出し（バッジ切除の円弧バイト）
  return pts.map((p) => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const d = Math.hypot(dx, dy) || 1;
    return d >= r ? p : [cx + (dx / d) * r, cy + (dy / d) * r];
  });
}

function personPieces({ s = 1, dx = 0, dy = 0, cutDisk = null, slash = false } = {}) {
  const hc = [12 * s + dx, 7.7 * s + dy];
  const hr = 3.6 * s;
  const cx = 12 * s + dx;
  const ay = 19.3 * s + dy; // ドームアンカー
  const rx = 7.3 * s;
  const ry = 6.7 * s;
  const by = 20.2 * s + dy; // 底辺
  const sh = [];
  for (let i = 0; i <= 36; i++) {
    const t = Math.PI + (i / 36) * Math.PI;
    sh.push([cx + rx * Math.cos(t), ay + ry * Math.sin(t)]);
  }
  sh.push([cx + rx, by - 0.35], [cx + rx - 0.35, by], [cx - rx + 0.35, by], [cx - rx, by - 0.35]);
  const hd = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * 2 * Math.PI;
    hd.push([hc[0] + hr * Math.cos(t), hc[1] + hr * Math.sin(t)]);
  }
  let loops = [hd, sh];
  if (cutDisk) loops = loops.map((l) => pushOutOfDisk(l, cutDisk[0], cutDisk[1], cutDisk[2]));
  if (slash) {
    // slash帯 |x−y| ≤ 3.25（バー厚2.2 + 白1.2×2 の45°帯）で上下2ピースに分断
    const g = 3.25;
    loops = loops.flatMap((l) => [
      clipHalfplane(l, (p) => (p[0] - p[1]) - g),
      clipHalfplane(l, (p) => (p[1] - p[0]) - g),
    ]);
  }
  return loops.filter((l) => l.length > 2).map(loopToPath);
}

// バッジ用ミニマーク（中心(18.1,16.4)・C1比率・ステム1.9〜2.0を再設定）
function badgeMarkPlus() {
  return [cap(18.1, 14.3, 18.1, 18.5, 2.0), cap(16.0, 16.4, 20.2, 16.4, 2.0)];
}
function badgeMarkX() {
  const a = 1.91; // 対角スパン5.4
  return [cap(18.1 - a, 16.4 - a, 18.1 + a, 16.4 + a, 2.0), cap(18.1 + a, 16.4 - a, 18.1 - a, 16.4 + a, 2.0)];
}
function badgeMarkCheck() {
  // C1 spine ×0.40 + 平行移動、ステム2.0へ再設定
  return bentBar([15.62, 16.71], [17.54, 18.51], [21.38, 14.39], 1.0, 0.92, 0.25);
}

// ミニ盾（C10 shieldFill の仮実装。C10正式原器はまだ確定しない）
function miniShield(cx, top, w, h) {
  const hw = w / 2;
  return `M${(cx - hw).toFixed(2)} ${(top + 0.35).toFixed(2)}Q${(cx - hw).toFixed(2)} ${top} ${(cx - hw + 0.4).toFixed(2)} ${top}L${(cx + hw - 0.4).toFixed(2)} ${top}Q${(cx + hw).toFixed(2)} ${top} ${(cx + hw).toFixed(2)} ${(top + 0.35).toFixed(2)}L${(cx + hw).toFixed(2)} ${(top + h * 0.42).toFixed(2)}Q${(cx + hw).toFixed(2)} ${(top + h * 0.78).toFixed(2)} ${cx} ${(top + h).toFixed(2)}Q${(cx - hw).toFixed(2)} ${(top + h * 0.78).toFixed(2)} ${(cx - hw).toFixed(2)} ${(top + h * 0.42).toFixed(2)}z`;
}

// ミニ歯車（C9 gearFill の仮実装・簡略歯形 = sealShape 流用。歯数は16px比較で決定）
function miniGear(cx, cy, teeth, amp) {
  return evenOdd(sealShape(cx, cy, 3.7, amp, teeth) + disk(cx, cy, 1.3));
}

const BADGE_PERSON = { s: 0.84, dx: -3.0, dy: 2.2 }; // バッジ複合の共通配置（肩右端13.21・マーク圏との隙1.4+）
const BADGE_DISK_CUT = [17.7, 16.3, 5.9];            // disk囲み案の親切除円（disk r4.4 + 白1.5）

function userBody(cx = 9.65, cy = 7.83) {
  return `${disk(cx, cy, 3.62)}M3.27 19.05c.57-3.58 3.18-5.77 6.38-5.77s5.81 2.19 6.38 5.77c.08.57-.3 1.05-.81 1.05H4.08c-.51 0-.89-.48-.81-1.05z`;
}

function badgeCircle(cx = 17.5, cy = 15.25, r = 4.25) {
  return disk(cx, cy, r);
}

function gearShape(cx = 12, cy = 12, scale = 1) {
  if (scale !== 1 || cx !== 12 || cy !== 12) {
    return evenOdd(`M${cx - 1.4} ${cy - 5.05}h${2.8}l.34 1.12c.3.1.59.22.86.37l1.04-.55 1.1 1.1-.55 1.04c.15.27.27.56.37.86l1.12.34v1.55l-1.12.34c-.1.3-.22.59-.37.86l.55 1.04-1.1 1.1-1.04-.55c-.27.15-.56.27-.86.37l-.34 1.12h-2.8l-.34-1.12a4.6 4.6 0 0 1-.86-.37l-1.04.55-1.1-1.1.55-1.04a4.6 4.6 0 0 1-.37-.86l-1.12-.34v-1.55l1.12-.34c.1-.3.22-.59.37-.86l-.55-1.04 1.1-1.1 1.04.55c.27-.15.56-.27.86-.37zm1.4 5.05m-1.26 0a1.26 1.26 0 1 0 2.52 0 1.26 1.26 0 1 0-2.52 0z`);
  }
  return evenOdd('M10.55 3.35h2.9l.58 2.08c.56.16 1.09.38 1.58.66l1.88-1.06 2.05 2.05-1.06 1.88c.28.49.5 1.02.66 1.58l2.08.58v2.9l-2.08.58a7.6 7.6 0 0 1-.66 1.58l1.06 1.88-2.05 2.05-1.88-1.06c-.49.28-1.02.5-1.58.66l-.58 2.08h-2.9l-.58-2.08a7.6 7.6 0 0 1-1.58-.66l-1.88 1.06-2.05-2.05 1.06-1.88a7.6 7.6 0 0 1-.66-1.58l-2.08-.58v-2.9l2.08-.58c.16-.56.38-1.09.66-1.58L4.52 7.08l2.05-2.05 1.88 1.06c.49-.28 1.02-.5 1.58-.66zm1.45 8.65m-2.55 0a2.55 2.55 0 1 0 5.1 0 2.55 2.55 0 1 0-5.1 0z');
}

const ICON_PATHS = {
  // ナビゲーション / 基本操作
  'chevron-down': filledIcon(markChevron('down')),
  'chevron-left': filledIcon(markChevron('left')),
  'chevron-right': filledIcon(markChevron('right')),
  'arrow-left': filledIcon(markArrow(-1)),
  'arrow-right': filledIcon(markArrow(1)),
  // external: 枠（開放バンド・右上開放）+ 右上45°矢印が角から外へ逃げる（share の「真上」との役割分離）
  'arrow-up-right-from-square': filledIcon(
    'M11.4 6.2L5.8 6.2A2.2 2.2 0 0 0 3.6 8.4L3.6 18.2A2.2 2.2 0 0 0 5.8 20.4L15.6 20.4A2.2 2.2 0 0 0 17.8 18.2L17.8 12.0A1 1 0 0 0 15.8 12.0L15.8 17.5A0.9 0.9 0 0 1 14.9 18.4L6.5 18.4A0.9 0.9 0 0 1 5.6 17.5L5.6 9.1A0.9 0.9 0 0 1 6.5 8.2L11.4 8.2A1 1 0 0 0 11.4 6.2z',
    arrowOutline([12.4, 11.6], [21.0, 3.0], 2.2, 7.4, 5.6),
  ),
  'arrow-right-to-bracket': BRACKET_IN_ICON,
  'right-to-bracket': BRACKET_IN_ICON,
  // 出る: 尾がブラケット[ の内側(7.9,12)から始まり、ヘッドは完全に外
  'right-from-bracket': filledIcon(
    'M11.8 4.4L5.6 4.4A2.2 2.2 0 0 0 3.4 6.6L3.4 17.4A2.2 2.2 0 0 0 5.6 19.6L11.8 19.6A1 1 0 0 0 11.8 17.6L6.3 17.6A0.9 0.9 0 0 1 5.4 16.7L5.4 7.3A0.9 0.9 0 0 1 6.3 6.4L11.8 6.4A1 1 0 0 0 11.8 4.4z',
    arrowOutline([7.9, 12], [21.0, 12], 2.0, 7.7, 5.85),
  ),
  'home': filledIcon(markHome()),
  'xmark': filledIcon(markX()),
  'plus': filledIcon(markPlus()),
  'minus': filledIcon(markMinus()),
  'line-3-horizontal': filledIcon(markMenu()),
  'check': filledIcon(checkSurface()),
  // 後方チェック(左上・完全形) + 前方チェック(右下・短腕トリム)。
  // 平行オフセットで白ギャップ2.09（16pxで約1.3px）を確保し面同士の癒着を防ぐ。
  'check-double': filledIcon(
    checkSurface({ s: 0.64, dx: 2.26, dy: 2.05 }),
    checkSurface({ s: 0.64, dx: 6.36, dy: 5.87, trim: 3.5 }),
  ),
  'rotate': ROTATE_ICON,
  'rotate-right': ROTATE_ICON,
  'rotate-left': filledIcon(rotateArc(-1)),
  'ellipsis': filledIcon(markEllipsis()),

  // ステータス / シェイプ（C2: エンクロージャ+白抜き原器）
  'circle': filledIcon(ring(12, 12, 9, 7)),
  'circle-check': CIRCLE_CHECK_ICON,
  'check-circle': CIRCLE_CHECK_ICON,
  'circle-xmark': filledIcon(evenOdd(disk(12, 12, 9) + crossOutline(12, 12, 6.7, 2.0, 45))),
  'circle-info': filledIcon(evenOdd(disk(12, 12, 9) + dot(12, 8.05, 1.05) + taperBar(12, 10.9, 16.2, 1.9, 1.9))),
  'circle-question': filledIcon(evenOdd(disk(12, 12, 9) + arcBand(12, 9.8, 2.6, 1.8, 160, 450) + dot(12, 16.3, 1.05))),
  'circle-plus': filledIcon(evenOdd(disk(12, 12, 9) + crossOutline(12, 12, 8.6, 1.9, 0))),
  'circle-exclamation': filledIcon(evenOdd(disk(12, 12, 9) + taperBar(12, 7.6, 13.1, 1.9, 1.75) + dot(12, 16.1, 1.05))),
  'triangle': filledIcon(warnTriangle()),
  'triangle-exclamation': filledIcon(evenOdd(warnTriangle() + taperBar(12, 9.6, 14.2, 1.8, 1.7) + dot(12, 16.6, 1.0))),
  'ban': filledIcon(ring(12, 12, 9, 7), cap(7.05, 7.05, 16.95, 16.95, 2.0)),
  'lock': {
    paths: [
      { d: 'M8.25 10.05V7.8a3.75 3.75 0 0 1 7.5 0v2.25h.52a2.4 2.4 0 0 1 2.4 2.4v5.85a2.4 2.4 0 0 1-2.4 2.4H7.73a2.4 2.4 0 0 1-2.4-2.4v-5.85a2.4 2.4 0 0 1 2.4-2.4zm2.1 0h3.3V7.8a1.65 1.65 0 0 0-3.3 0zm.68 4.34a.97.97 0 0 1 1.94 0v2.05a.97.97 0 0 1-1.94 0z', fillRule: 'evenodd' },
    ],
  },
  'unlock': ['M7.25 10.75h9.5a2 2 0 0 1 2 2v5.25a2 2 0 0 1-2 2h-9.5a2 2 0 0 1-2-2v-5.25a2 2 0 0 1 2-2z', 'M8.35 10.75V7.9a3.65 3.65 0 0 1 7.05-1.35'],
  'shield-halved': ['M12 3.5c2.05 1.5 4.25 2.2 6.6 2.35v5.55c0 4.15-2.5 7.1-6.6 9.1-4.1-2-6.6-4.95-6.6-9.1V5.85C7.75 5.7 9.95 5 12 3.5z', 'M12 3.9v16.15'],
  'flag-checkered': ['M5.4 20.5V4.25', 'M5.4 5.15c2.25-1.05 4.45.95 6.7-.05s4.35-1 6.85.05v8.3c-2.5-1.05-4.6-.1-6.85.05s-4.45-1.1-6.7-.05', 'M8.75 4.7v8.55M12.1 5.1v8.3M15.45 4.65v8.5'],
  'wifi': ['M4.3 10.4a11.1 11.1 0 0 1 15.4 0', 'M7.4 13.55a6.6 6.6 0 0 1 9.2 0', 'M10.55 16.7a2.3 2.3 0 0 1 2.9 0', 'M12 19.4h.01'],

  // 編集 / ファイル操作（C4: pageFill / penShape 原器）
  // copy: 背面シートは「前面+白ギャップ1.5」で切り取った L字面（SF doc.on.doc.fill 文法）。帯厚2.7。
  'copy': filledIcon(
    roundedPolygon(
      [[4.6, 3.8], [15.0, 3.8], [15.0, 6.5], [7.3, 6.5], [7.3, 16.6], [4.6, 16.6]],
      [2.0, 2.0, 0.9, 0.9, 0.9, 2.0],
    ),
    rr(8.8, 8.0, 10.4, 12.6, 2.0),
  ),
  // 矢印がトレイに「着地」: 先端はトレイ内縁-1.5、シャフト中心=トレイ中心、柱内縁とヘッドの隙1.5
  'download': filledIcon(
    arrowOutline([12, 3.8], [12, 16.5], 2.2, 8.6, 6.5),
    'M4.0 12.7L4.0 18.0A2.2 2.2 0 0 0 6.2 20.2L17.8 20.2A2.2 2.2 0 0 0 20.0 18.0L20.0 12.7A1.1 1.1 0 0 0 17.8 12.7L17.8 17.1A0.9 0.9 0 0 1 16.9 18.0L7.1 18.0A0.9 0.9 0 0 1 6.2 17.1L6.2 12.7A1.1 1.1 0 0 0 4.0 12.7z',
  ),
  'trash': filledIcon(
    rr(9.8, 3.4, 4.4, 2.6, 1.3),
    rr(4.6, 5.4, 14.8, 2.2, 1.1),
    evenOdd(
      roundedPolygon([[5.6, 9.1], [18.4, 9.1], [17.0, 20.4], [7.0, 20.4]], [0.7, 0.7, 1.9, 1.9])
      + rr(9.3, 11.4, 1.6, 6.6, 0.8)
      + rr(13.1, 11.4, 1.6, 6.6, 0.8),
    ),
  ),
  'pen': filledIcon(...penShape([4.4, 19.6], [19.0, 5.0], 1.6, 3.4, 1.4)),
  // 枠 = 右上を開放した一筆書きバンド（外周→自由端キャップ→内周）。ペンは開口部を貫通、全接近部クリアランス1.5+。
  'pen-to-square': filledIcon(
    'M12.4 5.6L5.8 5.6A2.2 2.2 0 0 0 3.6 7.8L3.6 18.6A2.2 2.2 0 0 0 5.8 20.8L16.6 20.8A2.2 2.2 0 0 0 18.8 18.6L18.8 11.6A1 1 0 0 0 16.8 11.6L16.8 17.9A0.9 0.9 0 0 1 15.9 18.8L6.5 18.8A0.9 0.9 0 0 1 5.6 17.9L5.6 8.5A0.9 0.9 0 0 1 6.5 7.6L12.4 7.6A1 1 0 0 0 12.4 5.6z',
    ...penShape([10.2, 14.2], [20.6, 3.8], 1.3, 3.0, 1.3),
  ),
  // ペンは胴体+7%・外側シフト+0.3 を採用（16pxでの斜線化を防ぎ、カットとのクリアランスも1.8へ改善）
  'file-pen': filledIcon(
    pageFillCutBR(),
    ...penShape([12.9, 20.9], [20.9, 12.9], 1.5, 3.0, 1.3),
  ),
  'floppy-disk': FLOPPY_ICON,
  'save': FLOPPY_ICON,
  'paper-plane': ['M20.65 3.35 4.1 10.65c-.9.4-.8 1.7.15 1.95l6.25 1.45 1.45 6.25c.25.95 1.55 1.05 1.95.15z', 'M10.5 14.05 20.65 3.35'],
  'send': ['M20.65 3.35 4.1 10.65c-.9.4-.8 1.7.15 1.95l6.25 1.45 1.45 6.25c.25.95 1.55 1.05 1.95.15z', 'M10.5 14.05 20.65 3.35'],
  // share: 箱（開放バンド・上辺中央開放）+ 矢印が中心から「真上」へ抜ける
  'share-from-square': filledIcon(
    'M8.3 8.6L6.4 8.6A2.2 2.2 0 0 0 4.2 10.8L4.2 18.4A2.2 2.2 0 0 0 6.4 20.6L17.6 20.6A2.2 2.2 0 0 0 19.8 18.4L19.8 10.8A2.2 2.2 0 0 0 17.6 8.6L15.7 8.6A1 1 0 0 0 15.7 10.6L16.9 10.6A0.9 0.9 0 0 1 17.8 11.5L17.8 17.7A0.9 0.9 0 0 1 16.9 18.6L7.1 18.6A0.9 0.9 0 0 1 6.2 17.7L6.2 11.5A0.9 0.9 0 0 1 7.1 10.6L8.3 10.6A1 1 0 0 0 8.3 8.6z',
    arrowOutline([12, 13.6], [12, 3.2], 2.2, 5.9, 4.6), // ヘッド幅5.9=開放端クリアランス1.5確保（16px比較で採用）
  ),
  'key': ['M8.1 20.4a4.35 4.35 0 1 1 0-8.7 4.35 4.35 0 0 1 0 8.7z', 'M11.2 12.95 20 4.15', 'M17.5 6.65l2.4 2.4M14.9 9.25l1.95 1.95'],

  // ユーザー
  'user': ['M12 11.9a3.65 3.65 0 1 0 0-7.3 3.65 3.65 0 0 0 0 7.3z', 'M4.75 19.75a7.25 7.25 0 0 1 14.5 0'],
  'users': ['M9.75 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z', 'M3.15 19.75a6.6 6.6 0 0 1 13.2 0', 'M15.65 4.85a3.4 3.4 0 0 1 0 6.35', 'M17.4 15.35c2 .6 3.25 2.1 3.6 4.4'],
  'user-plus': ['M9.75 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z', 'M3.15 19.75a6.6 6.6 0 0 1 13.2 0', 'M18.25 8.4v5M15.75 10.9h5'],
  'user-xmark': ['M9.75 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z', 'M3.15 19.75a6.6 6.6 0 0 1 13.2 0', 'M16.4 9.05l3.7 3.7M20.1 9.05l-3.7 3.7'],
  'user-check': {
    paths: [
      { d: 'M9.65 11.45a3.62 3.62 0 1 0 0-7.24 3.62 3.62 0 0 0 0 7.24zm-6.38 7.6c.57-3.58 3.18-5.77 6.38-5.77 2.11 0 3.96.95 5.11 2.56.37.52.01 1.25-.63 1.25H12.7c-.89 0-1.68.57-1.96 1.41l-.26.8c-.16.48-.61.8-1.11.8H4.08c-.51 0-.89-.48-.81-1.05z' },
      { d: 'M15.04 15.24c.34-.36.91-.38 1.28-.04l1.18 1.12 2.61-3.08c.32-.38.89-.43 1.27-.1l.39.33c.38.32.43.89.1 1.27l-3.72 4.38c-.33.39-.92.43-1.29.07l-1.79-1.71a.91.91 0 0 1-.03-1.29z' },
    ],
  },
  'user-clock': ['M9.75 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z', 'M3.15 19.75a6.6 6.6 0 0 1 10.3-5.45', 'M17.6 20.25a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2z', 'M17.6 14.25v1.9l1.45.85'],
  'user-shield': ['M9.75 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z', 'M3.15 19.75a6.6 6.6 0 0 1 10.3-5.45', 'M17.35 10.2c1.3.95 2.6 1.4 4.1 1.5v3.05c0 2.45-1.5 4.2-4.1 5.35-2.6-1.15-4.1-2.9-4.1-5.35V11.7c1.5-.1 2.8-.55 4.1-1.5z'],
  'user-slash': ['M9.75 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z', 'M3.15 19.75a6.6 6.6 0 0 1 13.2 0', 'M3.75 3.75l16.5 16.5'],
  'crown': ['M4 8.25 7.2 15.4h9.6L20 8.25l-4.8 3.45L12 5.1l-3.2 6.6z', 'M7.2 18.75h9.6'],
  'address-book': ['M5.9 4h10.7a1.9 1.9 0 0 1 1.9 1.9v12.2a1.9 1.9 0 0 1-1.9 1.9H5.9A1.9 1.9 0 0 1 4 18.1V5.9A1.9 1.9 0 0 1 5.9 4z', 'M20.2 7.5h1.05M20.2 12h1.05M20.2 16.5h1.05', 'M11.25 11.15a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z', 'M7.8 16.05c.5-1.85 1.75-2.85 3.45-2.85s2.95 1 3.45 2.85'],
  'fingerprint': ['M12 11.5c0 2.75-.35 5.4-1.05 7.9', 'M8.4 18.25c.5-1.85.75-4.1.75-6.75a2.85 2.85 0 0 1 5.7 0c0 1.8-.1 3.55-.35 5.2', 'M5.95 15.3c.2-1.4.3-2.75.3-3.8a5.75 5.75 0 0 1 11.5 0c0 2.2-.2 4.2-.6 6.05', 'M4.15 10.3a7.85 7.85 0 0 1 15.7 1.2'],

  // コミュニケーション
  'envelope': ['M4.75 5.75h14.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H4.75a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2z', 'M3.3 7.6l7.6 4.9a2 2 0 0 0 2.2 0l7.6-4.9'],
  'envelope-circle-check': ['M12.35 15.75H4.6a1.9 1.9 0 0 1-1.9-1.9V8.2a1.9 1.9 0 0 1 1.9-1.9h9.8a1.9 1.9 0 0 1 1.9 1.9v2.5', 'M3.35 8.45l5.1 3.3a1.9 1.9 0 0 0 2.1 0l5.1-3.3', 'M17.25 21.05a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6z', 'M15.4 16.85l1.35 1.35 2.55-2.85'],
  'envelope-circle-xmark': ['M12.35 15.75H4.6a1.9 1.9 0 0 1-1.9-1.9V8.2a1.9 1.9 0 0 1 1.9-1.9h9.8a1.9 1.9 0 0 1 1.9 1.9v2.5', 'M3.35 8.45l5.1 3.3a1.9 1.9 0 0 0 2.1 0l5.1-3.3', 'M17.25 21.05a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6z', 'M15.7 15.2l3.1 3.1M18.8 15.2l-3.1 3.1'],
  'comment': ['M12 3.75c-4.55 0-8.25 3.1-8.25 6.95 0 1.9.9 3.6 2.35 4.85l-1.15 3.5 3.6-1.7c1.05.35 2.2.55 3.45.55 4.55 0 8.25-3.1 8.25-7.2 0-3.85-3.7-6.95-8.25-6.95z'],
  'message': ['M12 3.75c-4.55 0-8.25 3.1-8.25 6.95 0 1.9.9 3.6 2.35 4.85l-1.15 3.5 3.6-1.7c1.05.35 2.2.55 3.45.55 4.55 0 8.25-3.1 8.25-7.2 0-3.85-3.7-6.95-8.25-6.95z'],
  'paperclip': filledIcon(paperclipPaths()),

  // ドキュメント（C4: pageFill 外形を厳密に共有）
  'file-lines': filledIcon(evenOdd(
    pageFill()
    + rr(8.1, 10.2, 5.2, 1.7, 0.85)
    + rr(8.1, 13.3, 7.8, 1.7, 0.85)
    + rr(8.1, 16.4, 7.8, 1.7, 0.85),
  )),
  // pdf = 白行1本+横長ブロック1個 / csv = 白行1本+2×2セル。文字でなく形で弁別（C4仕様の既定）。
  'file-pdf': filledIcon(evenOdd(
    pageFill()
    + rr(8.1, 10.2, 7.8, 1.7, 0.85)
    + rr(8.1, 13.4, 7.8, 4.7, 1.2),
  )),
  'file-csv': filledIcon(evenOdd(
    pageFill()
    + rr(8.1, 10.2, 7.8, 1.7, 0.85)
    + rr(8.1, 13.5, 3.15, 1.8, 0.6)
    + rr(12.75, 13.5, 3.15, 1.8, 0.6)
    + rr(8.1, 16.8, 3.15, 1.8, 0.6)
    + rr(12.75, 16.8, 3.15, 1.8, 0.6),
  )),
  'file-image': filledIcon(evenOdd(
    pageFill()
    + dot(9.6, 10.6, 1.05)
    + roundedPolygon([[8.1, 17.9], [10.6, 14.2], [12.3, 16.1], [14.5, 12.7], [15.9, 17.9]], [0.4, 0.5, 0.4, 0.5, 0.4]),
  )),
  // pageOutline 原器（幅11.2 = 残幅最低8.5を満たす）+ 右辺切除 高さ4.4固定（rr で白スロット）+ 出る矢印
  'file-export': filledIcon(
    evenOdd(pageOutline(4.4, 3.6, 15.6, 20.4, 2.2, 4.2) + rr(9.9, 11.0, 8.0, 4.4, 0.8)),
    arrowOutline([12.2, 13.2], [21.4, 13.2], 1.7, 5.7, 4.3),
  ),
  // 背面 = タブ付き上体（凹角あり）、前面 = 控えめに傾けたフラップ（上辺シフト+1.4）。白ギャップ1.5。
  'folder-open': filledIcon(
    roundedPolygon(
      [[3.4, 4.8], [8.8, 4.8], [10.4, 7.0], [19.8, 7.0], [19.8, 9.4], [3.4, 9.4]],
      [1.1, 0.7, 0.5, 0.9, 0.7, 0.7],
    ),
    roundedPolygon([[4.4, 10.9], [21.0, 10.9], [19.6, 20.2], [3.0, 20.2]], [1.0, 1.0, 1.5, 1.5]),
  ),
  // A = bentBar 原器（Λ）+ 貫通クロスバー。check は C1 checkSurface。ベースライン共有で一体化。
  'spell-check': filledIcon(
    bentBar([11.9, 18.3], [7.7, 5.1], [3.5, 18.3], 1.0, 1.0, 0.5),
    cap(5.0, 13.5, 10.4, 13.5, 1.8),
    checkSurface({ s: 0.6, dx: 9.2, dy: 7.2 }),
  ),
  // 開いた本: スパイン側が谷（上辺は中央へ下がり、下辺は中央が最も低い）。ノド白1.6。
  'book-open': filledIcon(
    roundedPolygon([[3.6, 6.2], [11.2, 7.8], [11.2, 19.8], [3.6, 17.2]], [1.4, 0.6, 0.6, 1.4]),
    roundedPolygon([[20.4, 6.2], [12.8, 7.8], [12.8, 19.8], [20.4, 17.2]], [1.4, 0.6, 0.6, 1.4]),
  ),
  // 縦の巻物: 上の巻軸（シートより左右に3.0ずつ突き出た丸端ロッド）+ シート + 下カール。
  // 白スリット案との16px比較で3層構成を採用（巻物の判読性が明確に上回る）。
  'scroll': filledIcon(
    rr(3.4, 3.6, 17.2, 4.4, 2.2),
    rr(6.4, 9.5, 11.2, 6.9, 1.8),
    rr(5.2, 17.9, 13.6, 2.5, 1.25),
  ),

  // データ / チャート
  'chart-column': ['M4.5 19.5h15', 'M8 19.5v-8M12 19.5V5.9M16 19.5v-10.1'],
  'chart-bar': ['M4.5 4.5v15', 'M4.5 7.5h9.5M4.5 12h12M4.5 16.5h7'],
  'chart-pie': ['M11.4 3.9a8.25 8.25 0 1 0 8.7 8.7h-8.7z', 'M14.55 3.95a8.3 8.3 0 0 1 5.5 5.5h-5.5z'],
  'magnifying-glass-chart': ['M10.9 17.3a6.4 6.4 0 1 0 0-12.8 6.4 6.4 0 0 0 0 12.8z', 'M15.75 15.75l4.5 4.5', 'M8.3 13.15v-2.5M10.9 13.15V8.55M13.5 13.15v-3.4'],
  'list': ['M8.25 6.75h11M8.25 12h11M8.25 17.25h11', 'M4.5 6.75h.01M4.5 12h.01M4.5 17.25h.01'],
  'list-ol': ['M9.75 6.75h9.5M9.75 12h9.5M9.75 17.25h9.5', 'M4.1 5.25l1.15-.65v4.1', 'M3.75 11.2c.2-.45.65-.75 1.2-.75.75 0 1.3.5 1.3 1.15 0 1.3-2.5 1.4-2.5 2.85h2.55', 'M3.75 15.9c.2-.4.65-.65 1.15-.65.75 0 1.3.45 1.3 1.05 0 .55-.45.95-1.05 1.05.65.1 1.15.55 1.15 1.15 0 .65-.6 1.15-1.4 1.15-.55 0-1-.25-1.2-.65'],
  'list-check': ['M10.5 6.75h9M10.5 12h9M10.5 17.25h9', 'M3.9 6.85l1.35 1.35 2.3-2.55M3.9 12.1l1.35 1.35 2.3-2.55M3.9 17.35l1.35 1.35 2.3-2.55'],
  'list-check-alt': ['M10.5 6.75h9M10.5 12h9M10.5 17.25h9', 'M3.9 6.85l1.35 1.35 2.3-2.55M3.9 12.1l1.35 1.35 2.3-2.55M3.9 17.35l1.35 1.35 2.3-2.55'],
  'hashtag': filledIcon(markHashtag()),
  'ranking-star': ['M8.25 19.75h7.5M10.2 19.75v-4.4h3.6v4.4', 'M12 4.1l1.15 2.8 3 .25-2.3 1.95.7 2.95L12 10.45 9.45 12.05l.7-2.95-2.3-1.95 3-.25z'],
  'percent': filledIcon(markPercent()),
  'trophy': ['M7.25 4.5h9.5v4.35a4.75 4.75 0 0 1-9.5 0z', 'M7.25 6.4H5.15a2.1 2.1 0 0 0 0 4.2h2.5', 'M16.75 6.4h2.1a2.1 2.1 0 0 1 0 4.2h-2.5', 'M12 13.6v3.05', 'M8.75 19.75h6.5', 'M10.1 16.65h3.8'],

  // 管理 / 設定
  'gear': {
    paths: [
      { d: 'M10.55 3.35h2.9l.58 2.08c.56.16 1.09.38 1.58.66l1.88-1.06 2.05 2.05-1.06 1.88c.28.49.5 1.02.66 1.58l2.08.58v2.9l-2.08.58a7.6 7.6 0 0 1-.66 1.58l1.06 1.88-2.05 2.05-1.88-1.06c-.49.28-1.02.5-1.58.66l-.58 2.08h-2.9l-.58-2.08a7.6 7.6 0 0 1-1.58-.66l-1.88 1.06-2.05-2.05 1.06-1.88a7.6 7.6 0 0 1-.66-1.58l-2.08-.58v-2.9l2.08-.58c.16-.56.38-1.09.66-1.58L4.52 7.08l2.05-2.05 1.88 1.06c.49-.28 1.02-.5 1.58-.66zm1.45 8.65m-2.55 0a2.55 2.55 0 1 0 5.1 0 2.55 2.55 0 1 0-5.1 0z', fillRule: 'evenodd' },
    ],
  },
  'gauge': ['M4.5 16.25a8.25 8.25 0 1 1 15 0', 'M12 12.75l3.95-4.45', 'M12 12.75h.01'],
  'wrench': ['M14.1 6.5a4.2 4.2 0 0 1 5.2-1.4L16.5 7.9l2.15 2.15 2.8-2.8a4.2 4.2 0 0 1-5.5 4.9l-6.7 6.7a2.15 2.15 0 1 1-3.05-3.05l6.7-6.7a4.2 4.2 0 0 1 1.2-2.6z'],
  'sliders': ['M6.25 4.5v15M12 4.5v15M17.75 4.5v15', 'M4.15 9.25h4.2M9.9 14.75h4.2M15.65 8h4.2'],
  'users-gear': {
    paths: [
      { d: 'M9.35 11.28a3.46 3.46 0 1 0 0-6.92 3.46 3.46 0 0 0 0 6.92zm-6.18 7.63c.52-3.55 2.95-5.8 6.18-5.8 1.32 0 2.52.37 3.5 1.07-.08.41-.08.84 0 1.27l-.9.9a1.35 1.35 0 0 0-.2 1.64l-.12.3c-.16.45-.58.76-1.06.76H3.96c-.5 0-.87-.45-.79-.94z' },
      { d: 'M17.5 10.2h1.55l.34 1.12c.3.1.59.22.86.37l1.04-.55 1.1 1.1-.55 1.04c.15.27.27.56.37.86l1.12.34v1.55l-1.12.34c-.1.3-.22.59-.37.86l.55 1.04-1.1 1.1-1.04-.55c-.27.15-.56.27-.86.37l-.34 1.12H17.5l-.34-1.12a4.6 4.6 0 0 1-.86-.37l-1.04.55-1.1-1.1.55-1.04a4.6 4.6 0 0 1-.37-.86l-1.12-.34v-1.55l1.12-.34c.1-.3.22-.59.37-.86l-.55-1.04 1.1-1.1 1.04.55c.27-.15.56-.27.86-.37zm.78 5.05m-1.26 0a1.26 1.26 0 1 0 2.52 0 1.26 1.26 0 1 0-2.52 0z', fillRule: 'evenodd' },
    ],
  },

  // 時間
  'calendar': filledIcon(calendarBody(), calendarPins()),
  // 日付ドットは 4（2×2・間隔広め）を採用: 5（3+2）は16pxでドット同士が併合気味
  'calendar-days': filledIcon(calendarBody(calDots(4)), calendarPins()),
  // 針は 12時+2時 を採用: 10:10 のV字白針は circle-check と酷似し意味弁別が壊れるため
  'clock': filledIcon(evenOdd(disk(12, 12, 9) + clockHands('two'))),
  'clock-rotate-left': HISTORY_ICON,
  'history': HISTORY_ICON,
  'play': 'M8.75 5.55v12.9c0 .75.8 1.2 1.45.8l10-6.45a.95.95 0 0 0 0-1.6l-10-6.45c-.65-.4-1.45.05-1.45.8z',
  'stop': 'M7.15 5.75h9.7a1.4 1.4 0 0 1 1.4 1.4v9.7a1.4 1.4 0 0 1-1.4 1.4h-9.7a1.4 1.4 0 0 1-1.4-1.4v-9.7a1.4 1.4 0 0 1 1.4-1.4z',
  'hourglass': filledIcon(rr(6.2, 3.7, 11.6, 2.1, 1.05), rr(6.2, 18.2, 11.6, 2.1, 1.05), hourglassBody()),

  // 教育 / 場所 / その他
  'school': ['M3.75 19.75h16.5', 'M5.5 19.75V10L12 5.25 18.5 10v9.75', 'M10.3 19.75v-3.3a1.7 1.7 0 0 1 3.4 0v3.3', 'M12 10.4h.01'],
  'graduation-cap': ['M3.4 9.35 12 4.9l8.6 4.45L12 13.8z', 'M6.4 11.05v3.95c0 1.85 2.5 3.35 5.6 3.35s5.6-1.5 5.6-3.35v-3.95', 'M20.6 9.35v5.4'],
  'tower-broadcast': ['M12 11.4a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z', 'M12 11.4v9.1', 'M8.15 13.35a5.45 5.45 0 0 1 0-7.7M15.85 13.35a5.45 5.45 0 0 0 0-7.7', 'M5.5 16a9.2 9.2 0 0 1 0-13M18.5 16a9.2 9.2 0 0 0 0-13'],
  'qrcode': {
    paths: [
      { d: 'M4.25 4.25h5.85v5.85H4.25zm1.55 1.55v2.75h2.75V5.8zm8.1-1.55h5.85v5.85H13.9zm1.55 1.55v2.75h2.75V5.8zM4.25 13.9h5.85v5.85H4.25zm1.55 1.55v2.75h2.75v-2.75zm8.15-1.55h2.5v2.5h-2.5zm3.75 0h2.05v2.05H17.7zm-3.75 3.75h2.05v2.1h-2.05zm3.35 1.95v-2.5h2.45v2.5z', fillRule: 'evenodd' },
    ],
  },
  'camera': {
    paths: [
      { d: 'M10.25 5.05h3.5c.56 0 1.08.29 1.38.77l.78 1.23h3.04a2.55 2.55 0 0 1 2.55 2.55v7.1a2.55 2.55 0 0 1-2.55 2.55H5.05A2.55 2.55 0 0 1 2.5 16.7V9.6a2.55 2.55 0 0 1 2.55-2.55h3.04l.78-1.23c.3-.48.82-.77 1.38-.77zM12 9.25a3.78 3.78 0 1 0 0 7.56 3.78 3.78 0 0 0 0-7.56zm0 2.05a1.73 1.73 0 1 1 0 3.46 1.73 1.73 0 0 1 0-3.46z', fillRule: 'evenodd' },
    ],
  },
  // solid 雲（小円弧r4.6+大円弧r5.6+フラット底の単一アウトライン）− 白抜き上向き矢印（SF icloud.and.arrow.up.fill 文法）
  'cloud-arrow-up': filledIcon(evenOdd(
    'M3.6 13.6A4.6 4.6 0 0 1 11.43 10.33A5.6 5.6 0 0 1 20.4 12.4L20.4 16.4A2.2 2.2 0 0 1 18.2 18.6L5.8 18.6A2.2 2.2 0 0 1 3.6 16.4z'
    + arrowOutline([12.2, 16.3], [12.2, 9.5], 2.0, 6.0, 4.15), // ヘッド+7%・シャフト2.0（16px比較で採用）
  )),
  'box-open': {
    paths: [
      { d: 'M11.46 3.75c.34-.17.74-.17 1.08 0l7.1 3.55c.56.28.8.94.55 1.51l-.88 2.02 1.7 1.08c.36.23.58.63.58 1.06v3.05c0 .48-.27.91-.7 1.12l-7.83 3.77c-.67.32-1.45.32-2.12 0l-7.83-3.77a1.25 1.25 0 0 1-.7-1.12v-3.05c0-.43.22-.83.58-1.06l1.7-1.08-.88-2.02a1.22 1.22 0 0 1 .55-1.51zm.54 2.45L6.22 9.09 12 11.82l5.78-2.73zm-6.23 6.63v2.63l5 2.42v-3.49zm12.46 0-5 1.56v3.49l5-2.42z', fillRule: 'evenodd' },
    ],
  },
  'inbox': ['M20.75 12.25h-5.25l-1.75 2.6h-3.5l-1.75-2.6H3.25', 'M6.3 6.1 3.25 12.25v5.15a1.85 1.85 0 0 0 1.85 1.85h13.8a1.85 1.85 0 0 0 1.85-1.85v-5.15L17.7 6.1a1.85 1.85 0 0 0-1.65-1.05H7.95A1.85 1.85 0 0 0 6.3 6.1z'],
  'map-location-dot': ['M12 20.6c4.35-3.95 6.5-7.4 6.5-10.4a6.5 6.5 0 1 0-13 0c0 3 2.15 6.45 6.5 10.4z', 'M12 12.5a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z'],
  'map-pin': ['M12 20.6c4.35-3.95 6.5-7.4 6.5-10.4a6.5 6.5 0 1 0-13 0c0 3 2.15 6.45 6.5 10.4z', 'M12 12.5a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z'],
  'door-open': ['M13.95 4.2h2.4a1.9 1.9 0 0 1 1.9 1.9v14.15', 'M3.75 20.25h16.5', 'M13.95 20.25V5.15a.95.95 0 0 0-1.15-.95L7.15 5.35a1.9 1.9 0 0 0-1.5 1.85v13.05', 'M11.5 12.4h.01'],
  'door-closed': ['M6.3 20.25V6.1a1.9 1.9 0 0 1 1.9-1.9h7.6a1.9 1.9 0 0 1 1.9 1.9v14.15', 'M3.75 20.25h16.5', 'M14.1 12.4h.01'],
  'ghost': ['M12 3.75a6.25 6.25 0 0 1 6.25 6.25v9.6l-2.1-1.7-2.1 1.7-2.05-1.7-2.05 1.7-2.1-1.7-2.1 1.7V10A6.25 6.25 0 0 1 12 3.75z', 'M9.4 10.4h.01M14.6 10.4h.01'],
  'keyboard': ['M4.75 6.9h14.5a1.9 1.9 0 0 1 1.9 1.9v6.4a1.9 1.9 0 0 1-1.9 1.9H4.75a1.9 1.9 0 0 1-1.9-1.9V8.8a1.9 1.9 0 0 1 1.9-1.9z', 'M6.9 10.1h.01M10.3 10.1h.01M13.7 10.1h.01M17.1 10.1h.01', 'M7.5 13.9h9'],
  'table-cells-large': ['M5.65 4.75h12.7a1.9 1.9 0 0 1 1.9 1.9v10.7a1.9 1.9 0 0 1-1.9 1.9H5.65a1.9 1.9 0 0 1-1.9-1.9V6.65a1.9 1.9 0 0 1 1.9-1.9z', 'M12 4.75v14.5M3.75 12h16.5'],
  'th': ['M5.65 4.75h12.7a1.9 1.9 0 0 1 1.9 1.9v10.7a1.9 1.9 0 0 1-1.9 1.9H5.65a1.9 1.9 0 0 1-1.9-1.9V6.65a1.9 1.9 0 0 1 1.9-1.9z', 'M12 4.75v14.5M3.75 12h16.5'],
  'arrows-rotate': filledIcon(
    arcBand(12, 12, ROT.r, ROT.w, 205, 326), rotHead(333, false),
    arcBand(12, 12, ROT.r, ROT.w, 25, 146), rotHead(153, false),
  ),
  'circle-notch': 'M20.25 12a8.25 8.25 0 1 1-5.7-7.85',
  'id-badge': ['M7.15 3.75h9.7a2 2 0 0 1 2 2v12.5a2 2 0 0 1-2 2h-9.7a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2z', 'M10.15 7.4h3.7', 'M12 13.9a2.15 2.15 0 1 0 0-4.3 2.15 2.15 0 0 0 0 4.3z', 'M9 17.4c.45-1.4 1.5-2.1 3-2.1s2.55.7 3 2.1'],
  // シール8山・振幅0.9 を採用（10山/0.65 は16pxで山が均されほぼ円になるため）+ 白check（circle-check の0.95倍）
  'check-badge': filledIcon(evenOdd(sealShape(12, 12, 9.2, 0.9, 8) + checkSurface({ s: 0.542, dx: 5.65, dy: 5.4 }))),
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
  const filled = isFilledIconData(data);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-1 -1 26 26');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('stroke', 'none');
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
  const paths = getIconPathItems(data, name);
  paths.forEach((item) => {
    const pathData = typeof item === 'string' ? { d: item } : item;
    if (!pathData?.d) return;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', pathData.d);
    p.setAttribute('fill', pathData.fill || 'currentColor');
    p.setAttribute('stroke', pathData.stroke || 'none');
    if (pathData.fillRule) p.setAttribute('fill-rule', pathData.fillRule);
    if (pathData.clipRule) p.setAttribute('clip-rule', pathData.clipRule);
    svg.appendChild(p);
  });
  return svg;
}

function isFilledIconData(data) {
  return Boolean(data && typeof data === 'object' && !Array.isArray(data) && data.paths);
}

function getIconPathItems(data, name) {
  if (isFilledIconData(data)) return Array.isArray(data.paths) ? data.paths : [];
  return legacyPathItemsToFilled(Array.isArray(data) ? data : [data], name);
}

function legacyPathItemsToFilled(items, name) {
  return items.flatMap((d) => convertLegacyPathToFilled(d, name));
}

function convertLegacyPathToFilled(d, name) {
  if (!d) return [];
  if (/[zZ]/.test(d)) return [iconPath(d)];
  const segments = extractLineSegments(d);
  if (segments.length) return segments.map(([x1, y1, x2, y2]) => iconPath(cap(x1, y1, x2, y2, legacySurfaceWidth(name))));
  return [iconPath(d)];
}

function legacySurfaceWidth(name) {
  if (/chevron|arrow|check|xmark|plus|minus|line-3|list|hashtag|calendar|clock|wifi|download|share/.test(name)) return 2.05;
  if (/user|file|envelope|folder|lock|shield|camera|door|table|qrcode/.test(name)) return 1.85;
  return 1.95;
}

function extractLineSegments(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) || [];
  const segments = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const isCmd = (v) => /^[a-zA-Z]$/.test(v);
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const op = cmd.toUpperCase();
    if (op === 'M') {
      x = num(); y = num();
      if (rel) { x += sx; y += sy; }
      sx = x; sy = y;
      cmd = rel ? 'l' : 'L';
    } else if (op === 'L') {
      while (i < tokens.length && !isCmd(tokens[i])) {
        let nx = num(); let ny = num();
        if (rel) { nx += x; ny += y; }
        segments.push([x, y, nx, ny]);
        x = nx; y = ny;
      }
    } else if (op === 'H') {
      while (i < tokens.length && !isCmd(tokens[i])) {
        let nx = num();
        if (rel) nx += x;
        segments.push([x, y, nx, y]);
        x = nx;
      }
    } else if (op === 'V') {
      while (i < tokens.length && !isCmd(tokens[i])) {
        let ny = num();
        if (rel) ny += y;
        segments.push([x, y, x, ny]);
        y = ny;
      }
    } else {
      return [];
    }
  }
  return segments;
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
