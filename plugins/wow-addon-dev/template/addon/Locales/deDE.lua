-- Locales/deDE.lua: German. Loaded after enUS.lua; does nothing on another client.
local _, ns = ...
if GetLocale() ~= "deDE" then return end

local L = ns.L
L["loaded. Type /%s for help."] = "geladen. Gib /%s für die Hilfe ein."
L["version %s"] = "Version %s"
L["Commands:"] = "Befehle:"
L["shows the version"] = "zeigt die Version"
