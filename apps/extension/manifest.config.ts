import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "eBay AI Message Assistant — V0 Dev",
  version: "0.0.1",
  description: "V0 dev build. Personal-tool-of-one paste-and-draft companion.",
  action: {
    default_popup: "src/popup/index.html",
    default_title: "eBay AI Assistant",
  },
  background: { service_worker: "src/sw.ts", type: "module" },
  permissions: ["storage", "scripting", "alarms"],
  host_permissions: [
    "https://www.ebay.com/*",
    "https://www.ebay.com/itm/*",
    "https://mesg.ebay.com/*",
    "http://localhost:3000/*",
  ],
  content_scripts: [
    {
      matches: ["https://www.ebay.com/mesg/*", "https://mesg.ebay.com/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
    {
      matches: ["https://www.ebay.com/itm/*", "https://*.ebay.com/itm/*"],
      js: ["src/content/listing.ts"],
      run_at: "document_idle",
    },
  ],
});
