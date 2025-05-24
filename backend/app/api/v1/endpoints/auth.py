"""
Authentication endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
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
    db: Session = Depends(get_db)
):
    """Register a new user."""
    # Check if user exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
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
    db.commit()
    db.refresh(user)
    
    # TODO: Send verification email
    logger.info(f"New user registered: {user.email}")
    
    return user


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    request: Request = None
):
    """Login and receive access token."""
    # Find user
    user = db.query(User).filter(User.email == form_data.username).first()
    
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
            db.commit()
        
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
    db.commit()
    
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
    refresh_token: str,
    db: Session = Depends(get_db)
):
    """Refresh access token using refresh token."""
    try:
        payload = decode_token(refresh_token)
        user_id = payload.get("sub")
        token_type = payload.get("type")
        
        if token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid token type"
            )
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user"
            )
        
        # Create new tokens
        access_token = create_access_token(user.id)
        new_refresh_token = create_refresh_token(user.id)
        
        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer"
        }
        
    except Exception as e:
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
    request: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """Request password reset token."""
    user = db.query(User).filter(User.email == request.email).first()
    
    if user:
        # Generate reset token
        reset_token = generate_reset_token()
        user.reset_password_token = reset_token
        user.reset_password_token_expires = datetime.utcnow() + timedelta(hours=1)
        db.commit()
        
        # TODO: Send password reset email
        logger.info(f"Password reset requested for {user.email}")
    
    # Always return success to prevent email enumeration
    return {"message": "If the email exists, a password reset link has been sent"}


@router.post("/password-reset")
async def reset_password(
    reset_data: PasswordReset,
    db: Session = Depends(get_db)
):
    """Reset password using reset token."""
    user = db.query(User).filter(
        User.reset_password_token == reset_data.token
    ).first()
    
    if not user or not user.reset_password_token_expires:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    if datetime.utcnow() > user.reset_password_token_expires:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired"
        )
    
    # Validate new password
    is_valid, error_msg = validate_password(reset_data.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # Update password
    user.hashed_password = get_password_hash(reset_data.new_password)
    user.reset_password_token = None
    user.reset_password_token_expires = None
    user.password_changed_at = datetime.utcnow()
    user.failed_login_attempts = 0  # Reset failed attempts
    db.commit()
    
    return {"message": "Password successfully reset"} 