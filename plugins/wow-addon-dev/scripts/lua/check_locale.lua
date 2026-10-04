-- check_locale.lua: every string the code shows through L["..."] must exist in every overlay.
--
-- Usage: lua check_locale.lua <config.lua>
--
-- The config (written by check.js) returns:
--   addon        the addon folder name, passed to each locale file as the game does (...)
--   table        where the strings end up, as a path: { "ns", "L" } (the addon's private table,
--                the second vararg) or { "MyAddon", "L" } (a global)
--   overlays     the locales to check, e.g. { "frFR", "deDE" }; the key language is not one of them
--   localeFiles  the locale files, in load order
--   codeFiles    the files to scan for L["..."]
--   dynamicKeys  keys the code builds at run time (counted as used)
--   untranslated keys allowed to stay as they are in every overlay (brand names, "OK"...)
--   whitelist    optional Lua file returning { dynamic = {...}, allowedUntranslated = {...} }
--
-- Locale files are really run (GetLocale stubbed, one pass per overlay), not parsed with patterns:
-- the keys checked are exactly the ones the client would see. pairs(L) only returns the keys the
-- active overlay set; the key -> key fallback lives in a metatable that pairs doesn't see.
--
-- Blocking: [MISSING] (players see the untranslated key), [PLACEHOLDER] (string.format would
-- error), [PARITY] (overlays out of step). Warning only: [DEAD] (an overlay key no code uses).
-- Exit code 0 = fine, 1 = blocking problem, 2 = a locale file failed to load.

local cfg = dofile(arg[1] or error("usage: lua check_locale.lua <config.lua>"))

local function readFile(path)
  local fh = io.open(path, "rb")
  if not fh then return nil end
  local s = fh:read("*a"); fh:close()
  return s
end

local function sortedKeys(t)
  local keys = {}
  for k in pairs(t) do keys[#keys + 1] = k end
  table.sort(keys)
  return keys
end

-- The ordered format specifiers (%d, %s, %.2f...). %% is a literal percent sign.
local function placeholders(str)
  local seq, i, n = {}, 1, #str
  while i <= n do
    if str:sub(i, i) == "%" then
      if str:sub(i + 1, i + 1) == "%" then
        i = i + 2
      else
        local conv = str:match("^%%[%-%+ #0-9%.]*(%a)", i)
        if conv then seq[#seq + 1] = conv end
        i = i + 1
      end
    else
      i = i + 1
    end
  end
  return table.concat(seq, ",")
end

----------------------------------------------------------------------------------------------------
-- Keys the code uses: L["..."] / L['...'] literals, outside comments and other strings.
----------------------------------------------------------------------------------------------------

local function longOpenAt(src, p)
  if src:sub(p, p) ~= "[" then return nil end
  local j = p + 1
  while src:sub(j, j) == "=" do j = j + 1 end
  if src:sub(j, j) == "[" then return j - (p + 1), j + 1 end
  return nil
end

-- Returns (position after the closing bracket, newlines crossed).
local function skipLong(src, eqs, from)
  local close = "]" .. string.rep("=", eqs) .. "]"
  local stop = src:find(close, from, true) or #src
  local _, lines = src:sub(from, stop):gsub("\n", "")
  return stop + #close, lines
end

-- A short string literal starting at p. Returns (value or nil, position after it). The value is
-- resolved by Lua itself, so escapes come out exactly as the game would read them.
local function readShort(src, p)
  local q, i = src:sub(p, p), p + 1
  while i <= #src do
    local c = src:sub(i, i)
    if c == "\\" then
      i = i + 2
    elseif c == q then
      local f = loadstring("return " .. src:sub(p, i))
      local ok, val = pcall(f or error)
      return (ok and type(val) == "string") and val or nil, i + 1
    elseif c == "\n" then
      return nil, i
    else
      i = i + 1
    end
  end
  return nil, i
end

-- After the identifier L at position i: a literal key inside [ ]? Returns (key, next position).
local function keyAfterL(src, i)
  local q = src:match("^%s*%[%s*()['\"]", i)
  if not q then return nil, i end
  return readShort(src, q)
end

local function scanCode(path, used)
  local src = readFile(path)
  if not src then return false end
  local i, n, line = 1, #src, 1
  while i <= n do
    local c = src:sub(i, i)
    if c == "\n" then
      line = line + 1; i = i + 1
    elseif c == "-" and src:sub(i + 1, i + 1) == "-" then
      local eqs, from = longOpenAt(src, i + 2)
      if eqs then
        local after, crossed = skipLong(src, eqs, from)
        i, line = after, line + crossed
      else
        i = (src:find("\n", i, true) or n + 1)
      end
    elseif c == '"' or c == "'" then
      local _, after = readShort(src, i)
      i = after
    elseif c == "[" and longOpenAt(src, i) then
      local eqs, from = longOpenAt(src, i)
      local after, crossed = skipLong(src, eqs, from)
      i, line = after, line + crossed
    elseif c:match("[%a_]") then
      local start = i
      while i <= n and src:sub(i, i):match("[%w_]") do i = i + 1 end
      if src:sub(start, i - 1) == "L" then
        local key, after = keyAfterL(src, i)
        if key then
          used[key] = used[key] or (path .. ":" .. line)
          i = after
        end
      end
    else
      i = i + 1
    end
  end
  return true
end

----------------------------------------------------------------------------------------------------
-- Overlays, really loaded: GetLocale stubbed, each locale file run with (addon, ns) like the game.
----------------------------------------------------------------------------------------------------

local function loadOverlay(lang)
  _G.GetLocale = function() return lang end
  local ns, root = {}, cfg.table[1]
  if root ~= "ns" then _G[root] = {} end
  for _, f in ipairs(cfg.localeFiles) do
    local chunk, err = loadfile(f)
    local ok = chunk ~= nil
    if ok then ok, err = pcall(chunk, cfg.addon, ns) end
    if not ok then
      print("[LOAD] " .. f .. ": " .. tostring(err))
      os.exit(2)
    end
  end
  local L = (root == "ns") and ns or _G[root]
  for idx = 2, #cfg.table do L = type(L) == "table" and L[cfg.table[idx]] or nil end
  if root ~= "ns" then _G[root] = nil end
  local keys = {}
  if type(L) == "table" then for k, v in pairs(L) do keys[k] = v end end
  return keys
end

----------------------------------------------------------------------------------------------------
-- Checks
----------------------------------------------------------------------------------------------------

local function checkOverlay(lang, ov, used, untranslated)
  local errors, warnings = 0, 0
  for _, key in ipairs(sortedKeys(used)) do
    if ov[key] == nil and not untranslated[key] then
      errors = errors + 1
      print(string.format("[MISSING %s] %s   (%s)", lang, key, used[key]))
    end
  end
  for _, key in ipairs(sortedKeys(ov)) do
    if not used[key] then
      warnings = warnings + 1
      print(string.format("[DEAD %s] %s", lang, key))
    end
    if type(ov[key]) == "string" and placeholders(key) ~= placeholders(ov[key]) then
      errors = errors + 1
      print(string.format("[PLACEHOLDER %s] %s", lang, key))
    end
  end
  return errors, warnings
end

local function checkParity(overlays)
  local errors, ref = 0, overlays[1]
  for idx = 2, #overlays do
    local ov = overlays[idx]
    for _, key in ipairs(sortedKeys(ref)) do
      if ov[key] == nil then
        errors = errors + 1
        print(string.format("[PARITY %s] %s is missing (present in %s)", cfg.overlays[idx], key, cfg.overlays[1]))
      end
    end
    for _, key in ipairs(sortedKeys(ov)) do
      if ref[key] == nil then
        errors = errors + 1
        print(string.format("[PARITY %s] %s is extra (absent from %s)", cfg.overlays[idx], key, cfg.overlays[1]))
      end
    end
  end
  return errors
end

----------------------------------------------------------------------------------------------------
-- Entry point
----------------------------------------------------------------------------------------------------

local used, untranslated = {}, {}
local function addAll(list, set, value)
  for _, k in ipairs(list or {}) do set[k] = set[k] or value end
end
addAll(cfg.dynamicKeys, used, "declared dynamic")
addAll(cfg.untranslated, untranslated, true)
if cfg.whitelist then
  local wl = dofile(cfg.whitelist) or {}
  addAll(wl.dynamic, used, "declared dynamic")
  addAll(wl.allowedUntranslated, untranslated, true)
end
for _, f in ipairs(cfg.codeFiles) do
  if not scanCode(f, used) then print("[UNREADABLE] " .. f); os.exit(2) end
end

local overlays, errors, warnings = {}, 0, 0
for idx, lang in ipairs(cfg.overlays) do
  overlays[idx] = loadOverlay(lang)
  local e, w = checkOverlay(lang, overlays[idx], used, untranslated)
  errors, warnings = errors + e, warnings + w
end
errors = errors + checkParity(overlays)

print(string.format("=> %d key(s) used, %d overlay(s), %d blocking problem(s), %d dead key(s)",
  #sortedKeys(used), #cfg.overlays, errors, warnings))
os.exit(errors == 0 and 0 or 1)
