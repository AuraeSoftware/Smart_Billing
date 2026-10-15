"""
SB04 — a real Customer entity, scoped to the caller's own tenant. Additive
alongside the existing /analytics/tenant/customers aggregation (which keeps
working unchanged): this is for the searchable select-or-create control in
the invoice/quotation editor, and for anything else that wants a durable
customer record with an id rather than a bare name string.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_tenant_staff, current_tenant_id
from app.models.user import User
from app.models.customer import Customer

router = APIRouter()


class CustomerOut(BaseModel):
    id: str
    name: str
    email: str | None
    phone: str | None
    address: str | None

    class Config:
        from_attributes = True


def _out(c: Customer) -> CustomerOut:
    return CustomerOut(id=str(c.id), name=c.name, email=c.email, phone=c.phone, address=c.address)


class CustomerIn(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    address: str | None = None


@router.get("", response_model=list[CustomerOut])
def list_customers(
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    """Used by the invoice/quotation editor's searchable customer picker —
    `q` filters by name/email substring (case-insensitive); omit it for the
    full list."""
    query = db.query(Customer).filter(Customer.tenant_id == uuid.UUID(tenant_id))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Customer.name.ilike(like), Customer.email.ilike(like)))
    return [_out(c) for c in query.order_by(Customer.name).limit(50).all()]


def find_or_create_customer(db: Session, tenant_id: str, name: str, email: str | None) -> Customer:
    """Shared by invoices.py/quotations.py create_* endpoints: matches the
    same (tenant, lower(trim(name))) key the Customers aggregation page and
    the 0009 backfill migration use, so a document created with a name that
    already exists links to that customer instead of creating a duplicate."""
    key = name.strip().lower()
    existing = (
        db.query(Customer)
        .filter(Customer.tenant_id == uuid.UUID(tenant_id))
        .filter(Customer.name.ilike(name.strip()))
        .all()
    )
    for c in existing:
        if c.name.strip().lower() == key:
            if email and not c.email:
                c.email = email
                db.add(c)
            return c
    # id is set explicitly (rather than relying on the column's Python-side
    # default, which SQLAlchemy only applies at flush) so the caller can use
    # customer.id immediately, before this session's commit.
    customer = Customer(id=uuid.uuid4(), tenant_id=uuid.UUID(tenant_id), name=name.strip(), email=email)
    db.add(customer)
    return customer


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    """Explicit create, for the "+ New customer" path in the picker — most
    customers are created implicitly via find_or_create_customer when an
    invoice/quotation names a new customer, so this is for setting phone/
    address up front rather than leaving them to be filled in later."""
    customer = Customer(tenant_id=uuid.UUID(tenant_id), **payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return _out(customer)


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    customer = db.query(Customer).filter(Customer.id == customer_id, Customer.tenant_id == uuid.UUID(tenant_id)).one_or_none()
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found.")
    return _out(customer)
