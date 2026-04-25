const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const supabase = require("../config/supabaseClient");

const CODE_EXECUTION_TIMEOUT = 5000;
const MAX_OUTPUT_LENGTH = 10000;

const LANGUAGE_EXTENSIONS = {
  python: "py",
  javascript: "js",
};

// ================= RUN CODE (JUDGE SYSTEM) =================
const runCode = async (req, res) => {
  const { code, language = "python", problemId } = req.body;

  if (!code || !problemId) {
    return res.status(400).json({
      success: false,
      error: "Code and problemId are required",
    });
  }

  const tempDir = path.join(__dirname, "../temp");

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileName = `temp_${Date.now()}.${LANGUAGE_EXTENSIONS[language] || "py"}`;
  const filePath = path.join(tempDir, fileName);

  try {
    // Write code to file
    fs.writeFileSync(filePath, code);

    // 🔥 Fetch test cases
    const { data: testCases, error } = await supabase
      .from("test_cases")
      .select("*")
      .eq("problem_id", problemId);

    if (error || !testCases || testCases.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No test cases found",
      });
    }

    let results = [];

    for (let test of testCases) {
      const result = await new Promise((resolve) => {
        const proc = spawn(
          language === "python" ? "python" : "node",
          [filePath],
          { timeout: CODE_EXECUTION_TIMEOUT }
        );

        let output = "";
        let errorOutput = "";

        proc.stdout.on("data", (data) => {
          output += data.toString();
          if (output.length > MAX_OUTPUT_LENGTH) {
            proc.kill();
          }
        });

        proc.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });

        proc.on("close", () => {
          resolve({
            output: output.trim(),
            error: errorOutput,
          });
        });

        // Send input
        proc.stdin.write(test.input);
        proc.stdin.end();
      });

      const passed = result.output === test.expected_output.trim();

      results.push({
        input: test.input,
        expected: test.expected_output,
        output: result.output,
        passed,
      });
    }

    // Cleanup temp file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {}

    return res.json({
      success: true,
      results,
      verdict: results.every((r) => r.passed)
        ? "Accepted"
        : "Wrong Answer",
    });

  } catch (err) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}

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

  try {
    const { data: submission, error } = await supabase
      .from("submissions")
      .insert([
        {
          user_id: userId,
          problem_id: problemId,
          code,
          language,
          status: "Pending",
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({
      message: "Code submitted successfully",
      submission,
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