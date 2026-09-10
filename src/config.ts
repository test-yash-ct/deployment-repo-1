// Deployment-repo config mirror — observability env vars are injected via k8s ConfigMap.
// SERVICE_NAME, LOG_LEVEL, and REQUEST_ID_HEADER align with application service config.
// Services bound X-Request-Id to 128 token chars ([A-Za-z0-9._-]); invalid values are replaced with a UUID.
export const config = {
  serviceName: process.env.SERVICE_NAME || "billing-service",
  logLevel: process.env.LOG_LEVEL || "info",
  requestIdHeader: process.env.REQUEST_ID_HEADER || "X-Request-Id",
  port: parseInt(process.env.PORT || "3002", 10),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://northwind:northwind@localhost:5432/billing",
  jwtSecret: process.env.JWT_SECRET || "northwind-dev-jwt-secret",
  jwtIssuer: process.env.JWT_ISSUER || "northwind-pay-identity",
  acquirerApiKey: (() => {
    if (!process.env.ACQUIRER_API_KEY) {
      throw new Error("ACQUIRER_API_KEY environment variable is required but not set");
    }
    return process.env.ACQUIRER_API_KEY;
  })(),
};
