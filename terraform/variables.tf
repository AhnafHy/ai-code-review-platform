variable "aws_region" {
  default = "us-east-1"
}

variable "project_name" {
  default = "ai-code-review"
}

variable "openai_api_key" {
  description = "OpenAI API key"
  sensitive   = true
  default     = ""
}

variable "github_token" {
  description = "GitHub Personal Access Token"
  sensitive   = true
  default     = ""
}

variable "webhook_secret" {
  description = "GitHub webhook secret"
  sensitive   = true
  default     = "acr-webhook-secret-2026"
}