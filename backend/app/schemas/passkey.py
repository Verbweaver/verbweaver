from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# Schemas for WebAuthn (Passkey) operations

# --- Registration ---_webauthn_user_handle
class PasskeyRegistrationOptionsRequest(BaseModel):
    email: str # To link the passkey to an existing or new user
    display_name: Optional[str] = None # User's display name for the passkey authenticator

class PasskeyRegistrationOptionsResponse(BaseModel):
    # This will typically be a dictionary matching the PublicKeyCredentialCreationOptions structure
    # from the WebAuthn spec, serialized as JSON.
    # Example fields (actual structure depends on the webauthn library output):
    # rp: Dict[str, str]
    # user: Dict[str, Any]
    # challenge: str # Base64URL encoded
    # pubKeyCredParams: List[Dict[str, Any]]
    # timeout: int
    # attestation: Optional[str] = None
    # authenticatorSelection: Optional[Dict[str, Any]] = None
    options: Dict[str, Any] # The actual options dictionary from the library
    current_challenge: str # Store the challenge to verify against later

class PasskeyRegistrationVerificationRequest(BaseModel):
    # This structure needs to match what navigator.credentials.create() resolves with,
    # specifically the PublicKeyCredential object, serialized typically after converting ArrayBuffers to base64url.
    # Ensure fields are base64url-encoded strings where appropriate (e.g., id, rawId, attestationObject, clientDataJSON)
    credential_id: str = Field(alias="id") # The raw ID of the credential, base64url encoded
    raw_id: str = Field(alias="rawId")
    type: str
    response: Dict[str, str] # Contains attestationObject and clientDataJSON (base64url encoded)
    # client_extension_results: Optional[Dict[str, Any]] = Field(alias="clientExtensionResults", default_factory=dict)
    # current_challenge: str # The challenge that was originally sent to the client

class PasskeyDevice(BaseModel):
    credential_id: str # Base64URL encoded version for frontend display/management
    device_name: Optional[str] = None
    created_at: str
    last_used_at: Optional[str] = None
    # transports: Optional[List[str]] = None

class UserPasskeysResponse(BaseModel):
    passkeys: List[PasskeyDevice]

# --- Authentication --- #
class PasskeyLoginOptionsRequest(BaseModel):
    email: Optional[str] = None # User's email, if known, to suggest specific credentials

class PasskeyLoginOptionsResponse(BaseModel):
    # This will typically be a dictionary matching the PublicKeyCredentialRequestOptions structure
    # Example fields:
    # challenge: str # Base64URL encoded
    # timeout: int
    # rpId: Optional[str] = None
    # allowCredentials: Optional[List[Dict[str, Any]]] = None
    options: Dict[str, Any] # The actual options dictionary from the library
    current_challenge: str # Store the challenge to verify against later

class PasskeyLoginVerificationRequest(BaseModel):
    # Matches PublicKeyCredential object from navigator.credentials.get()
    # Ensure fields are base64url-encoded strings where appropriate
    credential_id: str = Field(alias="id")
    raw_id: str = Field(alias="rawId")
    type: str
    response: Dict[str, str] # Contains authenticatorData, clientDataJSON, signature, userHandle (base64url encoded)
    # client_extension_results: Optional[Dict[str, Any]] = Field(alias="clientExtensionResults", default_factory=dict)
    # current_challenge: str

# General Passkey response for frontend display
class PasskeyInfo(BaseModel):
    id: str # Passkey entry ID from our DB, not credential_id
    credential_id_display: str # Shortened or user-friendly version of credential_id
    device_name: Optional[str] = None
    created_at: str
    last_used_at: Optional[str] = None

    class Config:
        from_attributes = True 