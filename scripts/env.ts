import fs from "node:fs";

// Next.js reads .env by itself; the command-line scripts load it here.
if (fs.existsSync(".env")) process.loadEnvFile(".env");
