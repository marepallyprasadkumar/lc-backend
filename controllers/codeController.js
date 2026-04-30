const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const supabase = require("../config/supabaseClient");

const LANGUAGE_EXTENSIONS = {
  python: "py",
  javascript: "js",
  cpp: "cpp",
  java: "java",
};

const normalize = (v) => String(v || "").trim().replace(/\r\n/g, "\n");
const compact = (v) => String(v || "").replace(/\s+/g, "").trim();
const parseMaybeJson = (value, fallback = null) => {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const runProcess = (cmd, args, input, cwd = process.cwd(), timeoutMs = 5000) =>
  new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, shell: false });

    let out = "";
    let err = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
      resolve({ output: "", error: "Time Limit Exceeded", code: -1 });
    }, timeoutMs);

    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));

    proc.on("error", (e) => {
      clearTimeout(timer);
      resolve({ output: "", error: normalize(e.message), code: -1 });
    });

    proc.on("close", (code) => {
      if (timedOut) return;
      clearTimeout(timer);
      resolve({
        output: normalize(out),
        error: normalize(err),
        code: Number(code || 0),
      });
    });

    if (input) proc.stdin.write(input);
    proc.stdin.end();
  });

const executeByLanguage = async ({ language, code, input }) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codearena-"));

  try {
    if (language === "python") {
      const file = path.join(tempDir, "main.py");
      fs.writeFileSync(file, code);
      return await runProcess("python", [file], input, tempDir);
    }

    if (language === "javascript") {
      const file = path.join(tempDir, "main.js");
      fs.writeFileSync(file, code);
      return await runProcess("node", [file], input, tempDir);
    }

    if (language === "cpp") {
      const src = path.join(tempDir, "main.cpp");
      const exe = process.platform === "win32" ? path.join(tempDir, "main.exe") : path.join(tempDir, "main");
      fs.writeFileSync(src, code);

      const compile = await runProcess("g++", [src, "-O2", "-std=c++17", "-o", exe], "", tempDir, 10000);
      if (compile.code !== 0 || compile.error) {
        return { output: "", error: compile.error || "C++ compilation failed", code: -1 };
      }

      return await runProcess(exe, [], input, tempDir);
    }

    if (language === "java") {
      const src = path.join(tempDir, "Main.java");
      const wrapped = /class\s+Main\b/.test(code)
        ? code
        : `public class Main {\n  public static void main(String[] args) throws Exception {\n${code}\n  }\n}`;

      fs.writeFileSync(src, wrapped);

      const compile = await runProcess("javac", [src], "", tempDir, 12000);
      if (compile.code !== 0 || compile.error) {
        return { output: "", error: compile.error || "Java compilation failed", code: -1 };
      }

      return await runProcess("java", ["-cp", tempDir, "Main"], input, tempDir);
    }

    return { output: "", error: "Unsupported language", code: -1 };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
};

const toClientTests = (tests = [], sampleOnly = false) =>
  (Array.isArray(tests) ? tests : [])
    .filter((t) => t && t.input != null && (t.expected_output != null || t.expected != null))
    .filter((t) => !sampleOnly || t.is_sample !== false)
    .map((t, idx) => ({
      id: `client-test-${idx + 1}`,
      input: String(t.input),
      expected_output: String(t.expected_output ?? t.expected),
      is_sample: t.is_sample !== false,
    }));

const runCode = async (req, res) => {
  const { code, language = "python", problemId, examples: clientExamples = [], testCases: clientTestCases = [] } = req.body;

  if (!code || !problemId) {
    return res.status(400).json({ success: false, error: "Missing data" });
  }

  if (!LANGUAGE_EXTENSIONS[language]) {
    return res.status(400).json({ success: false, error: "Unsupported language" });
  }

  try {
    const { data: tests } = await supabase
      .from("test_cases")
      .select("*")
      .eq("problem_id", problemId)
      .eq("is_sample", true);

    let effectiveTests = tests || [];
    if (effectiveTests.length === 0) {
      const { data: problem } = await supabase
        .from("problems")
        .select("examples")
        .eq("id", problemId)
        .single();

      const examples = parseMaybeJson(problem?.examples, []);
      if (Array.isArray(examples) && examples.length > 0) {
        effectiveTests = examples
          .filter((ex) => ex && (ex.input != null) && (ex.output != null))
          .map((ex, idx) => ({
            id: `example-${idx + 1}`,
            input: String(ex.input),
            expected_output: String(ex.output),
            is_sample: true,
          }));
      }
    }

    if (effectiveTests.length === 0) {
      effectiveTests = toClientTests(clientTestCases, true);
    }

    if (effectiveTests.length === 0 && Array.isArray(clientExamples) && clientExamples.length > 0) {
      effectiveTests = clientExamples
        .filter((ex) => ex && ex.input != null && ex.output != null)
        .map((ex, idx) => ({
          id: `client-example-${idx + 1}`,
          input: String(ex.input),
          expected_output: String(ex.output),
          is_sample: true,
        }));
    }

    const results = [];

    for (const t of effectiveTests) {
      const inputFormatted = (t.input || "").replace(/\\n/g, "\n");
      const r = await executeByLanguage({ language, code, input: inputFormatted });
      const passed = !r.error && compact(r.output) === compact(t.expected_output);

      results.push({
        input: t.input,
        expected: t.expected_output,
        output: r.output,
        error: r.error,
        passed,
      });
    }

    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;

    res.json({
      success: true,
      verdict: passedCount === totalCount ? "Accepted" : "Wrong Answer",
      passed: passedCount,
      total: totalCount,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const submitCode = async (req, res) => {
  const { code, language = "python", problemId, testCases: clientTestCases = [] } = req.body;
  const userId = req.user?.id || 1;

  if (!code || !problemId) {
    return res.status(400).json({ message: "Missing data" });
  }

  if (!LANGUAGE_EXTENSIONS[language]) {
    return res.status(400).json({ message: "Unsupported language" });
  }

  try {
    const { data: tests } = await supabase
      .from("test_cases")
      .select("*")
      .eq("problem_id", problemId)
      .eq("is_sample", false);

    const effectiveTests = tests && tests.length > 0 ? tests : toClientTests(clientTestCases, false);

    if (!effectiveTests || effectiveTests.length === 0) {
      return res.json({ success: true, verdict: "No Tests", passed: 0, total: 0, submission: null });
    }

    let passed = 0;

    for (const t of effectiveTests) {
      const inputFormatted = (t.input || "").replace(/\\n/g, "\n");
      const r = await executeByLanguage({ language, code, input: inputFormatted });
      const ok = !r.error && compact(r.output) === compact(t.expected_output);
      if (ok) passed++;
    }

    const total = effectiveTests.length;
    const verdict = passed === total ? "Accepted" : "Wrong Answer";

    const { data, error } = await supabase
      .from("submissions")
      .insert([
        {
          user_id: userId,
          problem_id: problemId,
          code,
          language,
          status: verdict,
          test_cases_passed: passed,
          test_cases_total: total,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, verdict, passed, total, submission: data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getSubmissions = async (req, res) => {
  const { problemId } = req.params;
  const userId = req.user?.id || 1;

  try {
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("user_id", userId)
      .eq("problem_id", problemId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getAllSubmissions = async (req, res) => {
  const userId = req.user?.id || 1;

  try {
    const { data, error } = await supabase
      .from("submissions")
      .select("id, problem_id, status, language, test_cases_passed, test_cases_total, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getAiHint = async (req, res) => {
  const {
    problemTitle = "",
    problemDescription = "",
    code = "",
    hintLevel = 1,
    learnerLevel = "beginner",
  } = req.body || {};

  if (!problemTitle && !problemDescription) {
    return res.status(400).json({ message: "Problem context is required" });
  }

  const lowered = `${problemTitle} ${problemDescription}`.toLowerCase();
  const level = Math.max(1, Math.min(3, Number(hintLevel) || 1));
  const learner = ["beginner", "intermediate", "advanced"].includes(String(learnerLevel))
    ? String(learnerLevel)
    : "beginner";

  const topics = {
    generic: {
      concept: "Break the problem into input parsing, core logic, and exact output formatting.",
      why: "This keeps debugging simple. If output is wrong, you can quickly know whether parsing, algorithm, or printing caused it.",
      tradeoff: "A direct brute-force solution is useful for learning, but it may fail large hidden tests when the time complexity is high.",
      advanced: "Identify the invariant first, then choose the simplest data structure that preserves it during one pass.",
      next: "Run the first sample, compare expected and actual output, then fix one mismatch at a time.",
    },
    hashMap: {
      concept: "Use a hash map to remember values you have already seen.",
      why: "A hash map gives fast lookup. Instead of checking every pair again and again, you can ask: have I already seen the number I need?",
      tradeoff: "Nested loops are easier to write but become slow as input grows. A hash map uses extra memory, but it usually reduces O(n^2) work to O(n).",
      advanced: "Maintain value -> index while scanning once. Check complement before inserting the current value to avoid reusing the same element.",
      next: "For each number x, compute target - x. If it exists in the map, you found the answer.",
    },
    slidingWindow: {
      concept: "Use a sliding window when the answer is a continuous part of an array or string.",
      why: "The window lets you expand and shrink a range without rebuilding it from scratch each time.",
      tradeoff: "Brute force tries many substrings and repeats work. Sliding window is faster, but you must carefully update counts when the left pointer moves.",
      advanced: "Define the validity condition, expand right until invalid or satisfied, then move left to restore or optimize the window.",
      next: "Track left, right, and a frequency map or last-seen map. Update the best answer after each valid window.",
    },
    stack: {
      concept: "Use a stack when the latest opened item must be closed first.",
      why: "Bracket problems follow last-in-first-out order. The most recent opening bracket is the only one that can match the next closing bracket.",
      tradeoff: "Counting bracket types is not enough because order matters. A stack stores order, but you must handle empty-stack cases.",
      advanced: "Push opening brackets. For a closing bracket, compare against the expected top; fail immediately on mismatch.",
      next: "At the end, the stack must be empty. If anything remains, some bracket was never closed.",
    },
    dynamicProgramming: {
      concept: "Use dynamic programming when the answer can be built from smaller answers.",
      why: "It avoids solving the same subproblem repeatedly. You store what you learned and reuse it.",
      tradeoff: "Plain recursion is easy to understand but can repeat work or overflow the call stack. DP is faster, but you must define the state clearly.",
      advanced: "Write the recurrence, choose iteration order, then compress memory when only the previous states are needed.",
      next: "Ask: what smaller answer do I need to compute the current answer?",
    },
    graphSearch: {
      concept: "Use DFS or BFS to visit connected cells or nodes.",
      why: "When one cell leads to neighboring cells, traversal marks the entire connected component in one controlled pass.",
      tradeoff: "DFS is compact but may hit recursion depth on large grids. BFS uses a queue and is often safer for very large input.",
      advanced: "Each unvisited land cell starts one component. Mark on push/entry so the same cell is not queued twice.",
      next: "Scan the grid. When you find unvisited land, count one island and mark all reachable land.",
    },
    twoPointers: {
      concept: "Use two pointers when decisions depend on both ends or two moving boundaries.",
      why: "Two pointers reduce repeated scanning by moving each index only when it can still improve the answer.",
      tradeoff: "A precomputed array can be simpler, but two pointers often saves memory. The risk is moving the wrong pointer without a reason.",
      advanced: "Move the pointer at the limiting boundary because the stronger boundary cannot improve the current bottleneck.",
      next: "Define what each pointer represents, then update the answer before moving the limiting pointer.",
    },
  };

  let topic = topics.generic;
  let topicName = "Problem Solving";
  if (lowered.includes("two sum")) {
    topic = topics.hashMap;
    topicName = "Hash Map";
  } else if (lowered.includes("substring") || lowered.includes("window")) {
    topic = topics.slidingWindow;
    topicName = "Sliding Window";
  } else if (lowered.includes("parentheses") || lowered.includes("bracket")) {
    topic = topics.stack;
    topicName = "Stack";
  } else if (lowered.includes("stairs") || lowered.includes("subarray") || lowered.includes("dynamic")) {
    topic = topics.dynamicProgramming;
    topicName = "Dynamic Programming";
  } else if (lowered.includes("island") || lowered.includes("grid")) {
    topic = topics.graphSearch;
    topicName = "Graph Traversal";
  } else if (lowered.includes("rain water") || lowered.includes("two pointers")) {
    topic = topics.twoPointers;
    topicName = "Two Pointers";
  }

  const codeLines = code.split("\n").filter((l) => l.trim().length > 0).length;
  const adaptiveNudge = codeLines < 3
    ? "Start small: write function skeleton, handle one sample input, print output."
    : "Take one sample test, compare expected vs actual output, and find the first line where it goes wrong.";

  const byLearner = {
    beginner: [
      { title: "Concept", body: topic.concept },
      { title: "Why we use it", body: topic.why },
      { title: "What can go wrong", body: topic.tradeoff },
      { title: "Try this next", body: topic.next },
    ],
    intermediate: [
      { title: "Approach", body: topic.why },
      { title: "Tradeoff", body: topic.tradeoff },
      { title: "Common mistake", body: "Most wrong answers come from edge cases, pointer updates, or printing in the wrong format. Test the smallest input and one tricky sample." },
      { title: "Next move", body: topic.next },
    ],
    advanced: [
      { title: "Hint", body: topic.advanced },
      { title: "Invariant", body: "Keep one clear condition true after every loop iteration. If that condition breaks, fix the update order." },
      { title: "Edge cases", body: "Check empty or minimum input, duplicate values, all-negative values, and cases where no valid answer exists if the problem allows it." },
    ],
  };

  res.json({
    success: true,
    hintLevel: level,
    learnerLevel: learner,
    topic: topicName,
    hint: byLearner[learner].map((section) => `${section.title}: ${section.body}`).join("\n\n"),
    sections: byLearner[learner],
    nextHint: level < 3 ? level + 1 : 1,
    adaptiveNudge,
  });
};


const getContestLeaderboard = async (req, res) => {
  const problemIdsRaw = String(req.query.problemIds || "").trim();
  if (!problemIdsRaw) {
    return res.status(400).json({ message: "problemIds query is required" });
  }

  const problemIds = problemIdsRaw
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n));

  if (problemIds.length === 0) {
    return res.status(400).json({ message: "No valid problem ids" });
  }

  try {
    const { data: submissions, error: subErr } = await supabase
      .from("submissions")
      .select("id, user_id, problem_id, status, created_at")
      .in("problem_id", problemIds)
      .order("created_at", { ascending: true });

    if (subErr) throw subErr;

    const userIds = Array.from(new Set((submissions || []).map((s) => s.user_id)));

    let userMap = new Map();
    if (userIds.length > 0) {
      const { data: users, error: userErr } = await supabase
        .from("users")
        .select("id, username")
        .in("id", userIds);
      if (userErr) throw userErr;
      userMap = new Map((users || []).map((u) => [u.id, u.username]));
    }

    const grouped = new Map();
    for (const s of submissions || []) {
      if (!grouped.has(s.user_id)) {
        grouped.set(s.user_id, {
          user_id: s.user_id,
          username: userMap.get(s.user_id) || `user_${s.user_id}`,
          entries: [],
        });
      }
      grouped.get(s.user_id).entries.push(s);
    }

    const leaderboard = [];

    for (const [, u] of grouped) {
      const byProblem = new Map();
      for (const e of u.entries) {
        if (!byProblem.has(e.problem_id)) byProblem.set(e.problem_id, []);
        byProblem.get(e.problem_id).push(e);
      }

      let solved = 0;
      let penalty = 0;
      let lastAcceptedAt = null;

      for (const [pid, arr] of byProblem) {
        const acceptedIndex = arr.findIndex((x) => x.status === "Accepted");
        if (acceptedIndex >= 0) {
          solved += 1;
          const accepted = arr[acceptedIndex];
          const first = arr[0];
          const wrongBefore = arr.slice(0, acceptedIndex).filter((x) => x.status !== "Accepted").length;
          const minutes = Math.max(
            0,
            Math.floor((new Date(accepted.created_at).getTime() - new Date(first.created_at).getTime()) / 60000)
          );
          penalty += minutes + wrongBefore * 10;

          if (!lastAcceptedAt || new Date(accepted.created_at) > new Date(lastAcceptedAt)) {
            lastAcceptedAt = accepted.created_at;
          }
        }
      }

      leaderboard.push({
        userId: u.user_id,
        username: u.username,
        solved,
        score: solved * 100,
        penalty,
        lastAcceptedAt,
      });
    }

    leaderboard.sort((a, b) => {
      if (b.solved !== a.solved) return b.solved - a.solved;
      if (a.penalty !== b.penalty) return a.penalty - b.penalty;
      if (!a.lastAcceptedAt && !b.lastAcceptedAt) return 0;
      if (!a.lastAcceptedAt) return 1;
      if (!b.lastAcceptedAt) return -1;
      return new Date(a.lastAcceptedAt).getTime() - new Date(b.lastAcceptedAt).getTime();
    });

    res.json({ data: leaderboard });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const checkCommandVersion = async (cmd, args = ["--version"]) => {
  try {
    const result = await runProcess(cmd, args, "", process.cwd(), 3000);
    return { available: !result.error, detail: result.error || result.output || "ok" };
  } catch (err) {
    return { available: false, detail: err.message };
  }
};

const getRuntimeCapabilities = async (req, res) => {
  const python = await checkCommandVersion("python");
  const node = await checkCommandVersion("node");
  const cpp = await checkCommandVersion("g++");
  const javac = await checkCommandVersion("javac");
  const java = await checkCommandVersion("java");

  res.json({
    data: {
      python: python.available,
      javascript: node.available,
      cpp: cpp.available,
      java: javac.available && java.available,
      details: { python, node, cpp, javac, java },
    },
  });
};

const logContestViolation = async (req, res) => {
  const { problemSlug, reason, happenedAt, userAgent } = req.body || {};
  const userId = req.user?.id || null;

  if (!problemSlug || !reason) {
    return res.status(400).json({ message: "problemSlug and reason are required" });
  }

  try {
    const { error } = await supabase.from("contest_violations").insert([
      {
        user_id: userId,
        problem_slug: problemSlug,
        reason,
        happened_at: happenedAt || new Date().toISOString(),
        user_agent: userAgent || req.headers["user-agent"] || null,
      },
    ]);

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
module.exports = {
  runCode,
  submitCode,
  getSubmissions,
  getAllSubmissions,
  getAiHint,
  getContestLeaderboard,
  getRuntimeCapabilities,
  logContestViolation,
};





