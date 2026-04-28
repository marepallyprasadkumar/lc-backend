const express = require("express");
const router = express.Router();

const {
  runCode,
  submitCode,
  getSubmissions,
  getAiHint,
} = require("../controllers/codeController");

router.post("/run", runCode);
router.post("/submit", submitCode);
router.post("/hint", getAiHint);
router.get("/submissions/:problemId", getSubmissions);

module.exports = router;
