// Hero scenes for Home: wide anime scenes with the quote already painted on the right (same set as the web app).
// Metro needs literal require() paths. Starts on the scene of the day; HeroCard then rotates through them while the app is open.
// `ar` is width / height of the image, `accent` colours the name and the card border to match the scene.
export type HeroScene = { src: number; ar: number; accent: string; who: string };
export const HERO_SCENES: HeroScene[] = [
  { src: require('../../../assets/scenes/hero/inosuke.webp'), ar: 1200 / 433, accent: '#4f7bff', who: 'Inosuke' },
  { src: require('../../../assets/scenes/hero/zenitsu.webp'), ar: 1200 / 434, accent: '#ffc21a', who: 'Zenitsu' },
  { src: require('../../../assets/scenes/hero/tanjiro-kid.webp'), ar: 1200 / 432, accent: '#17a57a', who: 'Tanjiro' },
  { src: require('../../../assets/scenes/hero/tanjiro.webp'), ar: 1200 / 391, accent: '#e0443a', who: 'Tanjiro' },
  { src: require('../../../assets/scenes/hero/killua.webp'), ar: 1200 / 439, accent: '#8a6cff', who: 'Killua' },
  { src: require('../../../assets/scenes/hero/asta.webp'), ar: 1200 / 438, accent: '#e0443a', who: 'Asta' },
  { src: require('../../../assets/scenes/hero/gojo.webp'), ar: 1200 / 440, accent: '#7fc6ff', who: 'Gojo' },
  { src: require('../../../assets/scenes/hero/luffy.webp'), ar: 1200 / 439, accent: '#e0443a', who: 'Luffy' },
  { src: require('../../../assets/scenes/hero/goku-kid.webp'), ar: 1200 / 436, accent: '#ff8a00', who: 'Goku' },
  { src: require('../../../assets/scenes/hero/goku.webp'), ar: 1200 / 439, accent: '#ff8a00', who: 'Goku' },
  { src: require('../../../assets/scenes/hero/naruto.webp'), ar: 1200 / 439, accent: '#ff9a1f', who: 'Naruto' },
];
export const heroSceneOfDay = (d = new Date()): HeroScene => HERO_SCENES[(d.getDate() + 3) % HERO_SCENES.length];
