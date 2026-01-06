variable "admin_email" {
  description = "Email for the initial admin user (create a terraform.tfvars file in the same directory as this file to not get asked every time)"
  type        = string
}

variable "admin_name" {
  description = "Full name for the initial admin user (create a terraform.tfvars file in the same directory as this file to not get asked every time)"
  type        = string
}

variable "admin_password" {
  description = "Initial password for the admin user (create a terraform.tfvars file to not get asked every time)"
  type        = string
  sensitive   = true
}
