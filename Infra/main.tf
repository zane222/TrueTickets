# The IaC is not complete. For this to work with one store it still needs:
# - Add an authorizer to the HTTP API Gateway
#
# These would be some good things to fix soon, but are not immediate:
# - The S3 bucket is set to publicly readable, which we should probably correct before deploying. We would have to change some stuff with the backend for the bucket to not need to be publicly readable. It's not a huge problem though because only authenticated users will be getting the attachment links in the first place, and worst case senario people can read images that probably aren't that sensitive, but it should still be fixed.
# - It makes an Amplify branch and zips the output, but you have to upload the zip file in the console
# - We still have to make this work for multiple stores to where each store has their own Cognito groups, S3 bucket, and dynamodb tables. This will also require changes to the backend

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

locals {
  region = "us-east-2"
}

provider "aws" {
  region = local.region
}

data "aws_caller_identity" "current" {}

#------------------------------Cognito pool and groups------------------------------#
resource "aws_cognito_user_pool" "this" {
  name = "PoolTrueTickets"

  # Login using email only
  username_attributes = ["email"]

  # Removes need for new account flow in client, we just say the email is verified and don't tell them the password, then they have to reset the password which means they have to get the code from their email, which means their email is verified
  auto_verified_attributes = ["email"]

  # Attributes
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = false
  }

  schema {
    name                = "given_name"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  # Shouldn't be able to make your own account without being invited by someone else
  admin_create_user_config {
    allow_admin_create_user_only = true
  }
}

resource "aws_cognito_user_pool_client" "client" {
  name         = "TrueTickets"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  token_validity_units {
    refresh_token = "days"
    access_token  = "minutes"
    id_token      = "minutes"
  }

  refresh_token_validity = 180   # 6 months, the goal is for the client to work like YouTube, where you never really get logged out
  access_token_validity  = 60
  id_token_validity      = 60

  prevent_user_existence_errors = "ENABLED"
}

resource "aws_cognito_user_group" "TrueTicketsAdmin" {
  user_pool_id = aws_cognito_user_pool.this.id
  name         = "TrueTicketsAdmin"
  description  = "Admin account for True Tickets"
  precedence   = 1
}

resource "aws_cognito_user_group" "StoreOwner" {
  user_pool_id = aws_cognito_user_pool.this.id
  name         = "StoreOwner"
  description  = "For the owners"
  precedence   = 5
}

resource "aws_cognito_user_group" "StoreManager" {
  user_pool_id = aws_cognito_user_pool.this.id
  name         = "StoreManager"
  description  = "For Managers"
  precedence   = 10
}

resource "aws_cognito_user_group" "StoreEmployee" {
  user_pool_id = aws_cognito_user_pool.this.id
  name         = "StoreEmployee"
  description  = "For Employees"
  precedence   = 15
}

resource "aws_cognito_user" "admin" {
  user_pool_id = aws_cognito_user_pool.this.id
  username     = var.admin_email
  password     = var.admin_password

  attributes = {
    email          = var.admin_email
    email_verified = "true"
    given_name     = var.admin_name
  }

  lifecycle {
    ignore_changes = [attributes]
  }
}

resource "aws_cognito_user_in_group" "admin_group_membership" {
  user_pool_id = aws_cognito_user_pool.this.id
  username     = aws_cognito_user.admin.username
  group_name   = aws_cognito_user_group.TrueTicketsAdmin.name
}

#------------------------------DynamoDB Tables------------------------------#

resource "aws_dynamodb_table" "customers" {
  name         = "Customers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "customer_id"

  attribute {
    name = "customer_id"
    type = "S"
  }

  attribute {
    name = "gsi_pk"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "N"
  }

  global_secondary_index {
    name               = "CustomerSearchIndex"
    hash_key           = "gsi_pk"
    range_key          = "created_at"
    projection_type    = "INCLUDE"
    non_key_attributes = ["full_name_lower", "customer_id"]
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "customer_phone_index" {
  name         = "CustomerPhoneIndex"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "phone_number"
  range_key    = "customer_id"

  attribute {
    name = "phone_number"
    type = "S"
  }

  attribute {
    name = "customer_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "tickets" {
  name         = "Tickets"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "ticket_number"

  attribute {
    name = "ticket_number"
    type = "N"
  }

  attribute {
    name = "gsi_pk"
    type = "S"
  }

  attribute {
    name = "customer_id"
    type = "S"
  }

  attribute {
    name = "paid_at"
    type = "N"
  }

  global_secondary_index {
    name               = "TicketSearchIndex"
    hash_key           = "gsi_pk"
    range_key          = "ticket_number"
    projection_type    = "INCLUDE"
    non_key_attributes = ["subject_lower"]
  }

  global_secondary_index {
    name               = "TicketNumberIndex"
    hash_key           = "gsi_pk"
    range_key          = "ticket_number"
    projection_type    = "INCLUDE"
    non_key_attributes = ["subject", "customer_id", "status", "device", "created_at"]
  }

  global_secondary_index {
    name               = "CustomerIdIndex"
    hash_key           = "customer_id"
    projection_type    = "ALL"
  }

  global_secondary_index {
    name               = "RevenueIndex"
    hash_key           = "gsi_pk"
    range_key          = "paid_at"
    projection_type    = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "config" {
  name         = "Config"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "time_entries" {
  name         = "TimeEntries"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "timestamp"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "purchases" {
  name         = "Purchases"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "month_year"

  attribute {
    name = "month_year"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

#------------------------------S3 with Public Read Access------------------------------#
resource "aws_s3_bucket" "public_bucket" {
  bucket = "attachments-true-tickets"
}

resource "aws_s3_bucket_public_access_block" "public_bucket" {
  bucket = aws_s3_bucket.public_bucket.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Public read policy for s3
resource "aws_s3_bucket_policy" "public_policy" {
  bucket = aws_s3_bucket.public_bucket.id

  depends_on = [ # wait for the access block before putting the policy
    aws_s3_bucket_public_access_block.public_bucket
  ]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.public_bucket.arn}/*"
      }
    ]
  })
}

#-------------------Lambda with Function URL and access to S3, DynamoDB, and Cognito-------------------#
resource "aws_iam_role" "lambda_exec" {
  name = "lambda-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

#Custom policy for S3, Cognito, and DynamoDB
resource "aws_iam_role_policy" "lambda_s3_cognito_dynamodb" {
  name = "lambda-s3-cognito-policy"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
        ]
        Resource = [
          "arn:aws:s3:::${aws_s3_bucket.public_bucket.bucket}",
          "arn:aws:s3:::${aws_s3_bucket.public_bucket.bucket}/*"
        ]
      },
      {
        Effect = "Allow"
        Action: [
            "cognito-idp:AdminCreateUser",
            "cognito-idp:AdminSetUserPassword",
            "cognito-idp:AdminAddUserToGroup",
            "cognito-idp:AdminRemoveUserFromGroup",
            "cognito-idp:AdminGetUser",
            "cognito-idp:AdminListGroupsForUser",
            "cognito-idp:AdminDeleteUser",
            "cognito-idp:ListUsers",
            "cognito-idp:ListGroups",
            "cognito-idp:AdminDisableUser",
            "cognito-idp:AdminEnableUser"
        ],
        Resource: "arn:aws:cognito-idp:${local.region}:${data.aws_caller_identity.current.account_id}:userpool/${aws_cognito_user_pool.this.id}"
      },
  		{
  			Effect: "Allow",
  			Action: [
  				"dynamodb:PutItem",
  				"dynamodb:UpdateItem",
  				"dynamodb:GetItem",
  				"dynamodb:Query",
  				"dynamodb:Scan",
  				"dynamodb:BatchGetItem",
  				"dynamodb:DeleteItem"
  			],
  			Resource: [
  				"arn:aws:dynamodb:us-east-2:${data.aws_caller_identity.current.account_id}:table/Customers",
  				"arn:aws:dynamodb:us-east-2:${data.aws_caller_identity.current.account_id}:table/Customers/index/*",
  				"arn:aws:dynamodb:us-east-2:${data.aws_caller_identity.current.account_id}:table/CustomerPhoneIndex",
  				"arn:aws:dynamodb:us-east-2:${data.aws_caller_identity.current.account_id}:table/Tickets",
  				"arn:aws:dynamodb:us-east-2:${data.aws_caller_identity.current.account_id}:table/Tickets/index/*",
  				"arn:aws:dynamodb:us-east-2:${data.aws_caller_identity.current.account_id}:table/Config",
  				"arn:aws:dynamodb:us-east-2:${data.aws_caller_identity.current.account_id}:table/TimeEntries",
  				"arn:aws:dynamodb:us-east-2:${data.aws_caller_identity.current.account_id}:table/Purchases"
  			]
  		}
    ]
  })
}

# Package the Lambda function code
data "archive_file" "lambda_bin" {
  type        = "zip"
  source_file = "${path.module}/../Backend/target/lambda/TrueTickets/bootstrap"
  output_path = "${path.module}/../Backend/target/lambda/TrueTickets/bootstrap.zip"
}

# Lambda function
resource "aws_lambda_function" "lambda_function" {
  filename         = data.archive_file.lambda_bin.output_path
  function_name    = "TrueTicketsBackend"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "bootstrap"
  source_code_hash = data.archive_file.lambda_bin.output_base64sha256

  runtime = "provided.al2023"
  architectures = ["arm64"]

  timeout = 10
  memory_size = 1024

  environment {
    variables = {
      S3_BUCKET_NAME = aws_s3_bucket.public_bucket.bucket
      USER_POOL_ID = aws_cognito_user_pool.this.id
    }
  }

  tags = {
    Application = "TrueTickets"
  }
}

# -------------------HTTP API Gateway-------------------
resource "aws_apigatewayv2_api" "http_api" {
  name          = "backend-http-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "prod"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id           = aws_apigatewayv2_api.http_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.lambda_function.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambda_function.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_apigatewayv2_route" "this" {
  for_each = toset([
      "GET /all_tickets_for_this_month_with_payments", "OPTIONS /all_tickets_for_this_month_with_payments",
      "POST /clock-in", "OPTIONS /clock-in",
      "GET /clock-logs", "OPTIONS /clock-logs",
      "POST /clock-logs/update", "OPTIONS /clock-logs/update",
      "GET /clock-status", "OPTIONS /clock-status",
      "GET /customers", "POST /customers", "PUT /customers", "OPTIONS /customers",
      "POST /invite-user", "OPTIONS /invite-user",
      "GET /migrate-tickets", # only for manual use through something like HTTPie
      "GET /purchases", "PUT /purchases", "OPTIONS /purchases",
      "GET /query_all", "OPTIONS /query_all",
      "GET /store_config", "PUT /store_config", "OPTIONS /store_config",
      "GET /tickets", "POST /tickets", "PUT /tickets", "OPTIONS /tickets",
      "PUT /tickets/status", "OPTIONS /tickets/status",
      "POST /tickets/dont-fix", "OPTIONS /tickets/dont-fix",
      "POST /tickets/attachment", "OPTIONS /tickets/attachment",
      "POST /tickets/comment", "OPTIONS /tickets/comment",
      "POST /tickets/payment", "OPTIONS /tickets/payment",
      "POST /tickets/refund", "OPTIONS /tickets/refund",
      "GET /tickets/recent", "OPTIONS /tickets/recent",
      "POST /update-user-group", "OPTIONS /update-user-group",
      "POST /update-user-wage", "OPTIONS /update-user-wage",
      "GET /users", "OPTIONS /users",
    ])

  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

#-------------Amplify---------------
data "archive_file" "frontend_build" {
  type        = "zip"
  source_dir  = "${path.module}/../Frontend/dist"
  output_path = "${path.module}/../Frontend/dist.zip"
}

resource "aws_amplify_app" "frontend" {
  name     = "TrueTicketsWebsite"
  platform = "WEB"

  # manual deploys, no repo integration
  enable_branch_auto_build = false
}

resource "aws_amplify_branch" "main" {
  app_id = aws_amplify_app.frontend.id
  branch_name = "TrueTickets"
  enable_auto_build = false

  # Deploy using S3 artifact
  framework = "React" # or your framework, optional
}

#-------------Generate a .env file---------------
resource "local_file" "env_file" {
  filename = "${path.module}/../Frontend/.env"

  content = <<EOT
VITE_AWS_REGION=${local.region}
VITE_COGNITO_USER_POOL_ID=${aws_cognito_user_pool.this.id}
VITE_COGNITO_CLIENT_ID=${aws_cognito_user_pool_client.client.id}
VITE_API_GATEWAY_URL=${aws_apigatewayv2_stage.prod.invoke_url}
VITE_COOKIE_DOMAIN=.${aws_amplify_app.frontend.default_domain}
EOT
}

#--------------Notification to Upload to Amplify-----------
output "important_note" {
  value       = "Everything has been done automatically except you need to deploy /Frontend/dist.zip to the Amplify App in the AWS console. Also you need to set the ticket counter to 1000 in dynamodb"
}
