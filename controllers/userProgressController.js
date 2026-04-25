const supabase = require("../config/supabaseClient");

// GET user stats and progress
const getUserProgress = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { data: progress, error } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      return res.status(404).json({ message: "Progress not found" });
    }

    // Get problem stats
    const { data: solvedProblems } = await supabase
      .from("solved_problems")
      .select("problem_id, solved_at")
      .eq("user_id", userId)
      .order("solved_at", { ascending: false });

    // Get difficulty breakdown
    const { data: difficulties } = await supabase
      .from("solved_problems")
      .select("problems(difficulty)")
      .eq("user_id", userId);

    const difficultyBreakdown = {
      easy: 0,
      medium: 0,
      hard: 0
    };

    difficulties?.forEach(item => {
      const diff = item.problems?.difficulty?.toLowerCase();
      if (diff in difficultyBreakdown) {
        difficultyBreakdown[diff]++;
      }
    });

    res.json({
      ...progress,
      recentSolved: solvedProblems?.slice(0, 5) || [],
      difficultyBreakdown
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET leaderboard
const getLeaderboard = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const { data: leaderboard, error, count } = await supabase
      .from("user_progress")
      .select(`
        user_id,
        problems_solved,
        submission_count,
        current_streak,
        users(id, username, profile_picture_url)
      `, { count: "exact" })
      .order("problems_solved", { ascending: false })
      .order("submission_count", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    // Add rank to each entry
    const ranked = leaderboard.map((entry, index) => ({
      rank: offset + index + 1,
      ...entry
    }));

    res.json({
      data: ranked,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// GET user rank
const getUserRank = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get user's problems solved count
    const { data: userProgress } = await supabase
      .from("user_progress")
      .select("problems_solved")
      .eq("user_id", userId)
      .single();

    if (!userProgress) {
      return res.status(404).json({ message: "User progress not found" });
    }

    // Count users with more problems solved
    const { count: betterRank, error } = await supabase
      .from("user_progress")
      .select("id", { count: "exact" })
      .gt("problems_solved", userProgress.problems_solved);

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({
      rank: betterRank + 1,
      problemsSolved: userProgress.problems_solved
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Mark problem as solved
const markProblemSolved = async (req, res) => {
  try {
    const userId = req.user.id;
    const { problemId } = req.body;

    if (!problemId) {
      return res.status(400).json({ message: "Problem ID is required" });
    }

    // Check if already solved
    const { data: existing } = await supabase
      .from("solved_problems")
      .select("id")
      .eq("user_id", userId)
      .eq("problem_id", problemId)
      .single();

    if (existing) {
      return res.status(400).json({ message: "Problem already solved" });
    }

    // Add to solved problems
    const { data: solvedProblem, error: solveError } = await supabase
      .from("solved_problems")
      .insert([{
        user_id: userId,
        problem_id: problemId,
        solved_at: new Date()
      }])
      .select()
      .single();

    if (solveError) {
      return res.status(400).json({ message: solveError.message });
    }

    // Update user progress
    const { data: progress } = await supabase
      .from("user_progress")
      .select("problems_solved, current_streak, last_submission_date")
      .eq("user_id", userId)
      .single();

    let newStreak = (progress?.current_streak || 0) + 1;
    const lastDate = progress?.last_submission_date ? new Date(progress.last_submission_date) : null;
    const today = new Date();

    // Reset streak if not submitted yesterday
    if (lastDate) {
      const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
      if (daysDiff > 1) {
        newStreak = 1;
      }
    }

    await supabase
      .from("user_progress")
      .update({
        problems_solved: (progress?.problems_solved || 0) + 1,
        current_streak: newStreak,
        last_submission_date: new Date(),
        submission_count: (progress?.submission_count || 0) + 1
      })
      .eq("user_id", userId);

    res.json({
      message: "Problem marked as solved",
      solvedProblem,
      newStreak
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get dashboard data
const getDashboard = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get user progress
    const { data: progress } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Get recent submissions
    const { data: recentSubmissions } = await supabase
      .from("submissions")
      .select(`
        id,
        status,
        submitted_at,
        problems(title, slug)
      `)
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(5);

    // Get today's activity
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: todayCount } = await supabase
      .from("submissions")
      .select("id", { count: "exact" })
      .eq("user_id", userId)
      .gte("submitted_at", today.toISOString());

    res.json({
      progress,
      recentSubmissions,
      todayActivity: todayCount || 0,
      stats: {
        solvedProblems: progress?.problems_solved || 0,
        submissions: progress?.submission_count || 0,
        streak: progress?.current_streak || 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getUserProgress,
  getLeaderboard,
  getUserRank,
  markProblemSolved,
  getDashboard
};
