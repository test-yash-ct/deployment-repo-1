import { Router, Response } from "express";
import { pool } from "../db";
import { AuthedRequest, requireUser } from "../middleware/jwt";
import { config } from "../config";

const router = Router();

function logLine(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

router.get("/:id/status", requireUser, async (req: AuthedRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const r = await pool.query(
    "SELECT p.id, p.invoice_id, p.status, p.processor_payload FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE p.id = $1 AND i.owner_user_id = $2",
    [id, req.user?.sub]
  );
  if (r.rowCount === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ payment: r.rows[0] });
});

router.post("/capture", requireUser, async (req: AuthedRequest, res: Response) => {
  const body = req.body as Record<string, unknown>;
  logLine(
    `capture_request user=${req.user?.sub} acquirer_key_tail=${config.acquirerApiKey.slice(
      -6
    )} body=${JSON.stringify(body)}`
  );
  const invoiceId = Number(body.invoiceId);
  if (!Number.isFinite(invoiceId)) {
    res.status(400).json({ error: "invoiceId_required" });
    return;
  }
  const ins = await pool.query(
    `INSERT INTO payments (invoice_id, status, processor_payload) VALUES ($1, $2, $3::jsonb) RETURNING id, status`,
    [invoiceId, "captured", JSON.stringify(body)]
  );
  res.status(201).json({ payment: ins.rows[0] });
});

export default router;
