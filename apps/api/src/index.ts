import { runMigrations } from "./db/database.js";
import { createApiApp, loadEnvironment } from "./app.js";

loadEnvironment();

console.log("TINYFISH_API_KEY loaded:", Boolean(process.env.TINYFISH_API_KEY));
console.log("TINYFISH_FORCE_MOCK:", process.env.TINYFISH_FORCE_MOCK);

runMigrations();

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const { app, configuredOrigins, isProduction } = createApiApp();

app.listen(port, () => {
  console.log(
    `[tinyfish-demo] api listening on port ${port} | env=${process.env.NODE_ENV ?? "development"} | cors=${
      configuredOrigins.length > 0
        ? configuredOrigins.join(",")
        : isProduction
          ? "same-origin only"
          : "same-origin + localhost dev origins"
    }`,
  );
});
