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
| `PARTY` (two accounts grouped, outdoors) | `SendAddonMessage` returns 0, delivered; the sender comes as "First Surname", the same as `GetUnitName(unit, true)` | 2026-10-05 |
| `PARTY` once the group is a raid | delivered to your own subgroup only: nothing reaches a member moved to another group | 2026-10-05 |
| `RAID` | delivered across subgroups (group 1 to group 2) | 2026-10-05 |
| `WHISPER` to someone offline or a name that doesn't exist | `Success` (never `TargetOffline`), then "No player named" **~110 s later** (below) | 2026-10-03, build 70205 |
| `WHISPER` of **more than 255 bytes** | `Success`, then **cut to 255 bytes** on the other side, with no error anywhere (below) | 2026-10-05, build 70205 |
| **Text** in Trade - English / Trade (Services) | an addon can post from a typed command, other players' addons read it, across all capitals **of your own underlying realm** (Trade is split by realm, below); a 3rd post within 10 s on the same channel is refused; chat cuts at 255 bytes | 2026-09-29, build 70058 (measured between two characters of one realm) |

For your own group, send on `RAID` when `IsInRaid()` and on `PARTY` otherwise: `PARTY` in a raid
quietly misses everyone outside your subgroup. Each message also comes back to its sender: an addon
counting what it received over a session (two accounts, 2026-10-05) saw exactly one echo per
message it sent, so drop your own (match the sender to a group unit and test `UnitIsUnit(unit,
"player")`). The group rows above were measured outdoors with
two `/run` lines and no addon; not measured yet: `INSTANCE_CHAT`, inside a dungeon, and during a
boss fight (where the `Chat` lockdown of `secret-values-and-lockdowns.md` may block sends).

Careful with channels (Forever, seen September 2026): two characters can join a channel with the
same name and still land in two different channels, so a channel works like a room, not a
server-wide channel. Each underlying realm gets its own copy, and that holds for the game's Trade
channel too: see "A channel stops at your realm" below.

On **Era** it was the other way round for custom channels: 0 messages out of 176 between two
accounts on the same Battle.net (PTR, 2026-06-30), which left whispers as the only reliable route
there. `CHAT_MSG_CHANNEL_JOIN` / `_LEAVE` do fire on Forever, so presence by channel is usable.
Seen with two clients on 2026-09-19: one public message arrived **three times** (addon message on
the channel, text beacon, whispers) because all three routes deliver on Forever. Deduplicate by id.

## A channel stops at your realm

**Forever, 2026-10-07, build 70245**, three accounts. Realms still exist under the megaserver. At
character creation the player picks a ruleset (PvE, PvP), not a realm: the game assigns an
underlying realm (reported by the player who created the third character). Characters of different
underlying realms share the world (same city, same layer) and can whisper each other, but each
realm gets its own copy of a custom channel, and of the game's Trade channel (further down).

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
  relayed) from the stranger on 4618, in an addon's saved data dated 2026-10-05. Measured the same
  day: an addon's hello, profession lists and an order went both ways by whisper between a 4618 and
  a 4620 character grouped together.
- **The realm follows the account.** On the three accounts, every PvE character of an account sat on
  the account's realm (10 characters; one account all on 4620, including an Alliance and a Horde
  character; another on 4618). A gnome created on the 4618 account landed on 4618, while a gnome on
  another account was on 4620: race and starting zone don't decide.
- **It doesn't move with play.** That gnome grouped with the 4620 gnome, did a quest with it and
  stayed logged off 30 minutes: still 4618, same GUID.
- **The game's Trade channel is split the same way.** Two characters, one per realm, side by side in
  Ironforge: the member lists of their `Trade - English` (channel window) had no name in common, and
  screenshots taken a second apart showed two unrelated conversations with no speaker in both. A
  player listed in one roster spoke in that same character's Trade. Not checked one by one: Trade
  (Services), General, LocalDefense, Trade (Local) (expect the same).

Rules:
- A channel reaches your own underlying realm only, custom or the game's own (Trade), and
  `SendAddonMessage` returns `Success` either way. To reach the other realms, whisper.
- A chat scanner (Trade offers, LFW lines) only ever sees its own realm, and a line an addon posts
  in Trade only reaches players of the poster's realm.
- All characters of one account share a realm: an addon's own alts are never split by this.
- To know a peer's realm, have them send their `GetRealmID()`. Names carry no realm ("First
  Surname", no `-Realm`) and `CHAT_MSG_ADDON` carries no GUID; you only get a GUID for members of
  your own channel copy (roster) or a unit you can target or mouse over.
- Never hard-code the number of realms.

**Guilds seem to cross realms** (2026-10-07): a character on 4618 signed a guild charter offered by
a character on 4620, with no error. The charter was never turned in, so guild chat and `GUILD`
addon messages between realms are not measured. If they do cross, a guild is the only channel that
spans realms.

The game also keeps each character's **channel numbers** from one session to the next. A custom
channel joined at the first login, before the zone's General arrived, took `/1`, and kept `/1` at
the next logins with General on `/2` (a level 2 character, 2026-10-07): typing `/1` then writes
into the custom channel. Join a custom channel only once a game channel holds `/1`, and repair the
ones already there: `C_ChatInfo.SwapChatChannelsByChannelIndex(1, n)` works from addon code, from a
typed `/run` and from a `C_Timer` callback alike (2026-10-07: General back on `/1`, the custom
channel on `/2`, and the order kept at the next `/reload`). Two cautions: guard the channel names
you compare before swapping (they can be secret during a boss fight, see
`secret-values-and-lockdowns.md`), and know that the API doesn't swap the channels' chat colors,
which Blizzard's own chat settings panel does.

Not measured: whether one realm can hold several copies of a channel (the September case, two
players side by side in different copies, never had both realms read; every case measured since
fits one copy per realm); the `instanceID` argument of `CHAT_MSG_ADDON` for a message received on a
channel; PvP realms.

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

## Guild chat bridged to a Discord channel

Measured on Forever build 70338, 2026-10-10, with a guild linked to a channel of an existing Discord
server and two characters in the guild:
- **It's on**: `C_Discord.IsEnabled()` and `C_Discord.IsVoiceEnabled()` return `true`. Nearly every
  other `C_Discord` function carries `HasRestrictions`, and that holds for read-only getters too:
  `IsUserOAuthed`, `GetGuildLinkStatus`, `IsGuildChannelLinked`, `GetDisplayNameType`,
  `GetNumDiscordServers`, `GetDiscordUserID` called from a typed slash command each returned
  nothing and fired `ADDON_ACTION_FORBIDDEN` (function name `UNKNOWN()`, 6 out of 6). Free to call:
  those two, `C_GuildInfo.IsDiscordStreamSeparate`, `C_GuildInfo.IsGuildOfficer`, `IsGuildLeader`,
  `C_VoiceChat.GetActiveVoiceProviderID`. The `DISCORD_*` events and `CHAT_MSG_GUILD_DISCORD` aren't
  restricted.
- **Where the player links it**: Guild & Communities (J), **right-click the guild** in the left
  column, "Guild Settings", then "Discord Settings" in the dropdown (leader, or officer). The
  "Preferred Play Settings" screen is something else. The server list is every server of the
  player's Discord account; an existing server works. Discord's own rules (text channel, not NSFW,
  not linked elsewhere, Manage Channels permission) come from Discord's docs, not measured here.
- **A line written on Discord** (separate stream off) arrives as `CHAT_MSG_GUILD`, 18 arguments, for
  every guild member:
  - `text` is a K-string (`"|Kx1|k"`): an addon **can't read what was written on Discord**.
  - `playerName` is the Discord display name, plain text, no realm: **not a character**, a whisper
    to it fails.
  - `specialFlags` = `"DISCORD"`, `guid` = `nil` (the docs say non-nilable), `bnSenderID` = `1`.
  - `discordInfo` (arg 18): `fromDiscord = true`, `userID` a small opaque number (`1`, not the
    Discord ID), `globalName` a K-string, `type = 2` (`GlobalName`), `lastOnlineName` /
    `lastOnlineGUID` a character of the linked account.
  - On every ordinary guild line, `discordInfo` is a table too, with `userID = 0` and
    `fromDiscord = false`. Test `discordInfo.fromDiscord` (or `specialFlags == "DISCORD"`) before
    treating the sender as a player.
- **A line written in game** reaches Discord under the player's **Discord account name**, never the
  character's, with a controller badge: two characters of one Battle.net look the same there, so a
  line meant to be read on Discord must name its character itself. Every hyperlink becomes plain text: an item link arrives as `[Taskmaster Axe]`
  (name only, no ID), a profession link `|Htrade:...|h[Cooking]|h` as `[Cooking]`. A line such as
  `WTB [item] x1 2g50s #CO0` stays readable; `LFW Cooking/[profession link] #CO` reads
  `LFW Cooking/[Cooking] #CO`. Item links in game chat use the quality markup `|cnIQ1:` (not `|cff...`).
- The Discord connection belongs to the **Battle.net account**: every character of a linked
  Battle.net counts as connected (said by the player, consistent with `lastOnlineName` naming a
  character of the other WoW account). A "guildmate without Discord" test needs a second Battle.net.
- **Separate stream** (box "Separate Discord chat from Guild chat"): the guild gets a stream of its
  own, "Discord", and every line of it arrives as **`CHAT_MSG_GUILD_DISCORD`**, never `CHAT_MSG_GUILD`
  (so an addon that only reads guild chat sees none of it):
  - a line written on Discord: same shape as in the mixed stream (K-string text, Discord name,
    `"DISCORD"` flag, `nil` guid, `fromDiscord = true`);
  - a line a player writes from the game into that stream: **plain readable text**, the character's
    full name in `playerName`, its GUID, no flag, `fromDiscord = false`.
  To write to it, the player uses **Guild & Communities, stream dropdown "Discord"**: that works.
  Typing into the `GUILD_DISCORD` chat type from the chat box didn't. The ordinary guild chat stays
  game-only. In the mixed stream, both directions go through the ordinary guild chat.
- **An addon can write to the Discord stream** (separate stream on), from a typed slash command:
  `C_Club.SendMessage(C_Club.GetGuildClubId(), <Discord streamId>, text)` and
  `SendChatMessage(text, "GUILD_DISCORD")` both reached Discord, under the player's Discord name,
  with no `ADDON_ACTION_*`. The line comes back in game as `CHAT_MSG_GUILD_DISCORD` with the
  character's name. Also from a **button click** (`C_Club.SendMessage` in an `OnClick`), and for a
  **regular member** (lowest rank, not an officer): the stream is listed for them too and their line
  reaches Discord (measured 2026-10-10 16:46, two accounts).
- **A bot can't write to a linked channel**: any message from a Discord bot to the channel the guild
  is linked to is refused, as a reply or a plain message, even with Administrator (HTTP 403, code
  20062, "This action requires an application to be authorized by the user"). A bot can read it and
  write elsewhere. A line relayed from the game carries the game's `application_id` and flags 65536,
  under the player's own Discord account.
- **A bot can delete in a linked channel**, though: with "Manage Messages" on that channel, deleting a
  line relayed from the game works (measured 2026-10-10, Discord accepted it), and the line also
  disappears from the guild's Discord stream in game.
- **Telling whether the guild is linked**: the Discord stream shows in `C_Club.GetStreams` (stream type
  `Enum.ClubStreamType.Discord`) **only in the separate stream**. In the mixed stream the guild is
  still linked, yet the list holds only `Guild` and `Officer`, and the `C_Discord` getters that would
  say so are protected. So in the mixed stream an addon can't know the guild is linked, except by
  seeing a line with `discordInfo.fromDiscord` go by.

## The game's friend list: off, then back

Seen 2026-10-01: "Add friend" answered "This system is currently disabled", and `C_FriendList` stayed
empty. **Back on 2026-10-07** (reported by a player). Two characters on the same Battle.net still
can't add each other (seen the same day), so a "friends" feature is tested with a second Battle.net
account or by faking the friendship. Not measured: whether a friend on another realm shows online.
