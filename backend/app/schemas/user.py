from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class TenantUserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str


class TenantUserOut(BaseModel):
    id: UUID
    full_name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
