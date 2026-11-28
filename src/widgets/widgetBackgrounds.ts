// Static requires so Metro bundles every background. The widget wears one per week (see widgetTheme.ts); a new artwork also needs its name added to WIDGET_THEMES in utils/widgetTheme.ts.
export const BG_IMAGES: Record<string, any> = {
  asta: require('../../assets/widget/bg-asta.jpg'),
  goku: require('../../assets/widget/bg-goku.jpg'),
  gojo: require('../../assets/widget/bg-gojo.jpg'),
  tanjiro: require('../../assets/widget/bg-tanjiro.jpg'),
  luffy: require('../../assets/widget/bg-luffy.jpg'),
  naruto: require('../../assets/widget/bg-naruto.jpg'),
  jinwoo: require('../../assets/widget/bg-jinwoo.jpg'),
};
export const bgFor = (who: string): any => BG_IMAGES[who] || BG_IMAGES.jinwoo;
