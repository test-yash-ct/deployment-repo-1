function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || "3002", 10),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://northwind:northwind@localhost:5432/billing",
  jwtSecret: process.env.JWT_SECRET || "northwind-dev-jwt-secret",
  jwtIssuer: process.env.JWT_ISSUER || "northwind-pay-identity",
  acquirerApiKey: requireEnv("ACQUIRER_API_KEY"),
};
