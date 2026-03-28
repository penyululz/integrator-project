terraform {
  required_version = ">= 1.5.0"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.20.0"
    }
  }
}

variable "namespace" {
  type    = string
  default = "integration-platform"
}

resource "kubernetes_namespace" "integration_platform" {
  metadata {
    name = var.namespace
  }
}

