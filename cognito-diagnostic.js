// Cognito Diagnostic Script
// Run this in your browser console to check your Cognito configuration

console.log('=== COGNITO DIAGNOSTIC ===');

// Check environment variables
console.log('Environment Variables:');
console.log('VITE_AWS_REGION:', import.meta.env.VITE_AWS_REGION);
console.log('VITE_USER_POOL_ID:', import.meta.env.VITE_USER_POOL_ID);
console.log('VITE_USER_POOL_WEB_CLIENT_ID:', import.meta.env.VITE_USER_POOL_WEB_CLIENT_ID);

// Check Amplify configuration
console.log('Amplify Configuration:');
console.log('Amplify object:', window.Amplify);

// Test if we can access Cognito directly
async function testCognitoAccess() {
  try {
    console.log('Testing Cognito access...');
    
    // Try to import Cognito client
    const { CognitoIdentityProviderClient, AdminGetUserCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    
    console.log('Cognito SDK imported successfully');
    
    // Create client
    const client = new CognitoIdentityProviderClient({
      region: import.meta.env.VITE_AWS_REGION || 'us-east-2'
    });
    
    console.log('Cognito client created');
    
    // Try to get user info (this will fail without proper credentials, but we can see the error)
    const command = new AdminGetUserCommand({
      UserPoolId: import.meta.env.VITE_USER_POOL_ID,
      Username: 'test@example.com' // Replace with actual email
    });
    
    try {
      const response = await client.send(command);
      console.log('User found:', response);
    } catch (error) {
      console.log('User not found or access denied:', error.message);
    }
    
  } catch (error) {
    console.log('Cognito SDK not available:', error.message);
  }
}

// Run the test
testCognitoAccess();

console.log('=== DIAGNOSTIC COMPLETE ===');
console.log('Check the output above for any issues.');
console.log('If you see "User not found", the user might not exist in Cognito.');
console.log('If you see "access denied", you need to configure AWS credentials.');
