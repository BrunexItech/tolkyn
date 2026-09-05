from sqlalchemy import Column, DateTime, String

from app.db.base import BaseModel


class SuperAdmin(BaseModel):
    """Platform operator account. Deliberately NOT a `User` row — super admins
    sit outside every workspace and every tenant-scoped query in the app, so
    keeping them in their own table makes that isolation impossible to leak
    by accident. Seeded from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env
    on startup (see db.base.seed_super_admin)."""

    __tablename__ = "super_admins"

    name = Column(String(255), nullable=False, default="Super Admin")
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_login_ip = Column(String(50), nullable=True)

    def __repr__(self) -> str:
        return f"<SuperAdmin {self.email}>"
