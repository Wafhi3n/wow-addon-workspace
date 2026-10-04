-- ui_diff.lua: PURE reading of a diff of Blizzard's UI source (a Gethe/wow-ui-source clone): which
-- symbols a new build changes. No input or output here; ui_report.lua runs git, searches the
-- workspace's addons and prints the report.
--
-- TWO SOURCES OF SYMBOLS:
--   1. the UI code (.lua, .xml): global functions and methods defined or changed, globals set in
--      column 0 (`WOW_PROJECT_ID = ...`, which broke an addon on Forever build 70170), keys of a
--      global table, names of XML frames and templates;
--   2. the generated API docs (Blizzard_APIDocumentationGenerated): C_* functions, events, enums,
--      compared BETWEEN the two builds after running them in a sandbox.
--
-- A hunk header "@@ ... @@ <text>" is NOT read as "the function that holds the change": git has
-- no Lua driver, it copies the last line starting in column 0 BEFORE the hunk. With Blizzard's
-- style (definitions and `end` in column 0), that's the open function, or an `end` (outside any
-- function), but the change can follow a new definition INSIDE the hunk. Hence the line by line
-- walk, context lines included.

local M = {}

-- Severity classes, worst first; the report's order depends on it.
M.RANK = { removed = 1, changed = 2, added = 3 }

-- Method names too common to be a clue: an "OnEnter" changed at Blizzard says nothing about your
-- own OnEnter.
M.GENERIC = {
    Initialize = true, Init = true, Update = true, Refresh = true, Reset = true, Setup = true,
    SetUp = true, Show = true, Hide = true, Layout = true, Clear = true, Release = true,
    Acquire = true, GetText = true, SetText = true, UpdateLayout = true, Shutdown = true,
}

function M.IsDistinctive(method)
    if not method or #method < 8 then return false end
    if method:match("^On%u") then return false end
    return not M.GENERIC[method]
end

local function trim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end

----------------------------------------------------------------------------------------------------
-- Unified diff -> files
----------------------------------------------------------------------------------------------------

-- { path, status = "A"|"D"|"M", ext, lines = { {op, text} } }; op is " ", "+", "-", "@" (hunk
-- header, text = what follows the second @@).
function M.ParseDiff(text)
    local files, cur = {}, nil
    for line in (text .. "\n"):gmatch("([^\n]*)\n") do
        line = line:gsub("\r$", "")
        if line:sub(1, 11) == "diff --git " then
            cur = { path = line:match(" b/(.+)$") or "?", status = "M", lines = {}, inHunk = false,
                    plus = 0, minus = 0 }
            files[#files + 1] = cur
        elseif cur and not cur.inHunk then
            if line:match("^new file mode") then cur.status = "A"
            elseif line:match("^deleted file mode") then cur.status = "D"
            elseif line:match("^%+%+%+ b/") then cur.path = line:sub(7)
            elseif line:match("^%-%-%- a/") and cur.status == "D" then cur.path = line:sub(7)
            elseif line:match("^@@") then
                cur.inHunk = true
                cur.lines[#cur.lines + 1] = { op = "@", text = line:match("^@@[^@]*@@ ?(.*)$") or "" }
            end
        elseif cur then
            local op = line:sub(1, 1)
            if op == "@" then
                cur.lines[#cur.lines + 1] = { op = "@", text = line:match("^@@[^@]*@@ ?(.*)$") or "" }
            elseif op == "+" or op == "-" or op == " " then
                cur.lines[#cur.lines + 1] = { op = op, text = line:sub(2) }
                if op == "+" then cur.plus = cur.plus + 1 elseif op == "-" then cur.minus = cur.minus + 1 end
            end -- "\ No newline at end of file": ignored
        end
    end
    for _, f in ipairs(files) do
        f.inHunk = nil
        f.ext = (f.path:match("%.(%w+)$") or ""):lower()
    end
    return files
end

----------------------------------------------------------------------------------------------------
-- Lua code: definitions, globals, table keys
----------------------------------------------------------------------------------------------------

-- A definition in column 0, or nil. `owner` can be dotted (A.B:C).
function M.ParseDef(s)
    local owner, sep, meth = s:match("^function%s+([%a_][%w_%.]*)([:.])([%a_][%w_]*)%s*%(")
    if owner then
        return { key = owner .. sep .. meth, kind = "method", owner = owner, method = meth }
    end
    local name = s:match("^function%s+([%a_][%w_]*)%s*%(")
    if name then return { key = name, kind = "func", name = name } end
    local lname = s:match("^local%s+function%s+([%a_][%w_]*)")
    if lname then return { key = "local " .. lname, kind = "local" } end
    return nil
end

-- A global assignment in column 0 (`X = ...`, `X.Y = ...`), or nil. Also returns the value.
function M.ParseAssign(s)
    if s:match("^local%s") then return nil end
    local name, rest = s:match("^([%a_][%w_%.]*)%s*=(.*)$")
    if not name or rest:sub(1, 1) == "=" then return nil end
    return name, trim(rest)
end

local function closesOnSameLine(s) return s:match("%f[%w_]end%s*[;,]?%s*$") ~= nil end
local function opensTable(rhs) return rhs:match("{%s*$") ~= nil end

-- One accumulator for all files: a symbol removed from one file and added in another has MOVED,
-- it hasn't disappeared; only the whole picture knows that.
function M.NewAcc()
    return { items = {}, order = {}, xml = {}, api = {}, unreadable = {} }
end

local function item(acc, key, init)
    local it = acc.items[key]
    if not it then
        it = init
        it.key = key
        acc.items[key] = it
        acc.order[#acc.order + 1] = key
    end
    return it
end

local function touch(acc, def, op, path, value)
    local it = item(acc, def.key, { kind = def.kind, owner = def.owner, method = def.method, file = path })
    if op == "+" then it.plus = true; it.new = value or it.new
    elseif op == "-" then it.minus = true; it.old = value or it.old
    else it.body = true end
end

-- The current "context": a definition (function, method, global table) or nil (outside any block).
local function contextOf(s)
    local d = M.ParseDef(s)
    if d then return (not closesOnSameLine(s)) and d or nil end
    local name, rhs = M.ParseAssign(s)
    if name and opensTable(rhs) then return { key = name, kind = "table" } end
    return nil
end

function M.WalkLua(file, acc)
    local current
    for _, l in ipairs(file.lines) do
        local s, op = l.text, l.op
        if op == "@" then
            current = contextOf(s)
        else
            local d = M.ParseDef(s)
            local name, rhs = M.ParseAssign(s)
            if d then
                if op ~= " " and d.kind ~= "local" then touch(acc, d, op, file.path) end
                current = (not closesOnSameLine(s)) and d or nil
            elseif name then
                if op ~= " " then
                    touch(acc, { key = name, kind = "global" }, op, file.path, rhs)
                end
                current = opensTable(rhs) and { key = name, kind = "table" } or nil
            elseif s:match("^end%f[^%w_]") or s:match("^}") then
                if op ~= " " and current and current.kind ~= "local" and current.kind ~= "table" then
                    touch(acc, current, "body", file.path)
                end
                current = nil
            elseif op ~= " " and current and current.kind == "table" then
                local k, v = s:match("^%s+([%a_][%w_]*)%s*=%s*(.-)%s*,?%s*$")
                if k then touch(acc, { key = current.key .. "." .. k, kind = "field" }, op, file.path, v) end
            elseif op ~= " " and current and current.kind ~= "local" then
                touch(acc, current, "body", file.path)
            end
        end
    end
end

----------------------------------------------------------------------------------------------------
-- XML: frame and template names
----------------------------------------------------------------------------------------------------

function M.WalkXml(file, acc)
    for _, l in ipairs(file.lines) do
        if l.op == "+" or l.op == "-" then
            for name in l.text:gmatch("%sname=\"([^\"]+)\"") do
                if not name:find("$", 1, true) then
                    touch(acc, { key = name, kind = "xml" }, l.op, file.path)
                end
            end
        end
    end
end

-- What happened to a symbol: removed, changed, added.
function M.Classify(it)
    if it.minus and not it.plus then return "removed" end
    if it.plus and not it.minus and not it.body then return "added" end
    return "changed"
end

----------------------------------------------------------------------------------------------------
-- Generated API docs: run in a sandbox, then compared between builds
----------------------------------------------------------------------------------------------------

-- The doc files cite `Enum.X.Y` as a value: any unknown global becomes a probe that remembers its
-- path, so two builds citing the same value compare equal.
local PROXY = {}
local function proxy(path)
    return setmetatable({}, { __index = function(_, k) return proxy(path .. "." .. tostring(k)) end,
                              [PROXY] = path })
end
local function proxyPath(v)
    local mt = type(v) == "table" and getmetatable(v)
    return mt and mt[PROXY]
end

-- Returns the list of documented tables, or nil + error. An unreadable file is NEVER skipped
-- silently: the caller reports it.
function M.LoadApiDoc(text, label)
    local fn, err = loadstring(text, "=" .. (label or "doc"))
    if not fn then return nil, err end
    local out = {}
    local env = setmetatable({
        APIDocumentation = { AddDocumentationTable = function(_, t) out[#out + 1] = t end },
    }, { __index = function(_, k) return proxy(k) end })
    setfenv(fn, env)
    local ok, perr = pcall(fn)
    if not ok then return nil, perr end
    return out
end

-- Canonical form of an entry, without its prose (`Documentation`): two builds that only change
-- the comment don't change the API.
function M.Ser(v)
    local p = proxyPath(v)
    if p then return p end
    if type(v) ~= "table" then return tostring(v) end
    local keys = {}
    for k in pairs(v) do if k ~= "Documentation" then keys[#keys + 1] = k end end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    local parts = {}
    for _, k in ipairs(keys) do parts[#parts + 1] = tostring(k) .. "=" .. M.Ser(v[k]) end
    return "{" .. table.concat(parts, ",") .. "}"
end

local TABLE_KIND = { Enumeration = "enum", Constants = "constants" }

function M.IndexApi(tables, out)
    out = out or {}
    for _, t in ipairs(tables or {}) do
        local isObj = t.Type == "ScriptObject"
        for _, f in ipairs(t.Functions or {}) do
            local name = isObj and (t.Name .. ":" .. f.Name)
                or (t.Namespace and (t.Namespace .. "." .. f.Name) or f.Name)
            out["F " .. name] = { kind = isObj and "widget" or "function", name = name, method = f.Name, entry = f }
        end
        for _, e in ipairs(t.Events or {}) do
            local lit = e.LiteralName or e.Name
            out["E " .. lit] = { kind = "event", name = lit, entry = e }
        end
        for _, tb in ipairs(t.Tables or {}) do
            local kind = TABLE_KIND[tb.Type] or "structure"
            local name = (kind == "enum" and "Enum." or kind == "constants" and "Constants." or "") .. tb.Name
            out["T " .. name] = { kind = kind, name = name, entry = tb }
        end
    end
    return out
end

-- What differs between two entries: the top fields (Arguments, Returns, SecretArguments...) and,
-- for an enum or a structure, the members added or removed.
function M.EntryDelta(old, new)
    local fields, seen = {}, {}
    for k in pairs(old) do seen[k] = true end
    for k in pairs(new) do seen[k] = true end
    for k in pairs(seen) do
        if k ~= "Documentation" and M.Ser(old[k]) ~= M.Ser(new[k]) then fields[#fields + 1] = tostring(k) end
    end
    table.sort(fields)
    local members = old.Fields or old.Values
    local nmembers = new.Fields or new.Values
    if members and nmembers then
        local o, n, plus, minus = {}, {}, {}, {}
        for _, x in ipairs(members) do o[x.Name or "?"] = true end
        for _, x in ipairs(nmembers) do n[x.Name or "?"] = true end
        for k in pairs(n) do if not o[k] then plus[#plus + 1] = "+" .. k end end
        for k in pairs(o) do if not n[k] then minus[#minus + 1] = "-" .. k end end
        table.sort(plus); table.sort(minus)
        for _, x in ipairs(minus) do fields[#fields + 1] = x end
        for _, x in ipairs(plus) do fields[#fields + 1] = x end
    end
    return fields
end

-- { {kind, name, method, change = removed|changed|added, delta = {...}} }, by severity then name.
function M.DiffApi(oldIndex, newIndex)
    local out = {}
    for k, o in pairs(oldIndex) do
        local n = newIndex[k]
        if not n then
            out[#out + 1] = { kind = o.kind, name = o.name, method = o.method, change = "removed" }
        elseif M.Ser(o.entry) ~= M.Ser(n.entry) then
            out[#out + 1] = { kind = o.kind, name = o.name, method = o.method, change = "changed",
                              delta = M.EntryDelta(o.entry, n.entry) }
        end
    end
    for k, n in pairs(newIndex) do
        if not oldIndex[k] then
            out[#out + 1] = { kind = n.kind, name = n.name, method = n.method, change = "added" }
        end
    end
    table.sort(out, function(a, b)
        if a.change ~= b.change then return M.RANK[a.change] < M.RANK[b.change] end
        return a.name < b.name
    end)
    return out
end

return M
