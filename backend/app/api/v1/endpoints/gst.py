"""
GST Manager — a tenant's GST registration details, default tax rates, and a
reference list of HSN/SAC codes with their rates. Smart Garage 360's "GST
Manager" sidebar page, kept close to its original concept since it's
genuinely useful for an Indian billing SaaS. Scoped to the caller's own
tenant; settings are created lazily on first read.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_super_admin, current_tenant_id
from app.models.user import User
from app.models.gst import TenantGstSettings, TenantTaxCode

router = APIRouter()


# ---------------------------------------------------------------------------
# GST settings
# ---------------------------------------------------------------------------

class GstSettingsOut(BaseModel):
    gstin: str | None
    pan: str | None
    legal_name: str | None
    place_of_supply: str | None
    default_cgst_percent: float
    default_sgst_percent: float
    default_igst_percent: float


class GstSettingsIn(BaseModel):
    gstin: str | None = None
    pan: str | None = None
    legal_name: str | None = None
    place_of_supply: str | None = None
    default_cgst_percent: float = 0
    default_sgst_percent: float = 0
    default_igst_percent: float = 0


def _settings_out(s: TenantGstSettings) -> GstSettingsOut:
    return GstSettingsOut(
        gstin=s.gstin, pan=s.pan, legal_name=s.legal_name, place_of_supply=s.place_of_supply,
        default_cgst_percent=float(s.default_cgst_percent),
        default_sgst_percent=float(s.default_sgst_percent),
        default_igst_percent=float(s.default_igst_percent),
    )


@router.get("/settings", response_model=GstSettingsOut)
def get_gst_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    s = db.query(TenantGstSettings).filter(TenantGstSettings.tenant_id == uuid.UUID(tenant_id)).one_or_none()
    if s is None:
        return GstSettingsOut(
            gstin=None, pan=None, legal_name=None, place_of_supply=None,
            default_cgst_percent=0, default_sgst_percent=0, default_igst_percent=0,
        )
    return _settings_out(s)


@router.put("/settings", response_model=GstSettingsOut)
def update_gst_settings(
    payload: GstSettingsIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    s = db.query(TenantGstSettings).filter(TenantGstSettings.tenant_id == uuid.UUID(tenant_id)).one_or_none()
    if s is None:
        s = TenantGstSettings(id=uuid.uuid4(), tenant_id=uuid.UUID(tenant_id))
    for field, value in payload.model_dump().items():
        setattr(s, field, value)
    db.add(s)
    db.commit()
    db.refresh(s)
    return _settings_out(s)


# ---------------------------------------------------------------------------
# Tax codes (HSN/SAC lookup list)
# ---------------------------------------------------------------------------

class TaxCodeOut(BaseModel):
    id: str
    code: str
    description: str | None
    gst_rate_percent: float


def _code_out(c: TenantTaxCode) -> TaxCodeOut:
    return TaxCodeOut(id=str(c.id), code=c.code, description=c.description, gst_rate_percent=float(c.gst_rate_percent))


class TaxCodeIn(BaseModel):
    code: str
    description: str | None = None
    gst_rate_percent: float = 0


@router.get("/tax-codes", response_model=list[TaxCodeOut])
def list_tax_codes(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    codes = (
        db.query(TenantTaxCode)
        .filter(TenantTaxCode.tenant_id == uuid.UUID(tenant_id))
        .order_by(TenantTaxCode.code)
        .all()
    )
    return [_code_out(c) for c in codes]


@router.post("/tax-codes", response_model=TaxCodeOut, status_code=status.HTTP_201_CREATED)
def create_tax_code(
    payload: TaxCodeIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    code = TenantTaxCode(id=uuid.uuid4(), tenant_id=uuid.UUID(tenant_id), **payload.model_dump())
    db.add(code)
    db.commit()
    db.refresh(code)
    return _code_out(code)


@router.delete("/tax-codes/{code_id}")
def delete_tax_code(
    code_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    code = db.query(TenantTaxCode).filter(
        TenantTaxCode.id == code_id, TenantTaxCode.tenant_id == uuid.UUID(tenant_id)
    ).one_or_none()
    if code is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tax code not found.")
    db.delete(code)
    db.commit()
    return {"ok": True}
