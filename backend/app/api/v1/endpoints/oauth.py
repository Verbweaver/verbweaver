import httpx
from fastapi import APIRouter, Request, HTTPException, Depends, status
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
import secrets

from app.core.config import settings
from app.db.session import get_db
from app.schemas import UserResponse # Using existing UserResponse for consistency
# Removed OAuthCode, Token as they are not directly used as response models here
from app.crud import user as crud_user # Import the new crud module
from app.core import security
# UserModel is not directly needed here anymore as CRUD handles it

router = APIRouter()

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo"
GOOGLE_SCOPES = ["openid", "email", "profile"]

# GitHub OAuth settings
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_API_URL = "https://api.github.com/user"
GITHUB_USER_EMAILS_API_URL = "https://api.github.com/user/emails" # To get private emails
GITHUB_SCOPES = ["read:user", "user:email"]

@router.get("/google/login", summary="Redirect to Google OAuth login", tags=["OAuth"])
async def google_login(request: Request):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Google OAuth not configured")
    
    redirect_uri = str(request.url_for('google_callback'))
    if not settings.DEBUG and not redirect_uri.startswith("https://localhost") and not redirect_uri.startswith("https://127.0.0.1"):
        if redirect_uri.startswith("http://"):
            redirect_uri = redirect_uri.replace("http://", "https://", 1)

    # Generate and store state for CSRF protection
    state = secrets.token_urlsafe(32)
    request.session["oauth_state"] = state
    request.session["oauth_provider"] = "google" # Store provider for callback state validation

    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={settings.GOOGLE_CLIENT_ID}&"
        f"redirect_uri={redirect_uri}&"
        f"response_type=code&"
        f"scope={' '.join(GOOGLE_SCOPES)}&"
        f"access_type=offline&"
        f"prompt=consent&"
        f"state={state}"  # Add state to the auth URL
    )
    return RedirectResponse(auth_url, status_code=307)

@router.get("/google/callback", summary="Google OAuth callback", tags=["OAuth"])
async def google_callback(request: Request, code: str, state: str, db: AsyncSession = Depends(get_db)):
    print("Google OAuth callback initiated.")

    # Validate state for CSRF protection
    stored_state = request.session.pop("oauth_state", None)
    stored_provider = request.session.pop("oauth_provider", None)
    if not stored_state or stored_state != state or stored_provider != "google":
        print(f"ERROR: Invalid OAuth state. Stored: {stored_state}, Received: {state}, Provider: {stored_provider}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Invalid state parameter. Possible CSRF attack or broken OAuth flow."
        )
    print("OAuth state validated successfully.")

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        print("ERROR: Google OAuth not configured on server.")
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    redirect_uri = str(request.url_for('google_callback'))
    print(f"Using redirect_uri for token exchange: {redirect_uri}")
    if not settings.DEBUG and not redirect_uri.startswith("https://localhost") and not redirect_uri.startswith("https://127.0.0.1"):
         if redirect_uri.startswith("http://"):
            redirect_uri = redirect_uri.replace("http://", "https://", 1)
            print(f"Adjusted redirect_uri to HTTPS: {redirect_uri}")
            
    token_data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    print(f"Exchanging code for token with Google. Token request data (excluding secret): {{code: '{code}', client_id: '{settings.GOOGLE_CLIENT_ID}', redirect_uri: '{redirect_uri}', grant_type: 'authorization_code'}}")

    async with httpx.AsyncClient() as client:
        try:
            token_response = await client.post(GOOGLE_TOKEN_URL, data=token_data)
            print(f"Google token API response status: {token_response.status_code}")
            token_response.raise_for_status()
            token_json = token_response.json()
            google_access_token = token_json.get("access_token")
            print(f"Received Google access token: {'******' if google_access_token else 'None'}")

            if not google_access_token:
                print(f"ERROR: Could not get Google access token from provider. Response: {token_json}")
                raise HTTPException(status_code=400, detail="Could not get Google access token from provider")

            headers = {"Authorization": f"Bearer {google_access_token}"}
            print("Fetching user info from Google.")
            userinfo_response = await client.get(GOOGLE_USERINFO_URL, headers=headers)
            print(f"Google userinfo API response status: {userinfo_response.status_code}")
            userinfo_response.raise_for_status()
            userinfo_json = userinfo_response.json()
            print(f"Received userinfo from Google: {userinfo_json}")
            
            user_email = userinfo_json.get("email")
            user_name = userinfo_json.get("name")
            user_avatar = userinfo_json.get("picture")

            if not user_email:
                print(f"ERROR: Could not get user email from Google. Userinfo: {userinfo_json}")
                raise HTTPException(status_code=400, detail="Could not get user email from Google")
            print(f"User email from Google: {user_email}")

        except httpx.HTTPStatusError as e:
            error_detail = f"Error communicating with Google: {e.response.status_code} - {e.response.text[:500]}"
            print(f"HTTPStatusError during Google OAuth: {error_detail}")
            print(f"Request URL: {e.request.url}")
            # print(f"Request Headers: {e.request.headers}") # Be careful logging headers with secrets
            # print(f"Request Content: {e.request.content}")
            raise HTTPException(status_code=e.response.status_code, detail=error_detail)
        except Exception as e:
            print(f"Unexpected error during Google OAuth communication: {str(e)}")
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

        print(f"Checking database for user: {user_email}")
        db_user = await crud_user.get_user_by_email(db, email=user_email)
        
        if db_user:
            print(f"User {user_email} found in database. Current provider: {db_user.provider}")
            if db_user.provider != "google":
                print(f"Updating user {user_email} provider to google.")
                update_data = {"provider": "google"}
                if not db_user.name and user_name:
                    update_data["name"] = user_name
                    print(f"Updating name for {user_email}.")
                if not db_user.avatar and user_avatar:
                    update_data["avatar"] = user_avatar
                    print(f"Updating avatar for {user_email}.")
                if not db_user.is_verified:
                    update_data["is_verified"] = True
                    print(f"Marking {user_email} as verified.")
                db_user = await crud_user.update_user_internal(db, db_obj=db_user, obj_in=update_data)
            
            print(f"Updating last login for user: {user_email}")
            db_user = await crud_user.update_last_login(db, user_id=str(db_user.id))
            if not db_user:
                 print(f"ERROR: Failed to update user session after login for {user_email}.")
                 raise HTTPException(status_code=500, detail="Failed to update user session after login.")
            print(f"User {user_email} successfully processed for login.")
        else:
            print(f"User {user_email} not found in database. Creating new user.")
            new_user_data = {
                "email": user_email,
                "name": user_name,
                "avatar": user_avatar,
                "provider": "google",
                "is_active": True,
                "is_verified": True,
                "hashed_password": None,
            }
            db_user = await crud_user.create_user_direct(db, obj_in=new_user_data)
            print(f"New user {user_email} created with provider google.")

        print(f"Generating JWT tokens for user: {user_email} (ID: {db_user.id})")
        access_token = security.create_access_token(subject=str(db_user.id))
        refresh_token = security.create_refresh_token(subject=str(db_user.id))
        print("JWT tokens generated.")
        
        user_response_data = UserResponse.model_validate(db_user).model_dump()

        import urllib.parse
        import json
        user_json_str = json.dumps(user_response_data)
        encoded_user = urllib.parse.quote(user_json_str)
        
        redirect_url = f"{settings.FRONTEND_URL}/login#access_token={access_token}&refresh_token={refresh_token}&user={encoded_user}"
        print(f"Redirecting to frontend: {settings.FRONTEND_URL}/login#access_token=******&refresh_token=******&user=******")
        
        return RedirectResponse(redirect_url)

@router.get("/github/login", summary="Redirect to GitHub OAuth login", tags=["OAuth"])
async def github_login(request: Request):
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="GitHub OAuth not configured")

    redirect_uri = str(request.url_for('github_callback'))
    if not settings.DEBUG and not redirect_uri.startswith("https://localhost") and not redirect_uri.startswith("https://127.0.0.1"):
        if redirect_uri.startswith("http://"):
            redirect_uri = redirect_uri.replace("http://", "https://", 1)
    
    # Generate and store state for CSRF protection
    state = secrets.token_urlsafe(32)
    request.session["oauth_state"] = state
    request.session["oauth_provider"] = "github"

    auth_url = (
        f"https://github.com/login/oauth/authorize?"
        f"client_id={settings.GITHUB_CLIENT_ID}&"
        f"redirect_uri={redirect_uri}&"
        f"scope={'%20'.join(GITHUB_SCOPES)}&"
        f"state={state}&"  # Add state parameter
        f"allow_signup=true"
    )
    return RedirectResponse(auth_url, status_code=307)

@router.get("/github/callback", summary="GitHub OAuth callback", tags=["OAuth"])
async def github_callback(request: Request, code: str, state: str, db: AsyncSession = Depends(get_db)):
    # Validate state for CSRF protection
    stored_state = request.session.pop("oauth_state", None)
    stored_provider = request.session.pop("oauth_provider", None)
    if not stored_state or stored_state != state or stored_provider != "github":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Invalid state parameter. Possible CSRF attack or broken OAuth flow."
        )

    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")

    redirect_uri = str(request.url_for('github_callback'))
    if not settings.DEBUG and not redirect_uri.startswith("https://localhost") and not redirect_uri.startswith("https://127.0.0.1"):
        if redirect_uri.startswith("http://"):
            redirect_uri = redirect_uri.replace("http://", "https://", 1)

    token_data = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "client_secret": settings.GITHUB_CLIENT_SECRET,
        "code": code,
        "redirect_uri": redirect_uri,
    }

    async with httpx.AsyncClient() as client:
        try:
            token_response = await client.post(
                GITHUB_TOKEN_URL,
                data=token_data,
                headers={"Accept": "application/json"} # GitHub requires this header
            )
            token_response.raise_for_status()
            token_json = token_response.json()
            github_access_token = token_json.get("access_token")

            if not github_access_token:
                error_description = token_json.get("error_description", "Could not get GitHub access token")
                raise HTTPException(status_code=400, detail=error_description)

            headers = {
                "Authorization": f"Bearer {github_access_token}",
                "Accept": "application/vnd.github.v3+json"
            }
            userinfo_response = await client.get(GITHUB_USER_API_URL, headers=headers)
            userinfo_response.raise_for_status()
            userinfo_json = userinfo_response.json()

            user_email = userinfo_json.get("email")
            # If primary email is not public, fetch from /user/emails
            if not user_email:
                emails_response = await client.get(GITHUB_USER_EMAILS_API_URL, headers=headers)
                emails_response.raise_for_status()
                emails_json = emails_response.json()
                primary_email_obj = next((e for e in emails_json if e.get("primary") and e.get("verified")), None)
                if primary_email_obj:
                    user_email = primary_email_obj.get("email")
            
            if not user_email:
                raise HTTPException(status_code=400, detail="Could not get verified primary email from GitHub")

            user_name = userinfo_json.get("name") or userinfo_json.get("login") # Use login as fallback for name
            user_avatar = userinfo_json.get("avatar_url")
            # github_provider_user_id = userinfo_json.get("id") # GitHub's unique user ID

        except httpx.HTTPStatusError as e:
            error_detail = f"Error communicating with GitHub: {e.response.status_code} - {e.response.text[:500]}"
            print(error_detail)
            raise HTTPException(status_code=e.response.status_code, detail=error_detail)
        except Exception as e:
            print(f"Unexpected error during GitHub OAuth callback: {str(e)}")
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

        db_user = await crud_user.get_user_by_email(db, email=user_email)

        if db_user:
            if db_user.provider != "github":
                update_data = {"provider": "github"}
                if not db_user.name and user_name:
                    update_data["name"] = user_name
                if not db_user.avatar and user_avatar:
                    update_data["avatar"] = user_avatar
                if not db_user.is_verified:
                    update_data["is_verified"] = True # Email is verified by GitHub
                db_user = await crud_user.update_user_internal(db, db_obj=db_user, obj_in=update_data)
            
            db_user = await crud_user.update_last_login(db, user_id=str(db_user.id))
            if not db_user:
                 raise HTTPException(status_code=500, detail="Failed to update user session after GitHub login.")
        else:
            new_user_data = {
                "email": user_email,
                "name": user_name,
                "avatar": user_avatar,
                "provider": "github",
                "is_active": True,
                "is_verified": True,
                "hashed_password": None,
            }
            db_user = await crud_user.create_user_direct(db, obj_in=new_user_data)

        access_token = security.create_access_token(subject=str(db_user.id))
        refresh_token = security.create_refresh_token(subject=str(db_user.id))
        user_response_data = UserResponse.model_validate(db_user).model_dump()

        # Redirect to frontend with tokens and user data in URL hash
        import urllib.parse
        import json
        user_json_str = json.dumps(user_response_data)
        encoded_user = urllib.parse.quote(user_json_str)
        
        redirect_url = f"{settings.FRONTEND_URL}/login#access_token={access_token}&refresh_token={refresh_token}&user={encoded_user}"
        
        return RedirectResponse(redirect_url)

# TODO: Add Passkey endpoints 