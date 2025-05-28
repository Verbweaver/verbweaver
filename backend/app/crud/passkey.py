from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import base64 # For handling credential_id encoding/decoding if needed for lookup

from app.models.user import UserPasskey as UserPasskeyModel, User as UserModel
from app.schemas.passkey import PasskeyDevice # For type hinting, if needed for response assembly

# Helper to convert bytes to base64url string (common for WebAuthn IDs)
def bytes_to_base64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode('utf-8')

# Helper to convert base64url string to bytes
def base64url_to_bytes(s: str) -> bytes:
    padding = '=' * (4 - (len(s) % 4))
    return base64.urlsafe_b64decode(s + padding)

async def create_user_passkey(
    db: AsyncSession, 
    user_id: str, 
    credential_id: bytes, 
    public_key: bytes, 
    sign_count: int,
    transports: Optional[List[str]] = None,
    device_name: Optional[str] = None
) -> UserPasskeyModel:
    new_passkey = UserPasskeyModel(
        user_id=user_id,
        credential_id=credential_id,
        public_key=public_key,
        sign_count=sign_count,
        transports=transports,
        device_name=device_name,
        last_used_at=datetime.now(timezone.utc) # Mark as used upon creation
    )
    db.add(new_passkey)
    await db.commit()
    await db.refresh(new_passkey)
    return new_passkey

async def get_passkeys_for_user(db: AsyncSession, user_id: str) -> List[UserPasskeyModel]:
    result = await db.execute(
        select(UserPasskeyModel)
        .filter(UserPasskeyModel.user_id == user_id)
        .order_by(UserPasskeyModel.created_at.desc())
    )
    return result.scalars().all()

async def get_passkey_by_credential_id(db: AsyncSession, credential_id: bytes) -> Optional[UserPasskeyModel]:
    result = await db.execute(
        select(UserPasskeyModel).filter(UserPasskeyModel.credential_id == credential_id)
    )
    return result.scalar_one_or_none()

async def update_passkey_sign_count(db: AsyncSession, passkey_id: str, new_sign_count: int) -> Optional[UserPasskeyModel]:
    result = await db.execute(
        select(UserPasskeyModel).filter(UserPasskeyModel.id == passkey_id)
    )
    passkey = result.scalar_one_or_none()
    if passkey:
        passkey.sign_count = new_sign_count
        passkey.last_used_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(passkey)
    return passkey

async def update_passkey_last_used(db: AsyncSession, passkey_id: str) -> Optional[UserPasskeyModel]:
    result = await db.execute(
        select(UserPasskeyModel).filter(UserPasskeyModel.id == passkey_id)
    )
    passkey = result.scalar_one_or_none()
    if passkey:
        passkey.last_used_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(passkey)
    return passkey

async def delete_passkey(db: AsyncSession, passkey_id: str, user_id: str) -> bool:
    """Deletes a passkey by its ID, ensuring it belongs to the specified user."""
    result = await db.execute(
        delete(UserPasskeyModel)
        .where(UserPasskeyModel.id == passkey_id)
        .where(UserPasskeyModel.user_id == user_id)
    )
    await db.commit()
    return result.rowcount > 0

async def get_user_by_passkey_credential_id(db: AsyncSession, credential_id: bytes) -> Optional[UserModel]:
    """Finds a user based on one of their passkey credential IDs."""
    result = await db.execute(
        select(UserModel)
        .join(UserPasskeyModel, UserModel.id == UserPasskeyModel.user_id)
        .filter(UserPasskeyModel.credential_id == credential_id)
    )
    return result.scalar_one_or_none() 