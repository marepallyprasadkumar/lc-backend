const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const supabase = require("../config/supabaseClient");

const LANGUAGE_EXTENSIONS = {
  python: "py",
  javascript: "js",
};

const LANGUAGE_COMMANDS = {
  python: "python",
  javascript: "node",
};

const normalize = (v) => String(v || "").trim().replace(/\r\n/g, "\n");
const compact = (v) => String(v || "").replace(/\s+/g, "").trim();

const executeCode = (cmd, file, input) =>
  new Promise((resolve) => {
    const proc = spawn(cmd, [file]);

    let out = "";
    let err = "";

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ output: "", error: "Time Limit Exceeded" });
    }, 5000);

    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));

    proc.on("close", () => {
      clearTimeout(timer);
      resolve({
        output: normalize(out),
        error: normalize(err),
      });
    });

    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();
  });

const runCode = async (req, res) => {
  const { code, language = "python", problemId } = req.body;

  if (!code || !problemId) {
    return res.status(400).json({ success: false, error: "Missing data" });
  }

  const file = path.join(
    __dirname,
    `../temp/run_${Date.now()}.${LANGUAGE_EXTENSIONS[language]}`
  );

  fs.writeFileSync(file, code);

  try {
    const { data: tests } = await supabase
      .from("test_cases")
      .select("*")
      .eq("problem_id", problemId)
      .eq("is_sample", true);

    const results = [];

    for (const t of tests || []) {
      const inputFormatted = (t.input || "").replace(/\\n/g, "\n");

      const r = await executeCode(
        LANGUAGE_COMMANDS[language],
        file,
        inputFormatted
      );

      const passed = !r.error && compact(r.output) === compact(t.expected_output);

      results.push({
        input: t.input,
        expected: t.expected_output,
        output: r.output,
        passed,
      });
    }

    fs.unlinkSync(file);

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
    fs.unlinkSync(file);
    res.status(500).json({ error: err.message });
  }
};

const submitCode = async (req, res) => {
  const { code, language = "python", problemId } = req.body;
  const userId = req.user?.id || 1;

  if (!code || !problemId) {
    return res.status(400).json({ message: "Missing data" });
  }

  const file = path.join(
    __dirname,
    `../temp/sub_${Date.now()}.${LANGUAGE_EXTENSIONS[language]}`
  );

  fs.writeFileSync(file, code);

  try {
    const { data: tests } = await supabase
      .from("test_cases")
      .select("*")
      .eq("problem_id", problemId)
      .eq("is_sample", false);

    if (!tests || tests.length === 0) {
      return res.json({
        success: true,
        verdict: "No Tests",
        passed: 0,
        total: 0,
        submission: null,
      });
    }

    let passed = 0;

    for (const t of tests) {
      const inputFormatted = (t.input || "").replace(/\\n/g, "\n");

      const r = await executeCode(
        LANGUAGE_COMMANDS[language],
        file,
        inputFormatted
      );

      const ok = !r.error && compact(r.output) === compact(t.expected_output);

      if (ok) passed++;
    }

    fs.unlinkSync(file);

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

    res.json({
      success: true,
      verdict,
      passed,
      total,
      submission: data,
    });
  } catch (err) {
    fs.unlinkSync(file);
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

const getAiHint = async (req, res) => {
  const { problemTitle = "", problemDescription = "", code = "" } = req.body || {};

  if (!problemTitle && !problemDescription) {
    return res.status(400).json({ message: "Problem context is required" });
  }

  const lowered = `${problemTitle} ${problemDescription}`.toLowerCase();
  const hasLoop = /for\s*\(|while\s*\(|for\s+\w+\s+in/.test(code);

  let hint = "Break the problem into input, processing, and output. Write a small brute-force solution first, then optimize.";

  if (lowered.includes("two sum")) {
    hint = "Try using a hash map: store number -> index as you scan the array, and for each number check whether target - number already exists.";
  } else if (lowered.includes("palindrome")) {
    hint = "Use two pointers from left and right and move inward while characters match.";
  } else if (lowered.includes("subarray") || lowered.includes("substring")) {
    hint = "Consider a sliding window and define the condition that grows/shrinks the window.";
  } else if (!hasLoop) {
    hint = "Start with a single pass loop over the main input and print intermediate values to verify your logic.";
  }

  res.json({ success: true, hint });
};

module.exports = {
  runCode,
  submitCode,
  getSubmissions,
  getAiHint,
};
