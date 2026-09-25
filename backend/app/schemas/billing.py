from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class LineItemIn(BaseModel):
    description: str
    quantity: float = 1
    unit_price: float = 0
    tax_rate_percent: float = 0
    discount_percent: float = 0


class LineItemOut(LineItemIn):
    id: UUID
    line_total: float

    class Config:
        from_attributes = True


class InvoiceCreate(BaseModel):
    customer_name: str
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
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
