# API Gateway CORS Configuration Fix

## The Problem
Your Lambda function is returning CORS headers, but API Gateway is not configured to handle CORS properly. This causes the browser to block the request before it even reaches your Lambda function.

## Solution: Configure API Gateway CORS

### Method 1: AWS Console (Recommended)

1. **Go to API Gateway Console**
   - Navigate to your API
   - Select your resource (e.g., `/api` or `/api/{proxy+}`)

2. **Enable CORS**
   - Click "Actions" → "Enable CORS"
   - Set the following values:
     - **Access-Control-Allow-Origin**: `*`
     - **Access-Control-Allow-Headers**: `Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`
     - **Access-Control-Allow-Methods**: `GET,POST,PUT,DELETE,OPTIONS`
     - **Access-Control-Max-Age**: `86400`

3. **Deploy the API**
   - Click "Actions" → "Deploy API"
   - Select your deployment stage (e.g., `prod`)
   - Click "Deploy"

### Method 2: AWS CLI

```bash
# Get your API ID
aws apigateway get-rest-apis --query 'items[?name==`your-api-name`].id' --output text

# Enable CORS for your resource
aws apigateway put-method-response \
  --rest-api-id YOUR_API_ID \
  --resource-id YOUR_RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters method.response.header.Access-Control-Allow-Origin=true,method.response.header.Access-Control-Allow-Headers=true,method.response.header.Access-Control-Allow-Methods=true

# Deploy the changes
aws apigateway create-deployment \
  --rest-api-id YOUR_API_ID \
  --stage-name prod
```

### Method 3: CloudFormation/SAM Template

If you're using Infrastructure as Code, add this to your template:

```yaml
Resources:
  ApiGatewayRestApi:
    Type: AWS::ApiGateway::RestApi
    Properties:
      Name: your-api-name
      
  ApiGatewayResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref ApiGatewayRestApi
      ParentId: !GetAtt ApiGatewayRestApi.RootResourceId
      PathPart: api
      
  ApiGatewayMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGatewayRestApi
      ResourceId: !Ref ApiGatewayResource
      HttpMethod: ANY
      AuthorizationType: COGNITO_USER_POOLS
      AuthorizerId: !Ref CognitoAuthorizer
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${LambdaFunction.Arn}/invocations'
        
  # CORS Configuration
  ApiGatewayMethodOptions:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ApiGatewayRestApi
      ResourceId: !Ref ApiGatewayResource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Origin: "'*'"
              method.response.header.Access-Control-Allow-Headers: "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
              method.response.header.Access-Control-Allow-Methods: "'GET,POST,PUT,DELETE,OPTIONS'"
            ResponseTemplates:
              application/json: ''
        RequestTemplates:
          application/json: '{"statusCode": 200}'
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Origin: true
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
```

## Quick Test

After configuring CORS:

1. **Test with curl**:
```bash
curl -X OPTIONS \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  https://your-api-gateway-url/prod/api/tickets
```

2. **Check the response headers**:
   - Should include `Access-Control-Allow-Origin: *`
   - Should include `Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS`
   - Should include `Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`

## Common Issues

1. **API Gateway not deployed** - Make sure to deploy after enabling CORS
2. **Wrong resource selected** - Make sure you're enabling CORS on the correct resource
3. **Cognito Authorizer blocking OPTIONS** - OPTIONS requests should not require authentication
4. **Caching** - Clear browser cache after making changes

## Verification

After fixing CORS, your browser should:
- ✅ Make the preflight OPTIONS request successfully
- ✅ Receive proper CORS headers
- ✅ Allow the actual API request to proceed
- ✅ Show the real API response (or error) instead of CORS error

The key is that API Gateway must be configured to handle CORS at the gateway level, not just in the Lambda function!
