from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from typing import Optional, Dict, Any
from datetime import datetime, timezone

from app.models.user import User as UserModel
from app.schemas.oauth import OAuthProviderUser as OAuthProviderUserSchema # For type hinting
from app.schemas.user import UserCreate # For creating email user
from app.core.security import get_password_hash # For email user creation

async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[UserModel]:
    result = await db.execute(select(UserModel).filter(UserModel.id == user_id))
    return result.scalar_one_or_none()

async def get_user_by_email(db: AsyncSession, email: str) -> Optional[UserModel]:
    result = await db.execute(select(UserModel).filter(UserModel.email == email))
    return result.scalar_one_or_none()

async def create_user_direct(db: AsyncSession, obj_in: Dict[str, Any]) -> UserModel:
    """
    Creates a user directly from a dictionary. 
    Ensure obj_in contains all necessary fields and hashed_password if applicable.
    """
    # Ensure essential fields like email are present if not using a strict schema here
    if 'email' not in obj_in:
        raise ValueError("Email is required to create a user.")

    db_user = UserModel(**obj_in)
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

async def create_oauth_user(db: AsyncSession, provider_user_data: OAuthProviderUserSchema) -> UserModel:
    db_user = UserModel(
        email=provider_user_data.email,
        name=provider_user_data.name,
        avatar=provider_user_data.avatar_url,
        provider=provider_user_data.provider,
        is_active=True,
        is_verified=True,  # Email is verified by the OAuth provider
        hashed_password=None, # No password for OAuth users
        password_changed_at=datetime.now(timezone.utc) # Set this for consistency
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user
    
async def create_email_user(db: AsyncSession, user_in: UserCreate) -> UserModel:
    hashed_password = get_password_hash(user_in.password)
    db_user = UserModel(
        email=user_in.email,
        name=user_in.name, # Assuming UserCreate has name, adjust if not
        hashed_password=hashed_password,
        provider="email",
        is_active=True, # Or False, if email verification is required
        is_verified=False, # Or True, if no email verification step
        password_changed_at=datetime.now(timezone.utc)
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

async def update_user_internal(db: AsyncSession, db_obj: UserModel, obj_in: Dict[str, Any]) -> UserModel:
    """
    General purpose update for a user model.
    `obj_in` is a dictionary of fields to update.
    """
    for field, value in obj_in.items():
        if hasattr(db_obj, field):
            setattr(db_obj, field, value)
    
    # Ensure updated_at is set if not handled automatically by DB
    if 'updated_at' not in obj_in and hasattr(db_obj, 'updated_at'):
         setattr(db_obj, 'updated_at', datetime.now(timezone.utc))

    db.add(db_obj) # Add to session if it was detached or to mark as dirty
    await db.commit()
    await db.refresh(db_obj)
    return db_obj

async def update_last_login(db: AsyncSession, user_id: str) -> Optional[UserModel]:
    user = await get_user_by_id(db, user_id=user_id)
    if user:
        user.last_login = datetime.now(timezone.utc)
        if hasattr(user, 'failed_login_attempts'): # Reset failed attempts on successful login
            user.failed_login_attempts = 0
        await db.commit()
        await db.refresh(user)
    return user 