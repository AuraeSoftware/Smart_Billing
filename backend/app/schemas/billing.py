from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class LineItemIn(BaseModel):
    description: str
    # SB01: bounds that match what a line item can actually mean — a
    # quantity of 0 or less, a negative price, or a discount/tax outside
    # 0-100% were previously accepted and silently produced nonsense totals
    # (or a negative grand_total). Enforced here so both the invoice and
    # quotation creation paths (which share this schema) get the same
    # guard without duplicating it.
    quantity: float = Field(default=1, gt=0)
    unit_price: float = Field(default=0, ge=0)
    tax_rate_percent: float = Field(default=0, ge=0, le=100)
    discount_percent: float = Field(default=0, ge=0, le=100)


class LineItemOut(BaseModel):
    # Deliberately NOT a subclass of LineItemIn. LineItemIn's gt=0 / ge=0 /
    # le=100 bounds are input validation, for a line item being entered
    # right now. Applied to output as well (as subclassing did before this
    # fix), they re-validate every existing line item on the way out of the
    # API too, which fails response serialization for any invoice or
    # quotation saved before these bounds existed, including the invoice
    # used to demonstrate the original out-of-range bug. That one bad
    # record was enough to 500 the whole /invoices (or /quotations) list
    # for the tenant, which read as the Invoices page going blank. Reading
    # back a stored amount is not the same claim as accepting a new one, so
    # this schema has no bounds at all.
    id: UUID
    description: str
    quantity: float
    unit_price: float
    tax_rate_percent: float
    discount_percent: float
    line_total: float

    class Config:
        from_attributes = True


class InvoiceCreate(BaseModel):
    customer_name: str
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
    # SB04: optional — when the picker's "select existing" path is used the
    # frontend can send this id directly; when omitted (every existing call
    # site), the backend finds-or-creates a Customer by customer_name as
    # before. Purely additive, defaults to no behavior change.
    customer_id: Optional[UUID] = None
    issue_date: date
    due_date: Optional[date] = None
    notes: Optional[str] = None
    items: list[LineItemIn] = Field(default_factory=list)


class InvoiceOut(BaseModel):
    id: UUID
    number: str
    customer_name: str
    customer_email: Optional[str] = None
    status: str
    issue_date: date
    due_date: Optional[date]
    subtotal: float
    tax_total: float
    discount_total: float
    grand_total: float
    amount_paid: float
    customer_id: Optional[UUID] = None
    # The purpose/description captured at creation (InvoiceCreate.notes) was
    # already stored on the model but never returned — the list table and
    # detail view had no way to show it. Purely additive: no existing field
    # changes meaning or shape.
    notes: Optional[str] = None
    items: list[LineItemOut]
    created_at: datetime

    class Config:
        from_attributes = True


class QuotationCreate(BaseModel):
    customer_name: str
    customer_email: Optional[str] = None
    # SB04: same optional explicit-customer override as InvoiceCreate.
    customer_id: Optional[UUID] = None
    issue_date: date
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    items: list[LineItemIn] = Field(default_factory=list)


class QuotationOut(BaseModel):
    id: UUID
    number: str
    customer_name: str
    customer_email: Optional[str] = None
    status: str
    revision: int
    issue_date: date
    valid_until: Optional[date]
    subtotal: float
    tax_total: float
    discount_total: float
    grand_total: float
    customer_id: Optional[UUID] = None
    # Same addition as InvoiceOut.notes — already captured at creation,
    # never surfaced back out.
    notes: Optional[str] = None
    items: list[LineItemOut]
    created_at: datetime

    class Config:
        from_attributes = True


class ReceiptCreate(BaseModel):
    invoice_id: UUID
    amount: float
    is_partial: bool = False
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    received_at: date


class ReceiptOut(BaseModel):
    id: UUID
    number: str
    invoice_id: UUID
    amount: float
    is_partial: bool
    payment_method: Optional[str]
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    received_at: date
    created_at: datetime

    class Config:
        from_attributes = True
