-- Seed curated problems and test cases for CodeArena.
-- Run this after 01_create_tables.sql in Supabase SQL Editor.

INSERT INTO problems (id, title, slug, description, examples, constraints, difficulty, category, tags, starter_code, acceptance_rate)
VALUES
(1, 'Two Sum', 'two-sum', 'Given an array of integers nums and an integer target, return the indices of the two numbers such that they add up to target. Input format: first line n, second line n integers, third line target. Print the two indices separated by a space.', '[{"input":"4\n2 7 11 15\n9","output":"0 1","explanation":"nums[0] + nums[1] equals 9."},{"input":"3\n3 2 4\n6","output":"1 2"}]'::jsonb, '["2 <= n <= 10000","Exactly one valid answer exists."]', 'Easy', 'Arrays', ARRAY['Array','Hash Table']::text[], '{}'::jsonb, 52.4),
(3, 'Longest Substring Without Repeating Characters', 'longest-substring-without-repeating-characters', 'Given a string s, find the length of the longest substring without repeating characters. Input contains one string. Print one integer.', '[{"input":"abcabcbb","output":"3"},{"input":"bbbbb","output":"1"}]'::jsonb, '["0 <= s.length <= 50000"]', 'Medium', 'Strings', ARRAY['String','Sliding Window']::text[], '{}'::jsonb, 34.5),
(20, 'Valid Parentheses', 'valid-parentheses', 'Given a string containing only brackets, determine whether it is valid. Print true or false.', '[{"input":"()","output":"true"},{"input":"([)]","output":"false"}]'::jsonb, '["1 <= s.length <= 10000"]', 'Easy', 'Stacks', ARRAY['String','Stack']::text[], '{}'::jsonb, 40.5),
(53, 'Maximum Subarray', 'maximum-subarray', 'Given an integer array nums, find the contiguous subarray with the largest sum and print that sum. Input format: n followed by n integers.', '[{"input":"9\n-2 1 -3 4 -1 2 1 -5 4","output":"6"},{"input":"1\n1","output":"1"}]'::jsonb, '["1 <= n <= 100000"]', 'Medium', 'Dynamic Programming', ARRAY['Array','Dynamic Programming']::text[], '{}'::jsonb, 50.7),
(70, 'Climbing Stairs', 'climbing-stairs', 'You are climbing a staircase with n steps. Each time you can climb 1 or 2 steps. Print the number of distinct ways to reach the top.', '[{"input":"2","output":"2"},{"input":"3","output":"3"}]'::jsonb, '["1 <= n <= 45"]', 'Easy', 'Dynamic Programming', ARRAY['Math','Dynamic Programming']::text[], '{}'::jsonb, 52.3)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  examples = EXCLUDED.examples,
  constraints = EXCLUDED.constraints,
  difficulty = EXCLUDED.difficulty,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  acceptance_rate = EXCLUDED.acceptance_rate;

INSERT INTO test_cases (problem_id, input, expected_output, is_sample, sort_order)
VALUES
(1, '4\n2 7 11 15\n9', '0 1', true, 1),
(1, '3\n3 2 4\n6', '1 2', true, 2),
(1, '2\n3 3\n6', '0 1', false, 3),
(1, '5\n-1 -2 -3 -4 -5\n-8', '2 4', false, 4),
(3, 'abcabcbb', '3', true, 1),
(3, 'bbbbb', '1', true, 2),
(3, 'pwwkew', '3', false, 3),
(3, 'dvdf', '3', false, 4),
(20, '()', 'true', true, 1),
(20, '()[]{}', 'true', true, 2),
(20, '([)]', 'false', false, 3),
(20, '{[]}', 'true', false, 4),
(53, '9\n-2 1 -3 4 -1 2 1 -5 4', '6', true, 1),
(53, '1\n1', '1', true, 2),
(53, '5\n5 4 -1 7 8', '23', false, 3),
(53, '3\n-3 -2 -5', '-2', false, 4),
(70, '2', '2', true, 1),
(70, '3', '3', true, 2),
(70, '5', '8', false, 3),
(70, '10', '89', false, 4);
