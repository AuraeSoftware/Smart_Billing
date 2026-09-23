"""
Server-side PDF rendering for invoices, quotations, and receipts, merging each
tenant's uploaded branding (logo/header/footer) at render time (SOW 3.1, 3.4).

This is a functional starting point using reportlab — swap in a templating
approach (e.g. WeasyPrint + Jinja HTML templates) if OS2 Studio wants richer,
designer-editable layouts later; the call signature here is what the API
routes depend on, so that swap stays isolated to this file.
"""
import io
import os
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas

from app.models.branding import TenantBranding


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
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    margin = 18 * mm
    y = height - margin

    # --- Header: tenant logo + header image, if uploaded ---
    if branding and branding.logo_url and os.path.exists(branding.logo_url):
        try:
            c.drawImage(branding.logo_url, margin, y - 20 * mm, width=30 * mm, height=20 * mm, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass
    if branding and branding.header_url and os.path.exists(branding.header_url):
        try:
            c.drawImage(branding.header_url, margin + 35 * mm, y - 20 * mm, width=width - 2 * margin - 35 * mm, height=20 * mm, preserveAspectRatio=True, mask="auto", anchor="n")
        except Exception:
            pass

    y -= 26 * mm
    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, y, tenant_name)
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(width - margin, y, doc_type)
    y -= 7 * mm
    c.setFont("Helvetica", 10)
    c.drawRightString(width - margin, y, f"No. {number}")
    y -= 5 * mm
    c.drawRightString(width - margin, y, f"Date: {issue_date}")

    y -= 10 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, y, "Billed to:")
    y -= 5 * mm
    c.setFont("Helvetica", 10)
    c.drawString(margin, y, customer_name)

    for line in meta_lines:
        y -= 5 * mm
        c.drawString(margin, y, line)

    # --- Line items table ---
    y -= 12 * mm
    c.setFont("Helvetica-Bold", 9)
    col_desc, col_qty, col_price, col_total = margin, width - margin - 70 * mm, width - margin - 50 * mm, width - margin - 25 * mm
    c.drawString(col_desc, y, "Description")
    c.drawString(col_qty, y, "Qty")
    c.drawString(col_price, y, "Unit price")
    c.drawRightString(width - margin, y, "Line total")
    y -= 2 * mm
    c.line(margin, y, width - margin, y)
    y -= 5 * mm

    c.setFont("Helvetica", 9)
    for item in line_items:
        if y < margin + 40 * mm:
            c.showPage()
            y = height - margin
        c.drawString(col_desc, y, str(item["description"])[:60])
        c.drawString(col_qty, y, str(item["quantity"]))
        c.drawString(col_price, y, str(item["unit_price"]))
        c.drawRightString(width - margin, y, str(item["line_total"]))
        y -= 5.5 * mm

    y -= 4 * mm
    c.line(width - margin - 60 * mm, y, width - margin, y)
    y -= 6 * mm

    c.setFont("Helvetica", 9)
    for label, value in totals[:-1]:
        c.drawString(width - margin - 60 * mm, y, label)
        c.drawRightString(width - margin, y, value)
        y -= 5 * mm
    if totals:
        label, value = totals[-1]
        c.setFont("Helvetica-Bold", 11)
        c.drawString(width - margin - 60 * mm, y, label)
        c.drawRightString(width - margin, y, value)

    # --- Footer: tenant footer image/text ---
    footer_y = margin
    if branding and branding.footer_url and os.path.exists(branding.footer_url):
        try:
            c.drawImage(branding.footer_url, margin, footer_y, width=width - 2 * margin, height=15 * mm, preserveAspectRatio=True, mask="auto")
            footer_y += 16 * mm
        except Exception:
            pass
    text_to_show = footer_text or (branding.footer_text if branding else None)
    if text_to_show:
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.grey)
        c.drawString(margin, footer_y, text_to_show[:180])

    c.showPage()
    c.save()
    return buf.getvalue()
