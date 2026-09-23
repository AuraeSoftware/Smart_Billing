from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth, subscription, invoices, quotations, receipts, admin, account, users, analytics,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(subscription.router, prefix="/subscription", tags=["subscription"])
api_router.include_router(invoices.router, prefix="/invoices", tags=["invoices"])
api_router.include_router(quotations.router, prefix="/quotations", tags=["quotations"])
api_router.include_router(receipts.router, prefix="/receipts", tags=["receipts"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin (supreme admin only)"])
api_router.include_router(account.router, prefix="/account", tags=["account"])
api_router.include_router(users.router, prefix="/tenant-users", tags=["tenant users"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
