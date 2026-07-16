variable "project_name" {
  description = "Short project identifier used in resource names and tags."
  type        = string
  default     = "xlb"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,18}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-20 lowercase letters, digits, or hyphens."
  }
}
variable "environment" {
  description = "Cloud environment represented by this state."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "region" {
  description = "Tencent Cloud region, for example ap-guangzhou."
  type        = string

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z0-9-]+$", var.region))
    error_message = "region must be a Tencent Cloud region identifier."
  }
}

variable "tags" {
  description = "Additional non-secret Tencent Cloud tags."
  type        = map(string)
  default     = {}
}

variable "enable_billable_resources" {
  description = "Explicit acknowledgement that this configuration contains resources which can incur charges."
  type        = bool
  default     = false
}

variable "billable_resources_acknowledgement" {
  description = "Must equal CREATE-TKE-STAGING or CREATE-TKE-PRODUCTION when any managed resource is enabled."
  type        = string
  default     = ""
}

variable "deletion_protection" {
  description = "Enable supported Tencent Cloud deletion-protection controls."
  type        = bool
  default     = true
}

variable "create_tke_cluster" {
  type    = bool
  default = false
}

variable "existing_tke_cluster_id" {
  description = "Existing TKE cluster ID when create_tke_cluster is false."
  type        = string
  default     = ""
}

variable "vpc_id" {
  description = "Existing VPC ID selected after network review."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR of the existing VPC, used only to build node security-group rules."
  type        = string
}

variable "subnet_ids" {
  description = "Existing private subnet IDs for the node pool, preferably in at least two availability zones."
  type        = list(string)
  default     = []
}

variable "cluster_version" {
  description = "TKE-supported Kubernetes version frozen for this environment."
  type        = string
}

variable "cluster_level" {
  description = "TKE managed-control-plane level."
  type        = string
  default     = "L5"
}

variable "cluster_network_type" {
  description = "TKE cluster network mode."
  type        = string
  default     = "CiliumOverlay"

  validation {
    condition     = contains(["GR", "VPC-CNI", "CiliumOverlay"], var.cluster_network_type)
    error_message = "cluster_network_type must be GR, VPC-CNI, or CiliumOverlay."
  }
}

variable "pod_cidr" {
  description = "Non-overlapping Pod CIDR."
  type        = string
}

variable "service_cidr" {
  description = "Non-overlapping Kubernetes Service CIDR."
  type        = string
}

variable "cluster_os" {
  description = "TKE-supported public OS name."
  type        = string
  default     = "tlinux4_x86_64"
}

variable "create_node_pool" {
  type    = bool
  default = false
}

variable "create_node_security_group" {
  type    = bool
  default = true
}

variable "existing_node_security_group_ids" {
  type    = list(string)
  default = []
}

variable "node_instance_type" {
  description = "CVM instance type verified as available in every selected subnet."
  type        = string
}

variable "node_ssh_key_ids" {
  description = "Tencent Cloud SSH key IDs. Password-based node access is not supported by this module."
  type        = list(string)
  default     = []
}

variable "node_pool_min_size" {
  type    = number
  default = 2
}

variable "node_pool_desired_capacity" {
  type    = number
  default = 2
}

variable "node_pool_max_size" {
  type    = number
  default = 6
}

variable "node_pool_enable_autoscaling" {
  type    = bool
  default = false
}

variable "node_system_disk_type" {
  type    = string
  default = "CLOUD_PREMIUM"
}

variable "node_system_disk_size" {
  type    = number
  default = 100
}

variable "create_tcr_instance" {
  type    = bool
  default = false
}

variable "existing_tcr_instance_id" {
  type    = string
  default = ""
}

variable "existing_tcr_internal_endpoint" {
  description = "Internal TCR endpoint when referencing an existing instance."
  type        = string
  default     = ""
}

variable "tcr_instance_type" {
  type    = string
  default = "basic"

  validation {
    condition     = contains(["basic", "standard", "premium"], var.tcr_instance_type)
    error_message = "tcr_instance_type must be basic, standard, or premium."
  }
}

variable "manage_tcr_repositories" {
  description = "Manage the private xlb namespace and four application repositories in the selected TCR instance."
  type        = bool
  default     = false
}

variable "tcr_namespace" {
  type    = string
  default = "xlb"
}

variable "create_cos_bucket" {
  type    = bool
  default = false
}

variable "cos_bucket_name" {
  description = "Full globally unique bucket name, including the Tencent Cloud app ID suffix."
  type        = string
  default     = ""
}

variable "existing_cos_bucket_name" {
  type    = string
  default = ""
}

variable "mysql_instance_id" {
  description = "Existing TencentDB for MySQL instance ID; this module does not create production databases."
  type        = string
  default     = ""
}

variable "mysql_internal_host" {
  description = "Private MySQL endpoint consumed later by Helm values."
  type        = string
  default     = ""
}

variable "mysql_port" {
  type    = number
  default = 3306
}

variable "redis_instance_id" {
  description = "Existing TencentDB for Redis instance ID; this module does not create production caches."
  type        = string
  default     = ""
}

variable "redis_internal_host" {
  description = "Private Redis endpoint consumed later by Helm values."
  type        = string
  default     = ""
}

variable "redis_port" {
  type    = number
  default = 6379
}

variable "runtime_secret_name" {
  description = "Name of the pre-created Kubernetes Secret referenced by the future Helm release."
  type        = string
  default     = ""
}
