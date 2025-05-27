import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../services/auth';

export default function Login() {
  const navigate = useNavigate();
  const { login, register, isLoading, error, clearError } = useAuthStore();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    fullName: '',
  });

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
        // For login, username field can be either username or email
        await login(formData.username || formData.email, formData.password);
      }
      navigate('/');
    } catch (error) {
      // Error is handled by the store
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
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
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
            <div className="flex items-center justify-end text-sm">
              <Link 
                to="/request-password-reset" 
                className="font-medium text-primary hover:text-primary/80"
              >
                Forgot your password?
              </Link>
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