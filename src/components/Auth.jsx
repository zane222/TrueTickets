import React, { useState, useEffect, createContext, useContext } from 'react';
import { Amplify } from 'aws-amplify';
import { getCurrentUser, signIn, signOut, resetPassword } from 'aws-amplify/auth';
import { fetchAuthSession } from 'aws-amplify/auth';
import { motion } from 'framer-motion';
import { UserPlus, LogOut, Settings, Mail, Key } from 'lucide-react';

// Create context for user groups
const UserGroupsContext = createContext();

export const useUserGroups = () => {
  const context = useContext(UserGroupsContext);
  if (!context) {
    throw new Error('useUserGroups must be used within a UserGroupsProvider');
  }
  return context;
};

export function LoginForm({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error'); // 'error', 'success', 'info'
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [showResetCodeForm, setShowResetCodeForm] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  // Clear reset code when form is first shown
  useEffect(() => {
    if (showResetCodeForm) {
      setResetCode('');
    }
  }, [showResetCodeForm]);

  const resetForm = () => {
    setError('');
    setMessage('');
    setMessageType('error');
    setPassword('');
    setShowResetCodeForm(false);
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const setMessageWithType = (messageText, type = 'error') => {
    setMessage(messageText);
    setMessageType(type);
    setError(''); // Clear any existing error
  };


  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const user = await signIn({ username: email, password: password });
      onLoginSuccess(user);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed');
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotPasswordLoading(true);
    setError('');

    try {
      const result = await resetPassword({ username: forgotPasswordEmail });
      setMessageWithType('Password reset code sent to your email. Please check your inbox.', 'success');
      setShowResetCodeForm(true);
    } catch (err) {
      console.error('Forgot password error:', err);
      setError(err.message || 'Failed to send reset code');
      setMessage('');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetPasswordLoading(true);
    setError('');

    try {
      // Check if passwords match
      if (newPassword !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
      
      // Check password strength
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }
      
      // Import the confirmResetPassword function
      const { confirmResetPassword } = await import('aws-amplify/auth');
      
      // Confirm the password reset
      const result = await confirmResetPassword({
        username: forgotPasswordEmail,
        confirmationCode: resetCode,
        newPassword: newPassword
      });
      
      setMessageWithType('Password reset successful! You can now sign in with your new password.', 'success');
      setShowResetCodeForm(false);
      setShowForgotPassword(false);
    } catch (err) {
      console.error('Reset password error:', err);
      
      if (err.code === 'CodeMismatchException') {
        setError('Invalid reset code. Please check your email and try again.');
        setMessage('');
      } else if (err.code === 'ExpiredCodeException') {
        setError('Reset code has expired. Please request a new one.');
        setMessage('');
      } else if (err.code === 'InvalidPasswordException') {
        setError('Password does not meet requirements. Please use a stronger password.');
        setMessage('');
      } else {
        setError(err.message || 'Failed to reset password. Please try again.');
        setMessage('');
      }
    } finally {
      setResetPasswordLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center material-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold" style={{color:'var(--md-sys-color-primary)'}}>
            Sign in to True Tickets
          </h2>
          <p className="mt-2 text-center text-sm" style={{color:'var(--md-sys-color-outline)'}}>
            Enter your credentials to sign in
          </p>
        </div>

        {!showForgotPassword ? (
          <div className="md-card p-8">
            <form className="space-y-6" onSubmit={handlePasswordLogin}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="md-input"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="md-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-md p-4"
                  style={{backgroundColor:'var(--md-sys-color-error)', color:'var(--md-sys-color-on-error)'}}
                >
                  <div className="text-sm">{error}</div>
                </motion.div>
              )}

              {message && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-md p-4"
                  style={{
                    backgroundColor: messageType === 'success' 
                      ? 'var(--md-sys-color-primary-container)' 
                      : messageType === 'info'
                      ? 'var(--md-sys-color-secondary-container)'
                      : 'var(--md-sys-color-error)',
                    color: messageType === 'success' 
                      ? 'var(--md-sys-color-on-primary-container)' 
                      : messageType === 'info'
                      ? 'var(--md-sys-color-on-secondary-container)'
                      : 'var(--md-sys-color-on-error)'
                  }}
                >
                  <div className="text-sm">{message}</div>
                </motion.div>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm flex items-center gap-1"
                  style={{color:'var(--md-sys-color-primary)'}}
                >
                  <Mail className="w-4 h-4" />
                  Forgot password?
                </button>
              </div>

              <div>
                <motion.button
                  type="submit"
                  disabled={loading}
                  className="md-btn-primary w-full flex justify-center"
                  whileTap={{ scale: 0.98 }}
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Signing in...
                    </div>
                  ) : (
                    'Sign in'
                  )}
                </motion.button>
              </div>
            </form>
          </div>
        ) : !showResetCodeForm ? (
          <div className="md-card p-8">
            <form className="space-y-6" onSubmit={handleForgotPassword}>
              <div>
                <label htmlFor="forgotPasswordEmail" className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                  Email Address
                </label>
                <input
                  id="forgotPasswordEmail"
                  name="forgotPasswordEmail"
                  type="email"
                  required
                  className="md-input"
                  placeholder="Enter your email address"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-md p-4"
                  style={{backgroundColor:'var(--md-sys-color-error)', color:'var(--md-sys-color-on-error)'}}
                >
                  <div className="text-sm">{error}</div>
                </motion.div>
              )}

              {message && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-md p-4"
                  style={{
                    backgroundColor: messageType === 'success' 
                      ? 'var(--md-sys-color-primary-container)' 
                      : messageType === 'info'
                      ? 'var(--md-sys-color-secondary-container)'
                      : 'var(--md-sys-color-error)',
                    color: messageType === 'success' 
                      ? 'var(--md-sys-color-on-primary-container)' 
                      : messageType === 'info'
                      ? 'var(--md-sys-color-on-secondary-container)'
                      : 'var(--md-sys-color-on-error)'
                  }}
                >
                  <div className="text-sm">{message}</div>
                </motion.div>
              )}

              <div className="flex space-x-3">
                <motion.button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="md-btn-surface flex-1"
                  whileTap={{ scale: 0.98 }}
                >
                  Back to Login
                </motion.button>
                <motion.button
                  type="submit"
                  disabled={forgotPasswordLoading}
                  className="md-btn-primary flex-1"
                  whileTap={{ scale: 0.98 }}
                >
                  {forgotPasswordLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Sending...
                    </div>
                  ) : (
                    'Send Reset Code'
                  )}
                </motion.button>
              </div>
            </form>
          </div>
        ) : null}

        {/* Reset Code Form */}
        {showResetCodeForm && (
          <div key="reset-code-form" className="md-card p-8">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold" style={{color:'var(--md-sys-color-primary)'}}>
                Enter Reset Code
              </h3>
              <p className="text-sm mt-2" style={{color:'var(--md-sys-color-outline)'}}>
                We sent a 6-digit code to {forgotPasswordEmail}
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleResetPassword}>
              <div>
                <label htmlFor="resetCode" className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                  Reset Code
                </label>
                <input
                  id="resetCode"
                  name="resetCode"
                  type="text"
                  required
                  className="md-input"
                  placeholder="Enter 6-digit code"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  maxLength={6}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                  New Password
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  className="md-input"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                  Confirm New Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  className="md-input"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-md p-4"
                  style={{backgroundColor:'var(--md-sys-color-error)', color:'var(--md-sys-color-on-error)'}}
                >
                  <div className="text-sm">{error}</div>
                </motion.div>
              )}

              {message && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-md p-4"
                  style={{
                    backgroundColor: messageType === 'success' 
                      ? 'var(--md-sys-color-primary-container)' 
                      : messageType === 'info'
                      ? 'var(--md-sys-color-secondary-container)'
                      : 'var(--md-sys-color-error)',
                    color: messageType === 'success' 
                      ? 'var(--md-sys-color-on-primary-container)' 
                      : messageType === 'info'
                      ? 'var(--md-sys-color-on-secondary-container)'
                      : 'var(--md-sys-color-on-error)'
                  }}
                >
                  <div className="text-sm">{message}</div>
                </motion.div>
              )}

              <div className="flex space-x-3">
                <motion.button
                  type="button"
                  onClick={() => {
                    setShowResetCodeForm(false);
                    setShowForgotPassword(false);
                  }}
                  className="md-btn-surface flex-1"
                  whileTap={{ scale: 0.98 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="submit"
                  disabled={resetPasswordLoading}
                  className="md-btn-primary flex-1"
                  whileTap={{ scale: 0.98 }}
                >
                  {resetPasswordLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Resetting...
                    </div>
                  ) : (
                    'Reset Password'
                  )}
                </motion.button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export function AuthWrapper({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userGroups, setUserGroups] = useState([]);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      
      // Get user groups for permission checking
      const groups = currentUser.signInDetails?.loginId ? 
        (await fetchAuthSession()).tokens.idToken?.payload?.['cognito:groups'] || [] : [];
      console.log('AuthWrapper - User groups from token:', groups);
      setUserGroups(groups);
    } catch (error) {
      console.log('No authenticated user:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = async (user) => {
    setUser(user);
    // Get user groups after login
    const groups = user.signInDetails?.loginId ? 
      (await fetchAuthSession()).tokens.idToken?.payload?.['cognito:groups'] || [] : [];
    setUserGroups(groups);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setUser(null);
      setUserGroups([]);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center material-surface">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2" style={{borderColor:'var(--md-sys-color-primary)'}}></div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <UserGroupsContext.Provider value={{ userGroups, setUserGroups }}>
      <div className="min-h-screen material-surface">
        {/* Main content */}
        <div className="flex-1">
          {children}
        </div>
      </div>
    </UserGroupsContext.Provider>
  );
}
