output "environment" {
  value = var.environment
}
output "region" {
  value = var.region
}

output "tke_cluster_id" {
  value = local.cluster_id
}

output "tke_node_pool_id" {
  value = try(tencentcloud_kubernetes_node_pool.xlb[0].id, null)
}

output "tcr_instance_id" {
  value = local.tcr_instance_id
}

output "tcr_internal_endpoint" {
  value = var.create_tcr_instance ? tencentcloud_tcr_instance.xlb[0].internal_end_point : var.existing_tcr_internal_endpoint
}

output "tcr_repository_urls" {
  value = {
    for name, repository in tencentcloud_tcr_repository.xlb : name => repository.url
  }
}

output "cos_bucket_name" {
  value = local.cos_bucket_name
}

output "application_dependency_contract" {
  description = "Non-secret values consumed by the future environment-values generation step."
  value = {
    mysql = {
      instance_id = var.mysql_instance_id
      host        = var.mysql_internal_host
      port        = var.mysql_port
    }
    redis = {
      instance_id = var.redis_instance_id
      host        = var.redis_internal_host
      port        = var.redis_port
    }
    object_storage = {
      provider = "cos"
      bucket   = local.cos_bucket_name
      region   = var.region
    }
    runtime_secret_name = var.runtime_secret_name
  }
}

output "billable_resource_summary" {
  value = {
    creates_tke_cluster = var.create_tke_cluster
    creates_node_pool   = var.create_node_pool
    creates_tcr         = var.create_tcr_instance
    manages_tcr_repos   = var.manage_tcr_repositories
    creates_cos         = var.create_cos_bucket
  }
}
