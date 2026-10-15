output "github_oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}

output "contract_parameters" {
  value = { for key, parameter in aws_ssm_parameter.contract : key => parameter.name }
}
