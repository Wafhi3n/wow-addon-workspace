-- Locales/enUS.lua: the base of the translations. A key IS its English text: L["Commands:"] shows
-- "Commands:" on an English client with nothing to write here. The fallback lives in the metatable,
-- so pairs(L) only lists what an overlay set, which is what /wow-addon-dev:check reads.
local _, ns = ...

ns.L = setmetatable({}, { __index = function(_, key) return key end })
