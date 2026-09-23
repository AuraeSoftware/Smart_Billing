"""
One-off script to create the first Supreme Admin (Aurae's platform account).
Run once after the database is migrated:

    python scripts/create_supreme_admin.py --email you@aurae.com --name "Aurae Admin" --password "change-me"

On Railway, run it from the backend service's shell (Railway dashboard -> service -> ... -> Run command),
or locally against DATABASE_URL pointed at the Railway Postgres instance.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == args.email).one_or_none()
        if existing:
            print(f"A user with email {args.email} already exists.")
            return
        user = User(
            tenant_id=None, email=args.email, hashed_password=hash_password(args.password),
            full_name=args.name, role=UserRole.SUPREME_ADMIN,
        )
        db.add(user)
        db.commit()
        print(f"Supreme Admin created: {args.email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
