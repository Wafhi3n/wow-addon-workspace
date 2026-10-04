-- check_size.lua: flag Lua files and functions that grew too long to work on comfortably.
--
-- Usage: lua check_size.lua <maxFile> <maxFunc> <listfile>      (one path per line)
--
-- The source is tokenized (comments and strings skipped) so a function's length is measured from
-- its `function` to its matching `end`, whatever keywords sit in its strings and comments.
-- Prints one line per file or function over its limit. Exit code 1 if any.

local maxFile = tonumber(arg[1]) or 500
local maxFunc = tonumber(arg[2]) or 60
local list = arg[3] or error("usage: lua check_size.lua <maxFile> <maxFunc> <listfile>")

local function readFile(path)
  local f = io.open(path, "rb")
  if not f then return nil end
  local c = f:read("*a")
  f:close()
  return c
end

-- The scanner state s = { src, n, i (position), line, stack (open blocks), funcs (closed ones) }.

-- A long bracket [[, [=[, [==[ ... at position p: returns (level, content start) or nil.
local function longOpenAt(src, p)
  if src:sub(p, p) ~= "[" then return nil end
  local j = p + 1
  while src:sub(j, j) == "=" do j = j + 1 end
  if src:sub(j, j) == "[" then return (j - (p + 1)), j + 1 end
  return nil
end

-- Returns the position just past the matching ]=*], counting newlines on the way.
local function skipLongBracket(s, eqs, startPos)
  local close = "]" .. string.rep("=", eqs) .. "]"
  local p = startPos
  while p <= s.n do
    local ch = s.src:sub(p, p)
    if ch == "\n" then
      s.line = s.line + 1; p = p + 1
    elseif ch == "]" and s.src:sub(p, p + #close - 1) == close then
      return p + #close
    else
      p = p + 1
    end
  end
  return s.n + 1
end

-- s.i sits on the first "-" of "--".
local function skipComment(s)
  local eqs, contentStart = longOpenAt(s.src, s.i + 2)
  if eqs then
    s.i = skipLongBracket(s, eqs, contentStart)
  else
    while s.i <= s.n and s.src:sub(s.i, s.i) ~= "\n" do s.i = s.i + 1 end
  end
end

-- s.i sits on the opening quote q.
local function skipShortString(s, q)
  s.i = s.i + 1
  while s.i <= s.n do
    local ch = s.src:sub(s.i, s.i)
    if ch == "\\" then s.i = s.i + 2
    elseif ch == "\n" then s.line = s.line + 1; s.i = s.i + 1
    elseif ch == q then s.i = s.i + 1; return
    else s.i = s.i + 1 end
  end
end

-- The text between `function` and its "(" (or the end of the line).
local function functionName(s)
  local p = s.i
  while s.src:sub(p, p):match("[ \t]") do p = p + 1 end
  local start = p
  while p <= s.n and s.src:sub(p, p) ~= "(" and s.src:sub(p, p) ~= "\n" do p = p + 1 end
  local name = s.src:sub(start, p - 1):gsub("%s+$", "")
  if name == "" then return "<anonymous>" end
  return name
end

-- for / while are left out on purpose: their `do` already opens the block.
local function onWord(s, word)
  if word == "function" then
    s.stack[#s.stack + 1] = { type = "function", line = s.line, name = functionName(s) }
  elseif word == "if" or word == "do" or word == "repeat" then
    s.stack[#s.stack + 1] = { type = word, line = s.line }
  elseif word == "end" or word == "until" then
    local top = s.stack[#s.stack]
    s.stack[#s.stack] = nil
    if top and top.type == "function" then
      s.funcs[#s.funcs + 1] = { name = top.name, startLine = top.line, length = s.line - top.line + 1 }
    end
  end
end

-- Returns the line count and the list of functions { name, startLine, length }.
local function analyze(src)
  local s = { src = src, n = #src, i = 1, line = 1, stack = {}, funcs = {} }
  while s.i <= s.n do
    local c = src:sub(s.i, s.i)
    if c == "\n" then
      s.line = s.line + 1; s.i = s.i + 1
    elseif c == "-" and src:sub(s.i + 1, s.i + 1) == "-" then
      skipComment(s)
    elseif c == '"' or c == "'" then
      skipShortString(s, c)
    elseif c == "[" then
      local eqs, contentStart = longOpenAt(src, s.i)
      if eqs then s.i = skipLongBracket(s, eqs, contentStart) else s.i = s.i + 1 end
    elseif c:match("[A-Za-z_]") then
      local start = s.i
      while s.i <= s.n and src:sub(s.i, s.i):match("[A-Za-z0-9_]") do s.i = s.i + 1 end
      onWord(s, src:sub(start, s.i - 1))
    else
      s.i = s.i + 1
    end
  end
  return s.line, s.funcs
end

local function report(path, src)
  local violations = 0
  local total, funcs = analyze(src)
  if total > maxFile then
    violations = violations + 1
    print(string.format("[FILE] %s: %d lines (max %d, +%d)", path, total, maxFile, total - maxFile))
  end
  for _, fn in ipairs(funcs) do
    if fn.length > maxFunc then
      violations = violations + 1
      print(string.format("[FUNCTION] %s:%d %s(): %d lines (max %d, +%d)",
        path, fn.startLine, fn.name, fn.length, maxFunc, fn.length - maxFunc))
    end
  end
  return violations
end

local fh = assert(io.open(list, "rb"))
local checked, violations = 0, 0
for raw in fh:lines() do
  local path = raw:gsub("\r$", "")
  if path ~= "" then
    local src = readFile(path)
    if not src then
      violations = violations + 1
      print("[UNREADABLE] " .. path)
    else
      checked = checked + 1
      violations = violations + report(path, src)
    end
  end
end
fh:close()

if checked == 0 and violations == 0 then
  print("=> no file in the list: nothing was checked, which is not a pass")
  os.exit(1)
end
print(string.format("=> %d file(s) checked, %d over the limit", checked, violations))
os.exit(violations == 0 and 0 or 1)
