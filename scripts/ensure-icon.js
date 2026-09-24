const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "assets");
fs.mkdirSync(dir, { recursive: true });
// Minimal valid 1024x1024 dark GMAX-style PNG (base64)
const b64 = require("fs").readFileSync
  ? null
  : null;
