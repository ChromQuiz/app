from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from pypdf import PdfReader, PdfWriter
import io

# フォント登録（日本語対応）
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))

input_pdf = "回答用紙.pdf"
output_pdf = "output_120.pdf"

reader = PdfReader(input_pdf)
writer = PdfWriter()

base_page = reader.pages[0]
width = float(base_page.mediabox.width)
height = float(base_page.mediabox.height)

for i in range(1, 121):
    packet = io.BytesIO()
    c = canvas.Canvas(packet, pagesize=(width, height))
    c.setFont("HeiseiKakuGo-W5", 7)

    reception = f"{i:03d}"

    # ===== ここが重要：位置調整ポイント =====
    start_x = 50
    start_y = height - 140
    dx = 45
    dy = 22
    # ======================================

    q = 1
    for row in range(10):
        for col in range(10):
            if q > 100:
                break
            text = f"{reception}-{q:03d}"
            x = start_x + col * dx
            y = start_y - row * dy
            c.drawString(x, y, text)
            q += 1

    # 受付番号欄（必要に応じて調整）
    c.drawString(50, height - 100, reception)

    c.save()
    packet.seek(0)

    overlay_pdf = PdfReader(packet)
    overlay_page = overlay_pdf.pages[0]

    new_page = reader.pages[0]
    new_page.merge_page(overlay_page)

    writer.add_page(new_page)

with open(output_pdf, "wb") as f:
    writer.write(f)

print("完了: output_120.pdf を生成しました")
