# How Philadelphia Grows: talk script

MUSA 6950 final presentation, Xuanyu Zhou. The talk is given on the website itself:
https://musa6950-philly-growth.xuanyuzhou.org

- One key press (→, space or Page Down) moves one screen. `#n` in the address opens screen n.
- Full version: about 10 minutes for the story, then 1.5 minutes on Explore. About 1,350 spoken words.
- Short version, about 6 minutes: say only the first sentence on the screens marked *(short: one line)*.
- Times are cumulative and assume a calm pace of about 130 words a minute.

## Before the talk

- Open the story and Explore in two tabs, full screen (F11), and click through once so that everything is cached.
- Wait on the cover: the flight down to the block starts with the first key press.
- If the network fails: `presentation/backup_screens.pdf` has the 26 screens as pages (no animation), and
  `npm --prefix web run preview` serves the story from this laptop without the internet.
- Explore needs the network (map tiles and the assistant).

## The story

| # | Screen | What to say | Time |
|---|---|---|---|
| 0 | Cover | Philadelphia is growing. This talk is about how it grows, where, and how we can see it. | 0:10 |
| 1 | One lot at a time | Philadelphia rarely grows in towers. It grows in two small ways: a vacant lot becomes a rowhouse, or a two-storey house gains a third floor. Planners call this gentle densification. | 0:30 |
| 2 | Seven springs later | This is one quarter-kilometre square, photographed every spring from 2018 to 2025. Watch the empty lots fill in. | 0:45 |
| 3 | Where it grew | Sixty buildings rose in this one square in seven years. Here they are in orange, standing on the heights that LiDAR measured. | 1:00 |
| 4 | Homes without new streets | This kind of growth matters. It puts homes where the streets, the transit and the pipes already are. It is also contested: neighbours object to houses that rise above the row, and City Council has capped added floors in parts of the city. | 1:25 |
| 5 | Nobody keeps count | And yet nobody keeps count. On this square, 107 buildings rose on cleared land. The city's records cannot say so, because a permit records what an owner intends, not what gets built. So my question is simple: where does Philadelphia grow, how much, and when? | 1:55 |
| 6 | With a laser | There are three ways to look. The first is LiDAR, a laser flown over the city. It measures every roof to within centimetres, but it is expensive, so the city has flown it only in 2018, 2022 and 2025. | 2:15 |
| 7 | With a camera above | The second is the aerial photograph. It is taken every spring and it is sharp, but it is flat. From directly above it cannot tell how tall anything is. | 2:30 |
| 8 | With a camera in the street | The third is the camera on a car. It sees every house front, and every floor can be counted. But it sees only the streets a car has driven, and it comes back only every few years. | 2:45 |
| 9 | Let one teach the other | Each way of looking misses something. So the idea of this project is to let them help each other. The few LiDAR flights teach a model to read change from the yearly photographs. And for what cannot be seen from above, I go down to the street. | 3:05 |
| 10 | A model that has seen the Earth | *(short: one line)* The model starts from DINOv3, a vision foundation model from Meta. Its satellite version has learned what roofs, trees and shadows look like from 493 million satellite images, without a single label. It reads a photograph as a grid of small patches, four metres each. | 3:25 |
| 11 | Two photographs, one height | For every window, the model gets a photograph from a LiDAR year, the height LiDAR measured that year, and a photograph from a later spring. It answers one question for every building: has it grown? | 3:45 |
| 12 | Taught by LiDAR | *(short: one line)* Nobody labelled a building by hand. Every pair of LiDAR flights shows which buildings grew in between, and six such pairs became ten and a half thousand lessons. Eight ZIP codes and the years 2022 to 2025 were locked away for the final test. | 4:05 |
| 13 | How well it sees new buildings | That test was run once. Counted block by block, the model's new buildings match LiDAR with a correlation of 0.96. It finds twelve percent fewer than LiDAR, and it is reliable for blocks, not for single houses. That is good enough to date new construction in the years with no flight. | 4:35 |
| 14 | A year with no flight | Here is what that buys. These 28 buildings are marked as new by spring 2020, two years before the next LiDAR flight. | 4:50 |
| 15 | The floor it cannot see | But the same test has a second result. A new building changes the photograph at once. An extra storey on an existing roof does not: from above, the roof looks just as it did before. For added floors the correlation was only 0.42. | 5:15 |
| 16 | Seen from the side | From the side, the extra storey is plain to see. LiDAR sees it because it measures height. A camera sees it too, if it stands in the street. This was the instructor's suggestion, and it became the second half of the project. | 5:35 |
| 17 | Down to the street | This is one row of houses in 2016, 2018 and 2019. A scaffold goes up, and one house gains a third floor. For every house that might have grown, a vision-language model, Gemini, compares street photographs like these and says whether the house is taller, and between which two photographs it changed. | 6:05 |
| 18 | House after house | *(short: one line)* Here are twenty-five of the houses found this way, each turning from before to after. Some gained one floor on the old walls. Others were torn down and came back taller. | 6:20 |
| 19 | Found from the street | In all, 1,950 houses are seen taller between 2018 and 2025. I checked a sample by hand: about four in five are added floors or taller rebuilds, and nearly all the rest are new buildings. One caution. The street finds houses, but it cannot count them, because many streets have no recent photograph. The counts of added floors still come from LiDAR. | 6:55 |
| 20 | When the city built | Now the city, once it can be seen. First, when. Construction peaked in 2020 and ran at about half that pace from 2023 to 2025. New buildings slowed by 26 percent and added floors by 33 percent. Only the years read from photographs show this peak. | 7:25 |
| 21 | Where the city built | Second, where. Each column is one block, as tall as its number of new buildings. Ninety-four percent of new construction sits in one tenth of the city's blocks. | 7:45 |
| 22 | Close to the train | *(short: one line)* Nearly all of it lies within a mile of a rail stop. Beyond that, new construction almost stops. | 7:55 |
| 23 | Two kinds of neighbourhood | Third, who. The two kinds of growth go to opposite ends of the city. New buildings rise most in the poorest neighbourhoods, where the vacant lots are. Added floors rise with income, and the richest fifth adds them most often. These are associations, not causes. | 8:25 |
| 24 | Permits and buildings | *(short: one line)* Last, the permits. Of every hundred new-construction permits, 61 became a visible building by 2025, about half within a year, and fewer than one new building in ten had no matching permit. | 8:45 |
| 25 | Three ways to watch a city grow | So there are three ways to watch a city grow. A laser measures its height every few years. A camera above it, taught by that laser, dates its new buildings every spring. A camera in the street finds its added floors, wherever a car has passed. From above, we can see new buildings. New floors have to be found from the street. | 9:20 |

## Explore (about 1.5 minutes)

Click **Explore** on the last screen.

1. "Everything in the story can be asked. The assistant reads only this project's tables, and it moves the map."
2. Type: **Show the number of new buildings from 2020 to 2024**. The map plays the years. "These are the model's
   years. You can see the 2020 peak fade."
3. Type: **Where were added floors found from the street?** The dots appear. "Each dot is one house, coloured by the
   photographs in which the change first shows. The assistant says what it cannot do: the dots are houses found, not a
   count."
4. Optional: open the layer panel and tick **Blocks as columns (3D)**.

If the assistant is slow or fails, open the layer panel and use **Play** and **Houses seen taller** by hand.

## Likely questions

**Why was the test run only once?** Thresholds, calibration and the 0.8 bar were fixed on validation data before the
test was opened. A test that is run again after looking at it stops being a test. The same rule was kept for the
street-view evaluation.

**How sure is 0.96?** The 95% bootstrap interval over blocks is 0.67 to 0.98. For single buildings precision and recall
are about 70%, which is why every result is reported for blocks and neighbourhoods.

**Why can't the model see added floors?** Two reasons. From directly above the roof looks the same. And they are rare:
0.07% of lots in the test period against 0.40% in validation, so false alarms outnumber them even at 52% recall.

**Could shadows reveal the extra storey?** In principle. In rowhouse blocks the shadow falls on the neighbour's roof or
into a yard that is already dark, and the flights differ in date and hour. It would need the sun position of each
flight as an input.

**How good is the street-view check?** Of 58 marked houses checked blind by hand, 47 are added floors or taller rebuilds
(81%, interval 69 to 89%), 10 are new buildings and 1 is wrong. Counted per block in the sealed ZIP codes it reaches
r = 0.54, above the 0.42 from the air but under the 0.8 bar, so it finds and does not count.

**Why can't the street count?** About three in ten of the houses to check have no usable pair of photographs, one from
before 2020 and one from 2024 or later. And an addition set back from the house front is hidden from a camera a few
metres away.

**Why two Gemini models?** Gemini 3.8 Flash read the densest blocks. Gemini Decision 1 came out on 11 November at an
eighth of the cost and read the rest. On the houses checked by hand it agrees with the hand call 87% of the time,
against 95% for Flash. All street-view reading cost $57.

**What does the AI add that LiDAR does not?** Time. LiDAR gives three snapshots. The model turns them into a yearly
series for new buildings, and the street views say between which photographs a house grew.

**What are the limits?** The 2018 flight covers 64% of lots, mostly central. Added-floor trends rest on two LiDAR
periods. The relations with rail and income are associations.

**Is construction without a permit common?** No. Between 3.6% and 9.1% of visible changes have no related permit, and
counting permits on the neighbouring lot halves that.

**How many homes is this?** Roughly 10,400 homes from new construction in 2018 to 2022 and 6,800 in 2022 to 2025.

**How long does training take?** One run of 8,000 steps takes 2 hours 36 minutes on an RTX 4080 SUPER with 32 GB.

**What would you do next?** Oblique or street-level imagery flown on a schedule, the sun position as a model input, and
a recalibration of the counts against each new LiDAR flight.
