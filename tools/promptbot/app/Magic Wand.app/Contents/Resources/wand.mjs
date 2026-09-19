/**
 * The overlay you actually see: a wand that flies to whatever is about to be
 * clicked, sparkles where it lands, a panel naming the job in flight, and
 * Escape to stop.
 *
 * Everything here runs inside the page, not in node.
 *
 * It is built without a <style> element and without @keyframes, which looks
 * like the long way round and is the only way that works. Gemini serves a
 * content security policy with a nonce on its styles, so an injected
 * stylesheet is dropped on the floor — the first version of this mounted
 * fine, reported no error, and drew absolutely nothing. Inline style
 * properties set from script are not covered by that rule, so every rule here
 * is written straight onto an element and every animation is a transition or
 * a timer.
 */

/** Injected on every page load. Calling it twice is a no-op. */
export const OVERLAY = `(() => {
  if (window.__wand) return true;

  const css = (el, s) => { for (const k in s) el.style[k] = s[k]; return el; };
  const root = document.documentElement;
  const TOP = "2147483647";

  // The wand. A transition on transform is what makes it travel rather than
  // jump, and travel is the whole point — you are meant to see where it went.
  const cursor = css(document.createElement("div"), {
    position: "fixed", zIndex: TOP, pointerEvents: "none",
    left: "0", top: "0", width: "46px", height: "46px", margin: "-23px 0 0 -23px",
    fontSize: "36px", lineHeight: "46px", textAlign: "center",
    transition: "transform .45s cubic-bezier(.22,.8,.28,1)",
    filter: "drop-shadow(0 4px 12px rgba(0,0,0,.55))",
    willChange: "transform",
  });
  cursor.textContent = "\\u{1FA84}";
  root.appendChild(cursor);

  const hud = css(document.createElement("div"), {
    position: "fixed", zIndex: TOP, right: "18px", bottom: "18px",
    maxWidth: "340px", padding: "13px 15px", borderRadius: "14px",
    background: "rgba(12,12,14,.94)", color: "#F7F2E7", pointerEvents: "none",
    font: '500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxShadow: "0 10px 40px -12px rgba(0,0,0,.75)",
  });
  const title = css(document.createElement("div"), {
    fontSize: "12px", letterSpacing: ".04em", textTransform: "uppercase",
    color: "#C9A0FF", marginBottom: "5px", fontWeight: "700",
  });
  const body = css(document.createElement("div"), { opacity: ".9" });
  const hint = css(document.createElement("div"), {
    marginTop: "8px", opacity: ".5", fontSize: "11.5px",
  });
  title.textContent = "Ready";
  body.textContent = "Waiting.";
  hint.textContent = "Press Esc to pause";

  /*
   * The controls. They live on the panel rather than in the Terminal because
   * the Terminal is behind the browser window by the time any of this is
   * running, and a control you have to go and find is a control you don't
   * use. Pointer events are turned back on for this row only — the rest of
   * the panel stays transparent to the mouse so it never sits between you and
   * the page underneath.
   */
  const bar = css(document.createElement("div"), {
    display: "none", gap: "7px", marginTop: "10px", pointerEvents: "auto",
  });
  const smallBtn = (text, primary) => {
    const b = css(document.createElement("button"), {
      flex: "1", padding: "8px 10px", borderRadius: "9px", border: "0",
      cursor: "pointer", fontSize: "12.5px", fontWeight: "700",
      fontFamily: "inherit",
      background: primary ? "#C9A0FF" : "rgba(247,242,231,.12)",
      color: primary ? "#140A02" : "#F7F2E7",
    });
    b.textContent = text;
    b.setAttribute("data-wand", "");
    return b;
  };
  const bPause = smallBtn("Pause", true);
  const bMore = smallBtn("Add pictures", false);
  const bStop = smallBtn("Stop", false);
  bar.append(bPause, bMore, bStop);

  hud.append(title, body, hint, bar);
  root.appendChild(hud);

  const state = { stopped: false, paused: false, deaf: 0, wantsCard: false, epoch: Date.now() };

  // Captured on the way down, so a page that swallows keys can't eat it.
  //
  // The deaf window exists because the runner sometimes has to send Escape itself, to
  // close a file dialog that opened on a button that turned out to be the
  // wrong one. Playwright's keypresses are indistinguishable from a person's
  // — that is the point of them — so the stop has to be deafened around the
  // few milliseconds where one is sent on purpose. Without this the tool
  // stopped itself mid-run and looked, from the outside, like a ghost.
  /*
   * Escape pauses. It used to stop, and stopping meant quitting the app and
   * starting the whole run again — so the one key you reach for when
   * something looks wrong was also the most expensive key on the keyboard.
   * Now it holds: nothing more is typed, everything already saved stays
   * saved, and the two buttons under the panel decide what happens next.
   */
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || state.stopped || Date.now() < state.deaf) return;
    if (state.paused) return;
    pause();
  }, true);

  function pause() {
    state.paused = true;
    css(title, { color: "#FFC24D" });
    title.textContent = "Paused";
    body.textContent = "Nothing is being typed. Everything saved so far is safe.";
    hint.textContent = "";
    css(cursor, { opacity: ".25" });
    css(bar, { display: "flex" });
    bPause.textContent = "Continue";
  }

  function resume() {
    /*
     * Continue un-stops as well as un-pauses.
     *
     * The stopped flag was set by Stop and then cleared by nothing at all —
     * not by Continue, not by the next job, not by anything but quitting.
     * Every job after a Stop broke out of its prompt loop on the first line,
     * finished with nothing, and the app sat there looking wedged while the
     * queue filled up behind it. Stop meant "this app is over" when everyone
     * using it, me included, read it as "stop this job".
     */
    state.stopped = false;
    state.paused = false;
    css(title, { color: "#C9A0FF" });
    title.textContent = "Running";
    body.textContent = "Carrying on where it stopped.";
    css(cursor, { opacity: "1" });
    bPause.textContent = "Pause";
  }

  function halt() {
    state.stopped = true;
    state.paused = false;
    css(title, { color: "#FF6B5A" });
    title.textContent = "Stopped";
    body.textContent = "Nothing more will be typed. Everything saved is on your Desktop.";
    hint.textContent = "";
    css(cursor, { opacity: ".25" });
    css(bar, { display: "none" });
  }

  /**
   * One sparkle: a four-pointed star that grows, spins, drifts and fades.
   *
   * These were round dots with a soft gradient, which is a bubble. A sparkle
   * has points — the long vertical and horizontal spikes with the pinched
   * waist between them are the whole reason the shape reads as magic rather
   * than as a loading indicator. Drawn with a clip-path so it stays a real
   * star at any size and needs no image.
   */
  /*
   * The sparkle shape.
   *
   * Long thin spikes with a pinched waist, not a fat eight-pointed star: at
   * six pixels a chunky star is a dot, and a dot is a loading indicator. The
   * spikes are what still read as magic when the whole thing is the size of a
   * full stop.
   */
  const STAR = "polygon(50% 0%, 54% 41%, 100% 50%, 54% 59%, 50% 100%, 46% 59%, 0% 50%, 46% 41%)";

  /* Fairy dust is not one colour. Three, picked at random, all pale. */
  const DUST = [
    "radial-gradient(circle at 50% 50%, #FFFFFF 0%, #FFF8D8 40%, #FFE49A 75%, rgba(255,205,110,0) 100%)",
    "radial-gradient(circle at 50% 50%, #FFFFFF 0%, #F2EBFF 40%, #D8C4FF 75%, rgba(190,160,255,0) 100%)",
    "radial-gradient(circle at 50% 50%, #FFFFFF 0%, #E8FBFF 40%, #B6ECFF 75%, rgba(150,220,255,0) 100%)",
  ];

  function one(x, y, size, dx, dy, spin, life) {
    const tint = DUST[(Math.random() * DUST.length) | 0];
    const s = css(document.createElement("div"), {
      position: "fixed", zIndex: String(Number(TOP) - 1), pointerEvents: "none",
      left: x + "px", top: y + "px", width: size + "px", height: size + "px",
      margin: (-size / 2) + "px 0 0 " + (-size / 2) + "px",
      background: tint,
      clipPath: STAR,
      WebkitClipPath: STAR,
      // A small, tight glow. The old one was six pixels of halo around an
      // eleven pixel star, which is most of what made them look heavy.
      filter: "drop-shadow(0 0 3px rgba(255, 236, 190, .9))",
      transition: "transform " + life + "ms cubic-bezier(.16,.8,.3,1), opacity " + life + "ms ease-out",
      transform: "translate(0,0) scale(.2) rotate(0deg)", opacity: "1",
    });
    root.appendChild(s);
    // Two frames, so the browser has a start value to transition away from.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      css(s, {
        transform: "translate(" + dx + "px, " + dy + "px) scale(" + (0.5 + Math.random() * 0.6) + ") rotate(" + spin + "deg)",
        opacity: "0",
      });
    }));
    setTimeout(() => s.remove(), life + 60);
  }

  /*
   * The tail.
   *
   * A wand that arrives somewhere and only then sparkles is a wand that
   * teleports. Dust dropped along the path it just took is what makes the
   * travel itself readable — and the drift is deliberately downward and slow,
   * because dust falls.
   */
  let lastAt = null;
  function trail(x, y) {
    const from = lastAt;
    lastAt = { x, y };
    if (!from) return;
    const far = Math.hypot(x - from.x, y - from.y);
    if (far < 24) return;
    // One speck every twenty-odd pixels, capped so a jump across the screen
    // does not cost a hundred elements.
    const n = Math.min(14, Math.max(3, Math.round(far / 26)));
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const px = from.x + (x - from.x) * t + (Math.random() - 0.5) * 7;
      const py = from.y + (y - from.y) * t + (Math.random() - 0.5) * 7;
      setTimeout(
        () => one(px, py, 3 + Math.random() * 4,
                  (Math.random() - 0.5) * 12, 10 + Math.random() * 16,
                  (Math.random() - 0.5) * 120, 620 + Math.random() * 420),
        // Later along the path means later in time: the tail catches up.
        Math.round(t * 260),
      );
    }
  }

  /**
   * A very light chime when the wand lands on something.
   *
   * Synthesised rather than loaded: a file would have to be hosted, fetched
   * and allowed past the page's own content policy, and all of that for a
   * third of a second of bell. A rising eight-note arpeggio, each note doubled and detuned,
   * and a gain low enough that it sits under whatever else is playing.
   *
   * Browsers refuse to make noise until somebody has interacted with the
   * page, which is exactly right here — the first sound arrives after the
   * Submit button, never before.
   */
  let audio = null;
  let lastPing = 0;
  function ping() {
    const now = Date.now();
    // One per burst, not one per sparkle: twenty at once is a smashed window.
    if (now - lastPing < 400) return;
    lastPing = now;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio = audio || new Ctx();
      if (audio.state === "suspended") audio.resume();
      const t = audio.currentTime;
      /*
       * A rising arpeggio with a scatter of tiny high bells over it.
       *
       * The tuned notes carry the shape; the scatter is what makes it sound
       * like dust rather than like a xylophone. Every note is struck a few
       * milliseconds off the beat and a few cents off pitch, because nothing
       * that sparkles is exactly on time.
       */
      const notes = [
        [783.99,  0,     0.042],
        [1046.5,  0.040, 0.050],
        [1318.5,  0.078, 0.046],
        [1568.0,  0.116, 0.040],
        [2093.0,  0.154, 0.028],
        [2637.0,  0.192, 0.019],
        [3136.0,  0.230, 0.012],
        [4186.0,  0.268, 0.008],
      ];
      // Six specks of high bell, scattered through the same third of a second.
      for (let i = 0; i < 6; i++) {
        notes.push([
          2600 + Math.random() * 3400,
          0.02 + Math.random() * 0.34,
          0.004 + Math.random() * 0.005,
        ]);
      }
      for (const [hzRaw, whenRaw, level] of notes) {
        const hz = hzRaw * (1 + (Math.random() - 0.5) * 0.006);
        const when = whenRaw + Math.random() * 0.012;
        // Two oscillators per note, a few cents apart: one sine for the body
        // and a much quieter triangle above it for the shimmer. The detune is
        // what stops it sounding like a phone notification.
        for (const [shape, mul, cut] of [["sine", 1, 1], ["triangle", 1.002, 0.34]]) {
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          osc.type = shape;
          osc.frequency.setValueAtTime(hz * mul, t + when);
          gain.gain.setValueAtTime(0, t + when);
          gain.gain.linearRampToValueAtTime(level * cut, t + when + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + when + 0.62);
          osc.connect(gain).connect(audio.destination);
          osc.start(t + when);
          osc.stop(t + when + 0.66);
        }
      }
    } catch {
      // No audio on this page is not a reason for anything else to stop.
    }
  }

  /**
   * A burst, thrown outward from wherever the wand just landed.
   *
   * More of them, much smaller, and they fall rather than fly: twenty specks
   * of four pixels reads as a puff of dust, where nine of twenty pixels read
   * as confetti.
   */
  function spark(x, y, n) {
    const count = n || 16;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.9;
      const reach = 10 + Math.random() * 34;
      setTimeout(
        () => one(x, y, 3 + Math.random() * 5,
                  Math.cos(a) * reach, Math.sin(a) * reach + 6 + Math.random() * 14,
                  (Math.random() - 0.5) * 200, 700 + Math.random() * 520),
        i * 14,
      );
    }
  }

  /**
   * Waiting is most of the time this thing spends, and a wand frozen in a
   * corner for four minutes reads as a crash. While it waits it drifts down
   * the right-hand edge and drops a spark now and then — out of the way of
   * the page, but obviously alive.
   */
  let idle = null;
  function stopIdle() { if (idle) { clearInterval(idle); idle = null; } }
  function startIdle() {
    stopIdle();
    let t = 0;
    idle = setInterval(() => {
      if (state.stopped) return stopIdle();
      t += 1;
      const x = window.innerWidth - 58;
      const y = window.innerHeight * 0.42 + Math.sin(t / 2.4) * 46;
      trail(x, y);
      cursor.style.transform = "translate(" + x + "px, " + y + "px)";
      // A speck or two while it hovers. Any more and a wand doing nothing is
      // the busiest thing on the page.
      one(x - 6 + Math.random() * 12, y + 14 + Math.random() * 18,
          3 + Math.random() * 3, (Math.random() - 0.5) * 10, 16 + Math.random() * 14,
          (Math.random() - 0.5) * 140, 900 + Math.random() * 500);
    }, 900);
  }


  /* ------------------------------------------------------------- the card */

  /*
   * The job, as a panel in the corner of the page you are already looking at.
   *
   * A macOS dialog works, but it takes over the screen and it cannot show you
   * the picture you just chose. This sits over the page, holds the reference
   * image, and keeps the decision in the same place as the thing being
   * decided. Dropping a file straight onto it also means the picture never
   * leaves the browser: it goes from this panel into the composer as a File
   * object, with no round trip through disk.
   */
  const card = css(document.createElement("div"), {
    position: "fixed", zIndex: TOP, right: "18px", top: "18px",
    width: "330px", padding: "16px", borderRadius: "16px",
    background: "rgba(14,14,17,.97)", color: "#F7F2E7",
    font: '500 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxShadow: "0 18px 60px -18px rgba(0,0,0,.85)",
    display: "none",
  });
  const cName = css(document.createElement("div"), {
    fontSize: "15px", fontWeight: "700", letterSpacing: "-.01em", marginBottom: "3px",
  });
  const cSub = css(document.createElement("div"), { opacity: ".55", fontSize: "12px", marginBottom: "12px" });
  const drop = css(document.createElement("div"), {
    border: "1.5px dashed rgba(247,242,231,.28)", borderRadius: "12px",
    padding: "16px 12px", textAlign: "center", cursor: "pointer",
    transition: "border-color .15s, background .15s", marginBottom: "12px",
    minHeight: "78px", display: "grid", placeItems: "center", gap: "6px",
  });
  const dropText = css(document.createElement("div"), { opacity: ".6", fontSize: "12.5px" });
  dropText.textContent = "Drop the product photo here";
  const thumbs = css(document.createElement("div"), { display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" });
  drop.append(dropText, thumbs);

  const row = css(document.createElement("div"), { display: "flex", gap: "8px" });
  const mkBtn = (text, primary) => {
    const b = css(document.createElement("button"), {
      flex: "1", padding: "10px 12px", borderRadius: "10px", border: "0",
      cursor: "pointer", fontSize: "13.5px", fontWeight: "600",
      font: 'inherit', fontFamily: "inherit",
      background: primary ? "#C9A0FF" : "rgba(247,242,231,.10)",
      color: primary ? "#140A02" : "#F7F2E7",
    });
    b.textContent = text;
    return b;
  };
  const bSkip = mkBtn("Skip", false);
  bSkip.setAttribute("data-wand", "");
  const bGo = mkBtn("Submit", true);
  bGo.setAttribute("data-wand", "");
  row.append(bSkip, bGo);

  const picker = css(document.createElement("input"), { display: "none" });
  picker.type = "file";
  picker.accept = "image/*";
  picker.multiple = true;
  picker.setAttribute("data-wand", "");

  card.append(cName, cSub, drop, row, picker);
  card.setAttribute("data-wand", "");
  root.appendChild(card);

  /** Files chosen for this job, held in the page until the composer wants them. */
  state.files = [];
  let decide = null;

  function showThumbs() {
    thumbs.replaceChildren();
    for (const f of state.files) {
      const img = css(document.createElement("img"), {
        width: "46px", height: "46px", objectFit: "cover", borderRadius: "8px",
      });
      img.src = URL.createObjectURL(f);
      img.title = "Click to remove";
      css(img, { cursor: "pointer" });
      img.addEventListener("click", (e) => {
        e.stopPropagation();
        state.files = state.files.filter((x) => x !== f);
        showThumbs();
      });
      thumbs.appendChild(img);
    }
    dropText.textContent = state.files.length
      ? state.files.length + (state.files.length === 1 ? " picture ready" : " pictures ready") +
        (state.files.length >= MAX ? " (that's the ten)" : "  ·  click to add more")
      : "Drop your pictures here, or click to choose  ·  up to ten";
  }

  /** Ten is the cap. Past that the thumbnails stop being readable and the
      model stops paying attention to the later ones anyway. */
  const MAX = 10;
  function take(list) {
    const files = [...list].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    state.files = [...state.files, ...files].slice(0, MAX);
    showThumbs();
  }

  drop.addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => take(picker.files));
  ["dragenter", "dragover"].forEach((t) =>
    drop.addEventListener(t, (e) => {
      e.preventDefault(); e.stopPropagation();
      css(drop, { borderColor: "#C9A0FF", background: "rgba(201,160,255,.10)" });
    }),
  );
  ["dragleave", "drop"].forEach((t) =>
    drop.addEventListener(t, (e) => {
      e.preventDefault(); e.stopPropagation();
      css(drop, { borderColor: "rgba(247,242,231,.28)", background: "transparent" });
      if (t === "drop") take(e.dataTransfer?.files ?? []);
    }),
  );
  bGo.addEventListener("click", () => { card.style.display = "none"; state.answer = "run"; decide?.("run"); decide = null; });

  /* --------------------------------------------------- the finished panel */

  /*
   * What happened, and a way to go and look at it.
   *
   * The runner writes one zip when the job finishes, and this is the button
   * that fetches it. "It saved them" is a claim; a file appearing in Finder,
   * selected, when you press a button is not. The button only exists once
   * there is something behind it — nothing on this panel is ever a promise
   * about work still running.
   */
  const doneCard = css(document.createElement("div"), {
    position: "fixed", zIndex: TOP, right: "18px", top: "18px",
    width: "330px", padding: "16px", borderRadius: "16px",
    background: "rgba(14,14,17,.97)", color: "#F7F2E7",
    font: '500 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxShadow: "0 18px 60px -18px rgba(0,0,0,.85)", display: "none",
  });
  const dName = css(document.createElement("div"), { fontSize: "15px", fontWeight: "700", marginBottom: "3px" });
  const dSub = css(document.createElement("div"), { opacity: ".6", fontSize: "12px", marginBottom: "12px" });
  const dRow = css(document.createElement("div"), { display: "flex", gap: "8px" });
  const bOpen = mkBtn("Get the zip", true);
  const bClose = mkBtn("Close", false);
  bOpen.setAttribute("data-wand", "");
  bClose.setAttribute("data-wand", "");
  dRow.append(bClose, bOpen);
  doneCard.append(dName, dSub, dRow);
  root.appendChild(doneCard);

  state.open = false;
  bOpen.addEventListener("click", () => { state.open = true; doneCard.style.display = "none"; });
  bClose.addEventListener("click", () => { doneCard.style.display = "none"; });

  bSkip.addEventListener("click", () => { card.style.display = "none"; state.answer = "skip"; decide?.("skip"); decide = null; });

  bPause.addEventListener("click", () => (state.paused ? resume() : pause()));
  bStop.addEventListener("click", halt);
  // Pausing to hand it more pictures is the whole reason pause exists: a run
  // that has moved on to the next product needs the next product's reference,
  // and that used to mean killing it and starting again.
  bMore.addEventListener("click", () => {
    if (!state.paused) pause();
    state.wantsCard = true;
  });

  window.__wand = {
    stopped: () => state.stopped,
    paused: () => state.paused,
    /** Which mount this is. A new number means the page reloaded under us. */
    epoch: () => state.epoch,
    /**
     * Put a state back after a reload.
     *
     * Pause and Stop lived only in the page, so any navigation — a fresh chat,
     * a goto, the reader pressing reload — quietly cleared them and the run
     * carried on typing. The runner keeps its own copy now and hands it back
     * here whenever it finds a new mount.
     */
    restore: (s) => {
      if (!s) return;
      if (s.stopped) halt();
      else if (s.paused) pause();
    },
    /** An order from Claude, applied exactly as if the button had been pressed. */
    order(what) {
      if (what === "pause" && !state.paused && !state.stopped) pause();
      else if ((what === "continue" || what === "go" || what === "run") && (state.paused || state.stopped)) resume();
      // "continue" on a card that is still asking is a yes: the job runs.
      else if ((what === "continue" || what === "go" || what === "run") && card.isConnected && card.style.display === "block") bGo.click();
      else if (what === "stop") halt();
      else if (what === "pictures" || what === "images") { if (!state.paused) pause(); state.wantsCard = true; }
      else if (what === "skip") { if (card.isConnected && card.style.display === "block") bSkip.click(); else return false; }
      else return false;
      hint.textContent = "Claude sent: " + what;
      return true;
    },
    /** True once, when Add pictures has been pressed. */
    wantsCard() { const v = state.wantsCard; state.wantsCard = false; return v; },
    /** The panel's own buttons, for a run that starts already going. */
    /*
     * A new job starting is itself a reason to be un-stopped. The runner calls
     * this the moment a job is approved, so a Stop that ended the last one
     * cannot silently swallow the next one.
     */
    running() {
      state.stopped = false;
      state.paused = false;
      css(bar, { display: "flex" });
      bPause.textContent = "Pause";
    },
    /**
     * Put the job on screen. Returns at once; the runner asks answer()
     * until somebody has pressed something.
     *
     * This used to hand back a promise that resolved on the click, and a
     * promise held open inside the page dies the moment the page changes —
     * which a chat site does constantly. The runner read that death as "the
     * person said no", wrote the job down as done, and then waited forever
     * for a job it had just thrown away. Nothing here can die now: the
     * answer is a value the page holds until it is read.
     */
    ask(name, sub) {
      // Put every piece back, not just the outer one: a page that tears the
      // overlay out can take the buttons with it, and a card with no Submit
      // on it is the same as no card at all.
      if (!row.isConnected || row.parentElement !== card) card.append(drop, row, picker);
      if (!card.isConnected) root.appendChild(card);
      if (!hud.isConnected) root.appendChild(hud);
      if (!cursor.isConnected) root.appendChild(cursor);
      cName.textContent = name;
      cSub.textContent = sub;
      state.files = [];
      state.answer = null;
      showThumbs();
      card.style.display = "block";
      return true;
    },
    /** What was pressed on the card, once, or null while it is still open. */
    answer() { const v = state.answer ?? null; state.answer = null; return v; },
    /**
     * Whether the card is really on screen waiting for a press.
     *
     * The display flag alone was a lie: a chat page re-renders and throws the card
     * out of the document while its style still says block, and the runner
     * then waited forever for a click on something that was not in the page.
     * Connected and visible, or it is not asking.
     */
    asking: () => card.isConnected && card.style.display === "block",
    /** How many pictures are waiting in the card. */
    fileCount: () => state.files.length,
    /** Show what a finished job produced, with a way to go and see it. */
    done(name, sub) {
      if (!doneCard.isConnected) root.appendChild(doneCard);
      dName.textContent = name;
      dSub.textContent = sub;
      state.open = false;
      doneCard.style.display = "block";
    },
    /** True once Open the folder has been clicked. */
    wantsFolder() { const v = state.open; state.open = false; return v; },
    /**
     * Push the card's pictures into the composer, as a paste or a drag.
     * They never touch the disk: the File objects go straight from the panel
     * that received them to the element that wants them.
     */
    give(sels, mode) {
      if (!state.files.length) return false;
      const box = sels.map((s) => document.querySelector(s)).find(Boolean);
      if (!box) return false;
      const dt = new DataTransfer();
      for (const f of state.files) dt.items.add(f);
      if (mode === "paste") {
        box.focus?.();
        box.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
        return true;
      }
      const targets = [];
      for (let el = box; el && targets.length < 8; el = el.parentElement) targets.push(el);
      targets.push(document.body, document.documentElement);
      for (const t of targets) {
        for (const type of ["dragenter", "dragover", "drop"]) {
          t.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        }
      }
      return true;
    },
    /** Ignore Escape for a moment, while the runner sends one on purpose. */
    deafen(ms) { state.deaf = Date.now() + (ms || 1500); },
    idle(on) { on ? startIdle() : stopIdle(); },
    to(x, y, act) {
      stopIdle();
      // Re-attach if the page's own rendering swept the overlay away.
      if (!cursor.isConnected) root.appendChild(cursor);
      if (!hud.isConnected) root.appendChild(hud);
      trail(x, y);
      cursor.style.transform = "translate(" + x + "px, " + y + "px)";
      if (!act) return;
      ping();
      spark(x, y, 18);
      setTimeout(() => spark(x, y, 10), 170);
      // A quick pulse on top of the travel, done with a timer because a
      // keyframe animation would need a stylesheet.
      cursor.style.transition = "transform .12s ease";
      cursor.style.transform = "translate(" + x + "px, " + y + "px) scale(1.25)";
      setTimeout(() => {
        cursor.style.transform = "translate(" + x + "px, " + y + "px) scale(1)";
        setTimeout(() => { cursor.style.transition = "transform .45s cubic-bezier(.22,.8,.28,1)"; }, 140);
      }, 130);
    },
    say(t, b) {
      // A paused panel says Paused until somebody presses Continue; a status
      // line arriving late from the runner must not talk over it.
      if (state.stopped || state.paused) return;
      if (!hud.isConnected) root.appendChild(hud);
      title.textContent = t;
      body.textContent = b;
    },
  };
  return true;
})()`;

/**
 * Mounts the overlay and hands back the three things the runner needs. It
 * reports whether the overlay is really there, because one that silently
 * fails to draw is worse than none — the run looks broken when it isn't.
 */
export async function attachWand(page) {
  await page.addInitScript(OVERLAY).catch(() => {});
  let mounted = false;
  try {
    mounted = Boolean(await page.evaluate(OVERLAY));
  } catch (e) {
    console.log(`  (the on-screen wand couldn't be drawn on this page: ${String(e).split("\n")[0]})`);
  }
  if (!mounted) {
    console.log("  (no on-screen wand here — the typing still works, you just won't see the cursor)");
  }

  const safe = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };

  return {
    mounted,
    stopped: () => safe(() => page.evaluate(() => window.__wand?.stopped() ?? false), false),
    paused: () => safe(() => page.evaluate(() => window.__wand?.paused() ?? false), false),
    epoch: () => safe(() => page.evaluate(() => window.__wand?.epoch() ?? 0), 0),
    restore: (s) => safe(() => page.evaluate((v) => window.__wand?.restore(v), s)),
    wantsCard: () => safe(() => page.evaluate(() => window.__wand?.wantsCard() ?? false), false),
    running: () => safe(() => page.evaluate(() => window.__wand?.running())),
    order: (what) => safe(() => page.evaluate((w) => window.__wand?.order(w) ?? false, what), false),
    /** Wrap a programmatic Escape so the stop key doesn't hear our own. */
    deafen: (ms = 1500) => safe(() => page.evaluate((v) => window.__wand?.deafen(v), ms)),
    say: (t, b) => safe(() => page.evaluate(([a, c]) => window.__wand?.say(a, c), [t, b])),
    /** Drift and sparkle at the edge while something slow is happening. */
    idle: (on) => safe(() => page.evaluate((v) => window.__wand?.idle(v), on)),
    point: async (locator, act = true) => {
      const box = await safe(() => locator.boundingBox(), null);
      if (!box) return;
      const x = box.x + box.width / 2;
      const y = box.y + Math.min(box.height / 2, 40);
      await safe(() => page.evaluate(([a, b, c]) => window.__wand?.to(a, b, c), [x, y, act]));
      // Long enough that the travel reads as movement rather than a jump.
      await page.waitForTimeout(act ? 540 : 260);
    },
    /** Show the card and wait. Null when the overlay isn't there to show it. */
    ask: (name, sub) => safe(() => page.evaluate(([a, b]) => window.__wand?.ask(a, b) ?? null, [name, sub]), null),
    answer: () => safe(() => page.evaluate(() => window.__wand?.answer() ?? null), null),
    asking: () => safe(() => page.evaluate(() => window.__wand?.asking() ?? false), false),
    /** Whether the overlay is actually in the page right now. */
    present: () => safe(() => page.evaluate(() => Boolean(window.__wand)), false),
    fileCount: () => safe(() => page.evaluate(() => window.__wand?.fileCount() ?? 0), 0),
    give: (sels, mode) => safe(() => page.evaluate(([s, m]) => window.__wand?.give(s, m), [sels, mode]), false),
    done: (name, sub) => safe(() => page.evaluate(([a, b]) => window.__wand?.done(a, b), [name, sub])),
    wantsFolder: () => safe(() => page.evaluate(() => window.__wand?.wantsFolder() ?? false), false),
    reattach: () => safe(() => page.evaluate(OVERLAY)),
  };
}
