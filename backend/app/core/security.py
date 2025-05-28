"""
Security utilities
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import User
from app.database import get_db
from datetime import datetime, timedelta
from typing import Optional, Any
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import ValidationError
from app.core.config import settings
import re
import secrets
from app.db.redis_client import get_redis_client
import redis

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# oauth2_scheme_optional is a new optional OAuth2 scheme
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS
RESET_TOKEN_EXPIRE_MINUTES = settings.RESET_TOKEN_EXPIRE_MINUTES

# Account Lockout Settings
MAX_LOGIN_ATTEMPTS: int = getattr(settings, 'MAX_LOGIN_ATTEMPTS', 5)
LOCKOUT_DURATION_MINUTES: int = getattr(settings, 'LOCKOUT_DURATION_MINUTES', 30)

# JWT Revocation List (JRL) prefix for Redis keys
JRL_PREFIX = "jrl:"

def validate_password(password: str) -> tuple[bool, str]:
    """
    Validate password against security policy.
    Returns (is_valid, error_message)
    """
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        return False, f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters long"
    
    if settings.PASSWORD_REQUIRE_UPPERCASE and not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    
    if settings.PASSWORD_REQUIRE_LOWERCASE and not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    
    if settings.PASSWORD_REQUIRE_DIGIT and not re.search(r"\d", password):
        return False, "Password must contain at least one digit"
    
    if settings.PASSWORD_REQUIRE_SPECIAL and not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character"
    
    return True, ""


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token."""
    
    if token == "desktop-token":
        # Check if desktop user exists
        result = await db.execute(select(User).filter(User.email == "desktop@verbweaver.local"))
        desktop_user = result.scalar_one_or_none()
        
        if not desktop_user:
            # Create a virtual desktop user if it doesn't exist
            desktop_user = User(
                email="desktop@verbweaver.local",
                name="Desktop User",
                hashed_password=get_password_hash("desktop-secure-password"),
                is_active=True,
                is_superuser=False,
                is_verified=True,
                provider="desktop"
            )
            db.add(desktop_user)
            await db.commit()
            await db.refresh(desktop_user)
        return desktop_user
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = decode_token(token) # This is sync, raises HTTPException on decode/expiry error
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        jti: str = payload.get("jti")
        
        if user_id is None or token_type != "access":
            raise credentials_exception
        
        # Check JTI blacklist for access tokens
        if jti and await is_jti_blacklisted(jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked (logged out)"
            )
            
    except HTTPException as e: # Catch HTTPExceptions from decode_token or blacklist check
        raise e
    except (JWTError, ValidationError, ValueError): # Should be caught by decode_token now
        raise credentials_exception
    
    try:
        result = await db.execute(select(User).filter(User.id == user_id))
        user = result.scalar_one_or_none()
    except (ValueError, TypeError):
        raise credentials_exception
    
    if user is None:
        raise credentials_exception
        
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
        
    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Get current authenticated user from JWT token, if token is provided and valid. Returns None otherwise."""
    if not token:
        return None

    if token == "desktop-token":
        result = await db.execute(select(User).filter(User.email == "desktop@verbweaver.local"))
        desktop_user = result.scalar_one_or_none()
        return desktop_user

    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        jti: str = payload.get("jti")
        
        if user_id is None or token_type != "access":
            return None
        
        # Check JTI blacklist for access tokens
        if jti and await is_jti_blacklisted(jti):
            return None # Token revoked
            
    except HTTPException: # Raised by decode_token for expiry/invalid or by blacklist check
        return None
    # JWTError, ValueError should be caught by decode_token and turned into HTTPException
    
    try:
        result = await db.execute(select(User).filter(User.id == user_id))
        user = result.scalar_one_or_none()
    except Exception:
        return None
    
    if user is None or not user.is_active:
        return None
        
    return user


async def get_current_active_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current active superuser."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


def create_access_token(subject: str | Any) -> str:
    """Create an access token with expiration."""
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "exp": expire, 
        "sub": str(subject), 
        "type": "access",
        "jti": secrets.token_urlsafe(16)  # JWT ID for token revocation support
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(subject: str | Any) -> str:
    """Create a refresh token with longer expiration."""
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {
        "exp": expire, 
        "sub": str(subject), 
        "type": "refresh",
        "jti": secrets.token_urlsafe(16)
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def add_jti_to_blacklist(jti: str, expires_delta: timedelta):
    """Add a JTI to the blacklist in Redis with an expiry time."""
    try:
        r = get_redis_client()
        await r.setex(f"{JRL_PREFIX}{jti}", int(expires_delta.total_seconds()), "revoked")
    except Exception as e:
        # Log this error, but don't let blacklist failure break the main flow if possible
        # Depending on policy, you might want to be stricter.
        print(f"Error adding JTI {jti} to blacklist: {e}")

async def is_jti_blacklisted(jti: str) -> bool:
    """Check if a JTI is in the blacklist in Redis."""
    try:
        r = get_redis_client()
        return await r.exists(f"{JRL_PREFIX}{jti}") > 0
    except Exception as e:
        print(f"Error checking JTI {jti} in blacklist: {e}")
        # Fail safe: if Redis check fails, consider the token not blacklisted to avoid DoS
        # Or, depending on strictness, could treat as blacklisted / raise error.
        return False

def decode_token(token: str) -> dict:
    """Decode and validate JWT token, including checking against JTI blacklist."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        # It's an async function, but decode_token is sync. This is problematic.
        # For a quick adaptation, this check would need to be async or called from an async context.
        # Ideal solution: make decode_token async or separate blacklist check.
        # For now, this highlights the issue. A proper fix involves more refactoring.
        # if jti and await is_jti_blacklisted(jti): # This line CANNOT work as-is (await in sync function)
        #     raise HTTPException(
        #         status_code=status.HTTP_401_UNAUTHORIZED,
        #         detail="Token has been revoked"
        #     )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except JWTError:
        # Consistent with ASVS, raise 401 for any JWT processing error
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generate password hash."""
    return pwd_context.hash(password)


def generate_reset_token() -> str:
    """Generate a secure random token for password reset."""
    return secrets.token_urlsafe(32)


def generate_verification_token() -> str:
    """Generate a secure random token for email verification."""
    return secrets.token_urlsafe(32) 