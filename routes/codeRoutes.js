const express = require("express");
const router = express.Router();
const { protect, optionalAuth } = require("../middleware/authMiddleware");

const {
  runCode,
  submitCode,
  getSubmissions,
  getAllSubmissions,
  getAiHint,
  getContestLeaderboard,
  getRuntimeCapabilities,
  logContestViolation,
} = require("../controllers/codeController");

router.post("/run", runCode);
router.post("/submit", submitCode);
router.post("/hint", getAiHint);
router.post("/contest-violation", optionalAuth, logContestViolation);

router.get("/submissions", getAllSubmissions);
router.get("/submissions/:problemId", getSubmissions);
router.get("/leaderboard", getContestLeaderboard);
router.get("/capabilities", getRuntimeCapabilities);

module.exports = router;
