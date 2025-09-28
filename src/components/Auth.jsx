import React, { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { getCurrentUser, signIn, signOut, confirmSignIn, resetPassword } from 'aws-amplify/auth';
import { fetchAuthSession } from 'aws-amplify/auth';
import { motion } from 'framer-motion';
import { UserPlus, LogOut, Settings, Mail, Key } from 'lucide-react';

export function LoginForm({ onLoginSuccess }) {
  const [activeTab, setActiveTab] = useState('otp'); // 'otp' or 'password'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [showResetCodeForm, setShowResetCodeForm] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  // Debug Amplify configuration on component mount
  useEffect(() => {
    window.console.log('=== AMPLIFY CONFIG DEBUG ===');
    window.console.log('Amplify object:', Amplify);
    window.console.log('Auth functions available:', { getCurrentUser, signIn, signOut, confirmSignIn, fetchAuthSession, resetPassword });
    window.console.log('signIn function exists:', typeof signIn);
    window.console.log('confirmSignIn function exists:', typeof confirmSignIn);
    window.console.log('getCurrentUser function exists:', typeof getCurrentUser);
    window.console.log('=== AMPLIFY CONFIG DEBUG END ===');
  }, []);

  const resetForm = () => {
    setError('');
    setOtpSent(false);
    setOtp('');
    setPassword('');
    setShowResetCodeForm(false);
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setSendingOtp(true);
    setError('');

    try {
      window.console.log('=== OTP DEBUG START ===');
      window.console.log('Email:', email);
      window.console.log('Amplify object:', Amplify);
      window.console.log('signIn function available:', typeof signIn);
      
      // Check if signIn function is available
      if (typeof signIn !== 'function') {
        const errorMsg = 'signIn function is not available. This usually means your AWS environment variables are missing. Please check the console for setup instructions.';
        window.console.error('🔧 SETUP REQUIRED:');
        window.console.error('1. Run: node setup-env.js');
        window.console.error('2. Edit .env with your AWS credentials');
        window.console.error('3. Restart the development server');
        throw new Error(errorMsg);
      }
      
      // For OTP-only authentication, we'll call your backend to send a real OTP
      window.console.log('Sending real OTP for email:', email);
      
      // Call your backend API to generate and send OTP
      const response = await fetch(`${import.meta.env.VITE_API_GATEWAY_URL}/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email })
      });

      if (response.ok) {
        setOtpSent(true);
        setError('OTP sent to your email. Please check your inbox.');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send OTP');
      }
      window.console.log('=== OTP DEBUG END ===');
    } catch (err) {
      window.console.log('=== OTP ERROR DEBUG ===');
      window.console.error('Send OTP error:', err);
      window.console.log('Error type:', typeof err);
      window.console.log('Error message:', err.message);
      window.console.log('Error code:', err.code);
      window.console.log('Error stack:', err.stack);
      window.console.log('=== OTP ERROR DEBUG END ===');
      
      if (err.code === 'UserNotFoundException') {
        setError('User not found. Please use password login to create an account first.');
      } else if (err.code === 'NotAuthorizedException') {
        setError('Invalid credentials. Please try again.');
      } else {
        setError('Failed to send OTP. Please try again.');
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const handleOtpLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      window.console.log('=== OTP LOGIN DEBUG START ===');
      window.console.log('Email:', email);
      window.console.log('OTP:', otp);
      window.console.log('confirmSignIn function available:', typeof confirmSignIn);
      
      // Check if confirmSignIn function is available
      if (typeof confirmSignIn !== 'function') {
        const errorMsg = 'confirmSignIn function is not available. This usually means your AWS environment variables are missing. Please check the console for setup instructions.';
        window.console.error('🔧 SETUP REQUIRED:');
        window.console.error('1. Run: node setup-env.js');
        window.console.error('2. Edit .env with your AWS credentials');
        window.console.error('3. Restart the development server');
        throw new Error(errorMsg);
      }
      
      // For OTP-only authentication, we'll verify the OTP with the backend
      window.console.log('Verifying OTP for email:', email, 'with OTP:', otp);
      
      // Call your backend API to verify the OTP
      const response = await fetch(`${import.meta.env.VITE_API_GATEWAY_URL}/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email, otp: otp })
      });

      if (response.ok) {
        const result = await response.json();
        window.console.log('OTP verification result:', result);
        
        // If OTP is valid, we can now sign in the user
        // For now, we'll use a temporary approach - in production you might
        // want to implement a different authentication flow
        window.console.log('OTP verified successfully');
        setError('OTP verified! Please use password login to complete authentication.');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Invalid OTP');
      }
      window.console.log('=== OTP LOGIN DEBUG END ===');
    } catch (err) {
      window.console.log('=== OTP LOGIN ERROR DEBUG ===');
      window.console.error('Login error:', err);
      window.console.log('Error type:', typeof err);
      window.console.log('Error message:', err.message);
      window.console.log('Error code:', err.code);
      window.console.log('Error stack:', err.stack);
      window.console.log('=== OTP LOGIN ERROR DEBUG END ===');
      
      if (err.code === 'CodeMismatchException') {
        setError('Invalid OTP code. Please try again.');
      } else if (err.code === 'ExpiredCodeException') {
        setError('OTP has expired. Please request a new one.');
      } else {
        setError('Failed to verify OTP. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const user = await signIn({ username: email, password: password });
      console.log('Login successful:', user);
      onLoginSuccess(user);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotPasswordLoading(true);
    setError('');

    try {
      window.console.log('=== FORGOT PASSWORD DEBUG START ===');
      window.console.log('Email:', forgotPasswordEmail);
      window.console.log('resetPassword function available:', typeof resetPassword);
      window.console.log('User Pool ID:', import.meta.env.VITE_USER_POOL_ID);
      window.console.log('App Client ID:', import.meta.env.VITE_USER_POOL_WEB_CLIENT_ID);
      window.console.log('Region:', import.meta.env.VITE_AWS_REGION);
      
      // Check if resetPassword function is available
      if (typeof resetPassword !== 'function') {
        const errorMsg = 'resetPassword function is not available. This usually means your AWS environment variables are missing. Please check the console for setup instructions.';
        window.console.error('🔧 SETUP REQUIRED:');
        window.console.error('1. Run: node setup-env.js');
        window.console.error('2. Edit .env with your AWS credentials');
        window.console.error('3. Restart the development server');
        throw new Error(errorMsg);
      }
      
      // In Amplify v6, resetPassword requires a different approach
      // We need to use the correct method signature
      window.console.log('Attempting password reset for:', forgotPasswordEmail);
      
      // Use the correct Amplify v6 resetPassword method
      // The method signature is: resetPassword({ username: string })
      window.console.log('Attempting resetPassword with username:', forgotPasswordEmail);
      
      // Try to get user info first to debug
      try {
        const { getCurrentUser } = await import('aws-amplify/auth');
        window.console.log('Attempting to get current user info...');
        // This will help us see if the user exists and what their attributes are
      } catch (userError) {
        window.console.log('User not signed in (expected for password reset)');
      }
      
      const result = await resetPassword({ username: forgotPasswordEmail });
      window.console.log('Reset password result:', result);
      
      setError('Password reset code sent to your email. Please check your inbox.');
      setShowResetCodeForm(true);
      
      window.console.log('=== FORGOT PASSWORD DEBUG END ===');
    } catch (err) {
      window.console.log('=== FORGOT PASSWORD ERROR DEBUG ===');
      window.console.error('Forgot password error:', err);
      window.console.log('Error type:', typeof err);
      window.console.log('Error message:', err.message);
      window.console.log('Error code:', err.code);
      window.console.log('Error stack:', err.stack);
      window.console.log('=== FORGOT PASSWORD ERROR DEBUG END ===');
      
      setError(err.message || 'Failed to send reset code');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetPasswordLoading(true);
    setError('');

    try {
      window.console.log('=== RESET PASSWORD DEBUG START ===');
      window.console.log('Email:', forgotPasswordEmail);
      window.console.log('Reset Code:', resetCode);
      window.console.log('New Password:', newPassword);
      window.console.log('Confirm Password:', confirmPassword);
      
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
      
      window.console.log('confirmResetPassword function available:', typeof confirmResetPassword);
      
      if (typeof confirmResetPassword !== 'function') {
        throw new Error('confirmResetPassword function is not available');
      }
      
      // Confirm the password reset
      const result = await confirmResetPassword({
        username: forgotPasswordEmail,
        confirmationCode: resetCode,
        newPassword: newPassword
      });
      
      window.console.log('Password reset result:', result);
      
      setError('Password reset successful! You can now sign in with your new password.');
      setShowResetCodeForm(false);
      setShowForgotPassword(false);
      
      window.console.log('=== RESET PASSWORD DEBUG END ===');
    } catch (err) {
      window.console.log('=== RESET PASSWORD ERROR DEBUG ===');
      window.console.error('Reset password error:', err);
      window.console.log('Error type:', typeof err);
      window.console.log('Error message:', err.message);
      window.console.log('Error code:', err.code);
      window.console.log('Error stack:', err.stack);
      window.console.log('=== RESET PASSWORD ERROR DEBUG END ===');
      
      if (err.code === 'CodeMismatchException') {
        setError('Invalid reset code. Please check your email and try again.');
      } else if (err.code === 'ExpiredCodeException') {
        setError('Reset code has expired. Please request a new one.');
      } else if (err.code === 'InvalidPasswordException') {
        setError('Password does not meet requirements. Please use a stronger password.');
      } else {
        setError(err.message || 'Failed to reset password. Please try again.');
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
            Choose your preferred login method
          </p>
        </div>

        {!showForgotPassword ? (
          <div className="md-card p-8">
            {/* Tab Navigation */}
            <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => {
                  setActiveTab('otp');
                  resetForm();
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'otp'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                OTP Login
              </button>
              <button
                onClick={() => {
                  setActiveTab('password');
                  resetForm();
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'password'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Password Login
              </button>
            </div>

            {/* OTP Tab Content */}
            {activeTab === 'otp' && (
              <>
                {!otpSent ? (
                  <form className="space-y-6" onSubmit={handleSendOtp}>
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

                    <div>
                      <motion.button
                        type="submit"
                        disabled={sendingOtp}
                        className="md-btn-primary w-full flex justify-center"
                        whileTap={{ scale: 0.98 }}
                      >
                        {sendingOtp ? (
                          <div className="flex items-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Sending OTP...
                          </div>
                        ) : (
                          'Send OTP'
                        )}
                      </motion.button>
                    </div>
                  </form>
                ) : (
                  <form className="space-y-6" onSubmit={handleOtpLogin}>
                    <div>
                      <label htmlFor="otp" className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                        Enter OTP
                      </label>
                      <input
                        id="otp"
                        name="otp"
                        type="text"
                        required
                        className="md-input"
                        placeholder="Enter 6-digit OTP"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        maxLength="6"
                      />
                      <p className="text-xs mt-1" style={{color:'var(--md-sys-color-outline)'}}>
                        OTP sent to {email}
                      </p>
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

                    <div className="flex space-x-3">
                      <motion.button
                        type="button"
                        onClick={() => {
                          setOtpSent(false);
                          setOtp('');
                          setError('');
                        }}
                        className="md-btn-surface flex-1"
                        whileTap={{ scale: 0.98 }}
                      >
                        Back
                      </motion.button>
                      <motion.button
                        type="submit"
                        disabled={loading}
                        className="md-btn-primary flex-1"
                        whileTap={{ scale: 0.98 }}
                      >
                        {loading ? (
                          <div className="flex items-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Verifying...
                          </div>
                        ) : (
                          'Verify OTP'
                        )}
                      </motion.button>
                    </div>
                  </form>
                )}
              </>
            )}

            {/* Password Tab Content */}
            {activeTab === 'password' && (
              <form className="space-y-6" onSubmit={handlePasswordLogin}>
                <div>
                  <label htmlFor="email-password" className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                    Email Address
                  </label>
                  <input
                    id="email-password"
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
            )}
          </div>
        ) : (
          <div className="md-card p-8">
            <form className="space-y-6" onSubmit={handleForgotPassword}>
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
        )}

        {/* Reset Code Form */}
        {showResetCodeForm && (
          <div className="md-card p-8">
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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showInviteUser, setShowInviteUser] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [userGroups, setUserGroups] = useState([]);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserEdit, setShowUserEdit] = useState(false);

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

  const handleInviteUser = async (e) => {
    e.preventDefault();
    setInviteLoading(true);
    
    try {
      // Use the same API client as the rest of the app
      const response = await fetch(`${import.meta.env.VITE_API_GATEWAY_URL}/invite-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await fetchAuthSession()).tokens.accessToken.toString()}`
        },
        body: JSON.stringify({ email: inviteEmail })
      });

      const result = await response.json();

      if (response.ok) {
        alert(`Invitation sent successfully to ${inviteEmail}. The user will receive an email with login instructions.`);
        setInviteEmail('');
        setShowInviteUser(false);
      } else {
        throw new Error(result.error || 'Failed to send invitation');
      }
      
    } catch (error) {
      console.error('Invite user error:', error);
      let errorMessage = 'Failed to send invitation. Please try again.';
      
      if (error.message.includes('already exists')) {
        errorMessage = 'A user with this email already exists.';
      } else if (error.message.includes('Insufficient permissions')) {
        errorMessage = 'You do not have permission to invite users.';
      } else if (error.message.includes('Invalid email')) {
        errorMessage = 'Invalid email address. Please check the format.';
      } else if (error.message.includes('Too many requests')) {
        errorMessage = 'Too many requests. Please try again later.';
      }
      
      alert(errorMessage);
    } finally {
      setInviteLoading(false);
    }
  };

  const canInviteUsers = userGroups.includes('TrueTickets-Cacell-ApplicationAdmin') || 
                        userGroups.includes('TrueTickets-Cacell-Owner') || 
                        userGroups.includes('TrueTickets-Cacell-Manager');

  const canManageUsers = userGroups.includes('TrueTickets-Cacell-ApplicationAdmin') || 
                        userGroups.includes('TrueTickets-Cacell-Owner');

  const canOnlyInvite = userGroups.includes('TrueTickets-Cacell-Manager');

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_GATEWAY_URL}/users`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await fetchAuthSession()).tokens.accessToken.toString()}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        setUsers(result.users || []);
      } else {
        throw new Error('Failed to load users');
      }
    } catch (error) {
      console.error('Error loading users:', error);
      alert('Failed to load users. Please try again.');
    } finally {
      setUsersLoading(false);
    }
  };

  const updateUserGroup = async (username, newGroup) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_GATEWAY_URL}/update-user-group`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await fetchAuthSession()).tokens.accessToken.toString()}`
        },
        body: JSON.stringify({ username, group: newGroup })
      });

      if (response.ok) {
        alert('User group updated successfully');
        loadUsers(); // Refresh the user list
        setShowUserEdit(false);
        setSelectedUser(null);
      } else {
        const result = await response.json();
        throw new Error(result.error || 'Failed to update user group');
      }
    } catch (error) {
      console.error('Error updating user group:', error);
      alert('Failed to update user group. Please try again.');
    }
  };

  const removeUser = async (username) => {
    if (!confirm(`Are you sure you want to remove user ${username}? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_GATEWAY_URL}/remove-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await fetchAuthSession()).tokens.accessToken.toString()}`
        },
        body: JSON.stringify({ username })
      });

      if (response.ok) {
        alert('User removed successfully');
        loadUsers(); // Refresh the user list
      } else {
        const result = await response.json();
        throw new Error(result.error || 'Failed to remove user');
      }
    } catch (error) {
      console.error('Error removing user:', error);
      alert('Failed to remove user. Please try again.');
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
    <div className="min-h-screen material-surface">
      {/* Top navigation with user menu */}
      <div className="material-app-bar">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <h1 className="text-xl font-bold tracking-wide" style={{color:'var(--md-sys-color-on-surface)'}}>
                True Tickets - Computer and Cellphone Inc
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm" style={{color:'var(--md-sys-color-on-surface)'}}>
                Welcome, {user.username}
              </span>
              
              {/* User menu dropdown */}
              <div className="relative">
                <motion.button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="md-btn-surface elev-1 inline-flex items-center justify-center w-11 h-11 rounded-full"
                  whileTap={{ scale: 0.95 }}
                >
                  <Settings className="w-5.5 h-5.5" />
                </motion.button>

                {showUserMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute right-0 mt-2 w-48 md-card py-1 z-50"
                  >
                    {canInviteUsers && (
                      <button
                        onClick={() => setShowInviteUser(true)}
                        className="flex items-center w-full px-4 py-2 text-sm hover:bg-opacity-10 hover:bg-white"
                        style={{color:'var(--md-sys-color-on-surface)'}}
                      >
                        <UserPlus className="w-4 h-4 mr-3" />
                        Invite User
                      </button>
                    )}
                    {canManageUsers && (
                      <button
                        onClick={() => {
                          setShowUserManagement(true);
                          loadUsers();
                        }}
                        className="flex items-center w-full px-4 py-2 text-sm hover:bg-opacity-10 hover:bg-white"
                        style={{color:'var(--md-sys-color-on-surface)'}}
                      >
                        <User className="w-4 h-4 mr-3" />
                        Manage Users
                      </button>
                    )}
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm hover:bg-opacity-10 hover:bg-white"
                      style={{color:'var(--md-sys-color-on-surface)'}}
                    >
                      <LogOut className="w-4 h-4 mr-3" />
                      Sign Out
                    </button>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1">
        {children}
      </div>

      {/* Invite User Modal */}
      {showInviteUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="md-card p-6 w-full max-w-md"
          >
            <h3 className="text-lg font-medium mb-4" style={{color:'var(--md-sys-color-primary)'}}>Invite User</h3>
            <form onSubmit={handleInviteUser}>
              <div className="mb-4">
                <label htmlFor="inviteEmail" className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                  Email Address
                </label>
                <input
                  id="inviteEmail"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="md-input"
                  placeholder="Enter email address"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowInviteUser(false)}
                  className="md-btn-surface elev-1"
                >
                  Cancel
                </button>
                <motion.button
                  type="submit"
                  disabled={inviteLoading}
                  className="md-btn-primary elev-1"
                  whileTap={{ scale: 0.95 }}
                >
                  {inviteLoading ? 'Sending...' : 'Send Invitation'}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* User Management Modal */}
      {showUserManagement && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="md-card p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium" style={{color:'var(--md-sys-color-primary)'}}>User Management</h3>
              <button
                onClick={() => setShowUserManagement(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            {usersLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{borderColor:'var(--md-sys-color-primary)'}}></div>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {users.map((user) => (
                  <div key={user.username} className="md-row-box p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{user.email || user.username}</div>
                      <div className="text-sm text-gray-500">
                        Groups: {user.groups ? user.groups.join(', ') : 'None'}
                      </div>
                      <div className="text-xs text-gray-400">
                        Status: {user.enabled ? 'Active' : 'Disabled'}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowUserEdit(true);
                        }}
                        className="md-btn-surface text-xs px-3 py-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeUser(user.username)}
                        className="md-btn-surface text-xs px-3 py-1"
                        style={{backgroundColor:'var(--md-sys-color-error)', color:'var(--md-sys-color-on-error)'}}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                {users.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No users found
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Edit User Modal */}
      {showUserEdit && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="md-card p-6 w-full max-w-md"
          >
            <h3 className="text-lg font-medium mb-4" style={{color:'var(--md-sys-color-primary)'}}>
              Edit User: {selectedUser.email || selectedUser.username}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                  User Group
                </label>
                <select
                  className="md-input"
                  value={selectedUser.groups?.[0] || 'TrueTickets-Cacell-Employee'}
                  onChange={(e) => {
                    setSelectedUser({
                      ...selectedUser,
                      groups: [e.target.value]
                    });
                  }}
                >
                  <option value="TrueTickets-Cacell-Employee">Employee</option>
                  <option value="TrueTickets-Cacell-Manager">Manager</option>
                  <option value="TrueTickets-Cacell-Owner">Owner</option>
                  <option value="TrueTickets-Cacell-ApplicationAdmin">Application Admin</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowUserEdit(false);
                    setSelectedUser(null);
                  }}
                  className="md-btn-surface elev-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => updateUserGroup(selectedUser.username, selectedUser.groups[0])}
                  className="md-btn-primary elev-1"
                >
                  Update Group
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
