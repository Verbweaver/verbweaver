import secrets
import json # For storing dicts in Redis
from fastapi import APIRouter, Request, HTTPException, Depends, Body # Removed Body as challenge comes from clientDataJSON
from sqlalchemy.ext.asyncio import AsyncSession
import webauthn as wna # py_webauthn library
from webauthn.helpers.structs import (
    RegistrationCredential, AuthenticatorSelectionCriteria, ResidentKeyRequirement, UserVerificationRequirement,
    PublicKeyCredentialCreationOptions, PublicKeyCredentialRequestOptions, AuthenticationCredential,
    AttestationFormat
)
from webauthn.helpers.exceptions import WebAuthnException
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url # Use library's helpers

from app.core.config import settings
from app.db.session import get_db
from app.db.redis_client import (
    store_webauthn_challenge, 
    retrieve_webauthn_challenge_data,
    clear_webauthn_challenge # For cleanup on error
)
from app.schemas import (
    PasskeyRegistrationOptionsRequest, PasskeyRegistrationOptionsResponse,
    PasskeyRegistrationVerificationRequest, PasskeyLoginOptionsRequest,
    PasskeyLoginOptionsResponse, PasskeyLoginVerificationRequest,
    UserResponse, Token
)
from app.crud import user as crud_user, passkey as crud_passkey
from app.core import security
from app.models.user import User as UserModel

router = APIRouter()

def get_rp_id() -> str:
    return settings.WEBAUTHN_RP_ID

def get_rp_name() -> str:
    return settings.WEBAUTHN_RP_NAME

def get_expected_origin() -> str:
    return settings.WEBAUTHN_EXPECTED_ORIGIN or settings.FRONTEND_URL

@router.post("/passkey/register-options", response_model=PasskeyRegistrationOptionsResponse, tags=["Passkey"])
async def passkey_register_options(
    request_data: PasskeyRegistrationOptionsRequest,
    db: AsyncSession = Depends(get_db)
):
    user = await crud_user.get_user_by_email(db, email=request_data.email)
    user_creation_flow = False
    if not user:
        user_creation_flow = True
        if not request_data.display_name:
             request_data.display_name = request_data.email.split('@')[0]
        
        user_in_create_dict = {
            "email": request_data.email,
            "name": request_data.display_name,
            "provider": "email", # Start as email, will update to passkey upon successful registration
            "is_active": True,
            "is_verified": False, 
            "hashed_password": None 
        }
        user = await crud_user.create_user_direct(db, obj_in=user_in_create_dict)
        print(f"New user {user.email} created for passkey registration flow.")

    user_handle_bytes = user.id.encode('utf-8')
    challenge_bytes = secrets.token_urlsafe(32).encode('utf-8')
    challenge_str = bytes_to_base64url(challenge_bytes) # py_webauthn returns challenge as bytes, convert for storage key

    existing_credentials_for_user = []
    user_passkeys = await crud_passkey.get_passkeys_for_user(db, user_id=user.id)
    for pk in user_passkeys:
        # py_webauthn expects credential ID as bytes for exclude_credentials
        existing_credentials_for_user.append(pk.credential_id) 

    try:
        options: PublicKeyCredentialCreationOptions = wna.generate_registration_options(
            rp_id=get_rp_id(),
            rp_name=get_rp_name(),
            user_id=user_handle_bytes,
            user_name=user.email, 
            user_display_name=request_data.display_name or user.name or user.email,
            challenge=challenge_bytes, # Use the bytes version for the library
            exclude_credentials=[{
                "type": "public-key", 
                "id": cred_id_bytes
            } for cred_id_bytes in existing_credentials_for_user],
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.PREFERRED,
                user_verification=UserVerificationRequirement.PREFERRED
            ),
            timeout=settings.WEBAUTHN_CHALLENGE_TIMEOUT_SECONDS * 1000,
            attestation=AttestationFormat.NONE # Default to 'none' for simplicity, can be configured
        )
    except WebAuthnException as e:
        print(f"WebAuthn library error during registration options: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating passkey registration options: {str(e)}")

    # Store challenge in Redis
    # Keyed by the base64url string version of the challenge
    user_info_for_challenge = {"user_id": user.id, "email": user.email, "user_creation_flow": user_creation_flow}
    await store_webauthn_challenge(challenge=challenge_str, user_info=user_info_for_challenge)
    
    # Convert options to dict for Pydantic model. DO NOT SEND CHALLENGE TO CLIENT.
    options_dict = options.to_dict()
    return PasskeyRegistrationOptionsResponse(options=options_dict)

@router.post("/passkey/register-verify", response_model=UserResponse, tags=["Passkey"])
async def passkey_register_verify(
    request_data: PasskeyRegistrationVerificationRequest,
    # original_challenge_from_client: str = Body(...), # REMOVED
    db: AsyncSession = Depends(get_db)
):
    try:
        # Extract challenge from clientDataJSON - this is base64url encoded by the browser/authenticator
        client_data = wna.helpers.decode_client_data_json(request_data.response['clientDataJSON'])
        client_challenge_b64url = client_data.challenge # This is the challenge string (base64url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid clientDataJSON: {str(e)}")

    # Retrieve challenge data from Redis using the challenge string from clientDataJSON
    challenge_user_info = await retrieve_webauthn_challenge_data(client_challenge_b64url)
    if not challenge_user_info:
        raise HTTPException(status_code=400, detail="Passkey registration challenge not found, expired, or already used. Please try again.")

    user_id_from_challenge = challenge_user_info.get("user_id")
    if not user_id_from_challenge:
        await clear_webauthn_challenge(client_challenge_b64url) # Clean up if malformed
        raise HTTPException(status_code=500, detail="User information missing from challenge data.")

    user = await crud_user.get_user_by_id(db, user_id=user_id_from_challenge)
    if not user:
        # This case should ideally not happen if challenge data was stored correctly
        await clear_webauthn_challenge(client_challenge_b64url)
        raise HTTPException(status_code=404, detail="User associated with passkey registration not found.")

    try:
        registration_cred = RegistrationCredential(
            id=request_data.credential_id, 
            raw_id=base64url_to_bytes(request_data.raw_id),
            type=request_data.type,
            response={
                "attestationObject": request_data.response['attestationObject'],
                "clientDataJSON": request_data.response['clientDataJSON']
            }
        )
        
        # The `py_webauthn` library expects the challenge as bytes.
        # The challenge from clientDataJSON is base64url, so decode it.
        expected_challenge_bytes = base64url_to_bytes(client_challenge_b64url)

        verified_credential = wna.verify_registration_response(
            credential=registration_cred,
            expected_challenge=expected_challenge_bytes, 
            expected_origin=get_expected_origin(),
            expected_rp_id=get_rp_id(),
            require_user_verification=settings.WEBAUTHN_RP_NAME != "localhost" # More strict for non-localhost
        )

        new_passkey = await crud_passkey.create_user_passkey(
            db=db,
            user_id=user.id,
            credential_id=verified_credential.credential_id,
            public_key=verified_credential.public_key,
            sign_count=verified_credential.sign_count,
            transports=registration_cred.response.get("transports") # from client if available
        )
        print(f"Passkey registered successfully for user {user.email}, DB ID: {new_passkey.id}")

        # Update user provider and verification status
        update_data = {"provider": "passkey", "is_verified": True}
        # If user was created in this flow, their display name might also be set from passkey display name
        if challenge_user_info.get("user_creation_flow") and not user.name and verified_credential.user_display_name:
            update_data["name"] = verified_credential.user_display_name
        
        user = await crud_user.update_user_internal(db, db_obj=user, obj_in=update_data)
        return UserResponse.model_validate(user)

    except WebAuthnException as e:
        print(f"Passkey registration verification failed: {str(e)}")
        # Note: challenge data is auto-deleted by retrieve_webauthn_challenge_data on first successful get
        # If it failed before retrieval or if retrieval failed, it might still be in Redis or already gone.
        raise HTTPException(status_code=400, detail=f"Passkey verification failed: {str(e)}")
    except Exception as e:
        print(f"Unexpected error during passkey registration verification: {str(e)}")
        # Consider clearing challenge if it might still exist and this error is recoverable
        # await clear_webauthn_challenge(client_challenge_b64url) 
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.post("/passkey/login-options", response_model=PasskeyLoginOptionsResponse, tags=["Passkey"])
async def passkey_login_options(
    request_data: PasskeyLoginOptionsRequest,
    db: AsyncSession = Depends(get_db)
):
    user_id_for_challenge: Optional[str] = None
    user_email_for_challenge: Optional[str] = None
    allowed_credentials_for_lib: List[Dict[str, Any]] = []
    
    challenge_bytes = secrets.token_urlsafe(32).encode('utf-8')
    challenge_str = bytes_to_base64url(challenge_bytes)

    if request_data.email:
        user = await crud_user.get_user_by_email(db, email=request_data.email)
        if user:
            user_id_for_challenge = user.id
            user_email_for_challenge = user.email
            user_passkeys = await crud_passkey.get_passkeys_for_user(db, user_id=user.id)
            for pk in user_passkeys:
                allowed_credentials_for_lib.append({"type": "public-key", "id": pk.credential_id}) # bytes
    
    # If no email or user not found by email, rely on discoverable credentials (resident keys)
    # In this case, user_id_for_challenge and user_email_for_challenge will remain None.
    # The challenge will be stored with a generic marker or just the challenge itself as key.

    try:
        options: PublicKeyCredentialRequestOptions = wna.generate_authentication_options(
            rp_id=get_rp_id(),
            challenge=challenge_bytes,
            allow_credentials=allowed_credentials_for_lib if allowed_credentials_for_lib else None, 
            user_verification=UserVerificationRequirement.PREFERRED,
            timeout=settings.WEBAUTHN_CHALLENGE_TIMEOUT_SECONDS * 1000
        )
    except WebAuthnException as e:
        print(f"WebAuthn library error during login options: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating passkey login options: {str(e)}")

    user_info_for_challenge = {
        "user_id": user_id_for_challenge, # Can be None for discoverable credential flow
        "email": user_email_for_challenge # Can be None
    }
    await store_webauthn_challenge(challenge=challenge_str, user_info=user_info_for_challenge)
    
    options_dict = options.to_dict()
    return PasskeyLoginOptionsResponse(options=options_dict)

@router.post("/passkey/login-verify", response_model=Token, tags=["Passkey"])
async def passkey_login_verify(
    request_data: PasskeyLoginVerificationRequest,
    # original_challenge_from_client: str = Body(...), # REMOVED
    db: AsyncSession = Depends(get_db)
):
    try:
        client_data = wna.helpers.decode_client_data_json(request_data.response['clientDataJSON'])
        client_challenge_b64url = client_data.challenge
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid clientDataJSON: {str(e)}")

    challenge_user_info = await retrieve_webauthn_challenge_data(client_challenge_b64url)
    if not challenge_user_info: # Also handles used/expired challenges
        raise HTTPException(status_code=400, detail="Passkey login challenge not found, expired, or already used. Please try again.")

    # The UserHandle from the authenticator response might contain the user_id if it's a discoverable credential
    # and it was stored during registration (py_webauthn stores it as user.id.encode('utf-8')).
    user_handle_b64url = request_data.response.get('userHandle')
    user_id_from_user_handle: Optional[str] = None
    if user_handle_b64url:
        try:
            user_id_from_user_handle = base64url_to_bytes(user_handle_b64url).decode('utf-8')
        except Exception:
            pass # Invalid user handle format
    
    credential_id_bytes = base64url_to_bytes(request_data.raw_id)
    stored_credential = await crud_passkey.get_passkey_by_credential_id(db, credential_id=credential_id_bytes)

    if not stored_credential:
        raise HTTPException(status_code=404, detail="Passkey not recognized or not registered.")
    
    # Determine the user ID: from stored_credential (most reliable), then user_handle, then challenge_user_info
    user_id_to_load = stored_credential.user_id
    if user_id_from_user_handle and user_id_from_user_handle != user_id_to_load:
        # This is a mismatch, could be an issue or an attempt to use someone else's userHandle.
        # Prioritize the ID linked to the credential itself.
        print(f"Warning: User handle {user_id_from_user_handle} differs from credential's user_id {user_id_to_load}")
    
    # If it was a discoverable credential flow, challenge_user_info["user_id"] would be None.
    # We must rely on the user_id from the stored_credential or user_handle.
    if not user_id_to_load and user_id_from_user_handle:
        user_id_to_load = user_id_from_user_handle
    elif not user_id_to_load and challenge_user_info.get("user_id"):
        # Fallback if user_id was in challenge (e.g. email hint provided) but not directly from credential userHandle
        user_id_to_load = challenge_user_info.get("user_id")

    if not user_id_to_load:
        raise HTTPException(status_code=400, detail="Could not identify user for passkey login.")

    user = await crud_user.get_user_by_id(db, user_id=user_id_to_load)
    if not user:
        raise HTTPException(status_code=404, detail="User associated with passkey not found.")
    
    # Final check: if user_id from challenge had a value, it should match the found user's ID
    if challenge_user_info.get("user_id") and challenge_user_info["user_id"] != user.id:
        raise HTTPException(status_code=400, detail="User mismatch during passkey login.")

    try:
        auth_cred = AuthenticationCredential(
            id=request_data.credential_id, 
            raw_id=credential_id_bytes, # Already bytes
            type=request_data.type,
            response={
                "authenticatorData": request_data.response['authenticatorData'],
                "clientDataJSON": request_data.response['clientDataJSON'],
                "signature": request_data.response['signature'],
                "userHandle": request_data.response.get('userHandle') 
            }
        )
        
        expected_challenge_bytes = base64url_to_bytes(client_challenge_b64url)

        new_sign_count = wna.verify_authentication_response(
            credential=auth_cred,
            # For stored_credential, library needs it in PublicKeyCredentialDescriptor format.
            # The `py_webauthn` library internally uses credential_id (bytes) and public_key (bytes) from the DB record.
            # We provide what it expects based on its examples/source if it doesn't fetch directly via user_id.
            # The library's own type hints for verify_authentication_response show it needs `credential_public_key` and `credential_current_sign_count`,
            # which means we must pass the `public_key` and `sign_count` from our `stored_credential` record.
            expected_challenge=expected_challenge_bytes,
            expected_rp_id=get_rp_id(),
            expected_origin=get_expected_origin(),
            credential_public_key=stored_credential.public_key, # Bytes from DB
            credential_current_sign_count=stored_credential.sign_count, # Int from DB
            require_user_verification=settings.WEBAUTHN_RP_NAME != "localhost" # More strict for non-localhost
        )

        await crud_passkey.update_passkey_sign_count(db, passkey_id=stored_credential.id, new_sign_count=new_sign_count)
        await crud_user.update_last_login(db, user_id=user.id)

        access_token = security.create_access_token(subject=str(user.id))
        refresh_token = security.create_refresh_token(subject=str(user.id))

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user=UserResponse.model_validate(user).model_dump()
        )

    except WebAuthnException as e:
        print(f"Passkey login verification failed: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Passkey login failed: {str(e)}")
    except Exception as e:
        print(f"Unexpected error during passkey login verification: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

# TODO: Add endpoints for managing passkeys (list, delete) by an authenticated user. 