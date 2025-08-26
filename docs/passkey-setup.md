# Passkey (WebAuthn) Authentication Setup

This guide details how to configure the Verbweaver server to support Passkey (WebAuthn) authentication. Passkeys offer a secure and user-friendly alternative to passwords.

## Prerequisites

1.  **Verbweaver Backend Setup**: Ensure you have followed the general backend setup instructions in the [Getting Started guide](./getting-started.md).
2.  **HTTPS Environment (for Production)**: WebAuthn for creating and using passkeys (especially platform authenticators) requires a secure context (HTTPS) in production. For local development (`localhost`), HTTP is usually permitted by browsers.
3.  **Redis Server**: Passkey authentication uses Redis for secure, temporary storage of WebAuthn challenges. Ensure a Redis server is running and accessible to the backend.

## Configuration

1.  **Environment Variables**: Open your `.env` file in the `backend/` directory and configure the following variables:

    ```env
    # ... other settings ...

    # --- Passkey (WebAuthn) Settings ---    
    # Relying Party ID (your domain name, e.g., verbweaver.com - NO scheme or port)
    WEBAUTHN_RP_ID=localhost 
    # WEBAUTHN_RP_ID=yourdomain.com # For production

    # Relying Party Name (Human-readable name for your service)
    WEBAUTHN_RP_NAME=Verbweaver

    # Expected Origin (Full origin of your frontend, e.g., https://app.yourdomain.com or http://localhost:5173 for dev)
    # Defaults to FRONTEND_URL if not set, but explicit is better for WebAuthn.
    WEBAUTHN_EXPECTED_ORIGIN=http://localhost:5173
    # WEBAUTHN_EXPECTED_ORIGIN=https://app.yourdomain.com # For production
    
    # Timeout for WebAuthn challenges in seconds
    WEBAUTHN_CHALLENGE_TIMEOUT_SECONDS=120

    # --- Redis Configuration (Required for Passkey) ---
    # Ensure this is set and your Redis server is running
    REDIS_URL=redis://localhost:6379/0
    # Example for a Redis server with a password:
    # REDIS_URL=redis://:yourpassword@localhost:6379/0
    
    # --- Frontend URL (Used by WEBAUTHN_EXPECTED_ORIGIN if not set explicitly) ---
    FRONTEND_URL=http://localhost:5173
    # FRONTEND_URL=https://app.yourdomain.com # For production
    ```

    **Important Notes on Configuration:**
    *   `WEBAUTHN_RP_ID`: This **must** be the effective domain of your application. For production, if your site is `https://app.verbweaver.com`, the `WEBAUTHN_RP_ID` would typically be `verbweaver.com` or `app.verbweaver.com`. It **must not** include `https://` or port numbers. Browsers use this to scope credentials.
    *   `WEBAUTHN_EXPECTED_ORIGIN`: This **must** exactly match the origin from which the WebAuthn JavaScript API (`navigator.credentials.*`) calls are made on the frontend. It includes the scheme (e.g., `http` or `https://`) and port if non-standard.
    *   `REDIS_URL`: If Redis is not running or this URL is incorrect, Passkey operations will fail.

2.  **Install Dependencies**: Ensure all necessary Python packages are installed, including those for Passkey support:
    ```bash
    # Navigate to the backend directory
    cd backend

    # Activate your virtual environment (if you have one)
    # Windows PowerShell: .\.venv\Scripts\Activate.ps1
    # Linux/macOS: source .venv/bin/activate

    pip install -r requirements.txt
    ```
    This will install `py_webauthn` for WebAuthn logic and `redis` for connecting to your Redis server.

## Database

No manual migrations are required. The backend initializes tables (including `user_passkeys`) automatically on startup.

## Restart the Server

After completing the configuration and database migrations, restart the Verbweaver backend server for the changes to take effect.

Your server should now be ready to handle Passkey registration and login requests.

## Next Steps

-   Implement the Passkey registration and login UI on the frontend.
-   Thoroughly test the Passkey authentication flow.
-   Review the [Security Checklist](../security-checklist.md) for other important security considerations. 