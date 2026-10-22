import { payment } from "../lib/payment.mjs";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  let body = req.body;
  try {
    if (typeof body === "string") body = JSON.parse(body);
  } catch {
    return res.status(400).json({ error: "JSON inválido." });
  }
  const [status, payload] = payment(body);
  res.setHeader(
    "X-Request-ID",
    /^[\w-]{1,100}$/.test(body?.attemptId || "")
      ? body.attemptId
      : "demo-probe",
  );
  return res.status(status).json(payload);
}
