const supabase = require("../config/supabaseClient");

// GET all discussions for a problem
const getProblemDiscussions = async (req, res) => {
  try {
    const { problemId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { data: discussions, error, count } = await supabase
      .from("discussions")
      .select(`
        id,
        title,
        content,
        upvotes,
        created_at,
        users(username, profile_picture_url)
      `, { count: "exact" })
      .eq("problem_id", problemId)
      .order("upvotes", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({
      data: discussions,
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

// CREATE a new discussion
const createDiscussion = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { problemId, title, content } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!title || !content || !problemId) {
      return res.status(400).json({ message: "Title, content, and problem ID are required" });
    }

    // Check if problem exists
    const { data: problem } = await supabase
      .from("problems")
      .select("id")
      .eq("id", problemId)
      .single();

    if (!problem) {
      return res.status(404).json({ message: "Problem not found" });
    }

    const { data: discussion, error } = await supabase
      .from("discussions")
      .insert([{
        problem_id: problemId,
        user_id: userId,
        title,
        content,
        upvotes: 0
      }])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.status(201).json(discussion);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// UPDATE a discussion (only by creator)
const updateDiscussion = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { discussionId } = req.params;
    const { title, content } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user is the creator
    const { data: discussion } = await supabase
      .from("discussions")
      .select("user_id")
      .eq("id", discussionId)
      .single();

    if (!discussion) {
      return res.status(404).json({ message: "Discussion not found" });
    }

    if (discussion.user_id !== userId) {
      return res.status(403).json({ message: "Not authorized to update this discussion" });
    }

    const { data: updated, error } = await supabase
      .from("discussions")
      .update({ title, content })
      .eq("id", discussionId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// DELETE a discussion (only by creator)
const deleteDiscussion = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { discussionId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user is the creator
    const { data: discussion } = await supabase
      .from("discussions")
      .select("user_id")
      .eq("id", discussionId)
      .single();

    if (!discussion) {
      return res.status(404).json({ message: "Discussion not found" });
    }

    if (discussion.user_id !== userId) {
      return res.status(403).json({ message: "Not authorized to delete this discussion" });
    }

    const { error } = await supabase
      .from("discussions")
      .delete()
      .eq("id", discussionId);

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({ message: "Discussion deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// UPVOTE a discussion
const upvoteDiscussion = async (req, res) => {
  try {
    const { discussionId } = req.params;

    const { data: discussion, error: fetchError } = await supabase
      .from("discussions")
      .select("upvotes")
      .eq("id", discussionId)
      .single();

    if (fetchError || !discussion) {
      return res.status(404).json({ message: "Discussion not found" });
    }

    const { data: updated, error } = await supabase
      .from("discussions")
      .update({ upvotes: discussion.upvotes + 1 })
      .eq("id", discussionId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// DOWNVOTE a discussion
const downvoteDiscussion = async (req, res) => {
  try {
    const { discussionId } = req.params;

    const { data: discussion, error: fetchError } = await supabase
      .from("discussions")
      .select("upvotes")
      .eq("id", discussionId)
      .single();

    if (fetchError || !discussion) {
      return res.status(404).json({ message: "Discussion not found" });
    }

    const newUpvotes = Math.max(0, discussion.upvotes - 1);

    const { data: updated, error } = await supabase
      .from("discussions")
      .update({ upvotes: newUpvotes })
      .eq("id", discussionId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getProblemDiscussions,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  upvoteDiscussion,
  downvoteDiscussion
};
