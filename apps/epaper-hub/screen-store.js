const fs = require("node:fs");
const path = require("node:path");

function createScreenStore(filePath) {
  return {
    load() {
      if (!filePath) return [];
      try {
        const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return Array.isArray(payload.screens) ? payload.screens : [];
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    },
    save(screens) {
      if (!filePath) return;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tempPath = `${filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify({ screens: Array.from(screens.values()) }));
      fs.renameSync(tempPath, filePath);
    }
  };
}

module.exports = { createScreenStore };
