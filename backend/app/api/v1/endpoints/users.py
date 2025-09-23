"""
Users endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Any, Dict

from app.database import get_db
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me/preferences")
async def get_my_preferences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return the current user's preferences JSON."""
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"preferences": user.preferences or {}}


@router.put("/me/preferences")
async def update_my_preferences(
    prefs: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Replace or merge the current user's preferences JSON with the provided object."""
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    try:
        # Shallow merge
        current = user.preferences or {}
        current.update(prefs or {})
        user.preferences = current
        await db.commit()
        await db.refresh(user)
        return {"preferences": user.preferences or {}}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update preferences: {e}")
