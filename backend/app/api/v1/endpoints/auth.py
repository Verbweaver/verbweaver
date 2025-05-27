"""
Authentication endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
# from sqlalchemy.orm import Session # Comment out synchronous Session
from sqlalchemy.ext.asyncio import AsyncSession # Import AsyncSession
from sqlalchemy import select # Import select
from datetime import datetime, timedelta
from typing import Optional

from app.db.session import get_db
from app.models.user import User
from app.core.security import (
    verify_password, 
    get_password_hash, 
    create_access_token,
    create_refresh_token,
    get_current_user,
    decode_token,
    validate_password,
    generate_verification_token,
    generate_reset_token
)
from app.schemas.auth import (
    UserCreate,
    UserResponse,
    Token,
    PasswordReset,
    PasswordResetRequest
)
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Account lockout settings
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 30


@router.post("/register", response_model=UserResponse)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user."""
    # Check if user exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Validate password
    is_valid, error_msg = validate_password(user_data.password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # Create new user
    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        name=user_data.name,
        provider="email",
        verification_token=generate_verification_token(),
        password_changed_at=datetime.utcnow()
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # TODO: Send verification email
    logger.info(f"New user registered: {user.email}")
    
    return user


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
    request: Request = None
):
    """Login and receive access token."""
    # Find user
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()
    
    # Check if user exists and is not locked out
    if user:
        # Check for account lockout
        if user.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
            if user.last_failed_login:
                lockout_expires = user.last_failed_login + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
                if datetime.utcnow() < lockout_expires:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Account locked due to too many failed attempts. Try again after {LOCKOUT_DURATION_MINUTES} minutes."
                    )
                else:
                    # Reset failed attempts after lockout period
                    user.failed_login_attempts = 0
    
    # Verify credentials
    if not user or not verify_password(form_data.password, user.hashed_password):
        # Update failed login attempts
        if user:
            user.failed_login_attempts += 1
            user.last_failed_login = datetime.utcnow()
            await db.commit()
        
        # Log failed attempt
        client_ip = request.client.host if request else "unknown"
        logger.warning(f"Failed login attempt for {form_data.username} from {client_ip}")
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    
    # Reset failed attempts on successful login
    user.failed_login_attempts = 0
    user.last_login = datetime.utcnow()
    await db.commit()
    
    # Create tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(
    refresh_token_payload: str,
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token."""
    try:
        payload = decode_token(refresh_token_payload)
        user_id = payload.get("sub")
        token_type = payload.get("type")
        
        if token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid token type"
            )
        
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()

        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user"
            )
        
        access_token = create_access_token(user.id)
        new_refresh_token = create_refresh_token(user.id)
        
        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer"
        }
        
    except Exception as e:
        logger.error(f"Error refreshing token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current user information."""
    return current_user


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user)
):
    """Logout current user."""
    # TODO: Implement token blacklisting if needed
    # For now, just return success as the client should discard the token
    return {"message": "Successfully logged out"}


@router.post("/password-reset-request")
async def request_password_reset(
    request_body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db)
):
    """Request password reset token."""
    result = await db.execute(select(User).where(User.email == request_body.email))
    user = result.scalars().first()
    
    if user:
        reset_token = generate_reset_token()
        user.reset_password_token = reset_token
        user.reset_password_token_expires = datetime.utcnow() + timedelta(hours=1)
        await db.commit()
        
        logger.info(f"Password reset token generated for {user.email}: {reset_token}")
        return {"message": "Password reset email sent"}
    
    logger.info(f"Password reset request for non-existent email: {request_body.email}")
    return {"message": "If your email is registered, you will receive a password reset link."}


@router.post("/password-reset")
async def reset_password(
    reset_data: PasswordReset,
    db: AsyncSession = Depends(get_db)
):
    """Reset password using reset token."""
    result = await db.execute(
        select(User).where(
            User.reset_password_token == reset_data.token,
            User.reset_password_token_expires > datetime.utcnow()
        )
    )
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token"
        )

    is_valid, error_msg = validate_password(reset_data.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )

    user.hashed_password = get_password_hash(reset_data.new_password)
    user.reset_password_token = None
    user.reset_password_token_expires = None
    user.password_changed_at = datetime.utcnow()
    user.failed_login_attempts = 0
    await db.commit()
    
    logger.info(f"Password reset successfully for {user.email}")
    return {"message": "Password successfully reset"} 