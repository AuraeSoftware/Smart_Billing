"""
Catalog — a tenant's reusable, saved service/product line items, so a Super
Admin can drop a priced item straight into an invoice or quotation line
without retyping price and tax every time. Smart Garage 360's "Packages"/
"Products" sidebar page, adapted for billing. Scoped strictly to the
caller's own tenant.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_super_admin, current_tenant_id
from app.models.user import User
from app.models.catalog import CatalogItem

router = APIRouter()


class CatalogItemOut(BaseModel):
    id: str
    name: str
    description: str | None
    unit: str | None
    default_unit_price: float
    default_tax_rate_percent: float
    is_active: bool

    class Config:
        from_attributes = True


def _out(item: CatalogItem) -> CatalogItemOut:
    return CatalogItemOut(
        id=str(item.id), name=item.name, description=item.description, unit=item.unit,
        default_unit_price=float(item.default_unit_price),
        default_tax_rate_percent=float(item.default_tax_rate_percent),
        is_active=item.is_active,
    )


class CatalogItemIn(BaseModel):
    name: str
    description: str | None = None
    unit: str | None = None
    default_unit_price: float = 0
    default_tax_rate_percent: float = 0
    is_active: bool = True


@router.get("", response_model=list[CatalogItemOut])
def list_catalog_items(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    items = (
        db.query(CatalogItem)
        .filter(CatalogItem.tenant_id == uuid.UUID(tenant_id))
        .order_by(CatalogItem.name)
        .all()
    )
    return [_out(i) for i in items]


@router.post("", response_model=CatalogItemOut, status_code=status.HTTP_201_CREATED)
def create_catalog_item(
    payload: CatalogItemIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    item = CatalogItem(id=uuid.uuid4(), tenant_id=uuid.UUID(tenant_id), **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _out(item)


def _get_owned(db: Session, tenant_id: str, item_id: uuid.UUID) -> CatalogItem:
    item = db.query(CatalogItem).filter(
        CatalogItem.id == item_id, CatalogItem.tenant_id == uuid.UUID(tenant_id)
    ).one_or_none()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catalog item not found.")
    return item


@router.put("/{item_id}", response_model=CatalogItemOut)
def update_catalog_item(
    item_id: uuid.UUID,
    payload: CatalogItemIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    item = _get_owned(db, tenant_id, item_id)
    for field, value in payload.model_dump().items():
        setattr(item, field, value)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _out(item)


@router.delete("/{item_id}")
def delete_catalog_item(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    item = _get_owned(db, tenant_id, item_id)
    db.delete(item)
    db.commit()
    return {"ok": True}
