// Single soft low tone — plays when a new 'requested' status appears
export const playNewRequestSound = (audioCtx) => {
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.frequency.value = 440 // A4
  osc.type = 'sine'
  gain.gain.setValueAtTime(0, audioCtx.currentTime)
  gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8)
  osc.start(audioCtx.currentTime)
  osc.stop(audioCtx.currentTime + 0.8)
}

// Two ascending tones (D5 then F#5) — plays when status changes to 'arrived'
export const playArrivalSound = (audioCtx) => {
  ;[587.33, 739.99].forEach((freq, i) => {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.frequency.value = freq
    osc.type = 'sine'
    const t = audioCtx.currentTime + i * 0.28
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7)
    osc.start(t)
    osc.stop(t + 0.7)
  })
}
