"""
User model for authentication
"""

from sqlalchemy import Column, String, DateTime, Boolean, JSON, Integer, ForeignKey, LargeBinary
from sqlalchemy.orm import relationship # For linking User and UserPasskey
from sqlalchemy.sql import func
import uuid

from app.db.base import Base


class User(Base):
    """User model"""
    
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)  # Nullable for OAuth/Passkey users
    name = Column(String, nullable=True)
    avatar = Column(String, nullable=True)
    provider = Column(String, default="email")  # email, google, github, passkey
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    preferences = Column(JSON, default=dict)
    
    # Security fields
    failed_login_attempts = Column(Integer, default=0)
    last_failed_login = Column(DateTime(timezone=True), nullable=True)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    verification_token = Column(String, nullable=True, index=True)
    reset_password_token = Column(String, nullable=True, index=True)
    reset_password_token_expires = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)

    passkeys = relationship("UserPasskey", back_populates="user", cascade="all, delete-orphan")


class UserPasskey(Base):
    __tablename__ = "user_passkeys"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    credential_id = Column(LargeBinary, unique=True, nullable=False, index=True) # Store as bytes
    public_key = Column(LargeBinary, nullable=False) # Store as bytes
    sign_count = Column(Integer, nullable=False, default=0)
    transports = Column(JSON, nullable=True) # List of strings: e.g., ["internal", "usb", "nfc", "ble"]
    
    # User-friendly fields (optional)
    device_name = Column(String, nullable=True) # e.g., "YubiKey Bio", "Pixel 7 Pro Fingerprint"
    # registered_at = Column(DateTime(timezone=True), server_default=func.now()) # Already have created_at from Base
    # last_used_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="passkeys")

    # Timestamps from Base model (created_at, updated_at)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True) 