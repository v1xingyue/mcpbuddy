'use client';

import { useEffect } from 'react';

type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

/** A deliberately quiet hover tone, enabled only after the user's first gesture. */
export function CardHoverSound() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioContextConstructor) return;
    let context: AudioContext | null = null;
    let lastTarget: Element | null = null;
    let lastPlayedAt = 0;

    const unlock = () => {
      context ??= new AudioContextConstructor();
      void context.resume();
    };
    const play = () => {
      if (!context || context.state !== 'running') return;
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(620, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.011, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
      oscillator.connect(gain).connect(context.destination); oscillator.start(now); oscillator.stop(now + 0.08);
    };
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const target = (event.target as Element | null)?.closest('.ui-interactive-card');
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
      const timestamp = performance.now();
      if (target === lastTarget && timestamp - lastPlayedAt < 300) return;
      lastTarget = target; lastPlayedAt = timestamp; play();
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('pointerover', onPointerOver);
    return () => { document.removeEventListener('pointerdown', unlock); document.removeEventListener('pointerover', onPointerOver); void context?.close(); };
  }, []);
  return null;
}
