# OAuth Login Setup for Verbweaver

This guide provides instructions for setting up Google and GitHub OAuth (Open Authorization) for your Verbweaver instance. This allows users to log in to the web version of Verbweaver using their existing Google or GitHub accounts.

## Prerequisites

*   A running Verbweaver backend instance.
*   Administrative access to the server environment where Verbweaver is hosted (to set environment variables).
*   A Google Cloud Platform account (for Google OAuth).
*   A GitHub account (for GitHub OAuth).

## Environment Variables

The following environment variables must be set in your Verbweaver backend environment (e.g., in a `.env` file at the root of the `backend` directory or directly as system environment variables):

```env
# Common Settings
FRONTEND_URL=http://localhost:3000 # Or your production frontend URL

# Google OAuth Credentials
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET

# GitHub OAuth Credentials
GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET=YOUR_GITHUB_CLIENT_SECRET
```

Replace `YOUR_..._ID` and `YOUR_..._SECRET` with the actual credentials obtained from Google and GitHub, respectively. Ensure `FRONTEND_URL` accurately reflects the URL of your Verbweaver frontend application.

## Setting up Google OAuth

1.  **Go to Google Cloud Console:**
    *   Navigate to [https://console.cloud.google.com/](https://console.cloud.google.com/).

2.  **Create or Select a Project:**
    *   If you don't have one already, create a new project.

3.  **Enable APIs and Services:**
    *   Go to "APIs & Services" > "Library".
    *   Search for and enable the **"Google People API"**. This API is used to fetch user profile information (name, email, avatar).

4.  **Configure OAuth Consent Screen:**
    *   Go to "APIs & Services" > "OAuth consent screen".
    *   Choose "External" for User Type and click "Create".
    *   **App information:**
        *   App name: `Verbweaver` (or your preferred name)
        *   User support email: Your support email address.
        *   App logo: (Optional)
    *   **Developer contact information:** Fill in your email address.
    *   Click "Save and Continue".
    *   **Scopes:** Click "Add or Remove Scopes". Select the following scopes:
        *   `.../auth/userinfo.email` (to view user's email address)
        *   `.../auth/userinfo.profile` (to see user's basic profile info)
        *   `openid` (for OpenID Connect)
        *   Click "Update", then "Save and Continue".
    *   **Test users:** (Optional during development) Add email addresses of test users. For a published app, you'll eventually need to submit for verification.
    *   Click "Save and Continue". Review the summary and go back to the dashboard.

5.  **Create OAuth 2.0 Credentials:**
    *   Go to "APIs & Services" > "Credentials".
    *   Click "+ Create Credentials" > "OAuth client ID".
    *   **Application type:** Select "Web application".
    *   **Name:** `Verbweaver Web Client` (or a descriptive name).
    *   **Authorized JavaScript origins:**
        *   Add the URL of your frontend application (e.g., `http://localhost:3000` for local development).
        *   Add your production frontend URL if applicable.
    *   **Authorized redirect URIs:**
        *   This is crucial. Add the backend callback URL that Verbweaver uses.
        *   For local development: `http://localhost:8000/api/v1/auth/google/callback`
        *   For production: `https://your-verbweaver-backend-domain.com/api/v1/auth/google/callback`
        *   **Important:** This URI must exactly match what the Verbweaver backend expects and generates, including `http` vs `https`, the port, and any trailing slashes (though typically no trailing slash for these paths).
    *   Click "Create".

6.  **Copy Client ID and Client Secret:**
    *   A dialog will show your "Client ID" and "Client Secret".
    *   Copy these values and set them as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your backend environment variables.

7.  **Publishing (Optional but Recommended for Production):**
    *   Back on the "OAuth consent screen" page, if your app is intended for public use, you may need to submit it for verification by Google, especially if using sensitive scopes.

## Setting up GitHub OAuth

1.  **Go to GitHub Developer Settings:**
    *   Log in to GitHub.
    *   Click on your profile picture in the top-right corner, then go to "Settings".
    *   In the left sidebar, scroll down and click "Developer settings".

2.  **Register a New OAuth Application:**
    *   Click on "OAuth Apps" in the left sidebar.
    *   Click the "New OAuth App" button (or "Register a new application").
    *   **Application name:** `Verbweaver` (or your preferred name).
    *   **Homepage URL:** The URL of your Verbweaver frontend application (e.g., `http://localhost:3000` for local development, or your production URL).
    *   **Application description:** (Optional) A brief description.
    *   **Authorization callback URL:** This is the most important part.
        *   For local development: `http://localhost:8000/api/v1/auth/github/callback`
        *   For production: `https://your-verbweaver-backend-domain.com/api/v1/auth/github/callback`
        *   **Important:** This URL must exactly match what the Verbweaver backend expects. GitHub is very strict about this URL.
    *   Click "Register application".

3.  **Copy Client ID and Generate a Client Secret:**
    *   After registering, you will be taken to the application's page.
    *   You will see the **Client ID**. Copy this value.
    *   Click the "Generate a new client secret" button. Confirm your password if prompted.
    *   GitHub will display the **Client Secret**. **Copy this secret immediately.** You will not be able to see it again.
    *   Set these values as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in your backend environment variables.

## Important Considerations

*   **HTTPS for Production:** For production environments, both your frontend and backend should be served over HTTPS. OAuth providers often require or strongly recommend HTTPS for redirect URIs.
*   **Redirect URI Matching:** The redirect URIs configured in the Google Cloud Console and GitHub OAuth App settings must *exactly* match the URIs your Verbweaver backend uses for the OAuth callbacks. Any mismatch (e.g., `http` vs `https`, trailing slashes, different ports) will cause the OAuth flow to fail.
*   **Environment Variable Security:** Keep your Client Secrets confidential. Do not commit them to your version control system. Use environment variables or a secure secrets management system.
*   **CSRF Protection (State Parameter):** The current implementation includes stubs for a `state` parameter in the OAuth flow. For enhanced security against Cross-Site Request Forgery (CSRF) attacks, it is highly recommended to fully implement the generation, storage (e.g., in a server-side session or secure cookie), and verification of the `state` parameter during the OAuth handshake. (This feature is partially stubbed in the `oauth.py` router and should be completed for production systems).
*   **Error Handling:** Review and enhance error handling in the backend OAuth callback endpoints to provide clear feedback to users or logs for administrators in case of issues.

After configuring the environment variables and setting up the OAuth applications with Google and GitHub, users should be able to use the "Sign in with Google" and "Sign in with GitHub" buttons on the Verbweaver login page. 