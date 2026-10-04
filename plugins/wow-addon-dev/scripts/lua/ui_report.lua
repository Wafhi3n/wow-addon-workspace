-- ui_report.lua: read a new build of Blizzard's UI code and say what it touches in YOUR addons.
--
-- Run by scripts/patch-diff.js, which resolves the Gethe clone, the two revisions and the list of
-- the workspace's files (addons.json). Here: the diff (git), the API docs on both sides, a search
-- for every changed symbol in the addons, the report. Reading the diff lives in ui_diff.lua.
--
-- Usage: lua ui_report.lua --src <clone> --from <rev> --to <rev> --files <list> --root <workspace>
-- Exit code 1 when an input is missing or an API doc file can't be read: a report that kept quiet
-- about a hole would wrongly say "nothing touches you".
-- Used as a library when _G.UI_DIFF_LIB is set (the plugin's Lua tests).

local BS = string.char(92)
local HERE = _G.UI_DIFF_DIR or ((arg and arg[0] or ""):match("^(.*)[/" .. BS .. "]") or ".")
local D = assert(loadfile(HERE .. "/ui_diff.lua"))()

local M = { D = D }

M.HITS_SHOWN = 4      -- hits shown per symbol in the report
M.HITS_KEPT = 50      -- hits kept per symbol (a very common name doesn't flood memory)

local KIND = {
    func = "function", method = "method", global = "global set", field = "table key",
    xml = "XML frame/template", ["function"] = "API", widget = "widget method", event = "event",
    enum = "enum", constants = "constants", structure = "structure",
}
local CHANGE = { removed = "REMOVED", changed = "changed", added = "added" }

----------------------------------------------------------------------------------------------------
-- Collecting: the diff, plus the API docs on both sides
----------------------------------------------------------------------------------------------------

local function loadSide(f, ref, present, readBlob, index, acc)
    if not present then return end
    local text = readBlob(ref, f.path)
    local tables, err = D.LoadApiDoc(text or "", f.path)
    if not tables or #tables == 0 then
        acc.unreadable[#acc.unreadable + 1] = f.path .. " @" .. ref .. ": " .. tostring(err or "no table")
        return
    end
    D.IndexApi(tables, index)
end

-- readBlob(ref, path) -> text: injected (git for real, a table in the tests).
function M.Collect(diffText, readBlob, from, to)
    local files = D.ParseDiff(diffText)
    local acc = D.NewAcc()
    local oldIdx, newIdx = {}, {}
    for _, f in ipairs(files) do
        if f.path:find("Blizzard_APIDocumentationGenerated/", 1, true) then
            f.priority = "documented API"
            if f.ext == "lua" then
                loadSide(f, from, f.status ~= "A", readBlob, oldIdx, acc)
                loadSide(f, to, f.status ~= "D", readBlob, newIdx, acc)
            end
        elseif f.ext == "lua" then D.WalkLua(f, acc)
        elseif f.ext == "xml" then D.WalkXml(f, acc) end
        if f.ext == "toc" then f.priority = "load list (.toc)" end
        if f.path:find("Blizzard_ProjectConstants/", 1, true) then f.priority = "project constants" end
    end
    return files, acc, D.DiffApi(oldIdx, newIdx)
end

----------------------------------------------------------------------------------------------------
-- Symbols to search for
----------------------------------------------------------------------------------------------------

local function sym(label, kind, change, file, needles, extra)
    local s = { label = label, kind = kind, change = change, file = file, needles = needles, hits = {},
                strong = 0, weak = 0 }
    for k, v in pairs(extra or {}) do s[k] = v end
    return s
end

-- A global set goes FIRST, even when "added": setting a name that already existed elsewhere (C
-- side, another file) changes the value your code reads (WOW_PROJECT_ID on Forever build 70170).
local function severity(s)
    if s.kind == "global" or s.kind == "field" then return 1 end
    return D.RANK[s.change] or 3
end
M.Severity = severity

function M.BuildSymbols(acc, apiChanges)
    local out = {}
    for _, key in ipairs(acc.order) do
        local it = acc.items[key]
        if it.kind ~= "table" then
            local change = D.Classify(it)
            local needles
            if it.kind == "method" then
                needles = { { text = it.owner .. ":" .. it.method }, { text = it.owner .. "." .. it.method } }
                if D.IsDistinctive(it.method) then needles[#needles + 1] = { text = it.method, weak = true } end
            else
                needles = { { text = key } }
            end
            out[#out + 1] = sym(key, it.kind, change, it.file, needles, { old = it.old, new = it.new })
        end
    end
    for _, c in ipairs(apiChanges) do
        local needles
        if c.kind == "widget" then
            needles = D.IsDistinctive(c.method) and { { text = c.method, weak = true } } or {}
        elseif c.kind ~= "structure" then
            needles = { { text = c.name } }
        end
        if needles then
            out[#out + 1] = sym(c.name, c.kind, c.change, "API docs", needles, { delta = c.delta })
        end
    end
    return out
end

----------------------------------------------------------------------------------------------------
-- Searching the addons
----------------------------------------------------------------------------------------------------

-- Boundaries: a strong symbol is a whole word (`_G.WOW_PROJECT_ID` yes, `MY_WOW_PROJECT_ID` no);
-- a method name, a weak clue, accepts a prefix joined by "_" (ChatEdit_ExtractTellTarget).
local function bounded(text, s, e, weak)
    local before, after = text:sub(s - 1, s - 1), text:sub(e + 1, e + 1)
    if after:match("[%w_]") then return false end
    if weak then return not before:match("%w") end
    return not before:match("[%w_]")
end

local function lineAt(text, pos)
    local ls = pos
    while ls > 1 and text:sub(ls - 1, ls - 1) ~= "\n" do ls = ls - 1 end
    local le = text:find("\n", pos, true) or (#text + 1)
    local _, n = text:sub(1, ls):gsub("\n", "")
    return n + 1, (text:sub(ls, le - 1):gsub("\r$", ""):gsub("^%s+", ""))
end

local function addHit(s, f, pos, weak)
    if weak then s.weak = s.weak + 1 else s.strong = s.strong + 1 end
    if #s.hits >= M.HITS_KEPT then return end
    local n, code = lineAt(f.text, pos)
    for _, h in ipairs(s.hits) do if h.path == f.path and h.line == n then return end end
    s.hits[#s.hits + 1] = { path = f.path, line = n, code = code:sub(1, 110), weak = weak,
                            comment = code:sub(1, 2) == "--" or code:sub(1, 1) == "#" }
end

-- A file's words, once: a strong symbol whose last segment isn't among them is ruled out without
-- scanning the text (megabytes of code, hundreds of symbols per build).
local function words(f)
    if not f.words then
        local t = {}
        for w in f.text:gmatch("[%a_][%w_]*") do t[w] = true end
        f.words = t
    end
    return f.words
end

-- files = { {path, text} }; fills s.hits, s.strong, s.weak.
function M.Search(symbols, files)
    for _, f in ipairs(files) do
        for _, s in ipairs(symbols) do
            for _, nd in ipairs(s.needles) do
                nd.seg = nd.seg or nd.text:match("([%a_][%w_]*)$") or nd.text
                local init = (nd.weak or words(f)[nd.seg]) and 1 or (#f.text + 1)
                while true do
                    local a, b = f.text:find(nd.text, init, true)
                    if not a then break end
                    if bounded(f.text, a, b, nd.weak) then addHit(s, f, a, nd.weak) end
                    init = b + 1
                end
            end
        end
    end
end

-- The Blizzard addons YOUR code names (loading, ADDON_LOADED, attaching): a changed file under one
-- of them is worth reading even when no name matches.
function M.WatchedNames(files)
    local set = {}
    for _, f in ipairs(files) do
        for name in f.text:gmatch("Blizzard_[%w_]+") do set[name] = true end
    end
    return set
end

function M.MarkWatched(diffFiles, watched)
    for _, f in ipairs(diffFiles) do
        for seg in f.path:gmatch("[^/]+") do
            local base = seg:gsub("%.%w+$", "")
            if watched[base] and not f.priority then f.priority = "your addons name " .. base end
        end
    end
end

----------------------------------------------------------------------------------------------------
-- Report
----------------------------------------------------------------------------------------------------

local function rel(path, root)
    local p = path:gsub(BS, "/")
    local r = (root or ""):gsub(BS, "/"):gsub("/$", "")
    if r ~= "" and p:sub(1, #r):lower() == r:lower() then p = p:sub(#r + 2) end
    return p
end

local function short(path) return (path:gsub("^Interface/AddOns/", "")) end

function M.SymHeader(s)
    local txt = "  " .. (CHANGE[s.change] or s.change) .. "  " .. (KIND[s.kind] or s.kind) .. "  " .. s.label
    if s.kind == "global" or s.kind == "field" then
        if s.old and s.new and s.old ~= s.new then txt = txt .. "   (" .. s.old .. "  ->  " .. s.new .. ")"
        elseif s.new or s.old then txt = txt .. " = " .. (s.new or s.old) end
    end
    if s.delta and #s.delta > 0 then txt = txt .. "   [" .. table.concat(s.delta, ", ") .. "]" end
    return txt .. "   <- " .. short(s.file or "?")
end

local function printHits(s, root, weak)
    table.sort(s.hits, function(a, b)
        if a.comment ~= b.comment then return not a.comment end
        if a.path ~= b.path then return a.path < b.path end
        return a.line < b.line
    end)
    local shown, total = 0, 0
    for _, h in ipairs(s.hits) do
        if (h.weak == true) == weak then
            total = total + 1
            if shown < M.HITS_SHOWN then
                shown = shown + 1
                print("      " .. rel(h.path, root) .. ":" .. h.line .. "   " .. h.code)
            end
        end
    end
    if total > shown then print("      (+" .. (total - shown) .. " more lines)") end
end

local function bySeverity(a, b)
    local sa, sb = severity(a), severity(b)
    if sa ~= sb then return sa < sb end
    return a.label < b.label
end

local function pick(symbols, pred)
    local list = {}
    for _, s in ipairs(symbols) do if pred(s) then list[#list + 1] = s end end
    table.sort(list, bySeverity)
    return list
end

function M.PrintTouches(symbols, root)
    local list = pick(symbols, function(s) return s.strong > 0 end)
    print("[1] TOUCHES YOUR CODE: changed at Blizzard AND used in your addons (" .. #list .. ")")
    if #list == 0 then print("  nothing.") end
    for _, s in ipairs(list) do print(M.SymHeader(s)); printHits(s, root, false) end
    return #list
end

function M.PrintPriority(diffFiles)
    local list = {}
    for _, f in ipairs(diffFiles) do if f.priority then list[#list + 1] = f end end
    table.sort(list, function(a, b)
        if a.priority ~= b.priority then return a.priority < b.priority end
        return a.path < b.path
    end)
    print(""); print("[2] READ FIRST (" .. #list .. " files)")
    if #list == 0 then print("  nothing.") end
    for _, f in ipairs(list) do
        print("  " .. f.priority .. ": " .. f.status .. " " .. short(f.path) .. " (+" .. f.plus .. " -" .. f.minus .. ")")
    end
end

function M.PrintApi(apiChanges)
    print(""); print("[3] DOCUMENTED API")
    if #apiChanges == 0 then print("  no change.") return end
    local groups = { removed = {}, changed = {}, added = {} }
    for _, c in ipairs(apiChanges) do
        local t = (KIND[c.kind] or c.kind) .. " " .. c.name
        if c.delta and #c.delta > 0 then t = t .. " [" .. table.concat(c.delta, ", ") .. "]" end
        table.insert(groups[c.change], t)
    end
    for _, ch in ipairs({ "removed", "changed", "added" }) do
        local g = groups[ch]
        if #g > 0 then print("  " .. CHANGE[ch] .. " (" .. #g .. "):") end
        for i, t in ipairs(g) do
            if i > 40 then print("    (+" .. (#g - 40) .. " more)") break end
            print("    " .. t)
        end
    end
end

function M.PrintWeak(symbols, root)
    local list = pick(symbols, function(s) return s.strong == 0 and s.weak > 0 end)
    print(""); print("[4] WEAK CLUES: the same method name in your code, your call (" .. #list .. ")")
    if #list == 0 then print("  nothing.") end
    for _, s in ipairs(list) do print(M.SymHeader(s)); printHits(s, root, true) end
    return #list
end

function M.PrintFiles(diffFiles, acc)
    print(""); print("[5] CHANGED CODE, FILE BY FILE (" .. #diffFiles .. ")")
    local per = {}
    for _, key in ipairs(acc.order) do
        local it = acc.items[key]
        per[it.file] = per[it.file] or {}
        table.insert(per[it.file], key)
    end
    for _, f in ipairs(diffFiles) do
        local names = per[f.path] or {}
        local txt = table.concat(names, ", ", 1, math.min(#names, 6))
        if #names > 6 then txt = txt .. " (+" .. (#names - 6) .. ")" end
        print("  " .. f.status .. " " .. short(f.path) .. " (+" .. f.plus .. " -" .. f.minus .. ")"
              .. (txt ~= "" and (": " .. txt) or ""))
    end
end

----------------------------------------------------------------------------------------------------
-- Entry point
----------------------------------------------------------------------------------------------------

local function quote(s) return '"' .. s .. '"' end

-- The command line starts with `git`, never with a quote: cmd.exe (under io.popen on Windows)
-- strips the first and last quote of a line that starts with one.
local function git(src, args)
    local p = io.popen("git -c core.quotepath=false -C " .. quote(src) .. " " .. args)
    if not p then return nil end
    local out = p:read("*a")
    p:close()
    return out
end

local function readFile(path)
    local fh = io.open(path, "rb")
    if not fh then return nil end
    local t = fh:read("*a")
    fh:close()
    return t
end

local function parseArgs(argv)
    local o, i = {}, 1
    while i <= #argv do
        local k = argv[i]:match("^%-%-(.+)$")
        if k then o[k] = argv[i + 1]; i = i + 2 else i = i + 1 end
    end
    return o
end

local function loadOurFiles(listPath)
    local list = readFile(listPath)
    if not list then return nil end
    local files = {}
    for p in list:gmatch("[^\r\n]+") do
        local t = readFile(p)
        if t then files[#files + 1] = { path = p, text = t } end
    end
    return files
end

local function fail(msg) print("ERROR: " .. msg); os.exit(1) end

function M.Main(argv)
    local o = parseArgs(argv)
    for _, k in ipairs({ "src", "from", "to", "files" }) do if not o[k] then fail("--" .. k .. " missing") end end
    local ours = loadOurFiles(o.files)
    if not ours or #ours == 0 then fail("no file of your addons could be read (list " .. o.files .. ")") end
    local function readBlob(ref, path) return git(o.src, "cat-file -p " .. quote(ref .. ":" .. path)) end
    local diff = git(o.src, "diff --no-color --no-renames -U3 " .. o.from .. " " .. o.to .. " -- Interface")
    if not diff then fail("git diff didn't run") end
    local version = function(ref) return ((readBlob(ref, "version.txt") or "?"):gsub("%s+", "")) end
    print("== What a new build of Blizzard's UI changes, and where your addons use it ==")
    print("  from " .. version(o.from) .. " (" .. o.from .. ") to " .. version(o.to) .. " (" .. o.to .. ")")
    local diffFiles, acc, api = M.Collect(diff, readBlob, o.from, o.to)
    if #diffFiles == 0 then print("  No UI change between these two revisions (version.txt at most).") return end
    M.MarkWatched(diffFiles, M.WatchedNames(ours))
    local symbols = M.BuildSymbols(acc, api)
    M.Search(symbols, ours)
    print("  " .. #diffFiles .. " UI files changed; " .. #symbols .. " symbols searched in "
          .. #ours .. " files of your addons.")
    print("")
    local touches = M.PrintTouches(symbols, o.root)
    M.PrintPriority(diffFiles)
    M.PrintApi(api)
    local weak = M.PrintWeak(symbols, o.root)
    M.PrintFiles(diffFiles, acc)
    print(""); print("SUMMARY: " .. touches .. " symbol(s) touch your code, " .. weak .. " weak clue(s).")
    if #acc.unreadable > 0 then
        print("!! UNREADABLE API DOC, the report has a hole:")
        for _, u in ipairs(acc.unreadable) do print("!!   " .. u) end
        os.exit(1)
    end
end

if not _G.UI_DIFF_LIB then M.Main(arg or {}) end
return M
