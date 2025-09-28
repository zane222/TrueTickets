// AWS Amplify Configuration
// Uses environment variables for security

// Debug environment variables
console.log('Environment variables:', {
  VITE_AWS_REGION: import.meta.env.VITE_AWS_REGION,
  VITE_USER_POOL_ID: import.meta.env.VITE_USER_POOL_ID,
  VITE_USER_POOL_WEB_CLIENT_ID: import.meta.env.VITE_USER_POOL_WEB_CLIENT_ID,
  VITE_API_GATEWAY_URL: import.meta.env.VITE_API_GATEWAY_URL
});

const awsconfig = {
  Auth: {
    Cognito: {
      // REQUIRED - Amazon Cognito Region
      region: import.meta.env.VITE_AWS_REGION || 'us-east-2',
      
      // REQUIRED - Amazon Cognito User Pool ID
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      
      // REQUIRED - Amazon Cognito Web Client ID
      userPoolClientId: import.meta.env.VITE_USER_POOL_WEB_CLIENT_ID,
      
      // OPTIONAL - Login with email
      loginWith: {
        email: true
      }
    }
  },
  
  API: {
    REST: {
      "true-tickets-api": {
        endpoint: import.meta.env.VITE_API_GATEWAY_URL,
        region: import.meta.env.VITE_AWS_REGION || 'us-east-2',
        custom_header: async () => {
          const { fetchAuthSession } = await import('aws-amplify/auth');
          const session = await fetchAuthSession();
          return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` }
        }
      }
    }
  }
};

export default awsconfig;
