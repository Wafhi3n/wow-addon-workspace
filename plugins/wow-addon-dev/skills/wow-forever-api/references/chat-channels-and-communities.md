# Chat, channels, communities and player names

Most of these rules were measured with two accounts on two clients, September and October 2026.

## Names: first name and surname

**Forever, 2026-09-27**, confirmed by `Blizzard_FrameXMLUtil\Camelot\NameUtil.lua`:
- `UnitName(unit)` returns **`firstName, surname`**. The 2nd value is NOT the realm.
- `GetUnitName(unit, true)` and `UnitFullName("player")` return **"First Surname"** (separator: a
  space, `CHARACTERNAME_SURNAME_SEPARATOR`).
- The server uses the full name everywhere: sender of `CHAT_MSG_ADDON` / `CHAT_MSG_CHANNEL`, whisper
  target, channel members, `ClubMemberInfo.name`. The **full** name is unique; **several players can
  share a first name**.
- The 2nd word is not the Battle.net name (two characters on the same account have different
  surnames).

Rules: "me" on the network is the full name; never cut a received name down to its first name to
compare it; tell whether a member is you by `isSelf` or the GUID, never by comparing names. A
whisper to the full name reaches the right character.

## A game channel has two names, and "trade" means three channels

Measured on 2026-09-30 (English client, Ironforge). `GetChannelName(i)` and the `channelName` of
`CHAT_MSG_CHANNEL` give the LONG name ("Trade (Services) - English", "Trade (Local) - Ironforge",
"General - Ironforge"); `GetChannelDisplayInfo(i)` gives a SHORT name ("Services", "TradeLocal")
and a category (`CHANNEL_CATEGORY_WORLD` / `_CUSTOM`). Looking for "trade" in the name catches three
channels for one. Strip the "N. " prefix and the " - Zone" suffix first, or "General - Trade
District" passes for a trade channel. Not measured: the French, German and Spanish names of Trade
(Local); a CUSTOM channel named "Trade..." passes for the game's.

## What carries an addon message, and what swallows it

| Route (Forever) | Result | Date |
|---|---|---|
| `SendAddonMessage` on a **custom** channel | delivered, same Battle.net or different ones | 2026-09-19 |
| `SendAddonMessage` on a **game** channel (General, Trade, LocalDefense...) | `Success`, then **swallowed**: nothing on the other side, not even the echo to yourself | 2026-09-29, build 70058 |
| `SendAddonMessage` on a **community** stream | `Success`, then swallowed | 2026-09-18 and 29 |
| `SendAddonMessage` with `SAY` / `YELL` | `InvalidChatType` outside instances | 2026-09-29 |
| `WHISPER` to the full name | delivered | 2026-09-29 |
| `WHISPER` to someone offline or a name that doesn't exist | `Success` (never `TargetOffline`), then "No player named" **~110 s later** (below) | 2026-10-03, build 70205 |
| **Text** in Trade - English / Trade (Services) | an addon can post from a typed command, other players' addons read it, across all capitals; a 3rd post within 10 s on the same channel is refused; chat cuts at 255 bytes | 2026-09-29, build 70058 |

Careful with custom channels: two characters can join a channel with the same name and still land
in two different channels, so a custom channel works like a room, not a server-wide channel. One
explanation players give: characters of the same ruleset sit on different underlying realms (not
measured).

On **Era** it was the other way round for custom channels: 0 messages out of 176 between two
accounts on the same Battle.net (PTR, 2026-06-30), which left whispers as the only reliable route
there. `CHAT_MSG_CHANNEL_JOIN` / `_LEAVE` do fire on Forever, so presence by channel is usable.
Seen with two clients on 2026-09-19: one public message arrived **three times** (addon message on
the channel, text beacon, whispers) because all three routes deliver on Forever. Deduplicate by id.

## Addon whisper to someone offline: the error comes ~110 s later

**Forever, 2026-10-03, build 70205** (Stormwind, one account, no zone change).
`C_ChatInfo.SendAddonMessage(..., "WHISPER", name)` to an offline player **or a name that doesn't
exist** returns `0` (`Success`), never `TargetOffline`. The server then answers with the system
message `CHAT_MSG_SYSTEM` "No player named 'X' is currently playing."
(`ERR_CHAT_PLAYER_NOT_FOUND_S` = `"No player named '%s' is currently playing."`, read with `/dump`),
but **108 to 112 s after the send**. The errors come in a batch, in send order. No secret values:
a `ChatFrameUtil.AddMessageEventFilter("CHAT_MSG_SYSTEM", ...)` filter receives them.

What follows, all of it learned the hard way:
- **Never conclude "no answer" without waiting more than 2 minutes.**
- **A filter that recognizes "its" whisper over a short window misses it.** An addon that hid the
  error only when the send was under 15 s old let it show to the player, and kept the departed peer
  "online", so everything sent "to all" went to them again: visible spam. A window of 5 minutes
  works, at the cost of also hiding the error of a MANUAL whisper to someone offline that the addon
  had written to in those 5 minutes.
- **Without a channel there's no other fast signal that a peer left**: the game (friends, guild,
  community) says so right away, the error two minutes later, and a stranger you only crossed
  paths with only has the error.

## Writing TEXT to a channel: a hardware event is required

`SendChatMessage(..., "CHANNEL", ...)` is protected: outside a click or key-press stack →
`ADDON_ACTION_BLOCKED`, which is **not** a Lua error (`pcall` doesn't see it, the message doesn't
go). Measured on Era 1.15, same rule on Forever. A pattern that works: a **queue emptied by the
player's input** (`WorldFrame:HookScript("OnMouseDown")` + a hidden frame with `OnKeyDown` and
`SetPropagateKeyboardInput(true)`), as Deathlog does. A `|` breaks the chat: encode it (`|` →
`~`). In a `ChatFrame_AddMessageEventFilter` filter, arguments are shifted by `(self, event)`:
channel number in 10th place, channel name in 11th.

## Communities (`C_Club`): a directory, not a transport

Forever, September 2026:
- **A message's content is opaque**: `GetMessageInfo(...).content` returns `"|Kw1|k"`, resolved
  only when drawn. `type()` says `"string"`, `issecretvalue()` says `false`, `:match()` works: all
  three naive checks pass and the payload isn't there. Same opacity in
  `CHAT_MSG_COMMUNITIES_CHANNEL`, despite the docs.
- **Being a member doesn't give you the roster**: without `C_Club.FocusMembers(clubId)`,
  `GetMemberInfo` returns a table **whose fields are all nil** (which an `if info then` lets
  through). Wait for `AreMembersReady(clubId)`.
- No professions in `ClubMemberInfo` for a character community (only for a guild). A usable name:
  `GetPlayerInfoByGUID(info.guid)`, returns 6 and 7 (`name`, `realmName`), inside a `pcall`.
- `C_Club.SendMessage` carries `HasRestrictions`: a hardware event is required. An addon can
  **neither create nor join** a club (`CreateClub`, `RedeemTicket` need a secure environment);
  `RequestTicket` isn't restricted.
- **Opening an invitation from addon code = `ADDON_ACTION_FORBIDDEN`** (2026-09-28):
  `SetItemRef("clubTicket:...")` from a button taints Blizzard's link handler for the WHOLE session
  (`/reload` to recover), and a link in a StaticPopup does too. The only clean way: a
  `|HclubTicket:...|h` link printed in the CHAT for the player to click.
- `SetClubMemberNote` from an addon = `ADDON_ACTION_FORBIDDEN`, even from a typed command and with
  `canSetOwnMemberNote = true`; a note the player sets **by hand** can be read in plain text by the
  other members' addons. The club description reads in plain text too.
- Only one club holds the presence subscription; `C_ClubFinder` is **disabled**; capacity measured
  at 1000 members.

## The game's friend list is off during the beta

Seen 2026-10-01: "Add friend" answers "This system is currently disabled"; `C_FriendList` stays
empty. Only Battle.net friends exist, and two accounts on the same Battle.net can't be friends, so a
"friends" feature gets tested by faking the friendship. Re-check at launch.
