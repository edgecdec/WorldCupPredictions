const { createServer } = require("http");
const crypto = require("crypto");
const { exec } = require("child_process");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const port = process.env.PORT || 3006;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    if (req.url === "/api/webhook" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk.toString(); });
      req.on("end", () => {
        const signature = req.headers["x-hub-signature-256"];
        if (!signature) { console.log("Webhook: no signature header"); res.statusCode = 401; res.end("No signature"); return; }
        if (!WEBHOOK_SECRET) { console.log("Webhook: WEBHOOK_SECRET not set"); res.statusCode = 500; res.end("Server misconfigured"); return; }
        const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
        const digest = "sha256=" + hmac.update(body).digest("hex");
        if (signature === digest) {
          console.log("Webhook verified. Deploying...");
          res.statusCode = 200; res.end("Deploying");
          exec("nohup bash /var/www/WorldCupPredictions/deploy_webhook.sh > /dev/null 2>&1 &", (error) => {
            if (error) console.error(`exec error: ${error}`);
          });
        } else {
          res.statusCode = 403; res.end("Forbidden");
        }
      });
      return;
    }
    handle(req, res);
  });

  server.listen(port, () => {
    console.log(`> World Cup Predictions running on http://localhost:${port}`);
  });
});
