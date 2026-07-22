const { createEpaperHubSdk } = require("@restaurant/epaper-hub-sdk");

function createEpaperClient({ hubUrl, apiKey, fetchImpl = fetch } = {}) {
  const normalizedHubUrl = String(hubUrl || "").replace(/\/$/, "");
  const token = String(apiKey || "");
  const sdk = normalizedHubUrl && token
    ? createEpaperHubSdk({ baseUrl: normalizedHubUrl, apiKey: token, fetchImpl })
    : null;

  async function updateTableStatus(tableNumber, status, orderingUrl) {
    if (!sdk) return { skipped: true };

    return sdk.updateTableDisplay({
      epaperId: tableNumber,
      tableNumber,
      status,
      url: orderingUrl
    });
  }

  return {
    updateTableWelcome: (tableNumber, orderingUrl) => updateTableStatus(tableNumber, "Welcome", orderingUrl),
    updateTableInUse: (tableNumber, orderingUrl) => updateTableStatus(tableNumber, "Table is in use", orderingUrl)
  };
}

module.exports = { createEpaperClient };
