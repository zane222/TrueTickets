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
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error'); // 'error', 'success', 'info'
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
    setMessage('');
    setMessageType('error');
    setOtpSent(false);
    setOtp('');
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
        setMessageWithType('OTP sent to your email. Please check your inbox.', 'success');
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
        setMessage('');
      } else if (err.code === 'NotAuthorizedException') {
        setError('Invalid credentials. Please try again.');
        setMessage('');
      } else {
        setError('Failed to send OTP. Please try again.');
        setMessage('');
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
        setMessageWithType('OTP verified! Please use password login to complete authentication.', 'success');
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
        setMessage('');
      } else if (err.code === 'ExpiredCodeException') {
        setError('OTP has expired. Please request a new one.');
        setMessage('');
      } else {
        setError('Failed to verify OTP. Please try again.');
        setMessage('');
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
      
      setMessageWithType('Password reset code sent to your email. Please check your inbox.', 'success');
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
      
      setMessageWithType('Password reset successful! You can now sign in with your new password.', 'success');
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
    <div className="min-h-screen material-surface">
      {/* Main content */}
      <div className="flex-1">
        {children}
      </div>

    </div>
  );
}
