terraform {
  backend "s3" {
    bucket = "acr-tfstate-ahnaf"
    key    = "acr/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# ─── DYNAMODB ───────────────────────────────────────────────
resource "aws_dynamodb_table" "reviews" {
  name         = "${var.project_name}-reviews"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = { Name = "${var.project_name}-reviews" }
}

# ─── SQS FIFO QUEUE ─────────────────────────────────────────
resource "aws_sqs_queue" "review_dlq" {
  name                      = "${var.project_name}-dlq.fifo"
  fifo_queue                = true
  content_based_deduplication = true
  tags = { Name = "${var.project_name}-dlq" }
}

resource "aws_sqs_queue" "review_queue" {
  name                        = "${var.project_name}-queue.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  visibility_timeout_seconds  = 120
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.review_dlq.arn
    maxReceiveCount     = 3
  })
  tags = { Name = "${var.project_name}-queue" }
}

# ─── IAM ROLE FOR LAMBDA ────────────────────────────────────
resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-policy"
  role = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem",
                    "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchWriteItem"]
        Resource = aws_dynamodb_table.reviews.arn
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage",
                    "sqs:GetQueueAttributes"]
        Resource = [aws_sqs_queue.review_queue.arn, aws_sqs_queue.review_dlq.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "*"
      }
    ]
  })
}

# ─── OPENAI LAMBDA LAYER ────────────────────────────────────
resource "aws_lambda_layer_version" "openai_layer" {
  layer_name          = "${var.project_name}-openai"
  description         = "OpenAI Python SDK"
  compatible_runtimes = ["python3.11"]
  filename            = "${path.module}/../lambda/openai_layer.zip"
  source_code_hash    = filebase64sha256("${path.module}/../lambda/openai_layer.zip")
}

# ─── WEBHOOK HANDLER LAMBDA ─────────────────────────────────
data "archive_file" "webhook_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/webhook_handler.py"
  output_path = "${path.module}/../lambda/webhook_handler.zip"
}

resource "aws_lambda_function" "webhook_handler" {
  filename         = data.archive_file.webhook_zip.output_path
  function_name    = "${var.project_name}-webhook"
  role             = aws_iam_role.lambda_role.arn
  handler          = "webhook_handler.lambda_handler"
  runtime          = "python3.11"
  timeout          = 30
  source_code_hash = data.archive_file.webhook_zip.output_base64sha256
  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.reviews.name
      SQS_QUEUE_URL  = aws_sqs_queue.review_queue.url
      WEBHOOK_SECRET = var.webhook_secret
    }
  }
  tags = { Name = "${var.project_name}-webhook" }
}

# ─── REVIEWER LAMBDA ────────────────────────────────────────
data "archive_file" "reviewer_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/reviewer.py"
  output_path = "${path.module}/../lambda/reviewer.zip"
}

resource "aws_lambda_function" "reviewer" {
  filename         = data.archive_file.reviewer_zip.output_path
  function_name    = "${var.project_name}-reviewer"
  role             = aws_iam_role.lambda_role.arn
  handler          = "reviewer.lambda_handler"
  runtime          = "python3.11"
  timeout          = 120
  memory_size      = 256
  source_code_hash = data.archive_file.reviewer_zip.output_base64sha256
  layers           = [aws_lambda_layer_version.openai_layer.arn]
  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.reviews.name
      OPENAI_API_KEY = var.openai_api_key
      GITHUB_TOKEN   = var.github_token
    }
  }
  tags = { Name = "${var.project_name}-reviewer" }
}

resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = aws_sqs_queue.review_queue.arn
  function_name    = aws_lambda_function.reviewer.arn
  batch_size       = 1
}

# ─── REVIEW API LAMBDA ──────────────────────────────────────
data "archive_file" "api_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/review_api.py"
  output_path = "${path.module}/../lambda/review_api.zip"
}

resource "aws_lambda_function" "review_api" {
  filename         = data.archive_file.api_zip.output_path
  function_name    = "${var.project_name}-api"
  role             = aws_iam_role.lambda_role.arn
  handler          = "review_api.lambda_handler"
  runtime          = "python3.11"
  timeout          = 30
  source_code_hash = data.archive_file.api_zip.output_base64sha256
  environment {
    variables = {
      DYNAMODB_TABLE   = aws_dynamodb_table.reviews.name
      WEBHOOK_FUNCTION = aws_lambda_function.webhook_handler.function_name
    }
  }
  tags = { Name = "${var.project_name}-api" }
}

# ─── API GATEWAY ────────────────────────────────────────────
resource "aws_api_gateway_rest_api" "api" {
  name = "${var.project_name}-api"
}

resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "proxy" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.proxy.id
  http_method             = aws_api_gateway_method.proxy.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.review_api.invoke_arn
}

resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.deployment.id
  rest_api_id   = aws_api_gateway_rest_api.api.id
  stage_name    = "prod"
}

resource "aws_api_gateway_deployment" "deployment" {
  depends_on  = [aws_api_gateway_integration.lambda]
  rest_api_id = aws_api_gateway_rest_api.api.id
  lifecycle { create_before_destroy = true }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.review_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# ─── CLOUDWATCH ALARMS ──────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "dlq_alarm" {
  alarm_name          = "${var.project_name}-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Messages in DLQ — review jobs are failing"
  dimensions = { QueueName = aws_sqs_queue.review_dlq.name }
}

resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${var.project_name}-api-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "API Lambda error rate too high"
  dimensions = { FunctionName = aws_lambda_function.review_api.function_name }
}