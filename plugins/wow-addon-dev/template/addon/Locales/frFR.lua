-- Locales/frFR.lua: French. Loaded after enUS.lua; does nothing on another client.
local _, ns = ...
if GetLocale() ~= "frFR" then return end

local L = ns.L
L["loaded. Type /%s for help."] = "chargé. Tape /%s pour l'aide."
L["version %s"] = "version %s"
L["Commands:"] = "Commandes :"
L["shows the version"] = "affiche la version"
