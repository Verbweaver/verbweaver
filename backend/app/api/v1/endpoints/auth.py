"""
Authentication endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
# from sqlalchemy.orm import Session # Comment out synchronous Session
from sqlalchemy.ext.asyncio import AsyncSession # Import AsyncSession
from sqlalchemy import select # Import select
from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets # For generating secure tokens

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
    generate_reset_token,
    ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS,
    MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES,
    RESET_TOKEN_EXPIRE_MINUTES, # Define this constant
    add_jti_to_blacklist, 
    is_jti_blacklisted,
    JRL_PREFIX # If needed directly, though unlikely for auth.py
)
from app.schemas.auth import (
    UserCreate,
    UserResponse,
    Token,
    PasswordResetRequest,
    ResetPasswordPayload,
    UserUpdate
)
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# REMOVE Local Account lockout settings, as they are now imported from app.core.security
# MAX_LOGIN_ATTEMPTS = 5 
# LOCKOUT_DURATION_MINUTES = 30

# REMOVE Local _RESET_TOKEN_EXPIRE_MINUTES, use settings.RESET_TOKEN_EXPIRE_MINUTES from security import
# _RESET_TOKEN_EXPIRE_MINUTES = 30 

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
        password_changed_at=datetime.utcnow(),
        is_active=True, # Or False if email verification is required
        is_verified=False # Or True if no email verification
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
    logger.info(f"Login attempt for: {form_data.username}")
    # Find user
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()
    
    if user:
        logger.info(f"User found: {user.email}")
        # Check for account lockout
        if user.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
            if user.last_failed_login:
                lockout_expires = user.last_failed_login + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
                if datetime.utcnow() < lockout_expires:
                    logger.warning(f"Account locked for user: {user.email}")
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Account locked due to too many failed attempts. Try again after {LOCKOUT_DURATION_MINUTES} minutes."
                    )
                else:
                    # Reset failed attempts after lockout period
                    logger.info(f"Lockout expired for user: {user.email}, resetting attempts.")
                    user.failed_login_attempts = 0
    else:
        logger.warning(f"User not found: {form_data.username}")

    # Verify credentials
    password_verified = False
    if user:
        logger.info(f"Attempting to verify password for user: {user.email}")
        try:
            password_verified = verify_password(form_data.password, user.hashed_password)
            logger.info(f"Password verification result for {user.email}: {password_verified}")
        except Exception as e:
            logger.error(f"Error during password verification for {user.email}: {e}", exc_info=True)
            # Re-raise or handle as an internal server error, as this is unexpected
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error during password verification process."
            )

    if not user or not password_verified:
        # Update failed login attempts
        if user: # Only if user was found but password verification failed
            user.failed_login_attempts += 1
            user.last_failed_login = datetime.utcnow()
            await db.commit()
            logger.warning(f"Failed login attempt for {user.email} due to incorrect password. Attempt count: {user.failed_login_attempts}")
        else: # User was not found
            logger.warning(f"Failed login attempt for non-existent user: {form_data.username}")
        
        # Log failed attempt (client_ip part already exists)
        client_ip = request.client.host if request else "unknown"
        # Logger warning now more specific based on user existence or password mismatch
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.is_active:
        logger.warning(f"Login attempt for inactive user: {user.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    
    logger.info(f"Successful login for user: {user.email}. Resetting failed attempts.")
    # Reset failed attempts on successful login
    user.failed_login_attempts = 0
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    # Refresh the user object to ensure all attributes (like DB-generated updated_at) are loaded
    await db.refresh(user)
    
    # Create tokens
    logger.info(f"Creating tokens for user: {user.email}")
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)
    logger.info(f"Tokens created successfully for user: {user.email}")
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": UserResponse.from_orm(user) # Include user details
    }


@router.post("/refresh", response_model=Token)
async def refresh_token_endpoint(
    request: Request, # Changed variable name from refresh_token_payload to request
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token. Implements rolling refresh tokens."""
    body = await request.json()
    refresh_token_payload_str = body.get("refresh_token")

    if not refresh_token_payload_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refresh token not provided in body"
        )

    try:
        payload = decode_token(refresh_token_payload_str) # decode_token handles expiry/format
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        jti: str = payload.get("jti")
        exp: int = payload.get("exp") # Expiration timestamp

        if not all([user_id, token_type == "refresh", jti, exp]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token structure")

        # Check if this refresh token's JTI is already blacklisted (meaning it was already used or revoked)
        if await is_jti_blacklisted(jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked or already used."
            )
        
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()

        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user for refresh token")
        
        # Blacklist the used refresh token JTI. 
        # Its expiry in Redis should be its original expiry to prevent premature removal if clock skew exists,
        # or simply the original token's lifetime.
        original_exp_datetime = datetime.utcfromtimestamp(exp)
        # If token is somehow not expired yet (decode_token should catch this), calculate remaining time.
        # Otherwise, use a short sensible duration for the blacklist entry if already past original exp.
        remaining_lifetime = original_exp_datetime - datetime.utcnow()
        if remaining_lifetime.total_seconds() <= 0:
            # If used after expiry (should not happen if decode_token is correct), blacklist for a short default period.
            remaining_lifetime = timedelta(minutes=5) 
        
        await add_jti_to_blacklist(jti, remaining_lifetime)

        # Issue new tokens
        new_access_token = create_access_token(subject=user.id)
        new_refresh_token = create_refresh_token(subject=user.id) # New JTI will be in this one
        
        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "user": UserResponse.model_validate(user) # Return user object for frontend convenience
        }
        
    except HTTPException as e: # Re-raise HTTPExceptions from decode_token or blacklist check
        raise e
    except Exception as e:
        logger.error(f"Error refreshing token: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid refresh token processing: {str(e)}",
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current user information."""
    return current_user


@router.post("/logout")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user) # Ensures user is authenticated
):
    """Logout current user by blacklisting their current access token."""
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    if not token:
        # This should ideally not happen if get_current_user worked, but as a safeguard.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No token found to logout.")

    try:
        payload = decode_token(token) # decode_token itself doesn't check blacklist for this purpose
        jti = payload.get("jti")
        exp = payload.get("exp")

        if not jti or not exp:
            logger.warning(f"Attempted logout with token missing JTI or EXP for user {current_user.email}")
            # Don't fail outright, but log it. The token is unusable anyway if get_current_user passed.
            return {"message": "Logout process initiated. Token structure issue noted."}

        # Add JTI to blacklist with its remaining lifetime
        expires_delta = datetime.utcfromtimestamp(exp) - datetime.utcnow()
        if expires_delta.total_seconds() > 0:
            await add_jti_to_blacklist(jti, expires_delta)
            logger.info(f"Access token JTI {jti} for user {current_user.email} blacklisted for logout.")
        else:
            logger.info(f"Access token JTI {jti} for user {current_user.email} already expired. No blacklist action needed.")

        return {"message": "Successfully logged out"}
    
    except HTTPException as e: # From decode_token (e.g. malformed, but not expired if get_current_user passed it)
        logger.error(f"Error during logout token processing for user {current_user.email}: {e.detail}")
        # If token is invalid, effectively logged out. Maybe return success with warning.
        return {"message": "Logout processed with token validation issue."}
    except Exception as e:
        logger.error(f"Unexpected error during logout for user {current_user.email}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error during logout.")


@router.post("/password-reset-request")
async def request_password_reset(
    request_body: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Request password reset token."""
    result = await db.execute(select(User).where(User.email == request_body.email))
    user = result.scalars().first()
    
    if not user:
        # IMPORTANT: Do not reveal if the user exists or not to prevent enumeration attacks
        # Simulate success to the client
        return {"message": "If an account with that email exists, a password reset link has been sent."}

    # Generate a secure token
    token = secrets.token_urlsafe(32)
    user.reset_password_token = token # Storing plain token temporarily; consider hashing for DB if token is not single-use by design
    user.reset_password_token_expires = datetime.now(timezone.utc) + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES) # Use settings
    await db.commit()

    # TODO: Send actual email with the reset link
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}" # Adjust FRONTEND_URL in config
    print(f"Password Reset Link (for user {user.email}): {reset_link}") # For debugging
    # if background_tasks: # Example of how email sending could be offloaded
    #     background_tasks.add_task(send_password_reset_email, user.email, reset_link)
    # else:
    #     # Fallback or direct call if background_tasks is not available/configured
    #     send_password_reset_email(user.email, reset_link)

    return {"message": "If an account with that email exists, a password reset link has been sent."}


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordPayload, # Schema: { token: str, new_password: str }
    db: AsyncSession = Depends(get_db)
):
    """Reset password using reset token."""
    result = await db.execute(
        select(User).where(User.reset_password_token == payload.token)
    )
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token.")

    current_time_utc = datetime.now(timezone.utc)
    token_expires_at = user.reset_password_token_expires

    if token_expires_at and token_expires_at.tzinfo is None:
        # If loaded as a naive datetime, assume it should be UTC based on how it's set
        token_expires_at = token_expires_at.replace(tzinfo=timezone.utc)

    if not token_expires_at or token_expires_at < current_time_utc:
        # Clear expired token fields
        user.reset_password_token = None
        user.reset_password_token_expires = None
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token.")

    # Validate new password strength
    is_valid, error_msg = validate_password(payload.new_password)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    # Update password
    user.hashed_password = get_password_hash(payload.new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    # Invalidate the token
    user.reset_password_token = None
    user.reset_password_token_expires = None
    # Reset failed login attempts as password has changed
    user.failed_login_attempts = 0
    user.last_failed_login = None
    
    await db.commit()

    # TODO: Optionally, invalidate other active sessions for this user.
    # TODO: Optionally, send a confirmation email that password was changed.

    return {"message": "Password has been reset successfully."} 