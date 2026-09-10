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

## Observability configuration

All payment platform services share request-correlation settings via the `northwind-platform-env` ConfigMap (`k8s/config-env.yaml`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `LOG_LEVEL` | `info` | Minimum structured log level |
| `REQUEST_ID_HEADER` | `X-Request-Id` | Correlation header name |

Each service deployment sets `SERVICE_NAME` explicitly and exposes `/health` and `/ready` probes that return `requestId` in the JSON body. Pod labels and annotations `platform.northwindpay.io/observability=request-correlation` identify workloads participating in the correlation scheme.

## Layered application architecture

Runtime services (`billing-service`, `identity-service`, `webhook-service`) use three layers:

1. **HTTP** — Express routes and middleware (JWT or HMAC, request-id, status mapping).
2. **Domain** — ownership, idempotency, credential verification, ingest/dispatch rules (`ARCHITECTURE_LAYER=domain`).
3. **Persistence** — parameterized PostgreSQL access and append-only audit rows.

This repository does not re-implement those domain modules. Manifests stay aligned with `platform.northwindpay.io/architecture-layer=domain`.

## Cross-service event contract (v1)

Platform events share this envelope (`EVENT_CONTRACT_VERSION=v1`):

| Field | Meaning |
|-------|---------|
| `eventType` | Bounded token, e.g. `payment.captured`, `identity.login_success` |
| `sourceService` | `billing-service`, `identity-service`, or `webhook-service` |
| `occurredAt` | Server clock, ISO-8601 |
| `requestId` | Same value as `X-Request-Id` |
| `payload` | Non-PII identifiers only |

Billing emits `payment.captured` after a successful capture; webhook ingest accepts that envelope after HMAC verification. Inter-service calls are not opened without existing JWT/HMAC controls.
