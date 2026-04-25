require("dotenv").config({ path: "./.env" });
const express = require("express");
const cors = require("cors");

// Import routes
const authRoutes = require("./routes/authRoutes");
const problemRoutes = require("./routes/problemRoutes");
const codeRoutes = require("./routes/codeRoutes");
const userProgressRoutes = require("./routes/userProgressRoutes");
const discussionRoutes = require("./routes/discussionRoutes");

// Initialize app
const app = express();

// Environment variables
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Request logging middleware (development only)
if (NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "CodeArena API is running",
    version: "1.0.0",
    environment: NODE_ENV
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/problems", problemRoutes);
app.use("/api/code", codeRoutes);
app.use("/api/user", userProgressRoutes);
app.use("/api/discussions", discussionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    message: "Route not found",
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);

  // Supabase error
  if (err.code === "PGRST") {
    return res.status(400).json({ 
      message: "Database error",
      error: err.message 
    });
  }

  // JWT error
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ 
      message: "Invalid token"
    });
  }

  // Default error
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    ...(NODE_ENV === "development" && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║      CodeArena API Server Running       ║
╠════════════════════════════════════════╣
║  Port:        ${PORT}                         ║
║  Environment: ${NODE_ENV}                    ║
║  URL:         http://localhost:${PORT}       ║
╚════════════════════════════════════════╝
  `);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  process.exit(0);
});

module.exports = app;
