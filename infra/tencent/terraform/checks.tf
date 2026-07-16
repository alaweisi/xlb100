check "billable_resources_are_explicit" {
  assert {
    condition = !local.billable_create_requested || (
      var.enable_billable_resources &&
      var.billable_resources_acknowledgement == local.required_acknowledgement
    )
    error_message = "Managed resources require enable_billable_resources=true and the exact environment acknowledgement."
  }
}
check "cluster_source_is_explicit" {
  assert {
    condition     = var.create_tke_cluster != (var.existing_tke_cluster_id != "")
    error_message = "Select exactly one TKE source: create_tke_cluster=true or existing_tke_cluster_id."
  }
}

check "network_inputs_are_private_and_complete" {
  assert {
    condition = can(regex("^vpc-", var.vpc_id)) && (
      !var.create_node_pool || (
        length(var.subnet_ids) > 0 &&
        alltrue([for id in var.subnet_ids : can(regex("^subnet-", id))])
      )
    )
    error_message = "A real VPC ID and at least one private subnet ID are required for managed nodes."
  }
}

check "node_access_uses_ssh_keys" {
  assert {
    condition = !var.create_node_pool || (
      length(var.node_ssh_key_ids) > 0 &&
      alltrue([for id in var.node_ssh_key_ids : can(regex("^skey-", id))]) &&
      length(local.node_security_group_ids) > 0
    )
    error_message = "A managed node pool requires SSH key IDs and at least one node security group."
  }
}

check "node_capacity_is_ordered" {
  assert {
    condition = (
      var.node_pool_min_size >= 1 &&
      var.node_pool_desired_capacity >= var.node_pool_min_size &&
      var.node_pool_max_size >= var.node_pool_desired_capacity
    )
    error_message = "Node capacity must satisfy 1 <= min <= desired <= max."
  }
}

check "tcr_source_is_explicit" {
  assert {
    condition = !var.manage_tcr_repositories || (
      var.create_tcr_instance != (var.existing_tcr_instance_id != "")
    )
    error_message = "Managing TCR repositories requires exactly one TCR source: create or existing instance ID."
  }
}

check "cos_source_is_explicit" {
  assert {
    condition     = var.create_cos_bucket != (var.existing_cos_bucket_name != "")
    error_message = "Select exactly one COS source: create_cos_bucket=true or existing_cos_bucket_name."
  }
}

check "managed_cos_name_is_safe" {
  assert {
    condition = !var.create_cos_bucket || (
      can(regex("^[a-z0-9][a-z0-9-]{4,48}-[0-9]{5,20}$", var.cos_bucket_name)) &&
      !can(regex("example|replace|placeholder", var.cos_bucket_name))
    )
    error_message = "cos_bucket_name must be a real globally unique private bucket name ending in the app ID."
  }
}

check "production_dependencies_are_frozen" {
  assert {
    condition = var.environment != "production" || (
      var.deletion_protection &&
      var.mysql_instance_id != "" &&
      var.mysql_internal_host != "" &&
      var.redis_instance_id != "" &&
      var.redis_internal_host != "" &&
      var.runtime_secret_name != "" &&
      local.tcr_instance_id != "" &&
      local.cos_bucket_name != ""
    )
    error_message = "Production requires deletion protection plus explicit MySQL, Redis, Secret, TCR, and COS dependencies."
  }
}
