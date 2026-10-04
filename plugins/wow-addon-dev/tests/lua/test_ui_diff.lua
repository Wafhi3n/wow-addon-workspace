-- test_ui_diff.lua: reading a UI build (scripts/lua/ui_diff.lua + ui_report.lua). Run by
-- tests/patch-diff.test.js through the plugin's own run_tests.lua, WORKSPACE_ROOT = the plugin.
--
-- WHAT IT PROTECTS: the tool exists so that a build like Forever's 70170 (WOW_PROJECT_ID going
-- from 1 to 18 in a NEW file) comes out at the top of the report, with the line of your code that
-- reads it. A diff cut wrong, a change credited to the wrong function, a word boundary too wide or
-- too narrow, and the report would wrongly say "nothing touches you", or bury the real alert.
-- Everything is made up here: neither a Gethe clone nor any addon is read.

local ROOT = WORKSPACE_ROOT
_G.UI_DIFF_LIB = true
_G.UI_DIFF_DIR = ROOT .. "/scripts/lua"
local C = assert(loadfile(ROOT .. "/scripts/lua/ui_report.lua"))()
local D = C.D

local function lines(t) return table.concat(t, "\n") .. "\n" end

-- A three-file diff modeled on 70170: a NEW file that sets a global, a changed file whose hunk
-- starts OUTSIDE any function ("end" header) then enters a definition shown as context, and a
-- deleted file.
local DIFF = lines({
    "diff --git a/Interface/AddOns/Blizzard_ProjectConstants/Camelot/ProjectConstants.lua b/Interface/AddOns/Blizzard_ProjectConstants/Camelot/ProjectConstants.lua",
    "new file mode 100644",
    "index 000000000..c6e006573",
    "--- /dev/null",
    "+++ b/Interface/AddOns/Blizzard_ProjectConstants/Camelot/ProjectConstants.lua",
    "@@ -0,0 +1,2 @@",
    "+WOW_PROJECT_CAMELOT = 18;",
    "+WOW_PROJECT_ID = WOW_PROJECT_CAMELOT;",
    "diff --git a/Interface/AddOns/Blizzard_Professions/Blizzard_ProfessionsFrame.lua b/Interface/AddOns/Blizzard_Professions/Blizzard_ProfessionsFrame.lua",
    "index 1..2 100644",
    "--- a/Interface/AddOns/Blizzard_Professions/Blizzard_ProfessionsFrame.lua",
    "+++ b/Interface/AddOns/Blizzard_Professions/Blizzard_ProfessionsFrame.lua",
    "@@ -10,6 +10,7 @@ end",
    " ",
    " function ProfessionsMixin:RecastSelectedProfession()",
    " \tlocal a = 1;",
    "-\tCastSpell(a);",
    "+\tif not open then CastSpell(a); end",
    "--- a removed comment, starting with two dashes",
    " end",
    "@@ -40,3 +41,4 @@ function ProfessionsMixin:OnShow()",
    " \tself:Refresh();",
    "+\tself:RecastSelectedProfession();",
    " end",
    "@@ -60,4 +62,5 @@ end",
    " SOUNDKIT = {",
    " \tOLD_SOUND = 1,",
    "+\tNEW_SOUND = 2,",
    "-\tGONE_SOUND = 3,",
    " }",
    "@@ -80,3 +83,3 @@ local function helper()",
    "-\treturn 1;",
    "+\treturn 2;",
    "diff --git a/Interface/AddOns/Blizzard_Old/Old.lua b/Interface/AddOns/Blizzard_Old/Old.lua",
    "deleted file mode 100644",
    "--- a/Interface/AddOns/Blizzard_Old/Old.lua",
    "+++ /dev/null",
    "@@ -1,3 +0,0 @@",
    "-function OldGlobalFunc()",
    "-\treturn 1;",
    "-end",
    "\\ No newline at end of file",
})

-- ParseDiff: paths, states, counts; a removed line that starts with "--" isn't a file header.
local files = D.ParseDiff(DIFF)
check(#files == 3, "ParseDiff: 3 files (read " .. #files .. ")")
check(files[1].status == "A" and files[1].path:match("Camelot/ProjectConstants%.lua$"), "ParseDiff: new file")
check(files[2].status == "M" and files[2].plus == 4 and files[2].minus == 4,
      "ParseDiff: +4 -4 on the changed file (read +" .. files[2].plus .. " -" .. files[2].minus .. ")")
check(files[3].status == "D" and files[3].path:match("Blizzard_Old/Old%.lua$"), "ParseDiff: deleted file")

local acc = D.NewAcc()
for _, f in ipairs(files) do D.WalkLua(f, acc) end
local function it(key) return acc.items[key] end

-- Globals set, with their value.
check(it("WOW_PROJECT_ID") and it("WOW_PROJECT_ID").plus and it("WOW_PROJECT_ID").new == "WOW_PROJECT_CAMELOT;",
      "WalkLua: WOW_PROJECT_ID set, value read")
-- Hunk opened OUTSIDE a function ("end" header): the change follows a definition shown as context
-- and belongs to it, not to the header.
check(it("ProfessionsMixin:RecastSelectedProfession") and it("ProfessionsMixin:RecastSelectedProfession").body,
      "WalkLua: change credited to the definition seen in context")
check(D.Classify(it("ProfessionsMixin:RecastSelectedProfession")) == "changed", "Classify: changed body = changed")
-- "function ..." header: the hunk is inside that function.
check(it("ProfessionsMixin:OnShow") and it("ProfessionsMixin:OnShow").body, "WalkLua: function header taken")
-- Keys of a global table.
check(it("SOUNDKIT.NEW_SOUND") and D.Classify(it("SOUNDKIT.NEW_SOUND")) == "added", "WalkLua: key added")
check(it("SOUNDKIT.GONE_SOUND") and D.Classify(it("SOUNDKIT.GONE_SOUND")) == "removed", "WalkLua: key removed")
check(not it("SOUNDKIT.OLD_SOUND"), "WalkLua: a context key isn't a change")
-- Local function: invisible to addons, nothing is credited.
check(not it("local helper") and not it("helper"), "WalkLua: local function ignored")
-- Deleted file: the function is REMOVED.
check(it("OldGlobalFunc") and D.Classify(it("OldGlobalFunc")) == "removed", "WalkLua: function removed")

-- Moving: removed from one file, added in another = changed, not gone.
local MOVE = lines({
    "diff --git a/A.lua b/A.lua", "--- a/A.lua", "+++ b/A.lua", "@@ -1,2 +1,0 @@ end",
    "-function MovedFunc()", "-end",
    "diff --git a/B.lua b/B.lua", "--- a/B.lua", "+++ b/B.lua", "@@ -1,0 +1,2 @@ end",
    "+function MovedFunc()", "+end",
})
local acc2 = D.NewAcc()
for _, f in ipairs(D.ParseDiff(MOVE)) do D.WalkLua(f, acc2) end
check(D.Classify(acc2.items["MovedFunc"]) == "changed", "Classify: a function that moves isn't removed")

-- XML: a frame name removed; `$parent...` ignored.
local XML = lines({
    "diff --git a/F.xml b/F.xml", "--- a/F.xml", "+++ b/F.xml", "@@ -1,2 +1,1 @@",
    "-\t<Frame name=\"OldTemplate\" virtual=\"true\">", "-\t<Button name=\"$parentChild\"/>", " </Ui>",
})
local acc3 = D.NewAcc()
for _, f in ipairs(D.ParseDiff(XML)) do D.WalkXml(f, acc3) end
check(acc3.items["OldTemplate"] and D.Classify(acc3.items["OldTemplate"]) == "removed", "WalkXml: template removed")
check(not acc3.items["$parentChild"], "WalkXml: $parent ignored")

-- API docs: sandbox (Enum.* cited as a value), comparison between builds.
local function doc(extraArg, extraFunc, docText)
    return lines({
        "local Spell =", "{", "\tName = \"Spell\", Type = \"System\", Namespace = \"C_Spell\",",
        "\tFunctions =", "\t{",
        "\t\t{ Name = \"Kept\", Type = \"Function\", Documentation = { \"" .. docText .. "\" },",
        "\t\t  Arguments = { { Name = \"id\", Type = \"number\", Nilable = false }" .. extraArg .. " } },",
        extraFunc,
        "\t},",
        "\tEvents = { { Name = \"Ev\", Type = \"Event\", LiteralName = \"SPELL_THING\" } },",
        "\tTables = { { Name = \"Kind\", Type = \"Enumeration\", Fields = { { Name = \"A\", Type = \"Kind\", EnumValue = 0 } } },",
        "\t           { Name = \"Ctx\", Type = \"Structure\", Fields = { { Name = \"f\", Type = \"Kind\", Default = Enum.Kind.A } } } },",
        "};", "APIDocumentation:AddDocumentationTable(Spell);",
    })
end
local OLD = doc("", "\t\t{ Name = \"Gone\", Type = \"Function\" },", "old prose")
local SAME_BUT_PROSE = doc("", "\t\t{ Name = \"Gone\", Type = \"Function\" },", "new prose")
local NEW = doc(", { Name = \"flag\", Type = \"bool\", Nilable = true }", "\t\t{ Name = \"Fresh\", Type = \"Function\" },", "x")

local oldT = assert(D.LoadApiDoc(OLD, "old"))
check(#oldT == 1 and oldT[1].Namespace == "C_Spell", "LoadApiDoc: table captured")
check(D.Ser(D.LoadApiDoc(OLD)[1].Tables[2].Fields[1].Default) == "Enum.Kind.A", "LoadApiDoc: Enum.* becomes its path")
check(#D.DiffApi(D.IndexApi(oldT), D.IndexApi(assert(D.LoadApiDoc(SAME_BUT_PROSE)))) == 0,
      "DiffApi: prose alone doesn't change the API")
local changes = D.DiffApi(D.IndexApi(oldT), D.IndexApi(assert(D.LoadApiDoc(NEW))))
local byName = {}
for _, c in ipairs(changes) do byName[c.name] = c end
check(byName["C_Spell.Gone"] and byName["C_Spell.Gone"].change == "removed", "DiffApi: function removed")
check(byName["C_Spell.Fresh"] and byName["C_Spell.Fresh"].change == "added", "DiffApi: function added")
check(byName["C_Spell.Kept"] and byName["C_Spell.Kept"].change == "changed"
      and byName["C_Spell.Kept"].delta[1] == "Arguments", "DiffApi: signature changed, field named")
check(changes[1].change == "removed", "DiffApi: removed comes first")
check(D.LoadApiDoc("local x = {", "broken") == nil, "LoadApiDoc: unreadable doc = nil, not an empty list")

-- Collect: an unreadable doc is NOTED, never skipped.
local API_DIFF = lines({
    "diff --git a/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellDocumentation.lua b/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellDocumentation.lua",
    "--- a/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellDocumentation.lua",
    "+++ b/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellDocumentation.lua",
    "@@ -1,1 +1,1 @@", "-x", "+y",
})
local blobs = { old = OLD, new = "this isn't Lua" }
local cf, cacc = C.Collect(API_DIFF, function(ref) return blobs[ref] end, "old", "new")
check(cf[1].priority == "documented API", "Collect: an API doc file is a priority")
check(#cacc.unreadable == 1, "Collect: the unreadable doc is reported")

-- Search: word boundaries.
local syms = C.BuildSymbols(acc, {})
local ours = {
    { path = "R/MyAddon/Compat.lua", text = "local id = _G.WOW_PROJECT_ID\nlocal z = MY_WOW_PROJECT_ID_X\nlocal s = WOW_PROJECT_IDS\n" },
    { path = "R/MyAddon/Chat.lua", text = "ChatEdit_ExtractTellTarget(box)\nlocal q = MyExtractTellTarget\n" },
}
local tell = { label = "ChatFrameEditBoxBaseMixin:ExtractTellTarget", kind = "method", change = "changed",
               needles = { { text = "ChatFrameEditBoxBaseMixin:ExtractTellTarget" }, { text = "ExtractTellTarget", weak = true } },
               hits = {}, strong = 0, weak = 0 }
syms[#syms + 1] = tell
C.Search(syms, ours)
local wpi
for _, s in ipairs(syms) do if s.label == "WOW_PROJECT_ID" then wpi = s end end
check(wpi and wpi.strong == 1 and wpi.hits[1].line == 1, "Search: _G.WOW_PROJECT_ID found, MY_WOW_PROJECT_ID_X and WOW_PROJECT_IDS not")
check(tell.weak == 1 and tell.hits[1].line == 1, "Search: weak clue joined by _ found, MyExtractTellTarget not")
check(C.Severity(wpi) < C.Severity(tell), "Severity: a global set comes before a changed method")

-- Method names: an OnX handler or a short name isn't a clue.
check(not D.IsDistinctive("OnEnter") and not D.IsDistinctive("Show") and D.IsDistinctive("ExtractTellTarget"),
      "IsDistinctive: OnEnter/Show no, ExtractTellTarget yes")

-- Blizzard addons the workspace names: a changed file under one of them becomes a priority.
local watched = C.WatchedNames({ { text = 'if name == "Blizzard_Professions" then' } })
local wf = { { path = "Interface/AddOns/Blizzard_Professions/X.lua" }, { path = "Interface/AddOns/Blizzard_Other/Y.lua" } }
C.MarkWatched(wf, watched)
check(wf[1].priority and not wf[2].priority, "MarkWatched: only the named addon is marked")
