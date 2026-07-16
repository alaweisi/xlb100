resource "tencentcloud_security_group" "tke_nodes" {
  count = var.create_node_pool && var.create_node_security_group ? 1 : 0

  name        = "${local.resource_prefix}-tke-nodes"
  description = "Private worker nodes for ${local.resource_prefix}; managed by Terraform"
  tags        = local.common_tags
}

resource "tencentcloud_security_group_rule_set" "tke_nodes" {
  count = var.create_node_pool && var.create_node_security_group ? 1 : 0

  security_group_id = tencentcloud_security_group.tke_nodes[0].id

  dynamic "ingress" {
    for_each = [var.vpc_cidr, var.pod_cidr, var.service_cidr]
    content {
      action      = "ACCEPT"
      cidr_block  = ingress.value
      protocol    = "ALL"
      port        = "ALL"
      description = "Allow reviewed XLB private network"
    }
  }

  ingress {
    action      = "DROP"
    cidr_block  = "0.0.0.0/0"
    protocol    = "ALL"
    port        = "ALL"
    description = "Default deny ingress"
  }

  egress {
    action      = "ACCEPT"
    cidr_block  = "0.0.0.0/0"
    protocol    = "ALL"
    port        = "ALL"
    description = "Allow required package, registry, and managed-service egress"
  }
}

resource "tencentcloud_kubernetes_cluster" "xlb" {
  count = var.create_tke_cluster ? 1 : 0

  cluster_name               = "${local.resource_prefix}-tke"
  cluster_desc               = "XLB ${var.environment} managed cluster"
  cluster_deploy_type        = "MANAGED_CLUSTER"
  cluster_level              = var.cluster_level
  auto_upgrade_cluster_level = false
  cluster_version            = var.cluster_version
  container_runtime          = "containerd"
  cluster_os                 = var.cluster_os
  cluster_os_type            = "GENERAL"
  vpc_id                     = var.vpc_id
  network_type               = var.cluster_network_type
  cluster_cidr               = var.pod_cidr
  service_cidr               = var.service_cidr
  cluster_max_pod_num        = 64
  cluster_max_service_num    = 256
  cluster_internet           = false
  deletion_protection        = var.deletion_protection
  tags                       = local.common_tags
}

resource "tencentcloud_kubernetes_node_pool" "xlb" {
  count = var.create_node_pool ? 1 : 0

  name                     = "${local.resource_prefix}-pool"
  cluster_id               = local.cluster_id
  vpc_id                   = var.vpc_id
  subnet_ids               = var.subnet_ids
  min_size                 = var.node_pool_min_size
  desired_capacity         = var.node_pool_desired_capacity
  max_size                 = var.node_pool_max_size
  enable_auto_scale        = var.node_pool_enable_autoscaling
  multi_zone_subnet_policy = "EQUALITY"
  retry_policy             = "INCREMENTAL_INTERVALS"
  node_os_type             = "GENERAL"
  node_os                  = var.cluster_os
  deletion_protection      = var.deletion_protection
  delete_keep_instance     = true
  labels = {
    "xlb.openai.com/environment" = var.environment
    "xlb.openai.com/pool"        = "general"
  }

  auto_scaling_config {
    instance_type              = var.node_instance_type
    instance_charge_type       = "POSTPAID_BY_HOUR"
    system_disk_type           = var.node_system_disk_type
    system_disk_size           = var.node_system_disk_size
    key_ids                    = var.node_ssh_key_ids
    orderly_security_group_ids = local.node_security_group_ids
    public_ip_assigned         = false
    internet_max_bandwidth_out = 0
    enhanced_monitor_service   = true
    enhanced_security_service  = true
    instance_name              = "${local.resource_prefix}-node"
    instance_name_style        = "UNIQUE"
    host_name                  = "${local.resource_prefix}-node"
    host_name_style            = "UNIQUE"
  }

  depends_on = [tencentcloud_security_group_rule_set.tke_nodes]
}
