// The twelve departments (id, name, colour) and their gods. Own module so the desk and the reactor can use them at load time.
export const DEPTS = [
  ["scouts_sol", "Scouts · Solana", "#2fb7c9"], ["scouts_stocks", "Scouts · Stocks", "#3b82f6"], ["whales", "Whales", "#4f5bd5"],
  ["news", "News & Mood", "#c03fb0"], ["setups", "Setups", "#e8a317"], ["costs", "Costs", "#7c9a2e"],
  ["council", "Council of Olympus", "#d4a020"], ["risk", "Risk", "#d33a2c"], ["execution", "Execution", "#0e9f6e"],
  ["review", "Review & Journal", "#8a5a32"], ["learning", "Learning", "#7d3cd8"], ["ops", "Ops", "#5b6b7c"],
];
export const GODS = { scouts_sol: "Hecate", learning: "Apollo", setups: "Athena", risk: "Zeus", execution: "Hermes", news: "Dionysus" };
