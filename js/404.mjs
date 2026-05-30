/*
 * 404.mjs — Client-side script for the custom 404 page.
 *
 * Loaded by 404.html via <script type="module" src="js/404.mjs">.
 * Module scripts (type="module") are deferred by default, so this code
 * runs after the HTML has been fully parsed. That's why the calls at
 * the bottom of the file can use querySelector immediately without
 * waiting for DOMContentLoaded.
 *
 * What this file does:
 *   1. Picks a random HAP pose and shows the image + caption.
 *   2. Fetches a roast from /.netlify/functions/insult and shows it.
 *   3. Saves every roast + pose to roastHistory (an array).
 *   4. Wires up the "Generate a new roast" button to repeat 1–3.
 *   5. Wires up Prev / Next buttons to navigate roastHistory by index.
 *
 * Core concepts this file teaches:
 *   - Arrays  : roastHistory stores every roast generated this session.
 *   - Indexes : historyIndex points to which entry is currently shown.
 *   - State   : the array + index together are the application state.
 *   - Game flow: generate → save → navigate (prev/next) → display.
 */

/**
 * Shape of one HAP pose entry.
 * @typedef {Object} HapPose
 * @property {string} id      Cloudinary public ID under canvas/hap/ (no extension).
 * @property {string} alt     Alt text for the image — required for screen readers.
 * @property {string} caption Caption shown below the image.
 */

/**
 * Available HAP poses. The 404 page picks one at random per page load and
 * per click of the "Generate a new roast" button.
 *
 * To add a new pose: upload the image to Cloudinary at canvas/hap/<id>,
 * then add an entry here. Keep alt text descriptive — it's read aloud
 * by screen readers and shown if the image fails to load.
 *
 * @type {HapPose[]}
 */
const HAP_POSES = [
  {
    id: "hap-confused-map",
    alt: "HAP robot with backpack looking confused while reading treasure map with compass",
    caption: "HAP tried to find your page. HAP has a map. The map did not help.",
  },
  {
    id: "hap-broke-things",
    alt: "HAP robot looking sad holding tangled wires, speech bubble says oops",
    caption: "This is fine. Everything is fine. The page is gone. Fine.",
  },
  {
    id: "hap-brain-explodes",
    alt: "HAP robot with surprised expression, head exploding with clouds and lightning bolts",
    caption: "HAP's brain trying to locate the page you requested.",
  },
  {
    id: "hap-forked-road",
    alt: "HAP robot at forked road with if(true) and else direction signs",
    caption: "You took the wrong fork. HAP respectfully suggests the other one.",
  },
  {
    id: "hap-safari",
    alt: "HAP robot wearing safari outfit and pith helmet looking through binoculars",
    caption: "HAP searched the entire savanna. Your page is not out there.",
  },
  {
    id: "hap-sad-falling-papers",
    alt: "HAP robot looking sad holding papers with more scattered on floor",
    caption: "HAP had your page right here. It's gone now. HAP is handling it.",
  },
  {
    id: "hap-w-bug",
    alt: "HAP robot holding magnifying glass, examining cute green bug on ground",
    caption: "HAP found a bug. Not your page, though. Just a bug.",
  },
  {
    id: "hap-sconcerned-laptop",
    alt: "HAP robot sitting at desk looking worried while staring at laptop screen",
    caption: "HAP checked the laptop. The laptop confirmed you are lost.",
  },
  {
    id: "hap-scientist",
    alt: "HAP robot wearing glasses holding bubbling test tube with chemistry symbols",
    caption: "HAP ran the experiment. Results: your page does not exist.",
  },
  {
    id: "hap-astronaut",
    alt: "HAP robot in astronaut suit floating in colorful space with planets",
    caption: "HAP searched outer space. Your page is not there either.",
  },
  {
    id: "hap-thinking-w-duck",
    alt: "HAP robot thinking pensively while holding rubber duck, finger on chin",
    caption: "HAP asked the duck. The duck has no idea where your page went.",
  },
  {
    id: "hap-holding-mystical-orb",
    alt: "HAP robot cradling a glowing mystical orb in both hands",
    caption: "The orb sees all. The orb does not see your page.",
  },
  {
    id: "hap-fishing-for-code",
    alt: "HAP robot in explorer outfit fishing with code file on the hook",
    caption: "HAP cast a line. Caught some code. Not your page.",
  },
  {
    id: "hap-wanting-snack",
    alt: "HAP robot thinking about food with thought bubbles showing tacos and snacks",
    caption: "HAP was going to find your page but got distracted thinking about tacos.",
  },
  {
    id: "hap-recharges",
    alt: "HAP robot sleeping peacefully while plugged into wall outlet, charging",
    caption: "HAP gave up looking and took a nap. Can you blame HAP?",
  },
  {
    id: "hap-juggles",
    alt: "HAP robot juggling floating HTML code tags like html and div",
    caption: "HAP is juggling a lot right now. Finding your page is not one of them.",
  },
  {
    id: "hap-as-chef",
    alt: "HAP robot wearing chef hat, holding spatula with pancakes and frying pan",
    caption: "HAP made pancakes instead of finding your page. Better use of time, honestly.",
  },
  {
    id: "hap-dj",
    alt: "HAP robot DJing at turntables on stage with colorful lights and music notes",
    caption: "HAP dropped the beat. Also dropped your page. Only one was on purpose.",
  },
  {
    id: "hap-pointing-up",
    alt: "HAP robot pointing upward with one finger, smiling encouragingly",
    caption: "HAP points to the URL bar. The answer to your problem is up there.",
  },
  {
    id: "hap-blizzard",
    alt: "HAP robot waving in winter blizzard wearing green earmuffs and red striped scarf with snowflakes swirling",
    caption: "HAP looked in a blizzard for your page. HAP is cold and it's your fault.",
  },
];

/**
 * Cloudinary URL prefix for HAP pose images.
 *
 * The query-like segment between /upload/ and /canvas/ is a chain of
 * Cloudinary transformations applied on the fly:
 *   f_auto  — serve modern formats (WebP/AVIF) when the browser supports them
 *   q_auto  — pick a quality level that balances size and clarity
 *   w_320   — resize to 320 pixels wide
 *   c_limit — never enlarge images that are already smaller than 320px
 *
 * The pose id is appended at request time (see showEntry).
 */
const CLOUDINARY_BASE =
  "https://res.cloudinary.com/cynthia-teeters/image/upload/f_auto,q_auto,w_320,c_limit/canvas/hap/";

// ─── State ────────────────────────────────────────────────────────────────────

/**
 * Shape of one history entry — the roast text paired with the pose shown
 * at the same moment, so browsing back in history shows the original image.
 * @typedef {Object} HistoryEntry
 * @property {string}  insult The roast text, with surrounding quotes stripped.
 * @property {HapPose} pose   The HAP pose shown alongside this roast.
 */

/**
 * Every roast generated this session lives here.
 * Index 0 is the first roast; the last index is the most recent.
 *
 * @type {HistoryEntry[]}
 */
const roastHistory = [];

/**
 * Which entry in roastHistory is currently on screen.
 * -1 means "nothing shown yet" (before the first roast loads).
 * @type {number}
 */
let historyIndex = -1;

/**
 * True while a fetch is in flight.
 * Prevents Prev / Next from navigating away before the fetch resolves.
 * @type {boolean}
 */
let isFetching = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick a random pose from HAP_POSES.
 *
 * The standard "random element" idiom in JavaScript:
 *   Math.random()   → a float in [0, 1)
 *   * length        → scales it to [0, length)
 *   Math.floor(...) → rounds down to an integer in [0, length - 1]
 *
 * @returns {HapPose} A randomly selected pose object.
 */
function pickPose() {
  return HAP_POSES[Math.floor(Math.random() * HAP_POSES.length)];
}

/**
 * Render a single history entry to the DOM.
 * Does not fetch — everything it needs is already in roastHistory.
 *
 * @param {number} index - A valid index into roastHistory.
 * @returns {void}
 */
function showEntry(index) {
  const entry = roastHistory[index];
  const img = document.querySelector("#hap-img");
  const caption = document.querySelector("#hap-caption");
  const roastEl = document.querySelector("#roast-text");

  /* SECURITY: textContent (not innerHTML) — see loadRoast for explanation. */
  roastEl.textContent = entry.insult;
  roastEl.classList.remove("loading");

  img.src = `${CLOUDINARY_BASE}${entry.pose.id}`;
  img.alt = entry.pose.alt;
  caption.textContent = entry.pose.caption;
}

/**
 * Sync the history navigation bar with the current state.
 *
 * - Updates the "X / Y" counter label.
 * - Enables or disables Prev / Next based on position in the array.
 * - Shows the nav bar as soon as there is at least one entry.
 *
 * @returns {void}
 */
function updateHistoryNav() {
  const nav = document.querySelector("#history-nav");
  const counter = document.querySelector("#history-counter");
  const prevBtn = document.querySelector("#history-prev-btn");
  const nextBtn = document.querySelector("#history-next-btn");

  if (roastHistory.length === 0) return; /* called before any roast loaded */

  /* Reveal the nav bar (hidden until the first roast arrives). */
  nav.hidden = false;

  counter.textContent = `${historyIndex + 1} / ${roastHistory.length}`;

  /* Disable Prev when already at the oldest entry (index 0). */
  prevBtn.disabled = historyIndex <= 0;

  /* Disable Next when already at the newest entry. */
  nextBtn.disabled = historyIndex >= roastHistory.length - 1;
}

// ─── Core flow ────────────────────────────────────────────────────────────────

/**
 * Fetch a fresh roast, pick a pose, save both to roastHistory, then display.
 *
 * This is the "generate" step of the game flow.  After it resolves:
 *   - roastHistory has one more entry (arrays grow with push()).
 *   - historyIndex points at the new entry (the last index).
 *   - The DOM shows the new entry.
 *   - The history nav is updated.
 *
 * @returns {Promise<void>}
 */
async function generate() {
  const roastEl = document.querySelector("#roast-text");
  roastEl.textContent = "Consulting HAP's judgment engine...";
  roastEl.classList.add("loading");

  isFetching = true;
  const pose = pickPose();

  let insult;
  try {
    /* The cache-buster ?t= makes each URL unique so the browser never
     * returns a cached response and re-shows the same roast. */
    const response = await fetch(`/.netlify/functions/insult?t=${Date.now()}`);

    /* response.ok is true for any 2xx status. Anything else is a failure. */
    if (!response.ok) throw new Error(`Status ${response.status}`);

    const data = await response.json();
    insult = data.insult.replace(/^["']+|["']+$/g, "");
  } catch {
    insult = "HAP tried to think of something clever. The Wi-Fi disagreed.";
  }

  /* Save to history — this is the "push to an array" moment. */
  roastHistory.push({ insult, pose });

  /* Point historyIndex at the new last entry. */
  historyIndex = roastHistory.length - 1;

  isFetching = false;
  showEntry(historyIndex);
  updateHistoryNav();
}

// ─── Wiring ───────────────────────────────────────────────────────────────────

/* Generate the first roast on page load. */
generate();

/* "Generate a new roast" button — always creates a new entry and jumps to it.
 *
 * addEventListener is preferred over inline onclick because:
 *   1. It separates JS behavior from HTML markup.
 *   2. It works with the enforcing CSP (no inline JS).
 *   3. Multiple handlers can be attached to the same event.
 */
document.querySelector("#new-roast-btn").addEventListener("click", () => {
  generate();
});

/* Prev button — step backward through roastHistory. */
document.querySelector("#history-prev-btn").addEventListener("click", () => {
  /* Defense-in-depth: the button is disabled at the same boundary, but
   * guard here too in case JS disables it before the DOM updates, or a
   * fetch is still in flight. */
  if (isFetching || historyIndex <= 0) return;
  historyIndex -= 1;
  showEntry(historyIndex);
  updateHistoryNav();
});

/* Next button — step forward through roastHistory. */
document.querySelector("#history-next-btn").addEventListener("click", () => {
  /* Defense-in-depth: same reasoning as the Prev guard above. */
  if (isFetching || historyIndex >= roastHistory.length - 1) return;
  historyIndex += 1;
  showEntry(historyIndex);
  updateHistoryNav();
});
