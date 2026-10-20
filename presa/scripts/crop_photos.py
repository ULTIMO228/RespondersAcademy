"""Обрезка фото участников под рамки слайда «Команда» (пропорции 1.88 × 1.70)."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/"
SRC = ROOT + "assets/photos/original/"
DST = ROOT + "assets/photos/"
R = 1.88 / 1.70
# файл: (центр x, центр y, ширина кадра) в пикселях исходника; порядок = порядок карточек
CROPS = {
    "1.webp": (480, 470, 940),   # Алексеев Всеволод
    "2.png": (345, 360, 680),    # Хасянов Амир
    "3.webp": (475, 400, 520),   # Янеев Александр
    "4.png": (265, 270, 531),    # Яров Иван
    "5.jpg": (793, 820, 1586),   # Ткаченко Никита
}
for i, (name, (cx, cy, w)) in enumerate(CROPS.items(), 1):
    im = Image.open(SRC + name).convert("RGB")
    h = int(w / R)
    x0 = max(0, min(im.width - w, cx - w // 2))
    y0 = max(0, min(im.height - h, cy - h // 2))
    im.crop((x0, y0, x0 + w, y0 + h)).resize((600, int(600 / R)), Image.LANCZOS).save(
        DST + f"photo{i}.jpg", quality=90)
