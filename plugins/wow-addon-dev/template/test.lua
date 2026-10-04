-- Headless test for __NAME__, run by /wow-addon-dev:check without the game.
--
-- It loads the addon's files the way the .toc does, with the few bits of the game API they touch
-- stubbed, then checks what /__SLASH__ version prints. Copy the pattern for your own logic: stub
-- what the code calls, run it, check() what it produced.
local printed = {}
DEFAULT_CHAT_FRAME = { AddMessage = function(_, text) printed[#printed + 1] = text end }
CreateFrame = function()
    return { RegisterEvent = function() end, SetScript = function() end }
end
SlashCmdList = {}
GetLocale = function() return "enUS" end

local ns = {}
for _, file in ipairs({ "Locales/enUS.lua", "__NAME__.lua" }) do
    assert(loadfile(WORKSPACE_ROOT .. "/__NAME__/" .. file))("__NAME__", ns)
end

check(SLASH___SLASHKEY__1 == "/__SLASH__", "the /__SLASH__ command is registered")
SlashCmdList["__SLASHKEY__"]("version")
check(printed[1] ~= nil and printed[1]:find("version 0.1.0", 1, true) ~= nil, "/__SLASH__ version prints the version")
