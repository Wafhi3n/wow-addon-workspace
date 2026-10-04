-- run_tests.lua: run the workspace's headless tests (tests/test_*.lua) with Lua 5.1, no game client.
--
-- Usage: lua run_tests.lua <workspace root> <listfile>      (one test file per line, run in order)
--
-- A test file is plain Lua. It loads the addon code it exercises (dofile, loadfile with the
-- addon's (name, ns) varargs), stubs the game API it needs as globals, and calls
--   check(condition, "what should be true")
-- WORKSPACE_ROOT holds the workspace path.
--
-- Isolation: every file starts from the same _G. Globals a test sets or replaces are undone
-- afterwards, so one test's fake C_Item can't make another pass or fail depending on file order.
-- Every FAIL line names its file. A file that doesn't load counts as a failure.

local root = arg[1] or error("usage: lua run_tests.lua <workspace root> <listfile>")
local list = arg[2] or error("usage: lua run_tests.lua <workspace root> <listfile>")

local files = {}
local fh = assert(io.open(list, "rb"))
for line in fh:lines() do
  local path = line:gsub("\r$", "")
  if path ~= "" then files[#files + 1] = path end
end
fh:close()
if #files == 0 then
  print("=> no test file in the list: nothing ran, which is not a pass")
  os.exit(1)
end

_G.WORKSPACE_ROOT = root
local pass, fail = 0, 0
local current = "?"
-- The real print, taken before any test: a test that silences print and then errors must not
-- silence its own failure.
local say = print

function _G.check(cond, label)
  if cond then
    pass = pass + 1
  else
    fail = fail + 1
    say("  FAIL [" .. current .. "] " .. tostring(label))
  end
end

-- First-level snapshot of _G, taken before the first test.
local BASE = {}
for k, v in pairs(_G) do BASE[k] = v end

local function restoreGlobals()
  local extra = {}
  for k in pairs(_G) do if BASE[k] == nil then extra[#extra + 1] = k end end
  for _, k in ipairs(extra) do _G[k] = nil end
  for k, v in pairs(BASE) do _G[k] = v end
end

for _, path in ipairs(files) do
  current = path:match("[^/\\]+$") or path
  say("== " .. current .. " ==")
  local ok, err = pcall(dofile, path)
  if not ok then
    fail = fail + 1
    say("  FAIL [" .. current .. "] didn't load: " .. tostring(err))
  end
  restoreGlobals()
end

say(string.format("=> %d file(s), %d check(s) passed, %d failed", #files, pass, fail))
os.exit(fail == 0 and 0 or 1)
