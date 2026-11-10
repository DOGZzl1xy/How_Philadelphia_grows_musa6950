// The story, one entry per screen. `stage` says what the frame shows; `html` is the text column.
// Acts: 0 cover, 1 a city that grows lot by lot, 2 two kinds of data, 3 the model, 4 the test, 5 the city, 6 close.

import { ICONS, LINKS } from "./links.js";

export const steps = [
  {
    act: 0, hero: true,
    stage: { scene: "s3", year: 2025 },
    html: `<h1>Teaching Annual Aerial Imagery to See Growth</h1>
           <p class="sub">How Philadelphia grows, lot by lot, 2018–2025</p>`,
  },
  {
    act: 1,
    stage: { scene: "s3", year: 2018 },
    html: `<h2>A city that grows one lot at a time</h2>
           <p>Philadelphia rarely grows in towers. It grows one rowhouse at a time, as a vacant lot becomes a home or a
           two-storey house gains a third.</p>
           <p>Adding homes inside the existing city reuses the streets, transit, and pipes that are already there.</p>`,
  },
  {
    act: 1,
    stage: { scene: "s3", year: 2025 },
    html: `<h2>Seven springs later</h2>
           <p>The same quarter-kilometre square in 2025. Scroll back and forth, and the empty lots fill in.</p>`,
  },
  {
    act: 1,
    stage: { scene: "s3", year: 2025, outlines: "lidar_new" },
    html: `<h2>Where it grew</h2>
           <span class="num" data-count="scene:total">0</span>
           <p>buildings rose in this square between 2018 and 2025.</p>
           <p>Yet the city has no record of where and when this happens. Permits record intent, not outcomes.</p>`,
  },
  {
    act: 2,
    stage: { scene: "s2", year: 2022, height: 2022 },
    html: `<h2>LiDAR measures height</h2>
           <p>A laser scanner flown over the city measures every roof to within centimetres.</p>
           <div class="track"><span class="on">2018</span><span>2019</span><span>2020</span><span>2021</span><span class="on">2022</span><span>2023</span><span>2024</span><span class="on">2025</span></div>
           <p>But it is expensive, so Philadelphia flies it only every three to four years.</p>`,
  },
  {
    act: 2,
    stage: { scene: "s2", year: 2022 },
    html: `<h2>Photographs come every spring</h2>
           <p>Aerial photographs are taken every year, sharp enough to see a single rowhouse.</p>
           <div class="track photo"><span class="on">2018</span><span class="on">2019</span><span class="on">2020</span><span>2021</span><span class="on">2022</span><span class="on">2023</span><span class="on">2024</span><span class="on">2025</span></div>
           <p>But a photograph is flat. From directly above, it cannot tell how tall anything is.</p>`,
  },
  {
    act: 2,
    stage: { scene: "s2", year: 2022, height: 2022, heightBlend: 0.5 },
    html: `<h2>Let one teach the other</h2>
           <p>LiDAR is precise but rare. Photographs are frequent but flat.</p>
           <p>This project uses those few LiDAR flights to <span class="hl">teach a model how to read change from the
           yearly photographs</span>, filling in the years between flights.</p>`,
  },

  // ---------- act 3: the model and its training ----------
  {
    act: 3,
    stage: { scene: "s2", year: 2018, grid: true },
    html: `<h2>A model that has already seen the Earth</h2>
           <p>The starting point is <span class="hl">DINOv3</span>, a vision foundation model from Meta. Its satellite
           version learned what roofs, trees, streets, and shadows look like from 493 million satellite images, without
           a single label.</p>
           <p>It reads a photograph as a grid of small patches—4 m squares here—and describes each patch with
           1,024 numbers. About 300 million parameters do the reading.</p>`,
  },
  {
    act: 3,
    stage: { scene: "s2", year: 2018, stack: { a: 2018, b: 2020 } },
    html: `<h2>Two photographs and one measured height</h2>
           <p>For every 128 m window, the model gets three inputs—the photograph from a LiDAR year, the height LiDAR
           measured that year, and a photograph from a later spring.</p>
           <p>DINOv3 reads both photographs. A decoder combines what it sees in each, the difference between them, and
           the measured height. For every building, it answers a single question—<span class="hl">has it grown?</span></p>`,
  },
  {
    act: 3,
    stage: { scene: "s2", year: 2020, chart: "arch" },
    html: `<h2>What goes in, what comes out</h2>
           <p>One DINOv3, shared by both photographs, turns each into features. The decoder compares them, adds the
           measured height, and marks every building that grew.</p>
           <p>A building that grew, but not by a single added storey, counts as new construction.</p>`,
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
  {
    act: 3,
    stage: { scene: "s2", year: 2020, chart: "training" },
    html: `<h2>Learning in two phases</h2>
           <p>First, DINOv3 stays frozen while the decoder learns to use it. Then, its last four blocks are fine-tuned on
           aerial photographs of Philadelphia.</p>
           <p>Two independent runs reached the same result, achieving <span class="hl">0.80</span> average precision on
           neighbourhoods held out from training. Simply subtracting the two photographs reaches 0.06. Each run took
           about two and a half hours on a single GPU.</p>`,
  },
  {
    act: 3,
    stage: { scene: "s2", year: 2020, chart: "backbones" },
    html: `<h2>Why a foundation model</h2>
           <p>We tested three ways to read height from a single photograph on unseen ZIP codes and years—a U-Net
           pretrained on everyday photos, a frozen DINOv3, and a fine-tuned DINOv3.</p>
           <p>The fine-tuned satellite model was the most accurate and held up best on the new 2025 photographs, making
           it the backbone of the change model.</p>
           <p class="small">Compared on the single-photo height task that preceded the final change model.</p>`,
  },
  {
    act: 3,
    stage: { scene: "s2", year: 2020, outlines: "model:2019,2020" },
    html: `<h2>Growth in a year with no flight</h2>
           <span class="num" data-count="scene:total">0</span>
           <p>buildings in this square that the model marks as new by spring 2020, two years before the next LiDAR
           flight.</p>`,
  },

  // ---------- act 4: one sealed test ----------
  {
    act: 4,
    stage: { scene: "s2", year: 2025, chart: "scatter" },
    html: `<h2>One exam, taken once</h2>
           <p>Eight ZIP codes and the years 2022–2025 stayed locked away until the model was finished. Then it was
           tested once.</p>
           <span class="num">0.96</span>
           <p>correlation with LiDAR when new buildings are counted block by block; the model finds 12% fewer than
           LiDAR. It is reliable for blocks and neighbourhoods, though not for single houses.</p>`,
  },
  {
    act: 4,
    stage: { scene: "s2", year: 2025, chart: "iso" },
    html: `<h2>Seen from above</h2>
           <p>A photograph looks straight down. A new building changes the picture at once.</p>
           <p>An extra storey on an existing roof does not, because the roof looks just as it did before.</p>`,
  },
  {
    act: 4,
    stage: { scene: "s2", year: 2025, chart: "iso", view: "side" },
    html: `<h2>Seen from the side</h2>
           <p>From the side, the extra storey is plain to see, and LiDAR sees it by measuring height. Photographs cannot
           count those reliably, so extra storeys come from LiDAR alone.</p>`,
  },

  // ---------- act 5: the city, seen (when, one place, where, access, built form, who, permits) ----------
  {
    act: 5,
    stage: { scene: "s2", year: 2025, chart: "yearly" },
    html: `<h2>When the city built</h2>
           <p>With photographs filling the years between flights, the timing becomes clear. Construction peaked in 2020,
           then ran at about half that pace from 2023 to 2025.</p>`,
  },
  {
    act: 5,
    stage: { scene: "s1", year: 2025, outlines: "lidar_new" },
    html: `<h2>Sometimes all at once</h2>
           <span class="num" data-count="scene:total">0</span>
           <p>new buildings on one quarter-kilometre square of cleared land. Not all growth is gentle.</p>`,
  },
  {
    act: 5,
    stage: { scene: "s1", year: 2025, chart: "map" },
    html: `<h2>Where the city built</h2>
           <span class="num">94%</span>
           <p>of new construction from 2018 to 2025 sits in one tenth of the city's blocks.</p>`,
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
    stage: { scene: "s1", year: 2025, chart: "area" },
    html: `<h2>What kind of street</h2>
           <p>Mixed-use streets, with shops below and homes above, build the fastest. Rowhouse blocks follow. Areas of
           detached houses hardly build at all.</p>`,
  },
  {
    act: 5,
    stage: { scene: "s1", year: 2025, chart: "income" },
    html: `<h2>Where incomes are changing</h2>
           <p>New construction is highest in the poorest neighbourhoods, where the vacant lots are, and in those where
           real incomes rose fastest.</p>
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
  {
    act: 6,
    stage: { scene: "s3", year: 2025, outlines: "lidar_new" },
    html: `<h2>Every spring, the city is photographed</h2>
           <p>Taught by a few LiDAR flights, those photographs can now show where and when Philadelphia grew, block by
           block, year by year.</p>
           <p><span class="hl">From above, the model can see new buildings, but not new floors.</span></p>
           <div class="cta">
             <a class="btn primary" href="${LINKS.report}" download>${ICONS.download}<span>Download report</span></a>
             <a class="btn" href="${LINKS.github}" target="_blank" rel="noopener">${ICONS.github}<span>GitHub</span></a>
             <a class="btn" href="${LINKS.explore}">${ICONS.search}<span>Explore</span></a>
           </div>`,
  },
];
