mock_provider "aws" {
  override_during = plan
  mock_resource "aws_cloudfront_origin_access_control" {
    defaults = { id = "E123OAC" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = {
      id                          = "the3-company-test"
      arn                         = "arn:aws:s3:::the3-company-test"
      bucket_regional_domain_name = "the3-company-test.s3.ap-northeast-1.amazonaws.com"
    }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      id             = "E123EXAMPLE"
      arn            = "arn:aws:cloudfront::123456789012:distribution/E123EXAMPLE"
      domain_name    = "example.cloudfront.net"
      hosted_zone_id = "Z2FDTNDATAQYW2"
    }
  }
  mock_resource "aws_acm_certificate" {
    defaults = {
      arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
      domain_validation_options = [{
        domain_name           = "the3.co.jp"
        resource_record_name  = "_validation.the3.co.jp"
        resource_record_type  = "CNAME"
        resource_record_value = "_validation.acm-validations.aws."
      }]
    }
  }
}

override_data {
  target = data.aws_ssm_parameter.foundation["aws-account-id"]
  values = { value = "123456789012" }
}
override_data {
  target = data.aws_ssm_parameter.foundation["hosted-zone-id"]
  values = { value = "Z0123456789EXAMPLE" }
}
override_data {
  target = data.aws_ssm_parameter.foundation["github-oidc-provider-arn"]
  values = { value = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
}

variables {
  aws_account_id = "123456789012"
}

run "keeps_storage_private_and_limits_release_permissions" {
  command = plan
  assert {
    condition     = output.aws_region == "ap-northeast-1" && aws_acm_certificate.site.region == "us-east-1" && aws_acm_certificate_validation.site.region == "us-east-1" && one(aws_cloudfront_distribution.site.origin).domain_name == "the3-company-test.s3.ap-northeast-1.amazonaws.com"
    error_message = "Publish the Tokyo region and S3 origin, with CloudFront certificate issuance and validation in us-east-1."
  }
  assert {
    condition     = aws_s3_bucket_public_access_block.site.block_public_acls && aws_s3_bucket_public_access_block.site.block_public_policy && aws_s3_bucket_public_access_block.site.ignore_public_acls && aws_s3_bucket_public_access_block.site.restrict_public_buckets && !aws_s3_bucket.site.force_destroy
    error_message = "The company bucket must stay private and cannot force-delete its objects."
  }
  assert {
    condition     = aws_s3_bucket_versioning.site.versioning_configuration[0].status == "Enabled" && one(aws_s3_bucket_server_side_encryption_configuration.site.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    error_message = "Preserve versioning and encryption."
  }
  assert {
    condition     = jsondecode(aws_s3_bucket_policy.site.policy).Statement[0].Condition.StringEquals["AWS:SourceArn"] == aws_cloudfront_distribution.site.arn && jsondecode(aws_s3_bucket_policy.site.policy).Statement[1].Condition.Bool["aws:SecureTransport"] == "false"
    error_message = "Read access must be limited to the company distribution and TLS."
  }
  assert {
    condition = jsondecode(aws_iam_role.deploy.assume_role_policy).Statement == [{
      Effect    = "Allow"
      Principal = { Federated = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = { StringEquals = {
        "token.actions.githubusercontent.com:sub" = "repo:the3-inc@249383711/landing-page@1418165190:environment:production"
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
      } }
    }]
    error_message = "The deploy role must trust only this repository's production Environment and AWS audience."
  }
  assert {
    condition = jsondecode(aws_iam_role_policy.deploy.policy).Statement == [
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = "arn:aws:s3:::the3-company-test" },
      { Effect = "Allow", Action = ["s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"], Resource = "arn:aws:s3:::the3-company-test/*" },
      { Effect = "Allow", Action = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"], Resource = "arn:aws:cloudfront::123456789012:distribution/E123EXAMPLE" }
    ]
    error_message = "Release credentials may update only the company bucket and invalidate its distribution."
  }
  assert {
    condition     = aws_cloudfront_distribution.site.aliases == toset(["the3.co.jp"]) && length(aws_cloudfront_distribution.site.origin) == 1 && length(aws_cloudfront_distribution.site.ordered_cache_behavior) == 0
    error_message = "製品登録を無効にしている間は会社Originだけを維持する。"
  }
}

run "rejects_other_account_contract" {
  command = plan
  override_data {
    target = data.aws_ssm_parameter.foundation["aws-account-id"]
    values = { value = "999999999999" }
  }
  expect_failures = [data.aws_ssm_parameter.foundation["aws-account-id"]]
}

run "rejects_unrelated_oidc_provider" {
  command = plan
  override_data {
    target = data.aws_ssm_parameter.foundation["github-oidc-provider-arn"]
    values = { value = "arn:aws:iam::999999999999:oidc-provider/other.example.com" }
  }
  expect_failures = [data.aws_ssm_parameter.foundation["github-oidc-provider-arn"]]
}

run "publishes_edge_without_product_dependency" {
  command = plan
  assert {
    condition     = length(data.aws_ssm_parameter.schedula) == 0 && jsondecode(aws_ssm_parameter.edge.value).distribution_arn == "arn:aws:cloudfront::123456789012:distribution/E123EXAMPLE" && jsondecode(aws_ssm_parameter.edge.value).host == "the3.co.jp"
    error_message = "会社の初回planは製品契約を要求せず、接続先ARNだけを公開する。"
  }
}

run "registers_schedula_without_changing_company_pages" {
  command = plan
  variables { enable_schedula = true }
  override_data {
    target = data.aws_ssm_parameter.schedula[0]
    values = { value = "{\"schema_version\": 1, \"aws_account_id\": \"123456789012\", \"region\": \"ap-northeast-1\", \"static_origin_domain\": \"the3-schedula-demo-production-test.s3.ap-northeast-1.amazonaws.com\", \"function_url_domain\": \"example.lambda-url.ap-northeast-1.on.aws\", \"function_alias_arn\": \"arn:aws:lambda:ap-northeast-1:123456789012:function:the3-schedula-demo-production:live\"}" }
  }

  assert {
    condition     = length(aws_cloudfront_distribution.site.origin) == 3 && aws_cloudfront_distribution.site.default_cache_behavior[0].target_origin_id == "company-site" && length(aws_cloudfront_distribution.site.ordered_cache_behavior) == 8
    error_message = "会社のdefault経路を維持し、製品の二つの配信元と明示的な経路だけを追加する。"
  }
  assert {
    condition = alltrue([for behavior in aws_cloudfront_distribution.site.ordered_cache_behavior :
      startswith(behavior.path_pattern, "/products/schedula/") && (
        behavior.target_origin_id == "schedula-api" ? length(behavior.function_association) == 0 && contains(behavior.allowed_methods, "POST") : length(behavior.function_association) == 1 && !contains(behavior.allowed_methods, "POST")
    )])
    error_message = "APIをrewriteせず、静的経路にPOSTを許可しない。"
  }
  assert {
    condition     = alltrue([for behavior in aws_cloudfront_distribution.site.ordered_cache_behavior : behavior.cache_policy_id == (behavior.path_pattern == "/products/schedula/assets/*" ? "658327ea-f89d-4fab-a63d-7e88639e58f6" : "4135ea2d-6df8-44a3-9df3-4b5a84be39ad")]) && aws_cloudfront_origin_access_control.schedula_lambda[0].signing_behavior == "always" && one(aws_cloudfront_origin_request_policy.schedula_api[0].headers_config[0].headers).items == toset(["Content-Type", "Origin", "X-Amz-Content-Sha256", "X-Demo-Lesson"])
    error_message = "assets以外のcacheを無効にし、本文hashと教材IDを転送してOAC署名する。"
  }
  assert {
    condition     = aws_wafv2_web_acl.site[0].scope == "CLOUDFRONT" && aws_wafv2_web_acl.site[0].region == "us-east-1" && alltrue([for rule in aws_wafv2_web_acl.site[0].rule : rule.statement[0].rate_based_statement[0].scope_down_statement[0].byte_match_statement[0].search_string == "/products/schedula/api"])
    error_message = "WAFのrate制限はデモAPIに限定する。"
  }
}

run "rejects_schedula_aws_account_id" {
  command = plan
  variables { enable_schedula = true }
  override_data {
    target = data.aws_ssm_parameter.schedula[0]
    values = { value = "{\"schema_version\": 1, \"aws_account_id\": \"999999999999\", \"region\": \"ap-northeast-1\", \"static_origin_domain\": \"the3-schedula-demo-production-test.s3.ap-northeast-1.amazonaws.com\", \"function_url_domain\": \"example.lambda-url.ap-northeast-1.on.aws\", \"function_alias_arn\": \"arn:aws:lambda:ap-northeast-1:123456789012:function:the3-schedula-demo-production:live\"}" }
  }
  expect_failures = [data.aws_ssm_parameter.schedula[0]]
}

run "rejects_schedula_static_origin_domain" {
  command = plan
  variables { enable_schedula = true }
  override_data {
    target = data.aws_ssm_parameter.schedula[0]
    values = { value = "{\"schema_version\": 1, \"aws_account_id\": \"123456789012\", \"region\": \"ap-northeast-1\", \"static_origin_domain\": \"other.example.com\", \"function_url_domain\": \"example.lambda-url.ap-northeast-1.on.aws\", \"function_alias_arn\": \"arn:aws:lambda:ap-northeast-1:123456789012:function:the3-schedula-demo-production:live\"}" }
  }
  expect_failures = [data.aws_ssm_parameter.schedula[0]]
}

run "rejects_schedula_function_alias_arn" {
  command = plan
  variables { enable_schedula = true }
  override_data {
    target = data.aws_ssm_parameter.schedula[0]
    values = { value = "{\"schema_version\": 1, \"aws_account_id\": \"123456789012\", \"region\": \"ap-northeast-1\", \"static_origin_domain\": \"the3-schedula-demo-production-test.s3.ap-northeast-1.amazonaws.com\", \"function_url_domain\": \"example.lambda-url.ap-northeast-1.on.aws\", \"function_alias_arn\": \"arn:aws:lambda:ap-northeast-1:123456789012:function:other:live\"}" }
  }
  expect_failures = [data.aws_ssm_parameter.schedula[0]]
}

run "rejects_schedula_schema_version" {
  command = plan
  variables { enable_schedula = true }
  override_data {
    target = data.aws_ssm_parameter.schedula[0]
    values = { value = "{\"schema_version\": 2, \"aws_account_id\": \"123456789012\", \"region\": \"ap-northeast-1\", \"static_origin_domain\": \"the3-schedula-demo-production-test.s3.ap-northeast-1.amazonaws.com\", \"function_url_domain\": \"example.lambda-url.ap-northeast-1.on.aws\", \"function_alias_arn\": \"arn:aws:lambda:ap-northeast-1:123456789012:function:the3-schedula-demo-production:live\"}" }
  }
  expect_failures = [data.aws_ssm_parameter.schedula[0]]
}
