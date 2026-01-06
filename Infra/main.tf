# The IaC is not complete. For this to work with one store it still needs:
# - A Cognito Pool with groups
# - DynamoDB tables with their correct keys and GSIs
# - An HTTP API Gateway with all the routes, integrations, and authorizers (a lambda funciton url is being used until this is made, just for testing)
# - The S3 bucket is set to publicly readable, which we should probably correct before deploying. We would have to change some stuff with the backend for the bucket to not need to be publicly readable. It's not a huge problem though because only authenticated users will be getting the attachment links in the first place, and worst case senario people can read images that probably aren't that sensitive, but it should still be fixed.
# -----------------------------
# After all that, we still have to make this work for multiple stores to where each store has their own Cognito groups, S3 bucket, and dynamodb tables. This will also require changes to the backend

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
        Resource: "arn:aws:cognito-idp:${local.region}:${data.aws_caller_identity.current.account_id}:userpool/${local.region}_COGNITO_ID"
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
data "archive_file" "lambdaBin" {
  type        = "zip"
  source_file = "${path.module}/../Backend/target/lambda/TrueTickets/bootstrap"
  output_path = "${path.module}/../Backend/target/lambda/TrueTickets/bootstrap.zip"
}

# Lambda function
resource "aws_lambda_function" "lambdaFunction" {
  filename         = data.archive_file.lambdaBin.output_path
  function_name    = "TrueTicketsBackend"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "bootstrap"
  source_code_hash = data.archive_file.lambdaBin.output_base64sha256

  runtime = "provided.al2023"
  architectures = ["arm64"]

  timeout = 10
  memory_size = 1024

  environment {
    variables = {
      ENVIRONMENT = "production"
    }
  }

  tags = {
    Application = "TrueTickets"
  }
}

resource "aws_lambda_function_url" "lambda_url" {
  function_name      = aws_lambda_function.lambdaFunction.arn
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "allow_function_url" {
  statement_id  = "AllowPublicFunctionUrlInvoke"
  action        = "lambda:InvokeFunctionUrl"
  function_name = aws_lambda_function.lambdaFunction.arn
  principal     = "*"

  function_url_auth_type = "NONE"

  depends_on = [
    aws_lambda_function_url.lambda_url
  ]
}

resource "aws_lambda_permission" "allow_function" {
  statement_id  = "AllowPublicInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lambdaFunction.arn
  principal     = "*"

  depends_on = [
    aws_lambda_function_url.lambda_url
  ]
}
