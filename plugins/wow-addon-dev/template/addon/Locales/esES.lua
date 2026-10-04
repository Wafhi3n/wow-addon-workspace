-- Locales/esES.lua: Spanish, for esES and esMX clients. Loaded after enUS.lua; does nothing on
-- another client.
local _, ns = ...
local locale = GetLocale()
if locale ~= "esES" and locale ~= "esMX" then return end

local L = ns.L
L["loaded. Type /%s for help."] = "cargado. Escribe /%s para ver la ayuda."
L["version %s"] = "versión %s"
L["Commands:"] = "Comandos:"
L["shows the version"] = "muestra la versión"
