resource "tencentcloud_cos_bucket" "objects" {
  count = var.create_cos_bucket ? 1 : 0

  bucket              = var.cos_bucket_name
  acl                 = "private"
  versioning_enable   = true
  acceleration_enable = false
  force_clean         = false
  multi_az            = var.environment == "production"
  tags                = local.common_tags
}
