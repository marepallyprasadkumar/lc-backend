const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const supabase = require("../config/supabaseClient");

const CODE_EXECUTION_TIMEOUT = parseInt(process.env.CODE_EXECUTION_TIMEOUT || "5000", 10);
const MAX_OUTPUT_LENGTH = parseInt(process.env.MAX_OUTPUT_LENGTH || "10000", 10);

const LANGUAGE_EXTENSIONS = {
  python: "py",
  javascript: "js",
};

const LANGUAGE_COMMANDS = {
  python: "python",
  javascript: "node",
};

const normalizeOutput = (value) => String(value || "").trim().replace(/\r\n/g, "\n");
const compactOutput = (value) => String(value || "").replace(/\s+/g, "").trim();

const cleanupTempFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("Failed to cleanup temp file:", err.message);
  }
};

const executeCode = (command, filePath, input) =>
  new Promise((resolve) => {
    const proc = spawn(command, [filePath], {
      timeout: CODE_EXECUTION_TIMEOUT,
    });

    let output = "";
    let errorOutput = "";
    let timedOut = false;

    proc.stdout.on("data", (data) => {
      output += data.toString();
      if (output.length > MAX_OUTPUT_LENGTH) {
        proc.kill();
      }
    });

    proc.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    proc.on("error", (error) => {
      resolve({
        output: "",
        error: error.message,
        timedOut: false,
      });
    });

    proc.on("close", (_, signal) => {
      if (signal === "SIGTERM") {
        timedOut = true;
      }

      resolve({
        output: normalizeOutput(output),
        error: normalizeOutput(errorOutput),
        timedOut,
      });
    });

    proc.stdin.write(input || "");
    proc.stdin.end();
  });

// ================= RUN CODE =================
const runCode = async (req, res) => {
  const { code, language = "python", problemId } = req.body;

  if (!code || !problemId) {
    return res.status(400).json({
      success: false,
      error: "Code and problemId are required",
    });
  }

  if (!LANGUAGE_COMMANDS[language]) {
    return res.status(400).json({
      success: false,
      error: "Unsupported language. Supported languages: python, javascript",
    });
  }

  const tempDir = path.join(__dirname, "../temp");

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileName = `temp_${Date.now()}.${LANGUAGE_EXTENSIONS[language] || "py"}`;
  const filePath = path.join(tempDir, fileName);

  try {
    fs.writeFileSync(filePath, code);

    const { data: testCases, error } = await supabase
      .from("test_cases")
      .select("*")
      .eq("problem_id", problemId)
      .eq("is_sample", true)
      .order("sort_order", { ascending: true });

    if (error || !testCases || testCases.length === 0) {
      cleanupTempFile(filePath);
      return res.status(400).json({
        success: false,
        error: "No sample test cases found",
      });
    }

    const results = [];
    const command = LANGUAGE_COMMANDS[language];

    for (const test of testCases) {
      const result = await executeCode(command, filePath, test.input);
      const expectedOutput = normalizeOutput(test.expected_output);
      const passed =
        !result.error &&
        !result.timedOut &&
        compactOutput(result.output) === compactOutput(expectedOutput);

      results.push({
        input: test.input,
        expected: expectedOutput,
        output: result.output,
        error: result.error || null,
        timedOut: result.timedOut,
        passed,
      });
    }

    cleanupTempFile(filePath);

    const hasRuntimeError = results.some((r) => r.error);
    const hasTimeout = results.some((r) => r.timedOut);

    const verdict = hasRuntimeError
      ? "Runtime Error"
      : hasTimeout
      ? "Time Limit Exceeded"
      : results.every((r) => r.passed)
      ? "Accepted"
      : "Wrong Answer";

    return res.json({
      success: true,
      results,
      verdict,
    });
  } catch (err) {
    cleanupTempFile(filePath);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// ================= SUBMIT CODE =================
const submitCode = async (req, res) => {
  const { code, language = "python", problemId } = req.body;
  const userId = req.user?.id;

  if (!code || !problemId) {
    return res.status(400).json({
      message: "Code and problem ID are required",
    });
  }

  if (!LANGUAGE_COMMANDS[language]) {
    return res.status(400).json({
      message: "Unsupported language. Supported languages: python, javascript",
    });
  }

  try {
    const tempDir = path.join(__dirname, "../temp");

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = `submit_${Date.now()}.${LANGUAGE_EXTENSIONS[language] || "py"}`;
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, code);

    const { data: hiddenTests, error: testError } = await supabase
      .from("test_cases")
      .select("*")
      .eq("problem_id", problemId)
      .eq("is_sample", false)
      .order("sort_order", { ascending: true });

    if (testError || !hiddenTests || hiddenTests.length === 0) {
      cleanupTempFile(filePath);
      return res.status(400).json({
        message: "No hidden test cases found for this problem",
      });
    }

    const command = LANGUAGE_COMMANDS[language];
    const results = [];

    for (const test of hiddenTests) {
      const result = await executeCode(command, filePath, test.input);
      const expectedOutput = normalizeOutput(test.expected_output);
      const passed =
        !result.error &&
        !result.timedOut &&
        compactOutput(result.output) === compactOutput(expectedOutput);

      results.push({
        passed,
        output: result.output,
        error: result.error,
        timedOut: result.timedOut,
      });
    }

    cleanupTempFile(filePath);

    const hasRuntimeError = results.some((r) => r.error);
    const hasTimeout = results.some((r) => r.timedOut);
    const passedCount = results.filter((r) => r.passed).length;
    const totalTests = results.length;

    const verdict = hasRuntimeError
      ? "Runtime Error"
      : hasTimeout
      ? "Time Limit Exceeded"
      : passedCount === totalTests
      ? "Accepted"
      : "Wrong Answer";

    const { data: submission, error } = await supabase
      .from("submissions")
      .insert([
        {
          user_id: userId,
          problem_id: problemId,
          code,
          language,
          status: verdict,
          output: verdict === "Accepted" ? "All hidden test cases passed" : null,
          error_message: hasRuntimeError ? results.find((r) => r.error)?.error : null,
          test_cases_passed: passedCount,
          test_cases_total: totalTests,
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    const { data: progress } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", userId)
      .single();

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    let newSubmissionCount = (progress?.submission_count || 0) + 1;
    let newProblemsSolved = progress?.problems_solved || 0;
    let newCurrentStreak = progress?.current_streak || 0;
    let newLongestStreak = progress?.longest_streak || 0;

    if (verdict === "Accepted") {
      const { data: existingSolved } = await supabase
        .from("solved_problems")
        .select("id")
        .eq("user_id", userId)
        .eq("problem_id", problemId)
        .maybeSingle();

      if (!existingSolved) {
        await supabase.from("solved_problems").insert([
          {
            user_id: userId,
            problem_id: problemId,
            solved_at: now.toISOString(),
            solution_code: code,
          },
        ]);

        newProblemsSolved += 1;
      }

      const lastDate = progress?.last_submission_date
        ? new Date(progress.last_submission_date)
        : null;

      if (!lastDate) {
        newCurrentStreak = 1;
      } else {
        const last = new Date(lastDate);
        last.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          newCurrentStreak = progress?.current_streak || 1;
        } else if (diffDays === 1) {
          newCurrentStreak = (progress?.current_streak || 0) + 1;
        } else {
          newCurrentStreak = 1;
        }
      }

      if (newCurrentStreak > newLongestStreak) {
        newLongestStreak = newCurrentStreak;
      }
    }

    await supabase
      .from("user_progress")
      .update({
        submission_count: newSubmissionCount,
        problems_solved: newProblemsSolved,
        current_streak: newCurrentStreak,
        longest_streak: newLongestStreak,
        last_submission_date: now.toISOString(),
      })
      .eq("user_id", userId);

    res.json({
      message: "Code submitted successfully",
      submission,
      verdict,
      passedTestCases: passedCount,
      totalTestCases: totalTests,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// ================= GET SUBMISSIONS =================
const getSubmissions = async (req, res) => {
  const { problemId } = req.params;
  const userId = req.user?.id;

  try {
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("user_id", userId)
      .eq("problem_id", problemId)
      .order("submitted_at", { ascending: false });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  runCode,
  submitCode,
  getSubmissions,
};
