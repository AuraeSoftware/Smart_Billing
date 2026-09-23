from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    device_token: str  # generated/stored client-side, see frontend lib/device.ts
    device_label: str = "Unknown device"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    tenant_id: str | None = None
    full_name: str
