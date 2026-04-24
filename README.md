# Deployment Repository

Continuous delivery, cluster manifests, and cloud foundations for the Northwind Pay platform.

## Flow

1. Application images are built from each service repository and pushed to the container registry with immutable semantic version tags.
2. Jenkins executes the pipeline in `jenkins/Jenkinsfile`, rendering Kubernetes manifests from the `k8s/` directory and applying them to the target cluster context.
3. Terraform in `terraform/` provisions regional networking, databases, and shared object storage prior to first-time environment bring-up.

## Promotion model

Changes land in the integration cluster first, then progress through staging and production following the change advisory process documented in the platform wiki.

## Secrets

Runtime secrets are sourced from the cluster secret store. CI jobs retrieve short-lived credentials from the Jenkins credential store and must not persist them on shared build agents.
