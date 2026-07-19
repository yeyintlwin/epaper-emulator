const { menuItems, tabs } = require("./menu-data");

const MAX_TABLE_NUMBER = 12;
const SERVICE_FEE_RATE = 0.1;
const TAX_RATE = 0.1;

function normalizeTableNumber(value) {
  const tableNumber = Number(value);
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > MAX_TABLE_NUMBER) {
    throw new Error("table_number must be between 1 and 12");
  }
  return tableNumber;
}

function yyyymmdd(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function calculateTotals(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE);
  const tax = Math.round((subtotal + serviceFee) * TAX_RATE);
  return { subtotal, serviceFee, tax, total: subtotal + serviceFee + tax };
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function createOrderStore(options = {}) {
  const now = options.now || (() => new Date());
  const sessions = new Map();
  const menuById = new Map(menuItems.map((item) => [item.id, item]));

  function getMenu() {
    return { tabs, items: menuItems };
  }

  function getSession(tableNumber) {
    const normalizedTable = normalizeTableNumber(tableNumber);
    return snapshot(sessions.get(String(normalizedTable)) || {
      tableNumber: normalizedTable,
      status: "Welcome",
      slipNumber: null,
      orders: [],
      totals: { subtotal: 0, serviceFee: 0, tax: 0, total: 0 }
    });
  }

  function createSlipNumber(tableNumber) {
    return `SLIP-${yyyymmdd(now())}-${String(tableNumber).padStart(3, "0")}`;
  }

  function expandItems(items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("items must not be empty");
    return items.map((line) => {
      const item = menuById.get(String(line && line.id));
      if (!item) throw new Error(`Unknown menu item: ${line && line.id}`);
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new Error("quantity must be between 1 and 99");
      }
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        quantity
      };
    });
  }

  function placeOrder({ tableNumber, items }) {
    const normalizedTable = normalizeTableNumber(tableNumber);
    const key = String(normalizedTable);
    const previous = sessions.get(key);
    const isFirstOrderForSession = !previous || !previous.slipNumber;
    const session = previous || {
      tableNumber: normalizedTable,
      status: "Welcome",
      slipNumber: createSlipNumber(normalizedTable),
      orders: [],
      totals: { subtotal: 0, serviceFee: 0, tax: 0, total: 0 }
    };
    const orderItems = expandItems(items);
    const order = {
      id: `${session.slipNumber}-${String(session.orders.length + 1).padStart(2, "0")}`,
      createdAt: now().toISOString(),
      items: orderItems,
      totals: calculateTotals(orderItems)
    };

    session.status = "Table is in use";
    session.orders.push(order);
    session.totals = calculateTotals(session.orders.flatMap((existingOrder) => existingOrder.items));
    sessions.set(key, session);

    return { isFirstOrderForSession, session: snapshot(session), order: snapshot(order) };
  }

  function callStaff(tableNumber, reason) {
    const session = getSession(tableNumber);
    return {
      id: `CALL-${yyyymmdd(now())}-${String(session.tableNumber).padStart(3, "0")}-${Date.now().toString(36)}`,
      tableNumber: session.tableNumber,
      reason: String(reason || "Assistance requested").slice(0, 120),
      createdAt: now().toISOString()
    };
  }

  return { getMenu, getSession, placeOrder, callStaff };
}

module.exports = {
  MAX_TABLE_NUMBER,
  SERVICE_FEE_RATE,
  TAX_RATE,
  calculateTotals,
  createOrderStore
};
