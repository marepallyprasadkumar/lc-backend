const express = require("express");
const router = express.Router();

const {
  getProblems,
  getProblemBySlug,
  getProblemById,
  createProblem,
  updateProblem,
  deleteProblem,
  getProblemStats,
  getProblemsWithStatus,
} = require("../controllers/problemController");

const { protect } = require("../middleware/authMiddleware");

// ✅ PUBLIC ROUTES (NO AUTH)
router.get("/", getProblems);              // 🔥 FIX HERE
router.get("/stats", getProblemStats);
router.get("/slug/:slug", getProblemBySlug);
router.get("/:id", getProblemById);

// ✅ OPTIONAL (only when logged in)
router.get("/with-status", protect, getProblemsWithStatus);

// ✅ PROTECTED ADMIN ROUTES
router.post("/", protect, createProblem);
router.put("/:id", protect, updateProblem);
router.delete("/:id", protect, deleteProblem);

module.exports = router;