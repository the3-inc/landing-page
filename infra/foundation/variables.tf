variable "aws_account_id" {
  description = "Expected AWS account; the provider rejects other accounts."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account ID."
  }
}

variable "hosted_zone_id" {
  description = "Existing authoritative public hosted zone for the3.co.jp; this root does not own the zone."
  type        = string
  validation {
    condition     = can(regex("^Z[A-Z0-9]+$", var.hosted_zone_id))
    error_message = "Use a hosted zone ID without the /hostedzone/ prefix."
  }
}
