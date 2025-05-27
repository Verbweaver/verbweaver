import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../services/auth'; // Assuming auth service will have requestPasswordReset
import toast from 'react-hot-toast';

export default function RequestPasswordReset() {
  const { requestPasswordReset } = useAuthStore(); // Placeholder, will be added to store
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    try {
      // This function needs to be added to useAuthStore
      // It should call the backend API: /api/v1/auth/password-reset-request
      // await requestPasswordReset(email);
      // For now, let's assume the backend handles the response as per OWASP (generic success message)
      // And the actual API call will be implemented in useAuthStore
      
      // Simulate API call for now until it's in useAuthStore
      const authService = useAuthStore.getState();
      if (authService.requestPasswordReset) { // Check if function exists
        await authService.requestPasswordReset(email);
        setMessage("If an account with that email exists, a password reset link has been sent. Please check your inbox (and spam folder).");
      } else {
        // Fallback if not yet implemented in store - THIS IS FOR DEV ONLY
        console.warn('requestPasswordReset not yet implemented in useAuthStore');
        setMessage("Password reset request submitted (simulated). Check backend console for link if email sending is mocked.");
      }

    } catch (error: any) {
      // The backend should ideally not reveal if email exists, so errors here might be network-related
      // Or if the backend *does* send specific errors (not recommended for this endpoint)
      toast.error(error.message || 'Failed to request password reset.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
            Forgot Your Password?
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {message && (
            <div className={`rounded-md p-4 ${message.includes('Failed') ? 'bg-destructive/10' : 'bg-positive/10'}`}>
              <p className={`text-sm ${message.includes('Failed') ? 'text-destructive' : 'text-positive'}`}>{message}</p>
            </div>
          )}
          
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input"
              placeholder="Email address"
              disabled={isLoading}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </div>
        </form>
        <div className="text-sm text-center">
          <Link to="/login" className="font-medium text-primary hover:text-primary/80">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
} 