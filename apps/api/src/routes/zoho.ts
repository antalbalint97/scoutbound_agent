import { Router, type Request, type Response } from "express";
import { getZohoAdapterStatus, testZohoConnection } from "../integrations/zoho/client.js";

const router = Router();

router.get("/status", (_request: Request, response: Response) => {
  response.json(getZohoAdapterStatus());
});

router.post("/test", async (_request: Request, response: Response) => {
  try {
    response.json(await testZohoConnection());
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Zoho connection test failed.",
    });
  }
});

export default router;
