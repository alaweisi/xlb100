resource "tencentcloud_tcr_instance" "xlb" {
  count = var.create_tcr_instance ? 1 : 0

  name                  = "${local.resource_prefix}-tcr"
  instance_type         = var.tcr_instance_type
  registry_charge_type  = 1
  open_public_operation = false
  deletion_protection   = var.deletion_protection
  delete_bucket         = false
  enable_cos_versioning = true
  tags                  = local.common_tags
}
resource "tencentcloud_tcr_namespace" "xlb" {
  count = var.manage_tcr_repositories ? 1 : 0

  instance_id    = local.tcr_instance_id
  name           = var.tcr_namespace
  is_public      = false
  is_auto_scan   = true
  is_prevent_vul = true
  severity       = "high"
  tags           = local.common_tags
}

resource "tencentcloud_tcr_repository" "xlb" {
  for_each = var.manage_tcr_repositories ? local.tcr_repositories : toset([])

  instance_id    = local.tcr_instance_id
  namespace_name = tencentcloud_tcr_namespace.xlb[0].name
  name           = each.value
  brief_desc     = "XLB ${each.value} image"
  description    = "Private immutable images for XLB ${var.environment} ${each.value}"
  force_delete   = false
}
