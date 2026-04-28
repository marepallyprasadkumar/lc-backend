const express = require("express");
const router = express.Router();

const {
  runCode,
  submitCode,
  getSubmissions,
} = require("../controllers/codeController");

// 🔥 REMOVE AUTH FOR NOW (fixes 401 + empty submissions)
router.post("/run", runCode);
router.post("/submit", submitCode);
router.get("/submissions/:problemId", getSubmissions);

module.exports = router;