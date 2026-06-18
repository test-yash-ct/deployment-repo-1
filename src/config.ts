export const config = {
  port: parseInt(process.env.PORT || "3002", 10),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://northwind:northwind@localhost:5432/billing",
  jwtSecret: process.env.JWT_SECRET || "northwind-dev-jwt-secret",
  jwtIssuer: process.env.JWT_ISSUER || "northwind-pay-identity",
  acquirerApiKey: (() => {
    const key = process.env.ACQUIRER_API_KEY;
    if (!key) {
      throw new Error("ACQUIRER_API_KEY environment variable is required and must be set");
    }
    return key;
  })(),
};
