import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../services/auth';
import { base64urlToBuffer, bufferToBase64url } from '../utils/webauthnHelpers';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    login,
    register,
    clearError,
    isLoading,
    error,
    getPasskeyLoginOptions,
    verifyPasskeyLogin,
  } = useAuthStore();
  
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [passkeyEmail, setPasskeyEmail] = useState('');
  
  const [formData, setFormData] = useState({
    email: '',
    username: '',
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
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          navigate('/');
        } catch (e) {
          console.error("Failed to process OAuth callback data from URL hash:", e);
          useAuthStore.setState({ error: 'OAuth login failed. Please try again.', isLoading: false });
        }
      }
    }
  }, [location, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      if (isRegisterMode) {
        if (formData.password !== formData.confirmPassword) {
          useAuthStore.setState({ error: 'Passwords do not match', isLoading: false });
          return;
        }
        await register(
          formData.email,
          formData.username,
          formData.password,
          formData.fullName || undefined
        );
      } else {
        await login(formData.username, formData.password);
      }
      if (!useAuthStore.getState().error) {
        navigate('/');
      }
    } catch (err) {
      console.error("Login/Register error:", err);
      if (!useAuthStore.getState().error) {
        useAuthStore.setState({ error: 'An unexpected error occurred.', isLoading: false });
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode);
    clearError();
    setPasskeyEmail('');
    setFormData({ email: '', username: '', password: '', confirmPassword: '', fullName: '' });
  };

  const handleGoogleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/api/v1/auth/google/login`;
  };

  const handleGitHubLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/api/v1/auth/github/login`;
  };

  const handlePasskeyLogin = async () => {
    clearError();
    try {
      const rawOptions = await getPasskeyLoginOptions(passkeyEmail || undefined);
      if (!rawOptions) throw new Error("Failed to get passkey login options.");

      const publicKeyCredentialRequestOptions = {
        ...rawOptions,
        challenge: base64urlToBuffer(rawOptions.challenge),
        allowCredentials: rawOptions.allowCredentials?.map((cred: any) => ({
          ...cred,
          id: base64urlToBuffer(cred.id),
        })),
        userVerification: rawOptions.userVerification || 'preferred',
      };
      
      const assertion = await navigator.credentials.get({ publicKey: publicKeyCredentialRequestOptions }) as PublicKeyCredential | null;
      if (!assertion) {
        console.log('Passkey authentication cancelled by user.');
        useAuthStore.setState({ isLoading: false });
        return;
      }

      const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
      const verificationData = {
        id: assertion.id,
        rawId: bufferToBase64url(assertion.rawId),
        type: assertion.type,
        response: {
          authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
          clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
          signature: bufferToBase64url(assertionResponse.signature),
          userHandle: assertionResponse.userHandle ? bufferToBase64url(assertionResponse.userHandle) : null,
        },
      } as any;

      await verifyPasskeyLogin(verificationData);
      
      if (!useAuthStore.getState().error) {
        navigate('/');
      }
    } catch (err: any) {
      console.error('Passkey login error:', err);
      if (!useAuthStore.getState().error) {
        useAuthStore.setState({ error: err.message || 'An unknown error occurred during passkey login.', isLoading: false });
      }
    }
  };

  useEffect(() => {
    const currentError = useAuthStore.getState().error;
    if (currentError) {
      console.error("Auth Error from store:", currentError);
    }
  }, [error]);

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
                <button type="button" onClick={toggleMode} className="font-medium text-primary hover:text-primary/80" disabled={isLoading}>
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button type="button" onClick={toggleMode} className="font-medium text-primary hover:text-primary/80" disabled={isLoading}>
                  Register
                </button>
              </>
            )}
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive p-3 rounded-md my-4">
            <p>{error}</p>
          </div>
        )}

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
              disabled={isLoading}
            />
          </div>
        )}

        <div className="space-y-4 pt-4">
          {!isRegisterMode && (
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              Sign in with Passkey
            </button>
          )}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#DB4437] hover:bg-[#C53D2E] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#DB4437] disabled:opacity-50"
          >
            Sign in with Google
          </button>
          <button
            type="button"
            onClick={handleGitHubLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#333] hover:bg-[#1F1F1F] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#333] disabled:opacity-50"
          >
            Sign in with GitHub
          </button>
        </div>

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

        <form className="space-y-6" onSubmit={handleSubmit}>
          {isRegisterMode && (
            <>
              <div>
                <label htmlFor="email-register" className="sr-only">Email address for registration</label>
                <input
                  id="email-register"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required={isRegisterMode}
                  value={formData.email}
                  onChange={handleChange}
                  className="appearance-none rounded-none relative block w-full px-3 py-2.5 border border-input placeholder-muted-foreground text-foreground rounded-t-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input"
                  placeholder="Email address"
                  disabled={isLoading}
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
                  disabled={isLoading}
                />
              </div>
            </>
          )}
          
          <div>
            <label htmlFor="username-main" className="sr-only">
              {isRegisterMode ? 'Username for registration' : 'Username or Email for login'}
            </label>
            <input
              id="username-main"
              name="username"
              type="text"
              autoComplete={isRegisterMode ? "username" : "username email"}
              required
              value={formData.username}
              onChange={handleChange}
              className={`appearance-none rounded-none relative block w-full px-3 py-2.5 border border-input placeholder-muted-foreground text-foreground ${isRegisterMode ? '' : 'rounded-t-md'} focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input`}
              placeholder={isRegisterMode ? 'Choose a username' : 'Username or Email'}
              disabled={isLoading}
            />
          </div>
          
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
              disabled={isLoading}
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
                disabled={isLoading}
              />
            </div>
          )}

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
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
            >
              {isLoading ? 'Processing...' : isRegisterMode ? 'Register' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 