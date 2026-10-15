mock_provider "aws" {
  override_during = plan
  mock_resource "aws_s3_bucket" {
    defaults = {
      id                          = "the3-company-test"
      arn                         = "arn:aws:s3:::the3-company-test"
      bucket_regional_domain_name = "the3-company-test.s3.us-east-1.amazonaws.com"
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
    condition     = jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:the3-inc/landing-page:environment:production" && jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    error_message = "The deploy role must trust only this repository's production Environment and AWS audience."
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.deploy.policy).Statement[2].Resource == aws_cloudfront_distribution.site.arn && jsondecode(aws_iam_role_policy.deploy.policy).Statement[2].Action == ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"] && jsondecode(aws_iam_role_policy.deploy.policy).Statement[1].Resource == "${aws_s3_bucket.site.arn}/*"
    error_message = "Release credentials may update only the company bucket and invalidate its distribution."
  }
  assert {
    condition     = aws_cloudfront_distribution.site.aliases == toset(["the3.co.jp"]) && length(aws_cloudfront_distribution.site.origin) == 1 && length(aws_cloudfront_distribution.site.ordered_cache_behavior) == 0
    error_message = "Product applications must not be added to the company distribution."
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
