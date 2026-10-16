# Event time without guessing the day

The pinned event shows its full local calendar date, time and UTC offset. Its
machine-readable timestamp keeps the original instant. Compact provider times
retain the complete timestamp in their title.

Unit checks distinguish repeated clock times at the end of daylight saving and
local dates on either side of UTC midnight. The browser journey pins its clock and
feeds together and checks the date and offset in the New York timezone. The
archive's UTC-day boundaries remain unchanged.

- [Desktop](event-time-1440.png)
- [Phone](event-time-390.png)

The review uses recorded feeds and emulated timezone and viewports. Physical
devices and native assistive technology remain device checks.
