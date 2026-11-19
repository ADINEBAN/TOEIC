import json
import os
import re
import sys
import tempfile
from typing import Any, Dict, List, Tuple


def cluster_column_aware_lines(boxes: List[Dict[str, Any]], img_width: int) -> str:
    if not boxes:
        return ""

    # Detect two-column layout on wide TOEIC exam pages (significant left/right halves)
    mid_x = img_width * 0.5
    left_boxes = [b for b in boxes if b["x_max"] < mid_x + img_width * 0.03]
    right_boxes = [b for b in boxes if b["x_min"] > mid_x - img_width * 0.03 and b not in left_boxes]
    spanning_boxes = [b for b in boxes if b not in left_boxes and b not in right_boxes]

    has_two_columns = (
        img_width >= 900
        and len(left_boxes) >= 5
        and len(right_boxes) >= 5
        and len(spanning_boxes) < max(3, int(len(boxes) * 0.25))
    )

    if has_two_columns:
        top_headers = sorted([b for b in spanning_boxes if b["y_mid"] < min(x["y_mid"] for x in left_boxes + right_boxes) + 40], key=lambda b: (b["y_mid"], b["x_min"]))
        bottom_footers = [b for b in spanning_boxes if b not in top_headers]
        parts = [
            render_single_column(top_headers),
            render_single_column(left_boxes),
            render_single_column(right_boxes),
            render_single_column(bottom_footers),
        ]
        return "\n".join(p for p in parts if p).strip()

    return render_single_column(boxes)


def render_single_column(boxes: List[Dict[str, Any]]) -> str:
    if not boxes:
        return ""
    sorted_boxes = sorted(boxes, key=lambda b: (b["y_min"], b["x_min"]))
    rows: List[List[Dict[str, Any]]] = []

    for box in sorted_boxes:
        placed = False
        tol = max(12.0, box["height"] * 0.55)
        for row in reversed(rows[-5:]):
            row_y = sum(item["y_mid"] for item in row) / len(row)
            if abs(box["y_mid"] - row_y) <= tol:
                row.append(box)
                placed = True
                break
        if not placed:
            rows.append([box])

    rows.sort(key=lambda r: min(item["y_min"] for item in r))
    lines = []
    for row in rows:
        row.sort(key=lambda item: item["x_min"])
        line_text = " ".join(item["text"].strip() for item in row if item["text"].strip())
        if line_text:
            lines.append(line_text)
    return "\n".join(lines)


def _parse_ocr_result(result: Any, img_width: int) -> Tuple[str, float]:
    boxes: List[Dict[str, Any]] = []
    confs: List[float] = []

    for item in result or []:
        # RapidOCR tuple: [coords, text, confidence]
        coords, text, score = item[0], str(item[1] or ""), float(item[2] or 0.0)
        xs = [pt[0] for pt in coords]
        ys = [pt[1] for pt in coords]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        boxes.append(
            {
                "text": text,
                "score": score,
                "x_min": x_min,
                "x_max": x_max,
                "y_min": y_min,
                "y_max": y_max,
                "y_mid": (y_min + y_max) / 2.0,
                "height": max(1.0, y_max - y_min),
            }
        )
        confs.append(score)

    text_out = cluster_column_aware_lines(boxes, img_width)
    avg_conf = round(sum(confs) / len(confs), 4) if confs else 0.0
    return text_out, avg_conf


def run_ocr(image_path: str) -> Dict[str, Any]:
    from PIL import Image, ImageOps
    from rapidocr_onnxruntime import RapidOCR

    with Image.open(image_path) as im:
        img_width, img_height = im.size

    engine = RapidOCR()
    result, _ = engine(image_path)
    text_out, avg_conf = _parse_ocr_result(result, img_width)

    # Fallback enhancement for compressed/thin JPG or small images when primary OCR yields sparse text
    alnum_len = len(re.sub(r"[^A-Za-z0-9]", "", text_out))
    if alnum_len < 35 or avg_conf < 0.72:
        tmp_png = None
        try:
            with Image.open(image_path) as im:
                gray = ImageOps.autocontrast(im.convert("L"), cutoff=1)
                scale = 2 if max(im.size) < 2200 else 1
                if scale > 1:
                    resample = getattr(Image, "Resampling", Image).LANCZOS
                    gray = gray.resize((im.width * scale, im.height * scale), resample)
                enhanced = gray.convert("RGB")
                enh_w = enhanced.width
            fd, tmp_png = tempfile.mkstemp(suffix=".png")
            os.close(fd)
            enhanced.save(tmp_png, format="PNG")
            enh_result, _ = engine(tmp_png)
            enh_text, enh_conf = _parse_ocr_result(enh_result, enh_w)
            enh_alnum = len(re.sub(r"[^A-Za-z0-9]", "", enh_text))
            if enh_alnum > alnum_len or (enh_alnum == alnum_len and enh_conf > avg_conf):
                text_out, avg_conf = enh_text, enh_conf
        except Exception:
            pass
        finally:
            if tmp_png and os.path.exists(tmp_png):
                try:
                    os.remove(tmp_png)
                except OSError:
                    pass

    return {
        "text": text_out,
        "confidence": avg_conf,
        "engine": "RAPID_OCR",
        "lineCount": len(text_out.splitlines()) if text_out else 0,
        "imageWidth": img_width,
        "imageHeight": img_height,
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing image_path argument"}, ensure_ascii=False))
        sys.exit(1)
    try:
        payload = run_ocr(sys.argv[1])
        print(json.dumps(payload, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc), "text": "", "confidence": 0.0}, ensure_ascii=False))
        sys.exit(2)


if __name__ == "__main__":
    main()
