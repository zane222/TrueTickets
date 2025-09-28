#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create .env file with template
const envContent = `# AWS Configuration
# Fill in your actual values below

# AWS Region
VITE_AWS_REGION=us-east-2

# Cognito User Pool ID (get from AWS Console)
VITE_USER_POOL_ID=

# Cognito App Client ID (get from AWS Console)
VITE_USER_POOL_WEB_CLIENT_ID=

# API Gateway URL (get from AWS Console)
VITE_API_GATEWAY_URL=

# Cookie Domain (optional, for production)
VITE_COOKIE_DOMAIN=.yourdomain.com

# Cookie Secure (optional, set to 'true' for HTTPS)
VITE_COOKIE_SECURE=true
`;

const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
  console.log('✅ .env file already exists');
} else {
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Created .env file');
  console.log('📝 Please edit .env with your actual AWS values');
  console.log('🔒 Remember: .env is already in .gitignore and .cursorignore');
}

console.log('\n📋 Next steps:');
console.log('1. Edit .env with your AWS credentials');
console.log('2. Get values from AWS Console:');
console.log('   - User Pool ID: Cognito → User Pools → Your Pool → General settings');
console.log('   - App Client ID: Cognito → User Pools → Your Pool → App integration');
console.log('   - API Gateway URL: API Gateway → Your API → Stages → prod');
console.log('3. Run: npm run dev');
