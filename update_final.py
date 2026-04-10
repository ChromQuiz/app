import re

with open('saiten.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Height optimization
content = re.sub(r'const maxGridHeight = \d+;', 'const maxGridHeight = 240;', content)

# 2. Horizontal numbering fix
content = re.sub(
    r'const col = Math\.floor\(i \/ rows\);\n\s*const row = i % rows;',
    r'const row = Math.floor(i / qCols);\n        const col = i % qCols;',
    content
)

# 3. New Unified Layout
old_layout = r"        // 3\. 受付番号マークシート \(Bottom Left\).*?doc\.text\(\"氏名\", nameBoxX \+ L4 \+ \(L5-L4\)\/2, nameBoxY \+ nameBoxH\/2, \{ align: \'center\', baseline: \'middle\' \}\);"

new_layout = """        // 3. 統合下部ボックス枠 (Bottom full-width box)
        const boxX = 15;
        const boxY = 265;
        const boxW = 180;
        const boxH = 26;
        
        doc.rect(boxX, boxY, boxW, boxH, 'S');

        // 各種区切り線 (横幅と用途)
        const L1 = boxX + 6;   // 受付番号ラベル
        const L2 = boxX + 13;  // 手書き枠
        const L3 = boxX + 56;  // マークシートバブル枠
        const L4 = boxX + 64;  // 学年ラベル
        const L5 = boxX + 86;  // 学年枠
        const L6 = boxX + 94;  // 所属ラベル
        const L7 = boxX + 124; // 所属枠
        const L8 = boxX + 132; // 氏名ラベル
        
        [L1, L2, L3, L4, L5, L6, L7, L8].forEach(lx => {
            doc.line(lx, boxY, lx, boxY + boxH, 'S');
        });

        const rowH = boxH / 3;
        // マーカーシート部分の横線 (3桁の分離)
        doc.line(L1, boxY + rowH, L3, boxY + rowH, 'S');
        doc.line(L1, boxY + rowH*2, L3, boxY + rowH*2, 'S');

        // 受付番号ラベル (縦書き)
        doc.setFontSize(8);
        doc.text(["受","付","番","号"], boxX + 3, boxY + boxH/2, { align: 'center', baseline: 'middle' });

        // マークシートのバブル配置
        const bubbleW = 3.2;
        const bubbleH = 5.0;
        
        for (let row = 0; row < 3; row++) {
          const cy = boxY + row * rowH + rowH / 2;
          for (let col = 0; col < 10; col++) {
            const cx = L2 + 2.5 + col * 4.0;
            doc.ellipse(cx + bubbleW/2, cy, bubbleW/2, bubbleH/2, 'S');
            doc.text(col.toString(), cx + bubbleW/2, cy, { align: 'center', baseline: 'middle' });
            
            // scoring.html は cell.row を 桁数(0-2)、cell.col を 値(0-9) とみなす
            config.markCells.push({ x: cx, y: cy-bubbleH/2, w: bubbleW, h: bubbleH, row: row, col: col });
          }
        }

        // 学年・所属・氏名ラベル
        doc.text("学年", (L3 + L4)/2, boxY + boxH/2, { align: 'center', baseline: 'middle' });
        doc.text("所属", (L5 + L6)/2, boxY + boxH/2, { align: 'center', baseline: 'middle' });
        doc.text("氏名", (L7 + L8)/2, boxY + boxH/2, { align: 'center', baseline: 'middle' });"""

content = re.sub(old_layout, new_layout, content, flags=re.DOTALL)

with open('saiten.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Unified bottom layout complete.")
