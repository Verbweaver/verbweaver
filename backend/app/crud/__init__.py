from .user import (
    get_user_by_id,
    get_user_by_email,
    create_oauth_user,
    create_email_user,
    create_user_direct, # Generic creation, might be useful
    update_user_internal,
    update_last_login
)
from .passkey import (
    create_user_passkey,
    get_passkeys_for_user,
    get_passkey_by_credential_id,
    update_passkey_sign_count,
    update_passkey_last_used,
    delete_passkey,
    get_user_by_passkey_credential_id,
    bytes_to_base64url, # Exporting helpers might be useful
    base64url_to_bytes
)

__all__ = [
    "get_user_by_id",
    "get_user_by_email",
    "create_oauth_user",
    "create_email_user",
    "create_user_direct",
    "update_user_internal",
    "update_last_login",
    "create_user_passkey",
    "get_passkeys_for_user",
    "get_passkey_by_credential_id",
    "update_passkey_sign_count",
    "update_passkey_last_used",
    "delete_passkey",
    "get_user_by_passkey_credential_id",
    "bytes_to_base64url",
    "base64url_to_bytes",
] 