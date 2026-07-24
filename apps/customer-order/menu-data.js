const menuItems = [
  {
    id: "tonkotsu-ramen",
    featured: true,
    name: "Tonkotsu Ramen",
    category: "Recommended",
    price: 1280,
    description: "Rich pork broth, noodles, egg, scallion.",
    tags: ["noodles", "popular"]
  },
  {
    id: "crispy-gyoza",
    featured: true,
    name: "Crispy Gyoza",
    category: "Recommended",
    price: 620,
    description: "Pan-fried dumplings with house dipping sauce.",
    tags: ["starter", "popular"]
  },
  {
    id: "karaage-chicken",
    name: "Karaage Chicken",
    category: "All Items",
    price: 780,
    description: "Juicy fried chicken with lemon.",
    tags: ["chicken"]
  },
  {
    id: "salmon-don",
    featured: true,
    name: "Salmon Don",
    category: "All Items",
    price: 1480,
    description: "Fresh salmon over rice.",
    tags: ["rice"]
  },
  {
    id: "extra-plate",
    name: "Extra Plate",
    category: "Service & Utensils",
    price: 0,
    description: "One extra sharing plate.",
    tags: ["service"]
  },
  {
    id: "chopsticks",
    name: "Chopsticks",
    category: "Service & Utensils",
    price: 0,
    description: "Additional chopsticks.",
    tags: ["service"]
  },
  {
    id: "tissues",
    name: "Tissues",
    category: "Service & Utensils",
    price: 0,
    description: "Extra tissues for the table.",
    tags: ["service"]
  },
  {
    id: "black-pepper",
    name: "Black Pepper",
    category: "Service & Utensils",
    price: 0,
    description: "Fresh black pepper.",
    tags: ["service"]
  },
  {
    id: "mango-pudding",
    featured: true,
    name: "Mango Pudding",
    category: "Desserts",
    price: 480,
    description: "Chilled mango pudding.",
    tags: ["sweet"]
  },
  {
    id: "green-tea-ice-cream",
    name: "Green Tea Ice Cream",
    category: "Desserts",
    price: 420,
    description: "Matcha ice cream.",
    tags: ["sweet"]
  },
  {
    id: "iced-oolong",
    name: "Iced Oolong",
    category: "Soft Drinks",
    price: 320,
    description: "Cold oolong tea.",
    tags: ["drink"]
  },
  {
    id: "yuzu-soda",
    featured: true,
    name: "Yuzu Soda",
    category: "Soft Drinks",
    price: 420,
    description: "Sparkling yuzu citrus soda.",
    tags: ["drink"]
  },
  {
    id: "draft-beer",
    featured: true,
    name: "Draft Beer",
    category: "Alcoholic Drinks",
    price: 620,
    description: "Cold house draft beer.",
    tags: ["drink", "alcohol"]
  },
  {
    id: "lemon-sour",
    name: "Lemon Sour",
    category: "Alcoholic Drinks",
    price: 560,
    description: "Shochu highball with lemon.",
    tags: ["drink", "alcohol"]
  }
];

const tabs = ["Recommended", "All Items", "Service & Utensils", "Desserts", "Soft Drinks", "Alcoholic Drinks"];

module.exports = { menuItems, tabs };
