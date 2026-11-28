// Where the live numbers sit on each daily background (assets/widget/bg-<who>.jpg).
// All values are pixels on the ORIGINAL 1774 x 887 artwork; FlexFitWidget scales them to the widget's real size.
// Box = [x, y, width, height]. If you make a new background whose cards sit in a different place, add or edit its entry here.
export type Box = [number, number, number, number];
export type Zones = {
  today: Box; streak: Box;
  cal: Box; calBar: Box; pro: Box; proBar: Box; steps: Box; stepsBar: Box; water: Box;
  dropsCx: number[]; dropsCy: number; // centres of the 7 empty water drops
  missions: [Box, Box, Box, Box];     // the four mission pills along the bottom
};
export const ART_W = 1774;
export const ART_H = 887;

const ASTA: Zones = {
  today: [660, 152, 290, 54],
  streak: [1528, 158, 208, 50],
  cal: [730, 305, 236, 64],
  calBar: [615, 385, 506, 28],
  pro: [1312, 305, 250, 64],
  proBar: [1195, 385, 412, 28],
  steps: [730, 520, 236, 64],
  stepsBar: [615, 603, 392, 30],
  water: [1312, 520, 250, 64],
  dropsCx: [1210, 1266, 1322, 1377, 1433, 1489, 1544], dropsCy: 618,
  missions: [[330, 755, 332, 80], [681, 755, 330, 80], [1028, 755, 340, 80], [1388, 755, 340, 80]],
};
const GOKU: Zones = {
  today: [660, 152, 290, 54],
  streak: [1528, 158, 208, 50],
  cal: [730, 305, 236, 64],
  calBar: [615, 385, 506, 28],
  pro: [1312, 305, 250, 64],
  proBar: [1195, 385, 412, 28],
  steps: [730, 520, 236, 64],
  stepsBar: [615, 603, 392, 30],
  water: [1312, 520, 250, 64],
  dropsCx: [1210, 1266, 1322, 1377, 1433, 1489, 1544], dropsCy: 618,
  missions: [[330, 755, 332, 80], [681, 755, 330, 80], [1028, 755, 340, 80], [1388, 755, 340, 80]],
};
const GOJO: Zones = {
  today: [660, 152, 290, 54],
  streak: [1528, 158, 208, 50],
  cal: [730, 305, 236, 64],
  calBar: [615, 385, 506, 28],
  pro: [1312, 305, 250, 64],
  proBar: [1195, 385, 412, 28],
  steps: [730, 520, 236, 64],
  stepsBar: [615, 603, 392, 30],
  water: [1312, 520, 250, 64],
  dropsCx: [1210, 1266, 1322, 1377, 1433, 1489, 1544], dropsCy: 618,
  missions: [[330, 755, 332, 80], [681, 755, 330, 80], [1028, 755, 340, 80], [1388, 755, 340, 80]],
};
const TANJIRO: Zones = {
  today: [660, 152, 290, 54],
  streak: [1528, 158, 208, 50],
  cal: [730, 305, 236, 64],
  calBar: [615, 385, 506, 28],
  pro: [1312, 305, 250, 64],
  proBar: [1195, 385, 412, 28],
  steps: [730, 520, 236, 64],
  stepsBar: [615, 603, 392, 30],
  water: [1312, 520, 250, 64],
  dropsCx: [1210, 1266, 1322, 1377, 1433, 1489, 1544], dropsCy: 618,
  missions: [[330, 755, 332, 80], [681, 755, 330, 80], [1028, 755, 340, 80], [1388, 755, 340, 80]],
};
const LUFFY: Zones = {
  today: [678, 155, 272, 52],
  streak: [1528, 158, 208, 50],
  cal: [730, 305, 236, 64],
  calBar: [615, 385, 506, 28],
  pro: [1312, 305, 250, 64],
  proBar: [1195, 385, 412, 28],
  steps: [730, 520, 236, 64],
  stepsBar: [615, 603, 392, 30],
  water: [1312, 520, 250, 64],
  dropsCx: [1210, 1266, 1322, 1377, 1433, 1489, 1544], dropsCy: 618,
  missions: [[330, 755, 332, 80], [681, 755, 330, 80], [1028, 755, 340, 80], [1388, 755, 340, 80]],
};
const NARUTO: Zones = {
  today: [700, 148, 250, 48],
  streak: [1520, 150, 225, 42],
  cal: [695, 293, 253, 72],
  calBar: [580, 378, 532, 30],
  pro: [1298, 293, 252, 72],
  proBar: [1180, 378, 422, 30],
  steps: [695, 515, 253, 72],
  stepsBar: [580, 603, 405, 30],
  water: [1298, 515, 252, 72],
  dropsCx: [1200, 1255, 1310, 1366, 1421, 1476, 1531], dropsCy: 613,
  missions: [[327, 755, 328, 83], [677, 755, 330, 83], [1027, 755, 338, 83], [1386, 755, 339, 83]],
};
const JINWOO: Zones = {
  today: [700, 155, 280, 50],
  streak: [1548, 160, 187, 40],
  cal: [750, 302, 240, 65],
  calBar: [648, 378, 500, 26],
  pro: [1325, 302, 250, 65],
  proBar: [1218, 378, 397, 26],
  steps: [750, 508, 240, 65],
  stepsBar: [648, 590, 367, 27],
  water: [1325, 508, 245, 65],
  dropsCx: [1248, 1298, 1349, 1400, 1450, 1500, 1551], dropsCy: 600,
  missions: [[335, 752, 337, 78], [690, 752, 332, 78], [1040, 752, 336, 78], [1393, 752, 339, 78]],
};

export const ZONES: Record<string, Zones> = { asta: ASTA, goku: GOKU, gojo: GOJO, tanjiro: TANJIRO, luffy: LUFFY, naruto: NARUTO, jinwoo: JINWOO };
/** Monday (zoro) has no artwork yet, so it borrows the Jin-Woo one. Add assets/widget/bg-zoro.jpg + a ZONES entry to give him his own. */
export const zonesFor = (who: string): Zones => ZONES[who] || ZONES.jinwoo;
