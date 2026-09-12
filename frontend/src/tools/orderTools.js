/**
 * orderTools.js
 *
 * Gemini Live function calling declarations and local state management
 * for the burger restaurant voice ordering assistant.
 */

export const functionDeclarations = [
  {
    name: "add_item",
    description: "Add a menu item with a specified quantity to the customer's order.",
    parameters: {
      type: "OBJECT",
      properties: {
        item: {
          type: "STRING",
          description: "Name of the menu item (e.g. burger, fries, drink, salad)",
        },
        quantity: {
          type: "INTEGER",
          description: "Quantity of the item to add. Defaults to 1 if omitted.",
        },
      },
      required: ["item"],
    },
  },
  {
    name: "remove_item",
    description: "Remove an existing item completely from the customer's order.",
    parameters: {
      type: "OBJECT",
      properties: {
        item: {
          type: "STRING",
          description: "Name of the menu item to remove.",
        },
      },
      required: ["item"],
    },
  },
  {
    name: "change_quantity",
    description: "Update or change the quantity of an item already in the order.",
    parameters: {
      type: "OBJECT",
      properties: {
        item: {
          type: "STRING",
          description: "Name of the menu item.",
        },
        new_quantity: {
          type: "INTEGER",
          description: "The new quantity for the item. If 0 or less, the item will be removed.",
        },
      },
      required: ["item", "new_quantity"],
    },
  },
  {
    name: "get_order_summary",
    description: "Get the current list of items in the customer's order and confirmation status.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
  {
    name: "confirm_order",
    description: "Finalize and mark the customer's order as confirmed.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
];

// Module-level mutable order state
export const orderState = {
  items: [],
  confirmed: false,
};

// Pub-sub listeners
const listeners = new Set();

/**
 * Normalizes item names for case-insensitive matching and common plurals (e.g. burgers -> burger, fries -> fries).
 */
function normalizeItemName(name) {
  if (!name) return "";
  let clean = name.trim().toLowerCase();
  if (clean === "french fries" || clean === "french fry" || clean === "fry") {
    return "fries";
  }
  if (clean.endsWith("s") && clean !== "fries") {
    clean = clean.slice(0, -1);
  }
  return clean;
}

function formatItemDisplayName(name) {
  const trimmed = name.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function findItemIndex(itemInput) {
  const target = normalizeItemName(itemInput);
  return orderState.items.findIndex(
    (item) => normalizeItemName(item.name) === target
  );
}

function notifyListeners() {
  const snapshot = {
    items: orderState.items.map((i) => ({ ...i })),
    confirmed: orderState.confirmed,
  };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (err) {
      console.error("[OrderTools] Error in listener:", err);
    }
  });
}

/**
 * Executes a tool function called by Gemini, mutates orderState, and notifies subscribers.
 *
 * @param {string} name - The tool function name
 * @param {Object} args - Arguments passed by Gemini
 * @returns {Object} Result object to send back as functionResponse
 */
export function executeTool(name, args = {}) {
  console.log(`[OrderTools] Executing tool: ${name}`, args);
  let resultObj = {};

  switch (name) {
    case "add_item": {
      const itemRaw = args.item || "Burger";
      const quantity = Math.max(1, parseInt(args.quantity, 10) || 1);
      const idx = findItemIndex(itemRaw);

      if (idx !== -1) {
        orderState.items[idx].quantity += quantity;
      } else {
        orderState.items.push({
          name: formatItemDisplayName(itemRaw),
          quantity,
        });
      }
      resultObj = { result: "added", item: itemRaw, quantity, order: orderState.items };
      break;
    }

    case "remove_item": {
      const itemRaw = args.item || "";
      const idx = findItemIndex(itemRaw);

      if (idx !== -1) {
        const removed = orderState.items.splice(idx, 1)[0];
        resultObj = { result: "removed", item: removed.name, order: orderState.items };
      } else {
        resultObj = { result: "not_found", item: itemRaw, order: orderState.items };
      }
      break;
    }

    case "change_quantity": {
      const itemRaw = args.item || "";
      const newQty = parseInt(args.new_quantity, 10);
      const idx = findItemIndex(itemRaw);

      if (isNaN(newQty) || newQty <= 0) {
        if (idx !== -1) {
          orderState.items.splice(idx, 1);
        }
        resultObj = { result: "removed", item: itemRaw, order: orderState.items };
      } else if (idx !== -1) {
        orderState.items[idx].quantity = newQty;
        resultObj = {
          result: "quantity_changed",
          item: orderState.items[idx].name,
          new_quantity: newQty,
          order: orderState.items,
        };
      } else {
        // If not in order, add it
        const displayName = formatItemDisplayName(itemRaw);
        orderState.items.push({ name: displayName, quantity: newQty });
        resultObj = {
          result: "added",
          item: displayName,
          quantity: newQty,
          order: orderState.items,
        };
      }
      break;
    }

    case "get_order_summary": {
      resultObj = {
        result: "summary",
        order: orderState.items,
        confirmed: orderState.confirmed,
        count: orderState.items.length,
      };
      break;
    }

    case "confirm_order": {
      orderState.confirmed = true;
      resultObj = { result: "confirmed", order: orderState.items, confirmed: true };
      break;
    }

    default:
      console.warn(`[OrderTools] Unrecognized tool name: ${name}`);
      resultObj = { error: `Tool ${name} not recognized` };
  }

  notifyListeners();
  return resultObj;
}

/**
 * Subscribes a listener to orderState changes.
 *
 * @param {Function} listener - Callback receiving { items, confirmed }
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener);
  // Send immediate initial state
  listener({
    items: orderState.items.map((i) => ({ ...i })),
    confirmed: orderState.confirmed,
  });
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Resets the order state (e.g. on new session).
 */
export function resetOrder() {
  orderState.items = [];
  orderState.confirmed = false;
  notifyListeners();
}
