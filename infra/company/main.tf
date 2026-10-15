data "aws_ssm_parameter" "foundation" {
  for_each        = toset(["aws-account-id", "hosted-zone-id", "github-oidc-provider-arn"])
  name            = "/the3/production/foundation/v1/${each.key}"
  with_decryption = false
  lifecycle {
    postcondition {
      condition     = each.key != "aws-account-id" || self.value == var.aws_account_id
      error_message = "The foundation contract belongs to a different AWS account."
    }
    postcondition {
      condition     = each.key != "github-oidc-provider-arn" || self.value == "arn:aws:iam::${var.aws_account_id}:oidc-provider/token.actions.githubusercontent.com"
      error_message = "The OIDC contract must identify this account's GitHub provider."
    }
  }
}

locals {
  foundation = { for key, parameter in data.aws_ssm_parameter.foundation : key => nonsensitive(parameter.value) }
}

resource "aws_s3_bucket" "site" {
  bucket_prefix = "the3-company-production-"
  force_destroy = false
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_acm_certificate" "site" {
  region            = "us-east-1"
  domain_name       = "the3.co.jp"
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "certificate" {
  for_each = {
    for option in aws_acm_certificate.site.domain_validation_options : option.domain_name => option
  }
  zone_id = local.foundation["hosted-zone-id"]
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 300
}

resource "aws_acm_certificate_validation" "site" {
  region                  = "us-east-1"
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate : record.fqdn]
}

resource "aws_cloudfront_function" "directory_index" {
  name    = "the3-company-production-directory-index"
  runtime = "cloudfront-js-2.0"
  comment = "Resolve company pages and product introductions in private S3"
  publish = true
  code    = file("${path.module}/directory-index.js")
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "the3-company-production-s3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  aliases             = ["the3.co.jp"]
  default_root_object = "index.html"
  http_version        = "http2and3"
  price_class         = "PriceClass_200"
  wait_for_deployment = true
  web_acl_id          = var.enable_schedula ? aws_wafv2_web_acl.site[0].arn : null
  origin {
    origin_id                = "company-site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
    s3_origin_config {
      origin_access_identity = ""
    }
  }
  dynamic "origin" {
    for_each = var.enable_schedula ? [local.schedula] : []
    content {
      origin_id                = "schedula-static"
      domain_name              = try(origin.value.static_origin_domain, "invalid.s3.ap-northeast-1.amazonaws.com")
      origin_access_control_id = aws_cloudfront_origin_access_control.site.id
      s3_origin_config {
        origin_access_identity = ""
      }
    }
  }
  dynamic "origin" {
    for_each = var.enable_schedula ? [local.schedula] : []
    content {
      origin_id                = "schedula-api"
      domain_name              = try(origin.value.function_url_domain, "invalid.lambda-url.ap-northeast-1.on.aws")
      origin_access_control_id = aws_cloudfront_origin_access_control.schedula_lambda[0].id
      custom_origin_config {
        http_port                = 80
        https_port               = 443
        origin_protocol_policy   = "https-only"
        origin_ssl_protocols     = ["TLSv1.2"]
        origin_read_timeout      = 35
        origin_keepalive_timeout = 5
      }
    }
  }
  dynamic "ordered_cache_behavior" {
    for_each = local.schedula_routes
    content {
      path_pattern               = ordered_cache_behavior.value.path
      target_origin_id           = ordered_cache_behavior.value.api ? "schedula-api" : "schedula-static"
      viewer_protocol_policy     = "redirect-to-https"
      allowed_methods            = ordered_cache_behavior.value.api ? ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"] : ["GET", "HEAD"]
      cached_methods             = ["GET", "HEAD"]
      compress                   = true
      cache_policy_id            = ordered_cache_behavior.value.assets ? "658327ea-f89d-4fab-a63d-7e88639e58f6" : "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
      origin_request_policy_id   = ordered_cache_behavior.value.api ? aws_cloudfront_origin_request_policy.schedula_api[0].id : null
      response_headers_policy_id = aws_cloudfront_response_headers_policy.schedula[0].id
      dynamic "function_association" {
        for_each = ordered_cache_behavior.value.api ? [] : [true]
        content {
          event_type   = "viewer-request"
          function_arn = aws_cloudfront_function.schedula_directory[0].arn
        }
      }
    }
  }
  default_cache_behavior {
    target_origin_id           = "company-site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03"
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.directory_index.arn
    }
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_route53_record" "site" {
  for_each = toset(["A", "AAAA"])
  zone_id  = local.foundation["hosted-zone-id"]
  name     = "the3.co.jp"
  type     = each.key
  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudFrontReadOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.site.arn}/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.site.arn } }
      },
      {
        Sid       = "RequireTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      }
    ]
  })
}

resource "aws_iam_role" "deploy" {
  name_prefix = "the3-company-deploy-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.foundation["github-oidc-provider-arn"] }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = { StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        "token.actions.githubusercontent.com:sub" = "repo:the3-inc@249383711/landing-page@1418165190:environment:production"
      } }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "DeployCompanySite"
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.site.arn },
      { Effect = "Allow", Action = ["s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"], Resource = "${aws_s3_bucket.site.arn}/*" },
      {
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
        Resource = aws_cloudfront_distribution.site.arn
      }
    ]
  })
}
