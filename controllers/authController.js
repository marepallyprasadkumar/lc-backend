const supabase = require("../config/supabaseClient");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Input validation
const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const validatePassword = (password) => {
  return password.length >= 6;
};

// @route POST /api/auth/register
const registerUser = async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  try {
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ 
        message: "Password must be at least 6 characters long" 
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ 
        message: "Username must be between 3 and 20 characters" 
      });
    }

    // Check if user exists
    const { data: existingUsers, error: checkError } = await supabase
      .from("users")
      .select("*")
      .or(`email.eq.${email},username.eq.${username}`);

    if (checkError) {
      return res.status(500).json({ message: "Database error", error: checkError.message });
    }

    if (existingUsers && existingUsers.length > 0) {
      const field = existingUsers[0].email === email ? "email" : "username";
      return res.status(409).json({ message: `${field} already taken` });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert([{ username, email, password: hashedPassword }])
      .select()
      .single();

    if (insertError) {
      return res.status(400).json({ message: insertError.message });
    }

    // Create user progress record
    await supabase
      .from("user_progress")
      .insert([{
        user_id: newUser.id,
        problems_solved: 0,
        problems_attempted: 0,
        submission_count: 0
      }]);

    res.status(201).json({
      message: "User registered successfully",
      token: generateToken(newUser.id),
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route POST /api/auth/login
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "Account is disabled" });
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.json({
      message: "Login successful",
      token: generateToken(user.id),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, email, bio, profile_picture_url, created_at")
      .eq("id", req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get user progress
    const { data: progress } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", req.user.id)
      .single();

    res.json({
      ...user,
      progress: progress || {}
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route PUT /api/auth/profile
const updateProfile = async (req, res) => {
  try {
    const { bio, profile_picture_url } = req.body;

    const { data: updatedUser, error } = await supabase
      .from("users")
      .update({
        bio,
        profile_picture_url,
      })
      .eq("id", req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        bio: updatedUser.bio,
        profile_picture_url: updatedUser.profile_picture_url,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route POST /api/auth/logout
const logoutUser = (req, res) => {
  // Client-side will remove token from localStorage
  res.json({ message: "Logged out successfully" });
};

module.exports = { 
  registerUser, 
  loginUser, 
  getMe, 
  updateProfile,
  logoutUser 
};
