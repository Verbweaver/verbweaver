import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../services/auth'; // Assuming auth service will have resetPassword
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const { resetPassword } = useAuthStore(); // Placeholder, will be added to store
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing password reset token. Please request a new one.');
      toast.error('Invalid or missing password reset token.');
    }
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Cannot reset password without a valid token.');
      return;
    }
    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      // This function needs to be added to useAuthStore
      // It should call the backend API: /api/v1/auth/reset-password
      // await resetPassword(token, formData.newPassword);

      // Simulate API call for now
      const authService = useAuthStore.getState();
      if (authService.resetPassword) { // Check if function exists
        await authService.resetPassword(token, formData.newPassword);
        toast.success('Password reset successfully! You can now login with your new password.');
        navigate('/login');
      } else {
        console.warn('resetPassword not yet implemented in useAuthStore');
        setMessage('Password reset successfully (simulated).');
        // navigate('/login'); // Don't navigate if simulated
      }

    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to reset password. The token might be invalid or expired.');
      toast.error(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token || error.includes('missing')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <div className="max-w-md w-full space-y-8 text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-destructive">Error</h2>
          <p className="mt-2 text-muted-foreground">{error || 'Invalid or missing password reset token.'}</p>
          <Link to="/request-password-reset" className="font-medium text-primary hover:text-primary/80">
            Request a new reset link
          </Link>
          <br />
          <Link to="/login" className="mt-4 inline-block font-medium text-primary hover:text-primary/80">
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
            Reset Your Password
          </h2>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          {message && (
            <div className="rounded-md bg-positive/10 p-4">
              <p className="text-sm text-positive">{message}</p>
            </div>
          )}
          
          <div>
            <label htmlFor="newPassword" className="sr-only">
              New Password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              value={formData.newPassword}
              onChange={handleChange}
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input"
              placeholder="New Password"
              disabled={isLoading}
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="sr-only">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              value={formData.confirmPassword}
              onChange={handleChange}
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input"
              placeholder="Confirm New Password"
              disabled={isLoading}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading || !token}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Resetting...' : 'Reset Password'}
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