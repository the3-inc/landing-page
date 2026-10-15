output "aws_region" {
  value = "us-east-1"
}
output "site_bucket" {
  value = aws_s3_bucket.site.id
}
output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}
output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}
output "site_url" {
  value = "https://the3.co.jp"
}
output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "aws_account_id" {
  value = var.aws_account_id
}
