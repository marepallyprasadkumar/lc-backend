const express = require("express");
const router = express.Router();
const { 
  registerUser, 
  loginUser, 
  getMe, 
  updateProfile,
  logoutUser 
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Public routes
router.post("/register", registerUser);
router.post("/login", loginUser);

// Protected routes
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);
router.post("/logout", protect, logoutUser);

module.exports = router;
