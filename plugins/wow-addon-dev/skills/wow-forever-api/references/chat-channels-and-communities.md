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
| `WHISPER` of **more than 255 bytes** | `Success`, then **cut to 255 bytes** on the other side, with no error anywhere (below) | 2026-10-05, build 70205 |
| **Text** in Trade - English / Trade (Services) | an addon can post from a typed command, other players' addons read it, across all capitals; a 3rd post within 10 s on the same channel is refused; chat cuts at 255 bytes | 2026-09-29, build 70058 |

Careful with custom channels (Forever, seen September 2026): two characters can join a channel
with the same name and still land in two different channels, so a custom channel works like a
room, not a server-wide channel. Each underlying realm gets its own copy: see "A custom channel
stops at your realm" below.

On **Era** it was the other way round for custom channels: 0 messages out of 176 between two
accounts on the same Battle.net (PTR, 2026-06-30), which left whispers as the only reliable route
there. `CHAT_MSG_CHANNEL_JOIN` / `_LEAVE` do fire on Forever, so presence by channel is usable.
Seen with two clients on 2026-09-19: one public message arrived **three times** (addon message on
the channel, text beacon, whispers) because all three routes deliver on Forever. Deduplicate by id.

## A custom channel stops at your realm

**Forever, 2026-10-07, build 70245**, three accounts. Realms still exist under the megaserver. At
character creation the player picks a ruleset (PvE, PvP), not a realm: the game assigns an
underlying realm (reported by the player who created the third character). Characters of different
underlying realms share the world (same city, same layer) and can whisper each other, but each
realm gets its own copy of a custom channel.

| Character | `GetRealmName()` | `GetRealmID()` | GUID | Members of its `CraftLinkNet` (`C_ChatInfo.GetChannelRosterInfo`) |
|---|---|---|---|---|
| A | Classic Beta PvE 2 | 4620 | `Player-4620-…` | A and B |
| B | Classic Beta PvE 2 | 4620 | `Player-4620-…` | A and B |
| C | Classic Beta PvE | 4618 | `Player-4618-…` | C and a stranger, also `Player-4618-…` |

- `GetRealmID()` is the server part of the player GUID, on all three characters.
- Every member of a channel copy had the same realm ID (2 copies of 2 members, a small sample).
- Nothing on the channel tells the copies apart: `GetChannelName("CraftLinkNet")` returns
  `6, "CraftLinkNet", 0, false` in both, and `C_ChatInfo.GetChannelInfoFromIdentifier` gives
  `instanceID = 0`, `zoneChannelID = 0`, `channelType = 0` in both.
- `C_AutoComplete.GetAutoCompleteRealms()` returns `{}`: no API lists the realms, so their number is
  unknown and may grow at launch.
- Whispers cross realms: a character on 4620 held professions it had received **directly** (not
  relayed) from the stranger on 4618, in an addon's saved data dated 2026-10-05.

Rules:
- A custom channel reaches your own underlying realm only, and `SendAddonMessage` returns `Success`
  either way. To reach the other realms, whisper.
- To know a peer's realm, have them send their `GetRealmID()`. Names carry no realm ("First
  Surname", no `-Realm`) and `CHAT_MSG_ADDON` carries no GUID; you only get a GUID for members of
  your own channel copy (roster) or a unit you can target or mouse over.
- Never hard-code the number of realms.

Not measured: whether one realm can hold several copies of a channel (the September case, two
players side by side in different copies, never had both realms read); the `instanceID` argument of
`CHAT_MSG_ADDON` for a message received on a channel; PvP realms.

## An addon message is cut at 255 bytes, and nobody tells you

**Forever, 2026-10-05, build 70205**, two accounts, `WHISPER` to the full name, a 5-character
prefix. Messages of 200, 254, 255, 256, 300, 600 and 1000 bytes: every
`C_ChatInfo.SendAddonMessage` returned `0` (`Success`). The receiver got the 200, 254 and 255-byte
messages whole, and **exactly the first 255 bytes** of each longer one. No Lua error, no other
return code, no system message on either side. The prefix didn't count against the 255.

Rules:
- `Success` says nothing about length. Check the size where you build the message, and split
  anything that can grow (a list of IDs, a registry, free text) into parts of 255 bytes or less,
  each one readable on its own.
- A cut list can end with a **wrong** last item rather than a missing one (`1a.2f.3k` arrives as
  `1a.2f.3`): a receiver that parses it stores a value nobody sent.
- An envelope around a message (a relay that adds the original sender's name) eats into the same
  255 bytes.
- Not measured: other distributions (`CHANNEL`, `GUILD`, `PARTY`), and whether a multibyte UTF-8
  character can be cut in half.

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
