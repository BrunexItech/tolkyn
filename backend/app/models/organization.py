import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class OrganizationStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class SubsidiaryStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING = "pending"


class Organization(BaseModel):
    """A tenant group the super admin creates. Holds one or more Subsidiary
    subdomains. Self-service signup never creates one of these — only the
    super admin portal does."""

    __tablename__ = "organizations"

    name = Column(String(255), nullable=False)
    slug = Column(String(80), unique=True, index=True, nullable=False)
    status = Column(Enum(OrganizationStatus), default=OrganizationStatus.ACTIVE, nullable=False)
    notes = Column(Text, nullable=True)
    created_by = Column(String(36), ForeignKey("super_admins.id"), nullable=True)

    # The real, approved tenant account this organization is built around.
    # A Subsidiary/subdomain can only be added once this is set to an
    # approved, active user — see SuperAdminService.create_subsidiary.
    owner_user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    subsidiaries = relationship(
        "Subsidiary", back_populates="organization", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Organization {self.slug}>"


class Subsidiary(BaseModel):
    """One subdomain under an Organization (e.g. 'acme' -> acme.tolkyn.co.ke),
    optionally pointed at the workspace/user that operates it. Creating one is
    a super-admin-only action."""

    __tablename__ = "subsidiaries"

    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    subdomain = Column(String(63), unique=True, index=True, nullable=False)
    status = Column(Enum(SubsidiaryStatus), default=SubsidiaryStatus.ACTIVE, nullable=False)
    workspace_id = Column(String(36), nullable=True, index=True)  # the tenant this subdomain routes to
    notes = Column(Text, nullable=True)
    created_by = Column(String(36), ForeignKey("super_admins.id"), nullable=True)

    organization = relationship("Organization", back_populates="subsidiaries")

    def __repr__(self) -> str:
        return f"<Subsidiary {self.subdomain}>"
