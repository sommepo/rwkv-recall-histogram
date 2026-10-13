The red part of each bar is the cards RWKV counts as due, each against its own desired retention. No setting is needed for that.

- `desired_retention`: fallback only. Where the red line sits when the fork cannot report due cards. `0.80` or `80`.
- `search`: which cards are counted (any Anki search). Default leaves out suspended cards.
- `min_percent`: lowest left edge of the chart. Cards below it are piled onto the first bar; the chart starts further right when there are no cards that low.
- `near_target_points`: fallback only. Cards this many points above the line are orange, the rest green.
- `refresh_seconds`: how long a count is reused before the deck list asks RWKV again. The review screen recounts on every card.
- `show_in_reviewer`: also show a small text-free chart in the review screen's bottom bar, beside "Edit".
