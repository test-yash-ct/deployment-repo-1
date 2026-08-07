# Webhook Service Deployment Guide

## Security Hardening & Scalability Updates

This document outlines the deployment requirements for the hardened and scalable webhook service.

## Pre-Deployment Checklist

### 1. Kubernetes Secrets Creation

Before deploying, create the required secrets in the `payments` namespace:

```bash
# Create webhook signing key secret (minimum 32 characters, cryptographically random)
kubectl create secret generic webhook-secrets \
  --from-literal=signing-key="$(openssl rand -hex 32)" \
  -n payments

# Verify the secret was created
kubectl describe secret webhook-secrets -n payments
```

**CRITICAL**: The signing key must be:
- At least 32 characters long
- Cryptographically random (use `openssl rand -hex 32` or similar)
- Different for each environment (dev, staging, prod)
- Rotated regularly (quarterly recommended)

### 2. TLS Certificate Configuration

If using self-signed internal certificates, configure the CA certificate:

```bash
# Create ConfigMap with internal CA certificate
kubectl create configmap internal-ca-certs \
  --from-file=ca.crt=/path/to/internal-ca.crt \
  -n payments
```

Then update webhook-service.yaml to mount and use it:
```yaml
env:
  - name: NODE_EXTRA_CA_CERTS
    value: /etc/ssl/certs/ca.crt
volumeMounts:
  - name: ca-certs
    mountPath: /etc/ssl/certs
volumes:
  - name: ca-certs
    configMap:
      name: internal-ca-certs
```

### 3. Database Initialization

The webhook service automatically creates required tables on startup:

**Tables created:**
- `delivery_attempts` - Webhook delivery audit log (append-only)
  - Columns: id, merchant_id, target_url, status_code, signature_verified, verification_error, idempotency_key, attempt_number, correlation_id, created_at, updated_at
  - Indexes: merchant_id + created_at, idempotency_key

- `merchant_endpoints` - Merchant-specific callback URL allowlist
  - Columns: id, merchant_id, endpoint_url, created_at

### 4. Environment Configuration

**Removed insecure settings:**
- `NODE_TLS_REJECT_UNAUTHORIZED: "0"` - **REMOVED** (enables TLS verification)
- TLS now required for all external connections

**New settings:**
- `LOG_LEVEL: "info"` - Structured logging
- `WEBHOOK_SIGNING_KEY` - Loaded from Secret (not ConfigMap)
- `NODE_EXTRA_CA_CERTS` - For internal CA certificates (if needed)

### 5. Deployment Verification

After deployment, verify:

```bash
# Check pod is running
kubectl get pods -n payments -l app=webhook-service

# Check logs for startup
kubectl logs -n payments -l app=webhook-service

# Test health endpoint
kubectl port-forward svc/webhook-service 3003:3003 -n payments
curl http://localhost:3003/health

# Expected response: {"status":"ok","service":"webhook-service"}
```

## Security Features Implemented

### HMAC-SHA256 Signature Verification

- **Header**: `X-Signature` (hex-encoded SHA256-HMAC of raw request body)
- **Algorithm**: HMAC-SHA256 with timing-safe comparison
- **Validation**: Signature format validated (64 hex characters)
- **Failure**: Returns 401 Unauthorized

Example client implementation:
```javascript
const crypto = require('crypto');
const body = JSON.stringify(payload);
const signature = crypto
  .createHmac('sha256', WEBHOOK_SIGNING_KEY)
  .update(body)
  .digest('hex');

fetch('https://api.example.com/v1/ingest/processor', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Signature': signature,
    'X-Idempotency-Key': crypto.randomUUID(),
  },
  body,
});
```

### SSRF Protection

- **Blocked patterns**: Private IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16)
- **Blocked hostnames**: localhost, *.local, metadata endpoints
- **Blocked IPv6**: ::1, fe80::, fc00::, fd00::
- **Validation**: URL protocol must be http: or https: (https: required in production)
- **Max redirects**: Disabled (0) to prevent redirect-based SSRF

### Idempotency Support

- **Header**: `X-Idempotency-Key` (UUID format)
- **Behavior**: Duplicate requests within TTL return cached result
- **State validation**: Requires signature verification before accepting cached result
- **Scope**: Per merchant + endpoint

Example:
```bash
curl -X POST http://localhost:3003/v1/ingest/processor \
  -H "Content-Type: application/json" \
  -H "X-Signature: <signature>" \
  -H "X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{"type": "event.processed"}'

# Subsequent requests with same key return 202 (idempotent)
```

### Exponential Backoff Retries

- **Max attempts**: 3
- **Backoff**: 100ms * 2^attempt + jitter (0-100ms)
- **Per-attempt timeout**: 8 seconds
- **Total timeout**: 15 seconds

### Container Security

- **User**: Non-root (UID 1000)
- **Filesystem**: Read-only root filesystem with emptyDir /tmp
- **Capabilities**: ALL dropped
- **Privileged mode**: DISABLED
- **Host mounts**: REMOVED (docker.sock, /var/log)

### Observability

- **Correlation ID**: `X-Correlation-ID` header (generated if not provided)
- **Health check**: `GET /health` (returns 503 if database unavailable)
- **Audit log**: All delivery attempts recorded in database
- **Graceful shutdown**: SIGTERM/SIGINT handled with 10-second drain timeout

## Operational Notes

### Secret Rotation

To rotate webhook signing keys:

1. Create new secret with rotated key
2. Update deployment to reference new secret
3. Maintain old key for 30 days for client grace period
4. Clients must update their signing key

### Monitoring

Monitor these metrics:

- **HTTP error rate**: >5% suggests misconfigured merchant endpoints
- **Database connection pool**: Should not exceed 20 connections
- **Pod restart rate**: Should be 0 (indicates crashes)
- **Delivery success rate**: Target >99%

### Troubleshooting

**Pod won't start:**
- Check secret exists: `kubectl get secret webhook-secrets -n payments`
- Check database connectivity: `kubectl logs -n payments <pod-name>`
- Check TLS certificates: Verify NODE_EXTRA_CA_CERTS if configured

**Signature verification failures:**
- Verify client is using raw request body (not parsed JSON re-stringified)
- Verify signature format is lowercase hex
- Verify signing key matches server configuration

**SSRF errors:**
- Check merchant callback URL is public-facing (not localhost, 127.0.0.1, or private IP)
- Verify URL uses HTTPS in production
- Check no DNS rebinding attacks (external DNS lookup attacks)

## Database Migration Notes

This deployment adds new columns to `delivery_attempts` table:
- `merchant_id`, `signature_verified`, `verification_error`, `idempotency_key`, `attempt_number`, `correlation_id`, `updated_at`

Existing data will have NULL values for these columns (safe, backward compatible).

New indexes are created for efficient querying by merchant and idempotency key.

## Network Policies

Apply the included NetworkPolicy to restrict:
- **Ingress**: Only from api-gateway in payments namespace
- **Egress**: PostgreSQL (5432), HTTPS (443), DNS (53)

```bash
kubectl apply -f k8s/webhook-service-network-policy.yaml
```
