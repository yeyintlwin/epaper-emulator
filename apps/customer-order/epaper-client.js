const { createEpaperHubSdk } = require("@restaurant/epaper-hub-sdk");

function createEpaperClient({ hubUrl, apiKey, orderBaseUrl, fetchImpl = fetch } = {}) {
  const normalizedHubUrl = String(hubUrl || "").replace(/\/$/, "");
  const token = String(apiKey || "");
  const sdk = normalizedHubUrl && token
    ? createEpaperHubSdk({ baseUrl: normalizedHubUrl, apiKey: token, fetchImpl })
    : null;

  function orderingUrlFor(tableNumber) {
    const orderingUrl = new URL(orderBaseUrl || "https://order.yeyintlwin.com");
    orderingUrl.searchParams.set("table", tableNumber);
    return orderingUrl.toString();
  }

  async function updateTableStatus(tableNumber, status) {
    if (!sdk) return { skipped: true };

    return sdk.updateTableDisplay({
      epaperId: tableNumber,
      tableNumber,
      status,
      url: orderingUrlFor(tableNumber)
    });
  }

  return {
    updateTableWelcome: (tableNumber) => updateTableStatus(tableNumber, "Welcome"),
    updateTableInUse: (tableNumber) => updateTableStatus(tableNumber, "Table is in use")
  };
}

module.exports = { createEpaperClient };
