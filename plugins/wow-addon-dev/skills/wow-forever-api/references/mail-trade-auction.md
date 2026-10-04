# Mail, trade and auction house

## Mail between players delivers by FIRST NAME only (Forever)

Measured with two accounts, September 2026. A made-up recipient is refused (VALIDATION reads the
full name), but DELIVERY goes by first name: if another player has the same first name, the mail
goes to them. Silently if they're on your faction, with "target is unfriendly" if they're on the
other. Two empty mails to a character with a common first name never arrived; a reply to a
guildmate failed on "target is unfriendly". For an addon: warn about a namesake, and never assume an accepted send was delivered.
The auction house does deliver (seen 2026-09-29).

## A split stack goes out WHOLE (Forever)

Measured 2026-09-28: order ×1, stack of 9 in the bag, split of 1 decided → attachment ×9 (even with
the drop delayed by 0.1 s). Cause not understood. What works (seen in game, 1 attached, 7 left in
the bag):
1. `SplitContainerItem` into an **empty** slot of an ordinary bag (family 0,
   `GetContainerNumFreeSlots`) with `PickupContainerItem` (`ClearCursor` if the slot refuses);
2. read that slot again every 0.1 s until item + exact count **and** `isLocked == false` (at a
   fixed 0.3 s it was still empty);
3. only then `UseContainerItem` on that small stack.

One item too many goes to another player and doesn't come back: never attach a stack whose count
you haven't read back.

## What an addon can and can't do

- **Mail** (Era, July 2026; the same calls are alive on Forever): with `SendMailFrame` open, attach
  with `C_Container.UseContainerItem(bag, slot)` (whole stack) or the split above; cash on delivery
  with `SendMailCODButton:SetChecked(true)` + `MoneyInputFrame_SetCopper(SendMailMoney, copper)`;
  body = `MailEditBox` (`:SetText`). **Never call `SendMail()` yourself**: fill the form in, the
  player clicks Send.
- **Trade** (Era only, not re-checked on Forever): `TradePlayerInputMoneyFrame` is
  `SetForbidden()`, so an addon can neither read nor write the gold in a trade, only show the
  expected amount. Trade partner = `GetUnitName("NPC")`.
- **Taking an attachment**: the loot message in chat comes about a second after taking it. A filter
  set only on the `TakeInboxItem` / `AutoLootMailItem` hook lets that second path through (seen
  2026-09-29: an auction house item confirmed an order through chat). The sender of an auction
  house mail reads "Alliance Auction House".
