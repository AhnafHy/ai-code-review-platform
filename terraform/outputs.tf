output "api_url" {
  value       = aws_api_gateway_stage.prod.invoke_url
  description = "API Gateway base URL — set as NEXT_PUBLIC_API_URL in Vercel"
}

output "webhook_url" {
  value       = "${aws_api_gateway_stage.prod.invoke_url}/webhook"
  description = "GitHub webhook URL — paste this into GitHub repo webhook settings"
}

output "queue_url" {
  value       = aws_sqs_queue.review_queue.url
  description = "SQS FIFO queue URL"
}

output "dlq_url" {
  value       = aws_sqs_queue.review_dlq.url
  description = "Dead letter queue URL"
}