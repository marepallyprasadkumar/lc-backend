const supabase = require("../config/supabaseClient");

const buildSlug = (title) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

// GET all problems with filtering and pagination
const getProblems = async (req, res) => {
  try {
    const {
      difficulty,
      category,
      search,
      page = 1,
      limit = 20,
      sortBy = "id",
    } = req.query;

    let query = supabase
      .from("problems")
      .select(
        "id, title, slug, difficulty, acceptance_rate, submissions_count, category, tags",
        { count: "exact" }
      );

    if (difficulty) query = query.eq("difficulty", difficulty);
    if (category) query = query.eq("category", category);
    if (search) query = query.ilike("title", `%${search}%`);

    switch (sortBy) {
      case "difficulty":
        query = query.order("difficulty");
        break;
      case "acceptance":
        query = query.order("acceptance_rate", { ascending: false });
        break;
      case "recent":
        query = query.order("created_at", { ascending: false });
        break;
      default:
        query = query.order("id");
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    query = query.range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET single problem by slug with user progress
const getProblemBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.user?.id;

    const { data: problem, error } = await supabase
      .from("problems")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error || !problem) {
      return res.status(404).json({ message: "Problem not found" });
    }

    let userProgress = null;

    if (userId) {
      const { data: solved } = await supabase
        .from("solved_problems")
        .select("*")
        .eq("user_id", userId)
        .eq("problem_id", problem.id)
        .single();

      const { data: submissions } = await supabase
        .from("submissions")
        .select("id, status, submitted_at")
        .eq("user_id", userId)
        .eq("problem_id", problem.id)
        .order("submitted_at", { ascending: false });

      userProgress = {
        isSolved: !!solved,
        submissions: submissions ? submissions.length : 0,
        solvedAt: solved?.solved_at || null,
        bestTime: solved?.best_execution_time || null,
        bestMemory: solved?.best_memory_used || null,
      };
    }

    res.json({
      problem,
      userProgress,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET problem by ID
const getProblemById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: problem, error } = await supabase
      .from("problems")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !problem) {
      return res.status(404).json({ message: "Problem not found" });
    }

    res.json(problem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// CREATE problem
const createProblem = async (req, res) => {
  try {
    const {
      title,
      description,
      difficulty,
      category,
      tags,
      examples,
      constraints,
      solution_link,
      starter_code,
    } = req.body;

    if (!title || !description || !difficulty) {
      return res.status(400).json({
        message: "Title, description, and difficulty are required",
      });
    }

    const slug = buildSlug(title);

    const { data: problem, error } = await supabase
      .from("problems")
      .insert([
        {
          title,
          slug,
          description,
          difficulty,
          category: category || "Other",
          tags: tags || [],
          examples: examples || [],
          constraints,
          solution_link,
          starter_code: starter_code || {},
          submissions_count: 0,
          acceptance_count: 0,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(problem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// UPDATE problem
const updateProblem = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data: problem, error } = await supabase
      .from("problems")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json(problem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE problem
const deleteProblem = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from("problems").delete().eq("id", id);
    if (error) throw error;

    res.json({ message: "Problem deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET problem statistics
const getProblemStats = async (req, res) => {
  try {
    const { data: problems, error } = await supabase
      .from("problems")
      .select("difficulty, submissions_count");

    if (error) throw error;

    const statsMap = { Easy: 0, Medium: 0, Hard: 0 };
    let totalSubmissions = 0;

    for (const problem of problems || []) {
      if (statsMap[problem.difficulty] !== undefined) {
        statsMap[problem.difficulty] += 1;
      }
      totalSubmissions += problem.submissions_count || 0;
    }

    const stats = Object.entries(statsMap).map(([difficulty, count]) => ({
      difficulty,
      count,
    }));

    res.json({
      totalProblems: problems?.length || 0,
      byDifficulty: stats,
      totalSubmissions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getProblems,
  getProblemBySlug,
  getProblemById,
  createProblem,
  updateProblem,
  deleteProblem,
  getProblemStats,
};
