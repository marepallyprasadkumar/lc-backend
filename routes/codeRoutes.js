const express = require("express");
const router = express.Router();
const { 
  runCode, 
  submitCode,
  getSubmissions
} = require("../controllers/codeController");
const { protect } = require("../middleware/authMiddleware");

// Public route (no auth needed for testing)
router.post("/run", runCode);

// Protected routes
router.post("/submit", protect, submitCode);
router.get("/submissions/:problemId", protect, getSubmissions);

module.exports = router;
