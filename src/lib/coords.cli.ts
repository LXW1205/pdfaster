// CLI runner for the coords self-check. Node-only — never imported
// from the browser bundle. Keeps coords.ts free of node:* imports
// so Vite's dev server doesn't try to externalize them at module
// init and crash the browser.
//
// Usage:  npm run demo:coords   (or)   tsx src/lib/coords.cli.ts
import { demo } from "./coords";

try {
  await demo();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
