mock_provider "tencentcloud" {
  override_during = plan

  mock_resource "tencentcloud_kubernetes_cluster" {
    defaults = {
      id = "cls-mocked"
    }
  }

  mock_resource "tencentcloud_kubernetes_node_pool" {
    defaults = {
      id = "cls-mocked#np-mocked"
    }
  }

  mock_resource "tencentcloud_tcr_instance" {
    defaults = {
      id                 = "tcr-mocked"
      internal_end_point = "mock.internal.tencentcloudcr.com"
    }
  }

  mock_resource "tencentcloud_cos_bucket" {
    defaults = {
      id     = "xlb-staging-objects-1250000000"
      bucket = "xlb-staging-objects-1250000000"
    }
  }
}

run "staging_managed_resources_plan" {
  command = plan

  variables {
    environment                        = "staging"
    region                             = "ap-guangzhou"
    enable_billable_resources          = true
    billable_resources_acknowledgement = "CREATE-TKE-STAGING"
    create_tke_cluster                 = true
    vpc_id                             = "vpc-mocked"
    vpc_cidr                           = "10.0.0.0/16"
    subnet_ids                         = ["subnet-mocked-a", "subnet-mocked-b"]
    cluster_version                    = "1.32.2"
    pod_cidr                           = "172.20.0.0/16"
    service_cidr                       = "172.21.0.0/20"
    create_node_pool                   = true
    node_instance_type                 = "SA5.MEDIUM4"
    node_ssh_key_ids                   = ["skey-mocked"]
    create_tcr_instance                = true
    manage_tcr_repositories            = true
    create_cos_bucket                  = true
    cos_bucket_name                    = "xlb-staging-objects-1250000000"
  }

  assert {
    condition     = output.tke_cluster_id == "cls-mocked"
    error_message = "Managed TKE output must use the created cluster."
  }

  assert {
    condition     = output.billable_resource_summary.creates_node_pool
    error_message = "The billable-resource summary must expose node-pool creation."
  }
}

run "production_existing_resources_plan" {
  command = plan

  variables {
    environment                    = "production"
    region                         = "ap-guangzhou"
    deletion_protection            = true
    create_tke_cluster             = false
    existing_tke_cluster_id        = "cls-existing"
    vpc_id                         = "vpc-existing"
    vpc_cidr                       = "10.10.0.0/16"
    cluster_version                = "1.32.2"
    pod_cidr                       = "172.24.0.0/16"
    service_cidr                   = "172.25.0.0/20"
    node_instance_type             = "SA5.MEDIUM4"
    create_tcr_instance            = false
    existing_tcr_instance_id       = "tcr-existing"
    existing_tcr_internal_endpoint = "existing.internal.tencentcloudcr.com"
    manage_tcr_repositories        = false
    create_cos_bucket              = false
    existing_cos_bucket_name       = "xlb-production-objects-1250000000"
    mysql_instance_id              = "cdb-existing"
    mysql_internal_host            = "10.10.10.10"
    redis_instance_id              = "crs-existing"
    redis_internal_host            = "10.10.20.20"
    runtime_secret_name            = "xlb-production-runtime-secrets"
  }

  assert {
    condition     = output.tke_cluster_id == "cls-existing"
    error_message = "Existing-resource mode must preserve the approved cluster ID."
  }

  assert {
    condition     = output.application_dependency_contract.object_storage.provider == "cos"
    error_message = "Production application contract must select COS."
  }
}

run "reject_unacknowledged_billable_plan" {
  command = plan

  variables {
    environment              = "staging"
    region                   = "ap-guangzhou"
    create_tke_cluster       = true
    vpc_id                   = "vpc-mocked"
    vpc_cidr                 = "10.0.0.0/16"
    cluster_version          = "1.32.2"
    pod_cidr                 = "172.20.0.0/16"
    service_cidr             = "172.21.0.0/20"
    node_instance_type       = "SA5.MEDIUM4"
    create_cos_bucket        = false
    existing_cos_bucket_name = "xlb-staging-objects-1250000000"
  }

  expect_failures = [check.billable_resources_are_explicit]
}
