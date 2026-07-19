const assert = require("node:assert/strict");
const test = require("node:test");
const { createOrderStore } = require("../order-store");

test("first order creates a table session and later orders keep the same slip number", () => {
  const store = createOrderStore({ now: () => new Date("2026-07-19T10:00:00Z") });

  const first = store.placeOrder({
    tableNumber: 5,
    items: [
      { id: "tonkotsu-ramen", quantity: 2 },
      { id: "iced-oolong", quantity: 1 }
    ]
  });
  const second = store.placeOrder({
    tableNumber: 5,
    items: [{ id: "extra-plate", quantity: 1 }]
  });

  assert.equal(first.isFirstOrderForSession, true);
  assert.equal(second.isFirstOrderForSession, false);
  assert.equal(first.session.slipNumber, second.session.slipNumber);
  assert.equal(first.session.status, "Table is in use");
  assert.equal(first.session.orders.length, 1);
  assert.equal(second.session.orders.length, 2);
  assert.equal(second.session.orders[0].items[0].name, "Tonkotsu Ramen");
  assert.equal(second.session.orders[1].items[0].name, "Extra Plate");
});

test("order totals include tax and service fee breakdown", () => {
  const store = createOrderStore({ now: () => new Date("2026-07-19T10:00:00Z") });

  const result = store.placeOrder({
    tableNumber: 2,
    items: [{ id: "mango-pudding", quantity: 2 }]
  });

  assert.deepEqual(result.session.totals, {
    subtotal: 960,
    serviceFee: 96,
    tax: 106,
    total: 1162
  });
});

test("invalid table and menu item requests are rejected", () => {
  const store = createOrderStore();

  assert.throws(() => store.placeOrder({ tableNumber: 13, items: [{ id: "tonkotsu-ramen", quantity: 1 }] }), {
    message: /table_number must be between 1 and 12/
  });
  assert.throws(() => store.placeOrder({ tableNumber: 1, items: [{ id: "missing", quantity: 1 }] }), {
    message: /Unknown menu item/
  });
});
