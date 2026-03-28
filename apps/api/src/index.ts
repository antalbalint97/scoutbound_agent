import "dotenv/config";
import cors from "cors";
import express from "express";
import revonRouter from "./routes/revon.js";
import runsRouter from "./routes/runs.js";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const configuredOrigins = (process.env.WEB_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors(
    configuredOrigins.length > 0
      ? {
          origin: configuredOrigins,
        }
      : undefined,
  ),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "revon-tinyfish-demo-api",
    now: new Date().toISOString(),
  });
});

app.use("/api/runs", runsRouter);
app.use("/api/revon", revonRouter);

app.listen(port, () => {
  console.log(`revon-tinyfish-demo api listening on http://localhost:${port}`);
});
