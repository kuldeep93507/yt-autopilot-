import rateLimit from "express-rate-limit";

// Login brute-force guard — 10 attempts / 10 min per IP
export const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts — 10 minute mein dobara try karo" },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API guard — 300 req / min per IP (generous for dashboard polling)
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: "Too many requests — thoda slow down karo" },
  standardHeaders: true,
  legacyHeaders: false,
});
