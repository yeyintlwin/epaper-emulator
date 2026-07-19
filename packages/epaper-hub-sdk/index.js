const { renderTableDisplay } = require("./table-template");

function normalizeBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("baseUrl must be an http or https URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("baseUrl must be an http or https URL");
  }
  if (parsed.search || parsed.hash) throw new Error("baseUrl must not contain a query or fragment");
  return parsed.toString().replace(/\/$/, "");
}

function createEpaperHubSdk({ baseUrl, apiKey, fetchImpl = globalThis.fetch } = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const token = String(apiKey || "");
  if (!token) throw new Error("apiKey is required");
  if (typeof fetchImpl !== "function") throw new Error("fetch is required");

  async function updateTableDisplay({ epaperId, ...template }) {
    if (!Number.isInteger(epaperId) || epaperId < 1 || epaperId > 12) {
      throw new Error("epaperId must be an integer from 1 to 12");
    }

    const response = await fetchImpl(`${normalizedBaseUrl}/api/epapers/${epaperId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(renderTableDisplay(template))
    });

    if (!response.ok) throw new Error(`E-paper hub update failed with ${response.status}`);
    return typeof response.json === "function" ? response.json() : { ok: true };
  }

  return { renderTableDisplay, updateTableDisplay };
}

module.exports = { createEpaperHubSdk, renderTableDisplay };
