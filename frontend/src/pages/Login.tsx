import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../services/auth';
import { base64urlToBuffer, bufferToBase64url } from '../utils/webauthnHelpers';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuthStore(); // Use a shorter alias for store access
  
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [passkeyEmail, setPasskeyEmail] = useState(''); // For hinted passkey login
  
  const [formData, setFormData] = useState({
    email: '',
    username: '', // Can be username or email for normal login
    password: '',
    confirmPassword: '',
    fullName: '',
  });

  // Effect to handle OAuth callback from URL hash
  useEffect(() => {
    if (location.hash) {
      const params = new URLSearchParams(location.hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const userStr = params.get('user');
      
      if (accessToken && userStr) {
        try {
          const user = JSON.parse(decodeURIComponent(userStr));
          useAuthStore.setState({
            accessToken,
            refreshToken,
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            isHydrated: true,
          });
          // Clear the hash from URL after processing
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          navigate('/');
        } catch (e) {
          console.error("Failed to process OAuth callback data from URL hash:", e);
          useAuthStore.setState({ error: 'OAuth login failed. Please try again.', isLoading: false });
        }
      }
    }
  }, [location, navigate, auth]);

  // Handles traditional email/password and registration submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    auth.clearError();
    useAuthStore.setState({ isLoading: true });
    try {
      if (isRegisterMode) {
        if (formData.password !== formData.confirmPassword) {
          useAuthStore.setState({ error: 'Passwords do not match', isLoading: false });
          return;
        }
        await auth.register(
          formData.email,
          formData.username, // Username for registration
          formData.password,
          formData.fullName || undefined
        );
      } else {
        await auth.login(formData.username, formData.password); // Username can be email or username here
      }
      if (!auth.error) {
        navigate('/');
      }
    } catch (err) {
      // Error is usually set by the auth store hooks, but catch any other unexpected issues
      console.error("Login/Register error:", err);
      if (!auth.error) { // If store didn't set an error, set a generic one
        useAuthStore.setState({ error: 'An unexpected error occurred.', isLoading: false });
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode);
    auth.clearError();
    setPasskeyEmail(''); // Clear passkey email when toggling mode
    setFormData({ email: '', username: '', password: '', confirmPassword: '', fullName: '' });
  };

  const handleGoogleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/api/v1/auth/google/login`;
  };

  const handleGitHubLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/api/v1/auth/github/login`;
  };

  const handlePasskeyLogin = async () => {
    auth.clearError();
    useAuthStore.setState({ isLoading: true });
    try {
      // 1. Get login options from backend
      const optionsResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/auth/passkey/login-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: passkeyEmail || undefined }),
      });

      if (!optionsResponse.ok) {
        const errData = await optionsResponse.json().catch(() => ({ detail: 'Failed to get passkey login options' }));
        throw new Error(errData.detail || 'Failed to get passkey login options');
      }
      const optionsData = await optionsResponse.json();
      const { options: rawOptions } = optionsData; // current_challenge is no longer sent

      // 2. Convert challenge and allowedCredentials IDs from base64url to ArrayBuffer
      const publicKeyCredentialRequestOptions = {
        ...rawOptions,
        challenge: base64urlToBuffer(rawOptions.challenge),
        allowCredentials: rawOptions.allowCredentials?.map((cred: any) => ({
          ...cred,
          id: base64urlToBuffer(cred.id),
        })),
        userVerification: rawOptions.userVerification || 'preferred',
      };
      
      // 3. Call navigator.credentials.get()
      const assertion = await navigator.credentials.get({ publicKey: publicKeyCredentialRequestOptions }) as PublicKeyCredential | null;
      if (!assertion) {
        throw new Error('Passkey authentication was cancelled or failed by the user.');
      }

      // 4. Convert ArrayBuffers in assertion response to base64url strings
      const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
      const verificationData = {
        id: assertion.id, // This is already base64url from browser
        rawId: bufferToBase64url(assertion.rawId), // This is the one server expects as credential_id (bytes)
        type: assertion.type,
        response: {
          authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
          clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
          signature: bufferToBase64url(assertionResponse.signature),
          userHandle: assertionResponse.userHandle ? bufferToBase64url(assertionResponse.userHandle) : null,
        },
      };

      // 5. Send to backend for verification
      const verifyResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/auth/passkey/login-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
                  // original_challenge_from_client is no longer sent
                  body: JSON.stringify(verificationData), 
      });

      if (!verifyResponse.ok) {
        const errData = await verifyResponse.json().catch(() => ({ detail: 'Passkey login verification failed' }));
        throw new Error(errData.detail || 'Passkey login verification failed');
      }
      const loginResult = await verifyResponse.json();

      // 6. Update auth store with tokens and user info
      useAuthStore.setState({
        user: loginResult.user,
        accessToken: loginResult.access_token,
        refreshToken: loginResult.refresh_token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        isHydrated: true, // Ensure hydration status is true after login
      });
      navigate('/');

    } catch (err: any) {
      console.error('Passkey login error:', err);
      useAuthStore.setState({ error: err.message || 'An unknown error occurred during passkey login.', isLoading: false });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
            {isRegisterMode ? 'Create your account' : 'Sign in to Verbweaver'}
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {isRegisterMode ? (
              <>
                Already have an account?{' '}
                <button type="button" onClick={toggleMode} className="font-medium text-primary hover:text-primary/80">
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button type="button" onClick={toggleMode} className="font-medium text-primary hover:text-primary/80">
                  Register
                </button>
              </>
            )}
          </p>
        </div>

        {/* Passkey Email Input (Optional, for hinted login) */}
        {!isRegisterMode && (
          <div className="mt-4">
            <label htmlFor="passkeyEmail" className="sr-only">Email for Passkey (optional)</label>
            <input
              type="email"
              name="passkeyEmail"
              id="passkeyEmail"
              placeholder="Email (optional for passkey)"
              value={passkeyEmail}
              onChange={(e) => setPasskeyEmail(e.target.value)}
              className="appearance-none rounded-md relative block w-full px-3 py-2.5 border border-input placeholder-muted-foreground text-foreground focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-input"
            />
          </div>
        )}

        {/* Action Buttons Section */}
        <div className="space-y-4 pt-4">
          {!isRegisterMode && (
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={auth.isLoading}
              className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              Sign in with Passkey
            </button>
          )}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={auth.isLoading}
            className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#DB4437] hover:bg-[#C53D2E] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#DB4437] disabled:opacity-50"
          >
            Sign in with Google
          </button>
          <button
            type="button"
            onClick={handleGitHubLogin}
            disabled={auth.isLoading}
            className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#333] hover:bg-[#1F1F1F] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#333] disabled:opacity-50"
          >
            Sign in with GitHub
          </button>
        </div>

        {/* Divider for email/password form */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-background text-muted-foreground">
              {isRegisterMode ? 'Or register with email' : 'Or sign in with email/username'}
            </span>
          </div>
        </div>

        {/* Email/Password/Username Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
          {auth.error && (
            <div className="rounded-md bg-destructive/10 p-3">
              <p className="text-sm font-medium text-destructive">{auth.error}</p>
            </div>
          )}
          
          <div className="rounded-md shadow-sm -space-y-px">
            {isRegisterMode && (
              <>
                <div>
                  <label htmlFor="email-register" className="sr-only">Email address for registration</label>
                  <input
                    id="email-register"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required={isRegisterMode} // Only required in register mode
                    value={formData.email}
                    onChange={handleChange}
                    className="appearance-none rounded-none relative block w-full px-3 py-2.5 border border-input placeholder-muted-foreground text-foreground rounded-t-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input"
                    placeholder="Email address"
                  />
                </div>
                <div>
                  <label htmlFor="fullName" className="sr-only">Full name</label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    value={formData.fullName}
                    onChange={handleChange}
                    className="appearance-none rounded-none relative block w-full px-3 py-2.5 border border-input placeholder-muted-foreground text-foreground focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input"
                    placeholder="Full name (optional)"
                  />
                </div>
              </>
            )}
            
            {/* Username field for Login (can be username or email) and Registration (username) */}
            <div>
              <label htmlFor="username-main" className="sr-only">
                {isRegisterMode ? 'Username for registration' : 'Username or Email for login'}
              </label>
              <input
                id="username-main"
                name="username" // Used for auth.login and auth.register
                type="text"
                autoComplete={isRegisterMode ? "username" : "username email"}
                required
                value={formData.username}
                onChange={handleChange}
                className={`appearance-none rounded-none relative block w-full px-3 py-2.5 border border-input placeholder-muted-foreground text-foreground ${isRegisterMode ? '' : 'rounded-t-md'} focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input`}
                placeholder={isRegisterMode ? 'Choose a username' : 'Username or Email'}
              />
            </div>
            
            {/* Password field */}
            <div>
              <label htmlFor="password-main" className="sr-only">Password</label>
              <input
                id="password-main"
                name="password"
                type="password"
                autoComplete={isRegisterMode ? "new-password" : "current-password"}
                required
                value={formData.password}
                onChange={handleChange}
                className={`appearance-none rounded-none relative block w-full px-3 py-2.5 border border-input placeholder-muted-foreground text-foreground ${!isRegisterMode ? 'rounded-b-md' : ''} focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input`}
                placeholder="Password"
              />
            </div>
            
            {isRegisterMode && (
              <div>
                <label htmlFor="confirmPassword" className="sr-only">Confirm Password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required={isRegisterMode}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="appearance-none rounded-none relative block w-full px-3 py-2.5 border border-input placeholder-muted-foreground text-foreground rounded-b-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input"
                  placeholder="Confirm password"
                />
              </div>
            )}
          </div>

          {!isRegisterMode && (
            <div className="flex items-center justify-end text-sm pt-2">
              <Link
                to="/request-password-reset"
                className="font-medium text-primary hover:text-primary/80"
              >
                Forgot your password?
              </Link>
            </div>
          )}

          <div className="pt-4">
            <button
              type="submit"
              disabled={auth.isLoading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
            >
              {auth.isLoading ? 'Processing...' : isRegisterMode ? 'Register' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 