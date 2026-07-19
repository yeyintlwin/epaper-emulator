function createEpaperClient({ hubUrl, apiKey, fetchImpl = fetch } = {}) {
  const normalizedHubUrl = String(hubUrl || "").replace(/\/$/, "");
  const token = String(apiKey || "");

  async function updateTableInUse(tableNumber, session) {
    if (!normalizedHubUrl || !token) return { skipped: true };

    const response = await fetchImpl(`${normalizedHubUrl}/api/epapers/${tableNumber}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: `TABLE ${tableNumber}`,
        lines: [`TABLE ${tableNumber}`, "Table is in use", session.slipNumber],
        text: `Table is in use\n${session.slipNumber}`,
        background: "white",
        color: "black",
        accent: "red",
        align: "center",
        size: "medium"
      })
    });

    if (!response.ok) throw new Error(`E-paper hub update failed with ${response.status}`);
    return response.json ? response.json() : { ok: true };
  }

  return { updateTableInUse };
}

module.exports = { createEpaperClient };
