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

const runCode = async (req, res) => {
  const { code, language = "python", problemId, examples: clientExamples = [] } = req.body;

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
  const { code, language = "python", problemId } = req.body;
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

    if (!tests || tests.length === 0) {
      return res.json({ success: true, verdict: "No Tests", passed: 0, total: 0, submission: null });
    }

    let passed = 0;

    for (const t of tests) {
      const inputFormatted = (t.input || "").replace(/\\n/g, "\n");
      const r = await executeByLanguage({ language, code, input: inputFormatted });
      const ok = !r.error && compact(r.output) === compact(t.expected_output);
      if (ok) passed++;
    }

    const total = tests.length;
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
  const { problemTitle = "", problemDescription = "", code = "", hintLevel = 1 } = req.body || {};

  if (!problemTitle && !problemDescription) {
    return res.status(400).json({ message: "Problem context is required" });
  }

  const lowered = `${problemTitle} ${problemDescription}`.toLowerCase();
  const level = Math.max(1, Math.min(3, Number(hintLevel) || 1));

  const generic = [
    "Step 1: Read one example input and write what output should come.\nStep 2: Write a simple working solution first (even if slow).\nStep 3: Run and verify with sample tests.",
    "Debug idea:\n1) Print important variables each loop.\n2) Check where your output becomes different.\n3) Fix one issue at a time and run again.",
    "Optimization idea:\n1) Find the slow part (usually nested loops).\n2) Replace with map/set, two pointers, or prefix sum.\n3) Re-test to confirm same correct output.",
  ];

  const twoSum = [
    "Think like this: for each number, what other number is needed to reach target?",
    "Use a map: number -> index.\nFor current number x, check if (target - x) is already in map.",
    "Simple steps:\n1) Loop through array.\n2) need = target - nums[i]\n3) If need in map, answer is [map[need], i]\n4) Else store nums[i] in map.",
  ];

  const slidingWindow = [
    "Use two pointers: left and right. This creates a moving window.",
    "Move right pointer forward, update counts. If rule breaks, move left pointer until rule is valid.",
    "Track best answer on every valid window (max length / min length / max sum based on question).",
  ];

  const palindrome = [
    "Palindrome means string reads same from left and right.",
    "Basic check: compare both ends, move inward while characters match.",
    "Longest palindrome tip: expand from center for both odd and even centers.",
  ];

  let bank = generic;
  if (lowered.includes("two sum")) bank = twoSum;
  else if (lowered.includes("substring") || lowered.includes("subarray")) bank = slidingWindow;
  else if (lowered.includes("palindrome")) bank = palindrome;

  const codeLines = code.split("\n").filter((l) => l.trim().length > 0).length;
  const adaptiveNudge = codeLines < 3
    ? "Start small: write function skeleton, handle one sample input, print output."
    : "Take one sample test, compare expected vs actual output, and find the first line where it goes wrong.";

  res.json({ success: true, hintLevel: level, hint: bank[level - 1], nextHint: level < 3 ? level + 1 : null, adaptiveNudge });
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





