const { createEpaperHubSdk } = require("@restaurant/epaper-hub-sdk");

function createEpaperClient({ hubUrl, apiKey, orderBaseUrl, fetchImpl = fetch } = {}) {
  const normalizedHubUrl = String(hubUrl || "").replace(/\/$/, "");
  const token = String(apiKey || "");
  const sdk = normalizedHubUrl && token
    ? createEpaperHubSdk({ baseUrl: normalizedHubUrl, apiKey: token, fetchImpl })
    : null;

  async function updateTableInUse(tableNumber, session) {
    if (!sdk) return { skipped: true };
    const orderingUrl = new URL(orderBaseUrl || "https://order.yeyintlwin.com");
    orderingUrl.searchParams.set("table", tableNumber);

    return sdk.updateTableDisplay({
      epaperId: tableNumber,
      tableNumber,
      status: "Table is in use",
      url: orderingUrl.toString()
    });
  }

  return { updateTableInUse };
}

module.exports = { createEpaperClient };
