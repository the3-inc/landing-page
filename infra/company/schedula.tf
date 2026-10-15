variable "enable_schedula" {
  description = "schedulaの配信元を構築・確認した後に共有CloudFrontへ登録する。"
  type        = bool
  default     = false
}

data "aws_ssm_parameter" "schedula" {
  count           = var.enable_schedula ? 1 : 0
  name            = "/the3/production/products/schedula/v1/origins"
  with_decryption = false
  lifecycle {
    postcondition {
      condition = try(
        jsondecode(self.value).schema_version == 1 &&
        jsondecode(self.value).aws_account_id == var.aws_account_id &&
        jsondecode(self.value).region == "ap-northeast-1" &&
        can(regex("^the3-schedula-demo-production-[a-z0-9-]+\\.s3\\.ap-northeast-1\\.amazonaws\\.com$", jsondecode(self.value).static_origin_domain)) &&
        can(regex("^[a-z0-9]+\\.lambda-url\\.ap-northeast-1\\.on\\.aws$", jsondecode(self.value).function_url_domain)) &&
        jsondecode(self.value).function_alias_arn == "arn:aws:lambda:ap-northeast-1:${var.aws_account_id}:function:the3-schedula-demo-production:live",
        false
      )
      error_message = "schedulaの公開契約は想定account・東京・専用S3とLambdaのlive aliasである必要がある。"
    }
  }
}

locals {
  schedula = var.enable_schedula ? try(jsondecode(nonsensitive(data.aws_ssm_parameter.schedula[0].value)), {}) : {}
  schedula_routes = var.enable_schedula ? [
    { path = "/products/schedula/api", api = true, assets = false },
    { path = "/products/schedula/api/*", api = true, assets = false },
    { path = "/products/schedula/assets/*", api = false, assets = true },
    { path = "/products/schedula/demo", api = false, assets = false },
    { path = "/products/schedula/demo/*", api = false, assets = false },
    { path = "/products/schedula/docs", api = false, assets = false },
    { path = "/products/schedula/docs/*", api = false, assets = false },
    { path = "/products/schedula/license.txt", api = false, assets = false },
  ] : []
}

resource "aws_ssm_parameter" "edge" {
  name = "/the3/production/company/v1/edge"
  type = "String"
  value = jsonencode({
    schema_version   = 1
    aws_account_id   = var.aws_account_id
    host             = "the3.co.jp"
    distribution_arn = aws_cloudfront_distribution.site.arn
  })
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudfront_origin_access_control" "schedula_lambda" {
  count                             = var.enable_schedula ? 1 : 0
  name                              = "the3-company-schedula-lambda"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "schedula_directory" {
  count   = var.enable_schedula ? 1 : 0
  name    = "the3-company-schedula-directory"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/schedula-directory.js")
}

resource "aws_cloudfront_origin_request_policy" "schedula_api" {
  count = var.enable_schedula ? 1 : 0
  name  = "the3-company-schedula-api"
  cookies_config {
    cookie_behavior = "none"
  }
  query_strings_config {
    query_string_behavior = "none"
  }
  headers_config {
    header_behavior = "whitelist"
    headers {
      items = ["Content-Type", "Origin", "X-Amz-Content-Sha256", "X-Demo-Lesson"]
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "schedula" {
  count = var.enable_schedula ? 1 : 0
  name  = "the3-company-schedula"
  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      override                = true
    }
    content_type_options {
      override = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}

resource "aws_wafv2_web_acl" "site" {
  count  = var.enable_schedula ? 1 : 0
  region = "us-east-1"
  name   = "the3-company-schedula-api"
  scope  = "CLOUDFRONT"
  default_action {
    allow {}
  }
  dynamic "rule" {
    for_each = { ip = { priority = 0, limit = 60, aggregate = "IP" }, total = { priority = 1, limit = 300, aggregate = "CONSTANT" } }
    content {
      name     = "schedula-${rule.key}"
      priority = rule.value.priority
      action {
        block {}
      }
      statement {
        rate_based_statement {
          limit                 = rule.value.limit
          evaluation_window_sec = 300
          aggregate_key_type    = rule.value.aggregate
          scope_down_statement {
            byte_match_statement {
              positional_constraint = "STARTS_WITH"
              search_string         = "/products/schedula/api"
              field_to_match {
                uri_path {}
              }
              text_transformation {
                priority = 0
                type     = "NONE"
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "schedula-${rule.key}"
        sampled_requests_enabled   = false
      }
    }
  }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "the3-company-schedula-api"
    sampled_requests_enabled   = false
  }
}
