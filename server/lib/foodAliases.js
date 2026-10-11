// Hindi / Telugu / Tamil / Kannada / Malayalam food words (in English letters) -> the English words the catalogue uses,
// so searching "annam", "perugu" or "kodi" finds rice, curd or chicken. Lower-case; a word may map to several terms.
const A = {
  annam: ['rice'], chawal: ['rice'], bhaat: ['rice'], sadam: ['rice'], choru: ['rice'], anna: ['rice'],
  perugu: ['curd'], dahi: ['curd'], thayir: ['curd'], mosaru: ['curd'], tayir: ['curd'], curds: ['curd'],
  pappu: ['dal'], paruppu: ['dal'], bele: ['dal'], parippu: ['dal'], daal: ['dal'],
  kodi: ['chicken'], murgh: ['chicken'], kozhi: ['chicken'], koli: ['chicken'], kozhikari: ['chicken'],
  mamsam: ['mutton'], gosht: ['mutton'], aadu: ['mutton'], maans: ['mutton'], kheema: ['keema'],
  guddu: ['egg'], anda: ['egg'], muttai: ['egg'], mutta: ['egg'], tamatar: ['tomato'], thakkali: ['tomato'], tamata: ['tomato'],
  chepa: ['fish'], chepala: ['fish'], machli: ['fish'], machhi: ['fish'], meen: ['fish'], meenu: ['fish'], maachh: ['fish'], maach: ['fish'],
  royyalu: ['prawn'], royyala: ['prawn'], jhinga: ['prawn'], eral: ['prawn'], chemmeen: ['prawn'],
  paal: ['milk'], palu: ['milk'], doodh: ['milk'], haalu: ['milk'], paalu: ['milk'], chai: ['tea'], chaay: ['tea'], theneer: ['tea'],
  aloo: ['potato'], bangaladumpa: ['potato'], urulai: ['potato'], batata: ['potato'], palak: ['spinach'], palakura: ['spinach'], keerai: ['spinach', 'keerai'],
  bhindi: ['okra', 'bhindi'], bendakaya: ['okra', 'bendakaya'], vendakkai: ['okra'], baingan: ['brinjal', 'baingan'], vankaya: ['brinjal', 'vankaya'], kathirikai: ['brinjal'],
  gobi: ['cauliflower', 'gobi'], pyaaz: ['onion'], pyaz: ['onion'], ullipaya: ['onion'], vengayam: ['onion'], nimbu: ['lemon'], nimmakaya: ['lemon'],
  chapati: ['roti'], phulka: ['roti'], rotte: ['roti'], rotti: ['roti'], neyyi: ['ghee'], tuppa: ['ghee'], nei: ['ghee'],
  senaga: ['chana'], senagalu: ['chana'], kondakadalai: ['chana'], kabuli: ['chana'], chole: ['chole', 'chana'], pesalu: ['moong'], pesara: ['moong', 'pesarattu'], payaru: ['moong'],
  molakalu: ['sprouts'], ragulu: ['ragi'], jonna: ['jowar', 'jonna'], sajja: ['bajra', 'sajja'], godhuma: ['wheat'], atta: ['wheat', 'atta'],
  mamidi: ['mango'], aam: ['mango'], arati: ['banana'], kela: ['banana'], vazhaipazham: ['banana'], seb: ['apple'], boppayi: ['papaya'], santra: ['orange'], angoor: ['grapes'],
  laddoo: ['laddu'], payasam: ['payesh', 'kheer'], payasa: ['payesh', 'kheer'], paayasam: ['payesh', 'kheer'], kheer: ['kheer', 'payesh'],
  garelu: ['vada', 'garelu'], vadai: ['vada'], dosai: ['dosa'], idly: ['idli'], uppittu: ['upma'], aval: ['poha'], sambhar: ['sambar'], charu: ['rasam', 'charu'],
  tiffin: ['idli', 'dosa'], bonda: ['bonda'], sabzi: ['curry'], kura: ['curry'], kootu: ['kootu'], poriyal: ['poriyal'], pulusu: ['pulusu'],
};

/** All search words for one typed word: the word itself plus any English equivalents. */
function expandWord(w) {
  const k = String(w || '').toLowerCase();
  return A[k] ? [k, ...A[k]] : [k];
}

/** Replaces known Indian-language words in free text with the English food word ("2 roti, perugu, annam" -> "2 roti, curd, rice"). */
function englishify(text) {
  return String(text || '').replace(/[A-Za-z]+/g, (w) => (A[w.toLowerCase()] ? A[w.toLowerCase()][0] : w));
}

module.exports = { expandWord, englishify, ALIASES: A };
