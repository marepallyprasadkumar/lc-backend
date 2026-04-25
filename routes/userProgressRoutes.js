const express = require("express");
const router = express.Router();
const { 
  getUserProgress,
  getLeaderboard,
  getUserRank,
  markProblemSolved,
  getDashboard
} = require("../controllers/userProgressController");
const { protect } = require("../middleware/authMiddleware");

// Public routes
router.get("/leaderboard", getLeaderboard);

// Protected routes
router.get("/dashboard", protect, getDashboard);
router.get("/progress", protect, getUserProgress);
router.get("/rank", protect, getUserRank);
router.post("/mark-solved", protect, markProblemSolved);

module.exports = router;
