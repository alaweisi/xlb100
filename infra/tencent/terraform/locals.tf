locals {
  resource_prefix = "${var.project_name}-${var.environment}"
  billable_create_requested = anytrue([
    var.create_tke_cluster,
    var.create_node_pool,
    var.create_tcr_instance,
    var.manage_tcr_repositories,
    var.create_cos_bucket,
  ])
  required_acknowledgement = "CREATE-TKE-${upper(var.environment)}"
  common_tags = merge(
    {
      application = var.project_name
      environment = var.environment
      managed-by  = "terraform"
      repository  = "xlb100"
    },
    var.tags,
  )

  cluster_id                      = var.create_tke_cluster ? tencentcloud_kubernetes_cluster.xlb[0].id : var.existing_tke_cluster_id
  tcr_instance_id                 = var.create_tcr_instance ? tencentcloud_tcr_instance.xlb[0].id : var.existing_tcr_instance_id
  cos_bucket_name                 = var.create_cos_bucket ? tencentcloud_cos_bucket.objects[0].bucket : var.existing_cos_bucket_name
  managed_node_security_group_ids = length(tencentcloud_security_group.tke_nodes) > 0 ? [tencentcloud_security_group.tke_nodes[0].id] : []
  node_security_group_ids         = concat(local.managed_node_security_group_ids, var.existing_node_security_group_ids)
  tcr_repositories                = toset(["backend", "customer", "worker", "admin", "oa", "dashboard"])
}
