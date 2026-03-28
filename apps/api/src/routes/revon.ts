import { Router, type Request, type Response } from "express";
import { getRevonAdapterStatus } from "../integrations/revon/client.js";

const router = Router();

router.get("/status", (_request: Request, response: Response) => {
  response.json(getRevonAdapterStatus());
});

export default router;
