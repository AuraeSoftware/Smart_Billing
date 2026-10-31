"""
Server-side PDF rendering for invoices, quotations, and receipts, merging each
tenant's uploaded branding (logo/header/footer) at render time (SOW 3.1, 3.4).

Layout: title top-left under an accent strip, logo top-right, From / To
blocks, a document-details row, an item table with a total band, payment
details, an optional note, and a footer line with page numbers. The look
(paper size, font, font size, accent colour, header style) comes from the
tenant's saved settings and falls back to sensible defaults.

The call signature of render_document_pdf stays backwards compatible: every
earlier argument still works, the new ones are optional.
"""
import io
import os
import re
from dataclasses import dataclass
from datetime import date
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A5, LEGAL, LETTER
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from app.models.branding import TenantBranding

PAPER_SIZES = {"A4": A4, "LETTER": LETTER, "LEGAL": LEGAL, "A5": A5}
DEFAULT_ACCENT = "#FDB515"
FONT_CHOICES = ("poppins", "helvetica", "times", "courier")

_FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "fonts")
_POPPINS_OK: Optional[bool] = None


def _ensure_poppins() -> bool:
    """Registers the bundled Poppins files once; False if they're missing."""
    global _POPPINS_OK
    if _POPPINS_OK is None:
        try:
            pdfmetrics.registerFont(TTFont("Poppins", os.path.join(_FONT_DIR, "Poppins-Regular.ttf")))
            pdfmetrics.registerFont(TTFont("Poppins-Medium", os.path.join(_FONT_DIR, "Poppins-Medium.ttf")))
            pdfmetrics.registerFont(TTFont("Poppins-SemiBold", os.path.join(_FONT_DIR, "Poppins-SemiBold.ttf")))
            _POPPINS_OK = True
        except Exception:
            _POPPINS_OK = False
    return _POPPINS_OK


def _font_names(choice: str) -> tuple[str, str, str]:
    """(regular, medium, bold) face names for a font choice."""
    if choice == "poppins" and _ensure_poppins():
        return "Poppins", "Poppins-Medium", "Poppins-SemiBold"
    if choice == "times":
        return "Times-Roman", "Times-Bold", "Times-Bold"
    if choice == "courier":
        return "Courier", "Courier-Bold", "Courier-Bold"
    return "Helvetica", "Helvetica-Bold", "Helvetica-Bold"


@dataclass
class DocStyle:
    paper: str = "A4"
    font: str = "poppins"
    font_size: int = 9
    accent: str = DEFAULT_ACCENT
    header_style: str = "shape"  # shape | image


def valid_hex(value: Optional[str]) -> bool:
    return bool(value and re.fullmatch(r"#[0-9a-fA-F]{6}", value.strip()))


def style_from_branding(branding: Optional[TenantBranding]) -> DocStyle:
    st = DocStyle()
    if branding is None:
        return st
    if (branding.doc_paper_size or "").upper() in PAPER_SIZES:
        st.paper = branding.doc_paper_size.upper()
    if (branding.doc_font or "").lower() in FONT_CHOICES:
        st.font = branding.doc_font.lower()
    if branding.doc_font_size and 8 <= branding.doc_font_size <= 14:
        st.font_size = int(branding.doc_font_size)
    if valid_hex(branding.doc_accent_color):
        st.accent = branding.doc_accent_color.strip()
    if branding.doc_header_style in ("shape", "image"):
        st.header_style = branding.doc_header_style
    return st


def business_lines(tenant, branding: Optional[TenantBranding]) -> list[str]:
    """The tenant's own details for the "From" block (below its name)."""
    lines: list[str] = []
    if branding and branding.doc_address:
        lines += [ln.strip() for ln in branding.doc_address.splitlines() if ln.strip()]
    contact = " | ".join(x for x in ((branding.doc_phone if branding else None), getattr(tenant, "contact_email", None)) if x)
    if contact:
        lines.append(contact)
    if branding and branding.doc_registration:
        lines.append(branding.doc_registration)
    return lines


def _pretty_date(value: str) -> str:
    try:
        return date.fromisoformat(value[:10]).strftime("%d %b %Y")
    except Exception:
        return value


def _fmt_qty(q) -> str:
    try:
        f = float(q)
        return str(int(f)) if f == int(f) else f"{f:g}"
    except Exception:
        return str(q)


pretty_date = _pretty_date


def _tint(hex_color: str, amount: float) -> colors.Color:
    c = colors.HexColor(hex_color)
    return colors.Color(1 - (1 - c.red) * amount, 1 - (1 - c.green) * amount, 1 - (1 - c.blue) * amount)


def _is_dark(hex_color: str) -> bool:
    c = colors.HexColor(hex_color)
    return (0.299 * c.red + 0.587 * c.green + 0.114 * c.blue) < 0.55


def _is_zero_amount(text: str) -> bool:
    nums = re.findall(r"[\d,]+\.?\d*", text)
    return bool(nums) and all(float(n.replace(",", "") or 0) == 0 for n in nums)


class _NumberedCanvas(canvas.Canvas):
    """Draws the dark footer bar with "Page n / total" once the page count is known."""

    def __init__(self, *args, footer_drawer=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved: list[dict] = []
        self._footer_drawer = footer_drawer

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            if self._footer_drawer:
                self._footer_drawer(self, self._pageNumber, total)
            super().showPage()
        super().save()


def render_document_pdf(
    *,
    doc_type: str,  # "INVOICE" | "QUOTATION" | "RECEIPT"
    number: str,
    tenant_name: str,
    branding: Optional[TenantBranding],
    customer_name: str,
    issue_date: str,
    meta_lines: list[str],
    line_items: list[dict],  # [{description, quantity, unit_price, line_total}]
    totals: list[tuple[str, str]],  # [("Subtotal", "1,000.00"), ...]
    footer_text: Optional[str] = None,
    customer_lines: Optional[list[str]] = None,
    from_lines: Optional[list[str]] = None,
    meta_fields: Optional[list[tuple[str, str]]] = None,  # extra detail columns, e.g. ("Invoice Due", "27 Apr 2026")
    badge: Optional[str] = None,
    note: Optional[str] = None,
    style: Optional[DocStyle] = None,
    logo_path: Optional[str] = None,
    header_path: Optional[str] = None,
    footer_path: Optional[str] = None,
) -> bytes:
    st = style or style_from_branding(branding)
    page_w, page_h = PAPER_SIZES.get(st.paper, A4)
    s = page_w / 595.28  # geometry scale relative to A4 width
    margin = 33 * s
    body = float(st.font_size)
    f_reg, f_med, f_bold = _font_names(st.font)
    accent = st.accent if valid_hex(st.accent) else DEFAULT_ACCENT
    dark = colors.HexColor("#1B1B1B")
    muted = colors.HexColor("#444444")
    hairline = colors.HexColor("#ECECEC")
    lh = body * 1.55  # line height

    logo = logo_path or (branding.logo_url if branding else None)
    header_img = header_path or (branding.header_url if branding else None)
    footer_img = footer_path or (branding.footer_url if branding else None)
    footer_note = footer_text if footer_text is not None else (branding.footer_text if branding else None)

    bar_h = 31 * s
    footer_img_h = 12 * s if (footer_img and os.path.exists(footer_img)) else 0
    bottom_limit = bar_h + footer_img_h + 18 * s

    contact_bits = [tenant_name]
    if from_lines:
        tail = [ln for ln in from_lines if "|" in ln or "@" in ln]
        if tail:
            contact_bits = [tenant_name] + [tail[0].replace(" | ", " | ")]
    footer_left = "  |  ".join(contact_bits)

    def draw_footer(c: canvas.Canvas, n: int, total: int):
        if footer_img_h:
            try:
                c.drawImage(footer_img, margin, bar_h + 4 * s, width=page_w - 2 * margin, height=footer_img_h,
                            preserveAspectRatio=True, anchor="c", mask="auto")
            except Exception:
                pass
        c.setStrokeColor(colors.HexColor(accent))
        c.setLineWidth(1.2)
        c.line(margin, bar_h, page_w - margin, bar_h)
        c.setFillColor(muted)
        c.setFont(f_reg, max(body - 2, 7))
        c.drawString(margin, bar_h / 2 - 2.5, footer_left[:110])
        c.drawRightString(page_w - margin, bar_h / 2 - 2.5, f"Page {n} / {total}")

    buf = io.BytesIO()
    c = _NumberedCanvas(buf, pagesize=(page_w, page_h), footer_drawer=draw_footer)
    c.setTitle(f"{doc_type.title()} {number}")

    def txt(x, y, text, font, size, color=dark, align="l"):
        c.setFont(font, size)
        c.setFillColor(color)
        if align == "r":
            c.drawRightString(x, y, text)
        elif align == "c":
            c.drawCentredString(x, y, text)
        else:
            c.drawString(x, y, text)

    def wrap(text, font, size, width):
        return simpleSplit(str(text), font, size, width) or [""]

    def image(path, x, y, w, h, anchor="sw"):
        if path and os.path.exists(path):
            try:
                c.drawImage(path, x, y, width=w, height=h, preserveAspectRatio=True, anchor=anchor, mask="auto")
                return True
            except Exception:
                return False
        return False

    # ---------------- Header ----------------
    top = page_h
    if st.header_style == "image" and header_img and os.path.exists(header_img):
        hh = 34 * s
        image(header_img, margin, page_h - hh - 8 * s, page_w - 2 * margin, hh, anchor="c")
        top = page_h - hh - 14 * s
        title_y = top - 34 * s
    else:
        c.setFillColor(colors.HexColor(accent))
        c.rect(0, page_h - 9 * s, page_w, 9 * s, stroke=0, fill=1)
        title_y = page_h - 58 * s
    title_size = 26 * s
    txt(margin, title_y, doc_type.title(), f_bold, title_size, dark)
    if st.header_style == "shape":
        c.setFillColor(colors.HexColor(accent))
        c.rect(margin, title_y - 11 * s, 38 * s, 3 * s, stroke=0, fill=1)
    image(logo, page_w - margin - 108 * s, title_y - 20 * s, 108 * s, 50 * s, anchor="e")

    # ---------------- From / To ----------------
    col_w = (page_w - 2 * margin) / 2 - 14 * s
    right_x = margin + (page_w - 2 * margin) / 2 + 8 * s
    y = title_y - 58 * s
    txt(margin, y, "From", f_bold, body + 2)
    txt(right_x, y, "To", f_bold, body + 2)
    y_from = y_to = y - lh * 1.35
    txt(margin, y_from, tenant_name[:60], f_bold, body)
    txt(right_x, y_to, customer_name[:60], f_bold, body)
    y_from -= lh
    y_to -= lh
    for ln in (from_lines or []):
        for piece in wrap(ln, f_reg, body, col_w):
            txt(margin, y_from, piece, f_reg, body, muted)
            y_from -= lh
    for ln in (customer_lines or []):
        for piece in wrap(ln, f_reg, body, col_w):
            txt(right_x, y_to, piece, f_reg, body, muted)
            y_to -= lh
    y = min(y_from, y_to) - 6 * s

    def hline(yy, color=hairline, width=0.8, x0=0, x1=None):
        c.setStrokeColor(color)
        c.setLineWidth(width)
        c.line(x0, yy, page_w if x1 is None else x1, yy)

    hline(y)

    # ---------------- Details row ----------------
    fields = [(f"{doc_type.title()} No.", number), ("Date", _pretty_date(issue_date))] + list(meta_fields or [])
    y -= lh * 1.5
    n_cols = len(fields)
    usable = page_w - 2 * margin - (112 * s if badge else 0)
    step = usable / max(n_cols, 1)
    for i, (label, value) in enumerate(fields):
        x = margin + i * step
        txt(x, y, label, f_bold, body + 1)
        txt(x, y - lh, str(value)[:28], f_reg, body, muted)
    if badge:
        bw, bh = 104 * s, 25 * s
        bx, by = page_w - margin - bw, y - lh * 0.9
        c.setStrokeColor(colors.HexColor(accent))
        c.setLineWidth(1.4)
        c.roundRect(bx, by, bw, bh, 12 * s, stroke=1, fill=0)
        txt(bx + bw / 2, by + bh / 2 - 3, badge.upper()[:22], f_bold, max(body - 1, 7), dark, "c")
    y -= lh * 2.1
    hline(y)

    # ---------------- Items table ----------------
    x_desc = margin + 9 * s
    x_amt = page_w - margin - 9 * s
    gap = 16 * s

    def _w(texts, font, size):
        return max([pdfmetrics.stringWidth(str(t), font, size) for t in texts] + [0])

    w_amt = max(_w([i["line_total"] for i in line_items], f_med, body), _w([v for _, v in totals], f_bold, body + 1),
                pdfmetrics.stringWidth("Amount", f_bold, body - 0.5))
    w_rate = max(_w([i["unit_price"] for i in line_items], f_reg, body), pdfmetrics.stringWidth("Rate", f_bold, body - 0.5))
    w_qty = max(_w([_fmt_qty(i["quantity"]) for i in line_items], f_reg, body), pdfmetrics.stringWidth("Quantity", f_bold, body - 0.5))
    x_rate = x_amt - w_amt - gap
    x_qty = x_rate - w_rate - gap
    desc_w = x_qty - w_qty - x_desc - gap

    def table_head(yy):
        band_h = 30 * s
        c.setStrokeColor(colors.HexColor(accent))
        c.setLineWidth(1.6)
        c.line(margin, yy - band_h, page_w - margin, yy - band_h)
        base = yy - band_h / 2 - body * 0.32
        txt(x_desc, base, "Description", f_bold, body - 0.5)
        txt(x_qty, base, "Quantity", f_bold, body - 0.5, align="r")
        txt(x_rate, base, "Rate", f_bold, body - 0.5, align="r")
        txt(x_amt, base, "Amount", f_bold, body - 0.5, align="r")
        return yy - band_h

    y = table_head(y - 14 * s)
    for item in line_items:
        lines = wrap(item["description"], f_reg, body, desc_w - 14 * s)
        row_h = max(len(lines) * lh + 12 * s, 28 * s)
        if y - row_h < bottom_limit + 40 * s:
            c.showPage()
            y = table_head(page_h - 40 * s)
        first = y - row_h / 2 + (len(lines) - 1) * lh / 2 - body * 0.32
        for k, piece in enumerate(lines):
            txt(x_desc + 14 * s, first - k * lh, piece, f_reg, body, muted)
        mid = y - row_h / 2 - body * 0.32
        txt(x_qty, mid, _fmt_qty(item["quantity"]), f_reg, body, muted, "r")
        txt(x_rate, mid, str(item["unit_price"]), f_reg, body, muted, "r")
        txt(x_amt, mid, str(item["line_total"]), f_med, body, dark, "r")
        y -= row_h
        hline(y, hairline, 0.8, margin, page_w - margin)

    c.setStrokeColor(colors.HexColor("#222222"))
    c.setLineWidth(1.6)
    c.line(margin, y, page_w - margin, y)

    # ---------------- Totals ----------------
    rows = [(l, v) for (l, v) in totals]
    if rows:
        head = [(l, v) for (l, v) in rows[:-1] if not (l.lower() in ("discount", "tax") and _is_zero_amount(v))]
        if len(head) == 1 and head[0][0].lower() == "subtotal":
            head = []
        rows = head + [rows[-1]]
    band_h = 33 * s
    need = len(rows) * 22 * s + 14 * s
    if y - need < bottom_limit:
        c.showPage()
        y = page_h - 40 * s
    for idx, (label, value) in enumerate(rows):
        last = idx == len(rows) - 1
        h = band_h if last else 22 * s
        c.setFillColor(_tint(accent, 0.12) if last else colors.HexColor("#F8F8F8"))
        c.rect(margin, y - h, page_w - 2 * margin, h, stroke=0, fill=1)
        base = y - h / 2 - body * 0.32
        txt(x_amt - w_amt - gap, base, label, f_bold if last else f_reg, body + (1 if last else 0), dark, "r")
        txt(x_amt, base, value, f_bold if last else f_reg, body + (1 if last else 0), dark, "r")
        y -= h

    # ---------------- Payment / extra details ----------------
    def kv_line(yy, line):
        if ":" in line and len(line.split(":", 1)[0]) <= 28:
            k, v = line.split(":", 1)
            txt(margin, yy, k + ":", f_med, body, dark)
            kw = pdfmetrics.stringWidth(k + ": ", f_med, body)
            txt(margin + kw, yy, v.strip(), f_reg, body, muted)
        else:
            txt(margin, yy, line, f_reg, body, muted)

    detail_lines: list[str] = list(meta_lines or [])
    if footer_note:
        detail_lines += [ln.strip() for ln in footer_note.splitlines() if ln.strip()]
    if detail_lines:
        y -= 26 * s
        for ln in detail_lines:
            for piece in wrap(ln, f_reg, body, page_w - 2 * margin):
                if y < bottom_limit:
                    c.showPage()
                    y = page_h - 50 * s
                kv_line(y, piece)
                y -= lh * 1.2

    if note:
        y -= 10 * s
        hline(y)
        y -= 24 * s
        for piece in wrap(note, f_bold, body, page_w - 2 * margin - 40 * s):
            if y < bottom_limit:
                c.showPage()
                y = page_h - 50 * s
            txt(page_w / 2, y, piece, f_bold, body, dark, "c")
            y -= lh

    c.showPage()
    c.save()
    return buf.getvalue()


def sample_document(doc_type: str, tenant_name: str, currency: str = "INR") -> dict:
    """Realistic sample content for the Settings / signup previews."""
    cur = currency or "INR"
    items = [
        {"description": "Brand identity design", "quantity": 1, "unit_price": f"{cur} 25,000.00", "line_total": f"{cur} 25,000.00"},
        {"description": "Website design and development (5 pages)", "quantity": 1, "unit_price": f"{cur} 45,000.00", "line_total": f"{cur} 45,000.00"},
        {"description": "Social media setup", "quantity": 2, "unit_price": f"{cur} 5,000.00", "line_total": f"{cur} 10,000.00"},
    ]
    return {
        "doc_type": doc_type, "customer_name": "Sample Customer Pvt Ltd",
        "customer_lines": ["12 Park Street, Chennai, Tamil Nadu 600001", "+91 98765 43210", "accounts@samplecustomer.com"],
        "issue_date": date.today().isoformat(), "line_items": items,
        "totals": [("Subtotal", f"{cur} 80,000.00"), ("Discount", f"-{cur} 0.00"), ("Tax", f"{cur} 0.00"), ("Total", f"{cur} 80,000.00")],
    }


def render_preview(
    *, doc_type: str, style: DocStyle, tenant_name: str, from_lines: list[str], currency: str = "INR",
    logo_path: Optional[str] = None, header_path: Optional[str] = None, footer_path: Optional[str] = None,
    footer_text: Optional[str] = None,
) -> bytes:
    """A sample invoice / quotation / receipt in the given style, for the live
    previews in Settings and signup. Never touches the database."""
    kind = doc_type.upper()
    if kind not in ("INVOICE", "QUOTATION", "RECEIPT"):
        kind = "INVOICE"
    sample = sample_document(kind, tenant_name, currency)
    cur = currency or "INR"
    today = date.today()
    extra: dict = {}
    if kind == "INVOICE":
        number = "INV-26-001"
        extra = {"meta_fields": [("Invoice Due", _pretty_date(date.fromordinal(today.toordinal() + 14).isoformat()))],
                 "note": "Thank you for your business."}
    elif kind == "QUOTATION":
        number = "QUO-26-001"
        extra = {"meta_fields": [("Valid Until", _pretty_date(date.fromordinal(today.toordinal() + 10).isoformat()))],
                 "badge": "Validity 10 days", "note": "Prices are valid for 10 days from the date of this quotation."}
    else:
        number = "RCT-26-001"
        sample["line_items"] = [{"description": "Payment received (partial)", "quantity": 1,
                                 "unit_price": f"{cur} 40,000.00", "line_total": f"{cur} 40,000.00"}]
        sample["totals"] = [("Invoice total", f"{cur} 80,000.00"), ("Total paid to date", f"{cur} 40,000.00"),
                            ("Balance remaining", f"{cur} 40,000.00"), ("Amount received", f"{cur} 40,000.00")]
        extra = {"meta_fields": [("Against Invoice", "INV-26-001")], "note": "Payment Received",
                 "meta_lines": ["Payment method: Bank transfer", "Reference: UTR 4821 9930 1177"]}
    return render_document_pdf(
        doc_type=kind, number=number, tenant_name=tenant_name or "Your Business", branding=None,
        customer_name=sample["customer_name"], customer_lines=sample["customer_lines"],
        issue_date=sample["issue_date"], line_items=sample["line_items"], totals=sample["totals"],
        from_lines=from_lines, style=style, logo_path=logo_path, header_path=header_path,
        footer_path=footer_path, footer_text=footer_text or "", **({"meta_lines": []} | extra),
    )
