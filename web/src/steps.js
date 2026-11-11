// The story, one entry per screen. `stage` says what the frame shows; `html` is the text column.
// Acts: 0 cover, 1 background (a city that grows lot by lot, and nobody counts), 2 three ways of looking,
// 3 teaching photographs to see new buildings, 4 the exam and the floor it cannot see (down to the street),
// 5 the city once seen, 6 close.

import { ICONS, LINKS } from "./links.js";

export const steps = [
  {
    act: 0, hero: true,
    stage: { scene: "s3", year: 2025 },
    html: `<h1>How Philadelphia Grows</h1>`,
  },

  // ---------- act 1: background ----------
  {
    act: 1,
    stage: { scene: "s3", year: 2018 },
    html: `<h2>A city that grows one lot at a time</h2>
           <p>Philadelphia rarely grows in towers. It grows in two small ways. A vacant lot becomes a rowhouse, or a
           two-storey house gains a third floor.</p>`,
  },
  {
    act: 1,
    stage: { scene: "s3", year: 2018, lapse: [2018, 2019, 2020, 2022, 2023, 2024, 2025], every: 1000 },
    html: `<h2>Seven springs later</h2>
           <p>The same quarter-kilometre square, spring after spring. The empty lots fill in.</p>`,
  },
  {
    act: 1,
    stage: { scene: "s3", year: 2025, iso: "2025_new", count: true },
    html: `<h2>Where it grew</h2>
           <span class="num" data-count="scene:total">0</span>
           <p>buildings rose in this square between 2018 and 2025.</p>`,
  },
  {
    act: 1,
    stage: { scene: "s1", year: 2018 },
    html: `<h2>Homes without new streets</h2>
           <p>Building inside the existing city puts homes where the streets, transit, and pipes already are. It is the
           least wasteful way for a city to grow.</p>
           <p>It is also contested. Neighbours object to houses that rise above the row, and City Council has limited
           added floors in parts of the city.</p>`,
  },
  {
    act: 1,
    stage: { scene: "s1", year: 2025, iso: "2025_new", count: true },
    html: `<h2>Nobody keeps count</h2>
           <span class="num" data-count="scene:total">0</span>
           <p>buildings rose on this one square of cleared land. The city's records cannot say so, because a permit
           records what an owner intends, not what gets built.</p>
           <p>Where does Philadelphia grow, how much, and when?</p>`,
  },

  // ---------- act 2: three ways of looking ----------
  {
    act: 2,
    stage: { scene: "s2", year: 2022, iso: "2022_clay" },
    html: `<h2>From above, with a laser</h2>
           <p>A laser scanner flown over the city, LiDAR, measures every roof to within centimetres.</p>
           <div class="track"><span class="on">2018</span><span>2019</span><span>2020</span><span>2021</span><span class="on">2022</span><span>2023</span><span>2024</span><span class="on">2025</span></div>
           <p>But it is expensive, so Philadelphia flies it only every three to four years.</p>`,
  },
  {
    act: 2,
    stage: { scene: "s2", year: 2022 },
    html: `<h2>From above, with a camera</h2>
           <p>Aerial photographs are taken every spring, sharp enough to see a single rowhouse.</p>
           <div class="track photo"><span class="on">2018</span><span class="on">2019</span><span class="on">2020</span><span>2021</span><span class="on">2022</span><span class="on">2023</span><span class="on">2024</span><span class="on">2025</span></div>
           <p>But a photograph is flat. From directly above, it cannot tell how tall anything is.</p>`,
  },
  {
    act: 2,
    stage: { scene: "s2", year: 2022, street: "2016" },
    html: `<h2>From the street, with a camera</h2>
           <p>Cameras on cars photograph every house front, and every floor can be counted. This row of two-storey
           houses was photographed in 2016.</p>
           <p>But they see only the streets a car has driven, and return only every few years.</p>`,
  },
  {
    act: 2,
    stage: { scene: "s2", year: 2022, height: 2022, heightBlend: 0.5 },
    html: `<h2>Let one teach the other</h2>
           <p>Each way of looking misses something. This project uses the few LiDAR flights to
           <span class="hl">teach a model how to read change from the yearly photographs</span>, and goes down to the
           street for what cannot be seen from above.</p>`,
  },

  // ---------- act 3: teaching photographs to see new buildings ----------
  {
    act: 3,
    stage: { scene: "s2", year: 2018, grid: true },
    html: `<h2>A model that has already seen the Earth</h2>
           <p>The starting point is <span class="hl">DINOv3</span>, a vision foundation model from Meta. Its satellite
           version learned what roofs, trees, streets, and shadows look like from 493 million satellite images, without
           a single label.</p>
           <p>It reads a photograph as a grid of small patches—4 m squares here—and describes each patch with
           1,024 numbers.</p>`,
  },
  {
    act: 3,
    stage: { scene: "s2", year: 2020, chart: "arch" },
    html: `<h2>Two photographs and one measured height</h2>
           <p>The model gets the photograph from a LiDAR year, the height LiDAR measured that year, and a photograph
           from a later spring.</p>
           <p>DINOv3 reads both photographs. A decoder compares them, adds the measured height, and answers one
           question for every building—<span class="hl">has it grown?</span></p>`,
  },
  {
    act: 3,
    stage: { scene: "s2", year: 2020, chart: "data" },
    html: `<h2>Taught by LiDAR, not by hand</h2>
           <div class="facts"><div><b>10,559</b>examples</div><div><b>6</b>LiDAR periods</div><div><b>37</b>ZIP codes</div></div>
           <p>Every pair of LiDAR flights shows which buildings grew in between. Six such pairs, from 2010 to 2022,
           became the lessons, and nobody labelled a building by hand.</p>
           <p>Eight ZIP codes and the 2022–2025 period were locked away for the final test.</p>`,
  },

  // ---------- act 4: the exam, and the floor it cannot see ----------
  {
    act: 4,
    stage: { scene: "s2", year: 2025, chart: "scatter" },
    html: `<h2>One exam, taken once</h2>
           <p>The locked ZIP codes and years stayed closed until the model was finished. Then it was tested once.</p>
           <span class="num">0.96</span>
           <p>correlation with LiDAR when new buildings are counted block by block; the model finds 12% fewer than
           LiDAR. It is reliable for blocks and neighbourhoods, though not for single houses.</p>`,
  },
  {
    act: 4,
    stage: { scene: "s2", year: 2020, outlines: "model:2019,2020" },
    html: `<h2>Growth in a year with no flight</h2>
           <span class="num" data-count="scene:total">0</span>
           <p>buildings in this square that the model marks as new by spring 2020, two years before the next LiDAR
           flight.</p>`,
  },
  {
    act: 4,
    stage: { scene: "s2", year: 2025, chart: "iso" },
    html: `<h2>The floor it cannot see</h2>
           <p>A photograph looks straight down. A new building changes the picture at once. An extra storey on an
           existing roof does not, because the roof looks just as it did before.</p>
           <p>On the same exam, added floors reached only <span class="hl">0.42</span>.</p>`,
  },
  {
    act: 4,
    stage: { scene: "s2", year: 2025, chart: "iso", view: "side" },
    html: `<h2>Seen from the side</h2>
           <p>From the side, the extra storey is plain to see. LiDAR sees it by measuring height. A camera sees it too,
           if it stands in the street.</p>`,
  },
  {
    act: 4,
    stage: { scene: "s2", year: 2019, lapse: [{ street: "2016" }, { street: "2018" }, { street: "2019" }], every: 1500 },
    html: `<h2>Down to the street</h2>
           <p>The same row in 2016, 2018, and 2019. A scaffold goes up, and one house gains a third floor.</p>
           <p>For every house that might have grown, a vision-language model compares street photographs like these
           and says whether the house is taller, and between which two photographs it changed. The houses to check
           come from the aerial model's hints and from building permits.</p>`,
  },
  {
    act: 4,
    stage: { scene: "s2", year: 2025, chart: "streetmap" },
    html: `<h2>Found from the street</h2>
           <span class="num">1,538</span>
           <p>houses seen taller between 2018 and 2025. Checked by hand, about four in five are added floors or taller
           rebuilds, and nearly all the rest are new buildings.</p>
           <p class="small">The street finds houses but cannot count them, since many streets have no recent
           photograph. Counts of added floors still come from LiDAR.</p>`,
  },

  // ---------- act 5: the city, once seen ----------
  {
    act: 5,
    stage: { scene: "s2", year: 2025, chart: "yearly" },
    html: `<h2>When the city built</h2>
           <p>With photographs filling the years between flights, the timing becomes clear. Construction peaked in 2020,
           then ran at about half that pace from 2023 to 2025.</p>
           <p>From 2018–2022 to 2022–2025, new buildings slowed by 26% and added floors by 33%.</p>`,
  },
  {
    act: 5,
    stage: { scene: "s1", year: 2025, chart: "map" },
    html: `<h2>Where the city built</h2>
           <span class="num">94%</span>
           <p>of new construction from 2018 to 2025 sits in one tenth of the city's blocks. Added floors are almost as
           concentrated, at 90%.</p>`,
  },
  {
    act: 5,
    stage: { scene: "s1", year: 2025, chart: "map", rail: true },
    html: `<h2>Close to the train</h2>
           <p>Nearly all of it lies within a mile of a subway, trolley, or regional rail stop. Beyond that, new
           construction almost stops.</p>`,
  },
  {
    act: 5,
    stage: { scene: "s1", year: 2025, chart: "income" },
    html: `<h2>Two kinds of growth, two kinds of neighbourhood</h2>
           <p>New buildings rise most in the poorest neighbourhoods, where the vacant lots are. Added floors rise with
           income, and the richest fifth of neighbourhoods adds them most often.</p>
           <p class="small">Construction itself also changes who lives in a neighbourhood.</p>`,
  },
  {
    act: 5,
    stage: { scene: "s1", year: 2025, chart: "waffle" },
    html: `<h2>Permits and buildings</h2>
           <span class="num">61</span>
           <p>of every 100 new-construction permits became a visible building by 2025, and for about half of all
           permits it took less than a year. Fewer than one in ten new buildings had no matching permit.</p>`,
  },

  // ---------- close ----------
  {
    act: 6,
    stage: { scene: "s3", year: 2025, lapse: [{ iso: "2018", year: 2018 }, { iso: "2025_new", year: 2025 }], every: 1800 },
    html: `<h2>Three ways to watch a city grow</h2>
           <p>A laser measures its height every few years. A camera above it, taught by that laser, dates its new
           buildings every spring. A camera in the street finds its added floors, wherever a car has passed.</p>
           <p><span class="hl">From above, we can see new buildings. New floors have to be found from the street.</span></p>
           <div class="cta">
             <a class="btn primary" href="${LINKS.report}" download>${ICONS.download}<span>Download report</span></a>
             <a class="btn" href="${LINKS.github}" target="_blank" rel="noopener">${ICONS.github}<span>GitHub</span></a>
             <a class="btn" href="${LINKS.explore}">${ICONS.search}<span>Explore</span></a>
           </div>`,
  },
];
