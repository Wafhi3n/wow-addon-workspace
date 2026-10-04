-- check_syntax.lua: compile each file of a list with the Lua 5.1 parser, the one the game uses.
--
-- Usage: lua check_syntax.lua <listfile>      (one path per line)
--
-- Run it with Elune (or another Lua 5.1). A Lua 5.4 luac accepts code the game refuses (goto,
-- //, bitwise operators), so a green result from it means nothing for an addon.
-- Prints one [SYNTAX] line per file that doesn't compile. Exit code 1 if any.

local list = arg[1] or error("usage: lua check_syntax.lua <listfile>")
local fh = assert(io.open(list, "rb"))
local checked, bad = 0, 0
for line in fh:lines() do
  local path = line:gsub("\r$", "")
  if path ~= "" then
    checked = checked + 1
    local chunk, err = loadfile(path)
    if not chunk then
      bad = bad + 1
      print("[SYNTAX] " .. tostring(err))
    end
  end
end
fh:close()

if checked == 0 then
  print("=> no file in the list: nothing was checked, which is not a pass")
  os.exit(1)
end
print(string.format("=> %d file(s) checked, %d error(s)", checked, bad))
os.exit(bad == 0 and 0 or 1)
