-- 1. 建立對照表
CREATE TABLE problem_display_numbers (
    problem_id TEXT PRIMARY KEY REFERENCES problems(id) ON DELETE CASCADE,
    display_number INTEGER NOT NULL UNIQUE
);

-- 2. 為搜尋建立索引，提升查詢效能
CREATE INDEX idx_problem_display_number ON problem_display_numbers(display_number);

-- 3. (選做) 為現有的題目補上編號
-- 這裡假設按照建立時間依序編號
INSERT INTO problem_display_numbers (problem_id, display_number)
SELECT id, ROW_NUMBER() OVER (ORDER BY title ASC, id ASC)
FROM problems;