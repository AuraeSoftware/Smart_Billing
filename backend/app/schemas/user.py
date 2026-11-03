from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class TenantUserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TenantUserOut(BaseModel):
    id: UUID
    full_name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
