// Synthesizes a short, professional-feeling two-note notification chime
// using FM synthesis — no audio asset needed.
//
// Why FM instead of plain oscillators: a bell/chime sound (think iOS,
// Samsung, WhatsApp Web) isn't a pure tone — it has a bright, slightly
// inharmonic "strike" that quickly settles into a clean tone. That
// character comes from frequency-modulating a carrier tone with a
// modulator whose depth decays fast (the classic "FM bell" technique).
// A plain sine/triangle can never produce this shape, which is why the
// previous version sounded synthetic no matter how the gain was tuned.
let audioCtx = null;
let unlocked = false;
let reverbImpulseBuffer = null; // cached so we only generate it once

function getContext() {
    if (typeof window === "undefined") return null;
    if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
    }
    return audioCtx;
}

// Chrome/Safari only allow AudioContext.resume() to succeed inside a real
// user-gesture handler. Unlock once, on the user's first interaction
// anywhere on the page, so it's already running by the time a notification
// needs to play.
function unlockAudio() {
    if (unlocked) return;
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
        ctx.resume().then(() => { unlocked = true; }).catch(() => { });
    } else {
        unlocked = true;
    }
}

if (typeof window !== "undefined") {
    ["pointerdown", "keydown", "touchstart"].forEach((evt) => {
        document.addEventListener(evt, unlockAudio, { once: true, passive: true });
    });
}

// Procedurally builds a very short "room" impulse response (decaying
// filtered noise) for a ConvolverNode. This is how a subtle sense of space
// gets added without needing to source/host an actual reverb audio file.
function getReverbImpulse(ctx) {
    if (reverbImpulseBuffer) return reverbImpulseBuffer;
    const duration = 0.7;
    const decay = 3.2; // higher = tail fades faster, keeps it subtle not "cave-like"
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
    }
    reverbImpulseBuffer = impulse;
    return impulse;
}

// A single FM "bell" note: a carrier at the note's pitch, modulated by a
// second oscillator at an inharmonic ratio (1.4x). The modulation depth
// starts bright and decays quickly — that's what gives the characteristic
// "struck bell settling into a pure tone" quality instead of a flat beep.
function scheduleBellNote(ctx, { frequency, start, duration, gain, dry, wet }) {
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = frequency;

    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = frequency * 1.4; // inharmonic ratio → bell character, not a flat octave

    const modDepth = ctx.createGain();
    modulator.connect(modDepth);
    modDepth.connect(carrier.frequency); // FM: modulator drives the carrier's pitch

    modDepth.gain.setValueAtTime(frequency * 2.2, start);
    modDepth.gain.exponentialRampToValueAtTime(Math.max(frequency * 0.02, 1), start + duration * 0.65);

    const noteGain = ctx.createGain();
    carrier.connect(noteGain);
    noteGain.gain.setValueAtTime(0, start);
    noteGain.gain.linearRampToValueAtTime(gain, start + 0.006); // fast "strike" attack
    noteGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    noteGain.connect(dry);
    noteGain.connect(wet);

    carrier.start(start);
    modulator.start(start);
    carrier.stop(start + duration + 0.05);
    modulator.stop(start + duration + 0.05);

    // A few milliseconds of filtered noise right at the strike — this is the
    // "mallet tap" transient. Without it, an FM tone alone still reads as
    // slightly synthetic; this is a small but very audible realism cue.
    const tickDur = 0.012;
    const tickBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * tickDur), ctx.sampleRate);
    const tickData = tickBuffer.getChannelData(0);
    for (let i = 0; i < tickData.length; i++) {
        tickData[i] = (Math.random() * 2 - 1) * (1 - i / tickData.length);
    }
    const tickSource = ctx.createBufferSource();
    tickSource.buffer = tickBuffer;
    const tickFilter = ctx.createBiquadFilter();
    tickFilter.type = "highpass";
    tickFilter.frequency.value = 4500;
    const tickGain = ctx.createGain();
    tickGain.gain.value = gain * 0.22;
    tickSource.connect(tickFilter);
    tickFilter.connect(tickGain);
    tickGain.connect(dry);
    tickSource.start(start);
}

function scheduleChime(ctx) {
    const now = ctx.currentTime;

    // Brickwall safety net — catches any peak that sneaks past 1.0 without
    // audibly squashing the overall sound the way a low-threshold compressor
    // does.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-1, now);
    limiter.knee.setValueAtTime(0, now);
    limiter.ratio.setValueAtTime(20, now);
    limiter.attack.setValueAtTime(0.001, now);
    limiter.release.setValueAtTime(0.08, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.95, now);
    limiter.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Dry path (the actual tone, unaffected)
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1;
    dryGain.connect(limiter);

    // Wet path (a touch of reverb for "polish") — kept low so it reads as
    // space, not an echoey room.
    const convolver = ctx.createConvolver();
    convolver.buffer = getReverbImpulse(ctx);
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.08;
    convolver.connect(wetGain);
    wetGain.connect(limiter);

    // Ascending fifth — same pleasant, resolving interval as before, now
    // rendered as proper bell tones instead of flat sine beeps.
    scheduleBellNote(ctx, { frequency: 1046.5, start: now, duration: 0.34, gain: 0.20, dry: dryGain, wet: convolver }); // C6
    scheduleBellNote(ctx, { frequency: 1568.0, start: now + 0.1, duration: 0.44, gain: 0.25, dry: dryGain, wet: convolver }); // G6
}

export function playNotificationSound() {
    try {
        const ctx = getContext();
        if (!ctx) {
            console.warn("[notificationSound] Web Audio API not available in this browser.");
            return;
        }
        if (ctx.state === "suspended") {
            console.warn("[notificationSound] Audio still locked — waiting for first user interaction.");
            return;
        }
        scheduleChime(ctx);
    } catch (err) {
        console.error("[notificationSound] Failed to play chime:", err);
    }
}