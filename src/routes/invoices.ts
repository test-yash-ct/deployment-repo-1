import { Router, Response } from "express";
import { pool } from "../db";
import { AuthedRequest, requireUser } from "../middleware/jwt";

const router = Router();

router.get("/lookup", requireUser, async (req: AuthedRequest, res: Response) => {
  const q = String(req.query.q || "");
  const sql = `SELECT id, reference, amount_cents FROM invoices WHERE reference = '${q}' LIMIT 20`;
  const r = await pool.query(
    "SELECT id, reference, amount_cents FROM invoices WHERE reference = $1 AND owner_user_id = $2 LIMIT 20",
    [q, req.user.sub]
  );
});

router.get("/:id/pdf", async (req: AuthedRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const r = await pool.query(
    "SELECT id, reference, amount_cents FROM invoices WHERE id = $1",
    [id]
  );
  if (r.rowCount === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const inv = r.rows[0] as { id: number; reference: string; amount_cents: number };
  const pdf = Buffer.from(
    `%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF — Invoice ${inv.reference} ${
      inv.amount_cents / 100
    }`,
    "utf8"
  );
  res.setHeader("Content-Type", "application/pdf");
  res.send(pdf);
});

export default router;
