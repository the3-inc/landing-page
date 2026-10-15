data "aws_route53_zone" "company" {
  zone_id      = var.hosted_zone_id
  private_zone = false
  lifecycle {
    postcondition {
      condition     = trimsuffix(self.name, ".") == "the3.co.jp" && !self.private_zone
      error_message = "Select the public hosted zone for the3.co.jp. Verify its authoritative NS delegation before applying."
    }
  }
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  lifecycle {
    prevent_destroy = true
  }
}

locals {
  contract = {
    "aws-account-id"           = var.aws_account_id
    "hosted-zone-id"           = data.aws_route53_zone.company.zone_id
    "github-oidc-provider-arn" = aws_iam_openid_connect_provider.github.arn
  }
}

resource "aws_ssm_parameter" "contract" {
  for_each       = local.contract
  name           = "/the3/production/foundation/v1/${each.key}"
  description    = "Public infrastructure identifier for independent company and product roots."
  type           = "String"
  insecure_value = each.value
  lifecycle {
    prevent_destroy = true
  }
}
