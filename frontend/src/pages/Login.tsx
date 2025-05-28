import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../services/auth';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, isLoading, error, clearError, isAuthenticated, user, accessToken, refreshToken, _setHydrated } = useAuthStore();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    fullName: '',
  });

  useEffect(() => {
    if (location.hash) {
      const params = new URLSearchParams(location.hash.substring(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      const user_str = params.get('user');
      
      if (access_token && user_str) {
        try {
          const parsedUser = JSON.parse(decodeURIComponent(user_str));
          useAuthStore.setState({
            accessToken: access_token,
            refreshToken: refresh_token,
            user: parsedUser,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            isHydrated: true,
          });
          navigate('/');
        } catch (e) {
          console.error("Error processing OAuth callback data:", e);
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
          alert('Passwords do not match');
          return;
        }
        await register(
          formData.email,
          formData.username,
          formData.password,
          formData.fullName || undefined
        );
      } else {
        await login(formData.username || formData.email, formData.password);
      }
      navigate('/');
    } catch (error) {
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode);
    clearError();
    setFormData({
      email: '',
      username: '',
      password: '',
      confirmPassword: '',
      fullName: '',
    });
  };

  const handleGoogleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/api/v1/auth/google/login`;
  };

  const handleGitHubLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/api/v1/auth/github/login`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
            {isRegisterMode ? 'Create your account' : 'Sign in to your account'}
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {isRegisterMode ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="font-medium text-primary hover:text-primary/80"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="font-medium text-primary hover:text-primary/80"
                >
                  Register
                </button>
              </>
            )}
          </p>
        </div>
        
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#DB4437] hover:bg-[#C53D2E] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#DB4437] disabled:opacity-50"
          >
            Sign in with Google
          </button>
          <button
            type="button"
            onClick={handleGitHubLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#333] hover:bg-[#1F1F1F] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#333] disabled:opacity-50"
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
              Or continue with email
            </span>
          </div>
        </div>
        
        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          
          <div className="rounded-md shadow-sm -space-y-px">
            {isRegisterMode && (
              <>
                <div>
                  <label htmlFor="email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground rounded-t-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-background"
                    placeholder="Email address"
                  />
                </div>
                <div>
                  <label htmlFor="fullName" className="sr-only">
                    Full name
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    value={formData.fullName}
                    onChange={handleChange}
                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-background"
                    placeholder="Full name (optional)"
                  />
                </div>
              </>
            )}
            
            <div>
              <label htmlFor="username" className="sr-only">
                {isRegisterMode ? 'Username' : 'Username or Email'}
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete={isRegisterMode ? "username" : "username email"}
                required
                value={formData.username}
                onChange={handleChange}
                className={`appearance-none rounded-none relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground ${
                  !isRegisterMode ? 'rounded-t-md' : ''
                } focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-background`}
                placeholder={isRegisterMode ? 'Username' : 'Username or Email'}
              />
            </div>
            
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isRegisterMode ? "new-password" : "current-password"}
                required
                value={formData.password}
                onChange={handleChange}
                className={`appearance-none rounded-none relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground ${
                  !isRegisterMode ? 'rounded-b-md' : ''
                } focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-background`}
                placeholder="Password"
              />
            </div>
            
            {isRegisterMode && (
              <div>
                <label htmlFor="confirmPassword" className="sr-only">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground rounded-b-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-background"
                  placeholder="Confirm password"
                />
              </div>
            )}
          </div>

          {!isRegisterMode && (
            <div className="flex items-center justify-between">
              <div className="flex items-center">
              </div>

              <div className="text-sm">
                <Link
                  to="/request-password-reset"
                  className="font-medium text-primary hover:text-primary/80"
                >
                  Forgot your password?
                </Link>
              </div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Loading...' : isRegisterMode ? 'Register' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 