const supabase = require("../config/supabaseClient");

/* ================= GET ALL PROBLEMS ================= */
const getProblems = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("problems")
      .select("*");

    if (error) {
      console.error("Supabase error:", error);
      throw error;
    }

    res.json({ data: data || [] });
  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET PROBLEM BY SLUG ================= */
const getProblemBySlug = async (req, res) => {
  const { slug } = req.params;

  try {
    const { data, error } = await supabase
      .from("problems")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(404).json({ error: "Problem not found" });
  }
};

/* ================= GET PROBLEM BY ID ================= */
const getProblemById = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("problems")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(404).json({ error: "Problem not found" });
  }
};

/* ================= CREATE PROBLEM ================= */
const createProblem = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("problems")
      .insert([req.body])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= UPDATE PROBLEM ================= */
const updateProblem = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("problems")
      .update(req.body)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= DELETE PROBLEM ================= */
const deleteProblem = async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from("problems")
      .delete()
      .eq("id", id);

    if (error) throw error;

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= PROBLEM STATS ================= */
const getProblemStats = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("problems")
      .select("difficulty");

    if (error) throw error;

    const stats = {
      total: data.length,
      easy: data.filter((p) => p.difficulty === "Easy").length,
      medium: data.filter((p) => p.difficulty === "Medium").length,
      hard: data.filter((p) => p.difficulty === "Hard").length,
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET PROBLEMS WITH STATUS ================= */
const getProblemsWithStatus = async (req, res) => {
  const userId = req.user?.id || 1;

  try {
    // 1. Get problems
    const { data: problems, error: probError } = await supabase
      .from("problems")
      .select("*");

    if (probError) throw probError;

    // 2. Get submissions
    const { data: submissions, error: subError } = await supabase
      .from("submissions")
      .select("problem_id, status")
      .eq("user_id", userId);

    if (subError) throw subError;

    // 3. Build status map
    const statusMap = {};

    (submissions || []).forEach((s) => {
      if (!statusMap[s.problem_id]) {
        statusMap[s.problem_id] = "attempted";
      }

      if (s.status === "Accepted") {
        statusMap[s.problem_id] = "solved";
      }
    });

    // 4. Attach status
    const enriched = (problems || []).map((p) => ({
      ...p,
      status: statusMap[p.id] || "unsolved",
    }));

    res.json({ data: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= EXPORTS ================= */
module.exports = {
  getProblems,
  getProblemBySlug,
  getProblemById,
  createProblem,
  updateProblem,
  deleteProblem,
  getProblemStats,
  getProblemsWithStatus,
};
