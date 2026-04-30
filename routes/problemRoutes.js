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

router.get("/", getProblems);
router.get("/stats", getProblemStats);
router.get("/with-status", protect, getProblemsWithStatus);
router.get("/slug/:slug", getProblemBySlug);
router.get("/:id", getProblemById);

router.post("/", protect, createProblem);
router.put("/:id", protect, updateProblem);
router.delete("/:id", protect, deleteProblem);

module.exports = router;
