const express = require("express");
const router = express.Router();
const { 
  getProblemDiscussions,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  upvoteDiscussion,
  downvoteDiscussion
} = require("../controllers/discussionController");
const { protect } = require("../middleware/authMiddleware");

// Public routes
router.get("/problem/:problemId", getProblemDiscussions);

// Protected routes
router.post("/", protect, createDiscussion);
router.put("/:discussionId", protect, updateDiscussion);
router.delete("/:discussionId", protect, deleteDiscussion);
router.post("/:discussionId/upvote", upvoteDiscussion);
router.post("/:discussionId/downvote", downvoteDiscussion);

module.exports = router;
