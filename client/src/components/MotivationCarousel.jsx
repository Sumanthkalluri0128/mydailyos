import { useEffect, useMemo, useState } from 'react';

const QUOTES = [
  'You do not need a perfect day. You only need one good next step.',
  'Small actions repeated consistently become a completely different life.',
  'Progress is still progress when nobody else can see it yet.',
  'Today is another chance to become a little stronger than yesterday.',
  'Your future self is built by what you choose to do today.',
  'Do the simple things well. Then do them again tomorrow.',
  'You are not behind. You are building at your own pace.',
  'One healthy meal, one workout, one task, one day at a time.',
  'Consistency will take you places motivation cannot reach alone.',
  'A slow day is not a failed day. Keep the streak of showing up.',
  'Make today count, even if today is not perfect.',
  'The goal is not perfection. The goal is becoming better.',
  'Keep your promises to yourself. That is how confidence grows.',
  'Every small win gives tomorrow a stronger starting point.',
  'You have already changed by deciding to keep going.',
  'Focus on the next useful action, not the entire mountain.',
  'Discipline gets easier when you stop waiting to feel ready.',
  'Your habits are quietly shaping the person you are becoming.',
  'Protect your energy. Spend it on the life you want.',
  'Do something today that your future self will thank you for.',
  'You can restart the day at any moment. Start now.',
  'A little better every day is a powerful direction.',
  'Show up for yourself today. That is enough to begin.',
  'Keep moving. The version of you you want is built in motion.',
  'Your only job right now is the next good decision.',
  'Momentum starts with one action. Take it.',
  'Do not compare your chapter to someone else’s finished page.',
  'You are allowed to go slowly. Just keep going.',
  'Build a life you do not need to escape from.',
  'Today does not need to be extraordinary to be meaningful.',
  'Keep the promise: one more healthy choice, one more step forward.',
];

function dayNumber() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function dailyOrder(seed) {
  return QUOTES.map((quote, index) => ({
    quote,
    score: Math.sin((seed + index * 37.17) * 12.9898) * 43758.5453 % 1,
  }))
    .sort((a, b) => a.score - b.score)
    .map((item) => item.quote);
}

export default function MotivationCarousel() {
  const [dayKey, setDayKey] = useState(dayNumber);
  const [index, setIndex] = useState(0);
  const quotes = useMemo(() => dailyOrder(dayKey), [dayKey]);

  useEffect(() => {
    const dayTimer = window.setInterval(() => {
      const nextDay = dayNumber();
      if (nextDay !== dayKey) {
        setDayKey(nextDay);
        setIndex(0);
      }
    }, 60 * 1000);
    return () => window.clearInterval(dayTimer);
  }, [dayKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % quotes.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [quotes.length]);

  return (
    <div className="motivation-carousel">
      <div className="motivation-topline">
        <span>✦ DAILY MOTIVATION</span>
        <span>{index + 1}/{quotes.length}</span>
      </div>
      <div className="motivation-quote" key={`${dayKey}-${index}`}>
        “{quotes[index]}”
      </div>
      <div className="motivation-bottomline">
        <div className="motivation-dots" aria-hidden="true">
          {quotes.slice(0, 5).map((_, dot) => (
            <span key={dot} className={dot === index % 5 ? 'active' : ''} />
          ))}
        </div>
        <button
          type="button"
          className="motivation-next"
          onClick={() => setIndex((value) => (value + 1) % quotes.length)}
          aria-label="Show another motivational quote"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
