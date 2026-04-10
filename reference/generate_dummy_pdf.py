import os
import base64
import io
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
import PIL.Image
from PIL import ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True
import re

# admin.html内にあるトンボ画像のBase64を動的に取得
with open('admin.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

match = re.search(r'const marker_b64\s*=\s*\[(.*?)\];', html_content, re.DOTALL)
marker_b64 = []
if match:
    arr_str = match.group(1)
    marker_b64 = re.findall(r'"([^"]+)"', arr_str)

# PNGファイルとして一時保存
images = []
os.makedirs('reference/tmp_markers', exist_ok=True)
for i, m_b64 in enumerate(marker_b64):
    b64_data = m_b64.split(',')[-1]
    decoded = base64.b64decode(b64_data)
    filepath = f"reference/tmp_markers/marker_{i}.png"
    with open(filepath, 'wb') as f:
        f.write(decoded)
    # reportlab 側には ImageReader を使って読み込ませるか、ファイルパスを直接渡すことができる
    images.append(filepath)

def generate_pdf():
    # reportlabはbottomup=Falseにすると左上原点(y座標が下方向)になるので、ブラウザ(jsPDF)と全く同じ座標が使える。
    c = canvas.Canvas('reference/dummy_sheets_1_120.pdf', pagesize=A4, bottomup=0)
    pageWidth = 210 * mm
    pageHeight = 297 * mm
    
    # 諸々の設定値 (admin.htmlに準拠)
    qCount = 100
    qCols = 5
    markerSize = 10 * mm
    margin = 5 * mm
    
    # トンボの座標配列
    markers_pos = [
        {'x': margin, 'y': margin, 'id': 0},
        {'x': pageWidth - margin - markerSize, 'y': margin, 'id': 1},
        {'x': margin, 'y': pageHeight - margin - markerSize, 'id': 2},
        {'x': pageWidth - margin - markerSize, 'y': pageHeight - margin - markerSize, 'id': 3}
    ]
    
    gridMarginX = 15 * mm
    gridMarginTop = 5 * mm
    gridSpaceWidth = pageWidth - gridMarginX * 2
    colWidth = gridSpaceWidth / qCols
    rows = qCount // qCols  # 20
    maxGridHeight = 255 * mm
    rowHeight = maxGridHeight / rows

    boxX = 15 * mm
    boxY = gridMarginTop + maxGridHeight + 5 * mm
    boxW = 180 * mm
    boxH = 26 * mm
    L2 = boxX + 13 * mm
    rH = boxH / 3
    bubbleW = 3.2 * mm
    bubbleH = 5.0 * mm

    c.setFont("Helvetica", 14)
    
    # 120人分のページを作成
    for p_idx in range(1, 121):
        # 1. トンボを描画
        for mp in markers_pos:
            c.drawInlineImage(images[mp['id']], mp['x'], mp['y'], width=markerSize, height=markerSize)
            
        c.setStrokeColorRGB(0, 0, 0)
        
        # 2. 解答枠とテキストを描画
        c.setFont("Helvetica-Bold", 12)
        for i in range(qCount):
            col = i % qCols
            row = i // qCols
            x = gridMarginX + col * colWidth
            y = gridMarginTop + row * rowHeight
            
            # jsPdfの rect(x, y, w, h, 'S') と同じ
            c.rect(x, y, colWidth, rowHeight, fill=0, stroke=1)
            
            # ダミーテキスト 「001-001」
            entry_str = f"{p_idx:03d}"
            q_str = f"{i+1:03d}"
            text = f"{entry_str}-{q_str}"
            
            # テキストを枠の中央くらいに配置
            # Y軸下方向なので少し下にオフセット
            c.drawCentredString(x + colWidth / 2, y + rowHeight / 2 + 3 * mm, text)

        # 3. 受験番号欄の枠
        c.rect(boxX, boxY, boxW, boxH, fill=0, stroke=1)
        
        # 4. マーク塗りつぶし
        # 受付番号の各桁
        p_str = f"{p_idx:03d}"
        
        for row_i in range(3):
            # 正解の列 (0〜9)
            target_col = int(p_str[row_i])
            cy = boxY + row_i * rH + rH / 2
            
            for col_i in range(10):
                cx = L2 + 1.5 * mm + col_i * 4.2 * mm
                
                if col_i == target_col:
                    # 塗りつぶす
                    c.setFillColorRGB(0, 0, 0)
                    c.ellipse(cx - bubbleW/2, cy - bubbleH/2, cx + bubbleW/2, cy + bubbleH/2, fill=1, stroke=0)
                else:
                    # 枠だけ
                    c.setFillColorRGB(1, 1, 1)
                    c.setStrokeColorRGB(0.7, 0.7, 0.7)
                    c.ellipse(cx - bubbleW/2, cy - bubbleH/2, cx + bubbleW/2, cy + bubbleH/2, fill=0, stroke=1)

        c.showPage()
    
    c.save()
    print("生成完了しました: reference/dummy_sheets_1_120.pdf")

if __name__ == "__main__":
    generate_pdf()
