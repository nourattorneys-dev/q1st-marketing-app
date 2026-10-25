// Passenger's startup file on the cPanel server (README, "Hosting on cPanel").
// It loads the server-only settings, which live outside the releases and the web root, keeps a log there,
// then starts Next's standalone server from this release.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const shared = process.env.DASHBOARD_SHARED || path.join(os.homedir(), "dashboard-shared");
const logFile = path.join(shared, "app.log");

// The account's error log isn't readable without a shell, so the app's own output goes to ~/dashboard-shared/app.log.
// One older file is kept once it passes 5 MB.
try {
  if (fs.statSync(logFile).size > 5 * 1024 * 1024) fs.renameSync(logFile, `${logFile}.1`);
} catch {}
const log = fs.createWriteStream(logFile, { flags: "a" });
for (const stream of [process.stdout, process.stderr]) {
  const write = stream.write.bind(stream);
  stream.write = (chunk, ...rest) => {
    log.write(chunk);
    return write(chunk, ...rest);
  };
}

try {
  process.loadEnvFile(path.join(shared, "settings.env"));
  process.env.NODE_ENV = "production";
  console.log(`${new Date().toISOString()} starting release ${path.basename(__dirname)} on Node ${process.version}`);
  process.chdir(__dirname);
  require("./server.js");
} catch (error) {
  console.error(`${new Date().toISOString()} startup failed:`, error);
  throw error;
}
