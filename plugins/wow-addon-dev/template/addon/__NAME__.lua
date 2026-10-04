-- __NAME__.lua: the core of the addon. Settings, saved variables and the /__SLASH__ command.
--
-- Loads after the locale files. Saved variables are ready on this addon's own ADDON_LOADED; code
-- that needs every file of the .toc loaded waits for PLAYER_LOGIN.
local ADDON, ns = ...
local L = ns.L

ns.VERSION = "0.1.0"   -- keep it equal to ## Version in the .toc

-- Defaults. CopyDefaults fills in what's missing without touching what the player changed;
-- schemaVer is there for the day the saved data needs migrating.
ns.DEFAULTS = {
    schemaVer = 1,
}

local function CopyDefaults(dst, src)
    for k, v in pairs(src) do
        if type(v) == "table" then
            if type(dst[k]) ~= "table" then dst[k] = {} end
            CopyDefaults(dst[k], v)
        elseif dst[k] == nil then
            dst[k] = v
        end
    end
end

function ns:Print(msg)
    DEFAULT_CHAT_FRAME:AddMessage("|cff33ccff__TITLE__|r " .. tostring(msg))
end

function ns:Printf(fmt, ...)
    self:Print(string.format(fmt, ...))
end

function ns:Slash(msg)
    local cmd = ((msg or ""):match("^%s*(%S*)") or ""):lower()
    if cmd == "version" then
        self:Printf(L["version %s"], self.VERSION)
    else
        self:Print(L["Commands:"])
        self:Print("/__SLASH__ version - " .. L["shows the version"])
    end
end

SLASH___SLASHKEY__1 = "/__SLASH__"
SlashCmdList["__SLASHKEY__"] = function(msg) ns:Slash(msg) end

local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_LOGIN")
frame:SetScript("OnEvent", function(_, event, arg1)
    if event == "ADDON_LOADED" and arg1 == ADDON then
        __NAME__DB = __NAME__DB or {}
        CopyDefaults(__NAME__DB, ns.DEFAULTS)
        ns.db = __NAME__DB
    elseif event == "PLAYER_LOGIN" then
        ns:Printf(L["loaded. Type /%s for help."], "__SLASH__")
    end
end)
