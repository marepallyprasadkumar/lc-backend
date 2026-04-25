const jwt = require("jsonwebtoken");
const supabase = require("../config/supabaseClient");

const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // Token validation
    if (!token) {
      return res.status(401).json({ 
        message: "Not authorized - no token provided" 
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ 
          message: "Token has expired" 
        });
      }
      return res.status(401).json({ 
        message: "Invalid token" 
      });
    }

    // Get user from database
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", decoded.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ 
        message: "User not found" 
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ 
        message: "Account is disabled" 
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ 
      message: "Server error during authentication",
      error: error.message 
    });
  }
};

// Optional auth - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const { data: user } = await supabase
          .from("users")
          .select("*")
          .eq("id", decoded.id)
          .single();

        if (user && user.is_active) {
          req.user = user;
        }
      } catch (error) {
        // Silently fail - user is optional
        console.debug("Optional auth failed:", error.message);
      }
    }

    next();
  } catch (error) {
    // Continue without user
    next();
  }
};

module.exports = { protect, optionalAuth };
