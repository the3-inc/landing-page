mock_provider "aws" {
  override_during = plan
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }
}

override_data {
  target = data.aws_route53_zone.company
  values = {
    name         = "the3.co.jp."
    private_zone = false
    zone_id      = "Z0123456789EXAMPLE"
  }
}

variables {
  aws_account_id = "123456789012"
  hosted_zone_id = "Z0123456789EXAMPLE"
}

run "publishes_only_shared_identifiers" {
  command = plan
  assert {
    condition     = length(aws_ssm_parameter.contract) == 3 && alltrue([for parameter in aws_ssm_parameter.contract : parameter.type == "String"])
    error_message = "The v1 contract must publish exactly three non-secret identifiers."
  }
  assert {
    condition     = aws_ssm_parameter.contract["github-oidc-provider-arn"].insecure_value == aws_iam_openid_connect_provider.github.arn && aws_ssm_parameter.contract["hosted-zone-id"].insecure_value == var.hosted_zone_id
    error_message = "Consumers must receive the foundation-owned OIDC ARN and existing zone ID."
  }
  assert {
    condition     = aws_ssm_parameter.contract["aws-account-id"].name == "/the3/production/foundation/v1/aws-account-id" && aws_ssm_parameter.contract["aws-account-id"].insecure_value == var.aws_account_id
    error_message = "Publish account provenance at the versioned contract path."
  }
}

run "rejects_invalid_account" {
  command = plan
  variables {
    aws_account_id = "not-an-account"
  }
  expect_failures = [var.aws_account_id]
}

run "rejects_other_domain" {
  command = plan
  override_data {
    target = data.aws_route53_zone.company
    values = {
      name         = "example.com."
      private_zone = false
    }
  }
  expect_failures = [data.aws_route53_zone.company]
}
