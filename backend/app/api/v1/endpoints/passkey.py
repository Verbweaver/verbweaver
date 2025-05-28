import secrets
from fastapi import APIRouter, Request, HTTPException, Depends, Body
from sqlalchemy.ext.asyncio import AsyncSession
import webauthn as wna # py_webauthn library
from webauthn.helpers.structs import (
    RegistrationCredential, AuthenticatorSelectionCriteria, ResidentKeyRequirement, UserVerificationRequirement,
    PublicKeyCredentialCreationOptions, PublicKeyCredentialRequestOptions, AuthenticationCredential
)
from webauthn.helpers.exceptions import WebAuthnException

from app.core.config import settings
from app.db.session import get_db
from app.schemas import (
    PasskeyRegistrationOptionsRequest, PasskeyRegistrationOptionsResponse,
    PasskeyRegistrationVerificationRequest, PasskeyLoginOptionsRequest,
    PasskeyLoginOptionsResponse, PasskeyLoginVerificationRequest,
    UserResponse, Token # For returning login success
)
from app.crud import user as crud_user, passkey as crud_passkey
from app.core import security
from app.models.user import User as UserModel # For type hint

router = APIRouter()

# Temporary storage for challenges (NOT PRODUCTION SAFE - use server-side session/cache)
# This is a simplified approach for now. In production, challenges must be stored securely server-side
# and associated with the user's session to prevent replay attacks and ensure atomicity.
challenge_storage: Dict[str, str] = {}

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
    if not user:
        # Option: Create user here if they don't exist, or require existing user
        # For now, assume user must exist or be created via a separate step before passkey registration
        # Or, if display_name is provided, we could create a new user.
        # Let's try creating if not exists, assuming email is unique identifier.
        if not request_data.display_name:
             request_data.display_name = request_data.email.split('@')[0]
        
        user_in_create = {
            "email": request_data.email,
            "name": request_data.display_name,
            "provider": "passkey", # Or keep as email and add passkey later
            "is_active": True,
            "is_verified": False, # Passkey registration doesn't verify email by itself
            "hashed_password": None 
        }
        user = await crud_user.create_user_direct(db, obj_in=user_in_create)
        print(f"New user {user.email} created for passkey registration.")

    # Generate registration options
    # User handle should be a stable, non-personally identifiable, unique ID for the user.
    # Using user.id (string UUID) directly as bytes.
    user_handle_bytes = user.id.encode('utf-8')

    # Get existing passkeys for this user to potentially exclude them
    existing_credentials = []
    user_passkeys = await crud_passkey.get_passkeys_for_user(db, user_id=user.id)
    for pk in user_passkeys:
        existing_credentials.append(pk.credential_id) # Already bytes

    try:
        options: PublicKeyCredentialCreationOptions = wna.generate_registration_options(
            rp_id=get_rp_id(),
            rp_name=get_rp_name(),
            user_id=user_handle_bytes, # Must be bytes
            user_name=user.email, # Typically username, using email for uniqueness
            user_display_name=request_data.display_name or user.name or user.email,
            challenge=secrets.token_urlsafe(32).encode('utf-8'), # Generate a new challenge (bytes)
            exclude_credentials=[{"type": "public-key", "id": cred_id} for cred_id in existing_credentials],
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.PREFERRED, # Discoverable credential preferred
                user_verification=UserVerificationRequirement.PREFERRED
            ),
            timeout=settings.WEBAUTHN_CHALLENGE_TIMEOUT_SECONDS * 1000, # ms
            attestation=None # "direct", "indirect", "none", "enterprise"
        )
    except WebAuthnException as e:
        print(f"WebAuthn library error during registration options: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating passkey registration options: {str(e)}")

    # Convert options to dict for Pydantic model and store challenge (simplified)
    options_dict = options.to_dict()
    current_challenge = options.challenge.decode('utf-8') # Store as string
    # TODO: Securely store challenge server-side, associated with session/user.
    # For now, returning it. The client MUST send this back for verification.
    challenge_storage[user.email] = current_challenge # Extremely simplified and insecure temp storage
    
    return PasskeyRegistrationOptionsResponse(options=options_dict, current_challenge=current_challenge)

@router.post("/passkey/register-verify", response_model=UserResponse, tags=["Passkey"])
async def passkey_register_verify(
    request_data: PasskeyRegistrationVerificationRequest,
    original_challenge_from_client: str = Body(...), # Client must send back the challenge
    db: AsyncSession = Depends(get_db)
):
    # Retrieve the securely stored challenge for the current session/user
    # This is where the insecure temporary storage is problematic.
    # Assume we get email from an authenticated session or a hidden field if user is known.
    # For now, we need a way to link this verification back to the user who initiated it.
    # This part needs careful thought in a real app with sessions.
    # Let's assume the client also sends the email of the user who is registering.
    user_email_from_client = Body(None) # This is a placeholder for how to get the user email.
                                       # This would typically come from an authenticated session or JWT identifying the user.
                                       # If user is not logged in, we might need to get it from initial options request.

    # For demonstration, trying to retrieve challenge using user_handle from clientDataJSON
    # This is also not ideal without secure session linking.
    try:
        client_data = wna.helpers.decode_client_data_json(request_data.response['clientDataJSON'])
        retrieved_challenge = client_data.challenge
        # The challenge from client_data_json is base64url. Our stored one might be plain string.
        # Need consistency or decode the one from client_data_json if library expects bytes.
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid clientDataJSON: {str(e)}")
    
    # THIS IS THE INSECURE PART for challenge retrieval:
    # We need to find the user based on something in the request_data or a session.
    # The `userHandle` in `authenticatorData` *might* be the user.id if we set it so.
    # Let's try to parse authenticatorData to get user handle.
    user_id_from_auth_data: Optional[str] = None
    try:
        auth_data_bytes = wna.helpers.base64url_to_bytes(request_data.response['authenticatorData'])
        parsed_auth_data = wna.helpers.parse_authenticator_data(auth_data_bytes)
        if parsed_auth_data.user_id:
            user_id_from_auth_data = parsed_auth_data.user_id.decode('utf-8')
    except Exception:
        pass # Could not parse or no user_id

    if not user_id_from_auth_data:
        raise HTTPException(status_code=400, detail="User identifier not found in authenticator data.")

    user = await crud_user.get_user_by_id(db, user_id=user_id_from_auth_data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found for passkey registration.")

    # Retrieve the challenge (INSECURE temporary method)
    stored_challenge_str = challenge_storage.pop(user.email, None)
    if not stored_challenge_str:
        raise HTTPException(status_code=400, detail="Passkey registration challenge not found or expired. Please try again.")

    try:
        registration_cred = RegistrationCredential(
            id=request_data.credential_id, # raw_id might be more appropriate for library if it expects base64url string for ID
            raw_id=crud_passkey.base64url_to_bytes(request_data.raw_id),
            type=request_data.type,
            response={
                "attestationObject": request_data.response['attestationObject'],
                "clientDataJSON": request_data.response['clientDataJSON']
            }
        )

        verified_credential = wna.verify_registration_response(
            credential=registration_cred,
            expected_challenge=stored_challenge_str.encode('utf-8'), # Library expects bytes
            expected_origin=get_expected_origin(),
            expected_rp_id=get_rp_id(),
            require_user_verification=True # Match what was in options if possible
        )

        # Store the new passkey
        new_passkey = await crud_passkey.create_user_passkey(
            db=db,
            user_id=user.id,
            credential_id=verified_credential.credential_id, # Bytes from library
            public_key=verified_credential.public_key, # Bytes from library
            sign_count=verified_credential.sign_count,
            transports=request_data.response.get("transports") # If client sends it
            # device_name can be set later by user or derived if possible
        )
        print(f"Passkey registered successfully for user {user.email}, credential ID (bytes): {verified_credential.credential_id}")

        # Update user provider if not already passkey, or if it was just created.
        if user.provider != "passkey" or not user.is_verified:
             await crud_user.update_user_internal(db, db_obj=user, obj_in={"provider": "passkey", "is_verified": True})

        return UserResponse.model_validate(user)

    except WebAuthnException as e:
        print(f"Passkey registration verification failed: {str(e)}")
        # Attempt to put challenge back if verification failed mid-way (still insecure)
        challenge_storage[user.email] = stored_challenge_str 
        raise HTTPException(status_code=400, detail=f"Passkey verification failed: {str(e)}")
    except Exception as e:
        print(f"Unexpected error during passkey registration verification: {str(e)}")
        challenge_storage[user.email] = stored_challenge_str # Try to put back
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.post("/passkey/login-options", response_model=PasskeyLoginOptionsResponse, tags=["Passkey"])
async def passkey_login_options(
    request_data: PasskeyLoginOptionsRequest,
    db: AsyncSession = Depends(get_db)
):
    user_id_bytes: Optional[bytes] = None
    allowed_credentials: List[Dict[str, Any]] = []

    if request_data.email:
        user = await crud_user.get_user_by_email(db, email=request_data.email)
        if user:
            user_id_bytes = user.id.encode('utf-8')
            user_passkeys = await crud_passkey.get_passkeys_for_user(db, user_id=user.id)
            for pk in user_passkeys:
                allowed_credentials.append({"type": "public-key", "id": pk.credential_id}) # id is bytes
        else:
            # User not found by email, proceed with discoverable credential (resident key) request
            pass 
    else:
        # No email provided, rely on discoverable credentials
        pass

    try:
        options: PublicKeyCredentialRequestOptions = wna.generate_authentication_options(
            rp_id=get_rp_id(),
            challenge=secrets.token_urlsafe(32).encode('utf-8'), # Bytes
            allow_credentials=allowed_credentials if allowed_credentials else None, # None means any passkey for this RP_ID
            user_verification=UserVerificationRequirement.PREFERRED,
            timeout=settings.WEBAUTHN_CHALLENGE_TIMEOUT_SECONDS * 1000 # ms
        )
    except WebAuthnException as e:
        print(f"WebAuthn library error during login options: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating passkey login options: {str(e)}")

    options_dict = options.to_dict()
    current_challenge = options.challenge.decode('utf-8') # Store as string
    # TODO: Securely store challenge (see registration options)
    # Storing challenge based on email if user found, otherwise a generic key (problematic)
    challenge_key = request_data.email if request_data.email and user else "__PASSKEY_LOGIN_NO_USER__"
    challenge_storage[challenge_key] = current_challenge
    
    return PasskeyLoginOptionsResponse(options=options_dict, current_challenge=current_challenge)

@router.post("/passkey/login-verify", response_model=Token, tags=["Passkey"])
async def passkey_login_verify(
    request_data: PasskeyLoginVerificationRequest,
    original_challenge_from_client: str = Body(...),
    db: AsyncSession = Depends(get_db)
):
    credential_id_bytes = crud_passkey.base64url_to_bytes(request_data.raw_id)
    
    # Find user by credential ID
    # user = await crud_passkey.get_user_by_passkey_credential_id(db, credential_id=credential_id_bytes)
    # The library's verify_authentication_response needs the stored credential, not the user directly.
    stored_credential = await crud_passkey.get_passkey_by_credential_id(db, credential_id=credential_id_bytes)

    if not stored_credential:
        raise HTTPException(status_code=404, detail="Passkey not recognized or not registered.")

    user = await crud_user.get_user_by_id(db, user_id=stored_credential.user_id)
    if not user:
        # Should not happen if passkey has a valid user_id
        raise HTTPException(status_code=404, detail="User associated with passkey not found.")

    # Retrieve challenge (INSECURE temporary method)
    challenge_key = user.email # Assuming user was found via passkey
    stored_challenge_str = challenge_storage.pop(challenge_key, None)
    # If challenge was for "__PASSKEY_LOGIN_NO_USER__" because it was a discoverable credential flow:
    if not stored_challenge_str:
        stored_challenge_str = challenge_storage.pop("__PASSKEY_LOGIN_NO_USER__", None)

    if not stored_challenge_str:
        raise HTTPException(status_code=400, detail="Passkey login challenge not found or expired. Please try again.")

    try:
        auth_cred = AuthenticationCredential(
            id=request_data.credential_id, # or raw_id for base64url
            raw_id=crud_passkey.base64url_to_bytes(request_data.raw_id),
            type=request_data.type,
            response={
                "authenticatorData": request_data.response['authenticatorData'],
                "clientDataJSON": request_data.response['clientDataJSON'],
                "signature": request_data.response['signature'],
                "userHandle": request_data.response.get('userHandle') # May be None
            }
        )

        new_sign_count = wna.verify_authentication_response(
            credential=auth_cred,
            stored_credential=wna.helpers.structs.PublicKeyCredentialDescriptor(
                id=stored_credential.credential_id, # Bytes
                type="public-key"
            ),
            expected_challenge=stored_challenge_str.encode('utf-8'), # Bytes
            expected_rp_id=get_rp_id(),
            expected_origin=get_expected_origin(),
            credential_public_key=stored_credential.public_key, # Bytes
            credential_current_sign_count=stored_credential.sign_count,
            require_user_verification=True # Or match your policy
        )

        # Update sign count and last used for the passkey
        await crud_passkey.update_passkey_sign_count(db, passkey_id=stored_credential.id, new_sign_count=new_sign_count)
        
        # Update user's last login
        await crud_user.update_last_login(db, user_id=user.id)

        # Generate JWT tokens for the user
        access_token = security.create_access_token(subject=str(user.id))
        refresh_token = security.create_refresh_token(subject=str(user.id))

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user=UserResponse.model_validate(user).model_dump() # Include user details
        )

    except WebAuthnException as e:
        print(f"Passkey login verification failed: {str(e)}")
        challenge_storage[challenge_key] = stored_challenge_str # Try to put back
        raise HTTPException(status_code=400, detail=f"Passkey login failed: {str(e)}")
    except Exception as e:
        print(f"Unexpected error during passkey login verification: {str(e)}")
        challenge_storage[challenge_key] = stored_challenge_str # Try to put back
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

# TODO: Add endpoints for managing passkeys (list, delete) by an authenticated user. 