import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════
   ⚔️ QUDRAT QUEST — رحلة من الثانوية إلى أرامكو
   RPG • Adventure • Puzzle — أسئلة القدرات هي سلاحك
   ═══════════════════════════════════════════════════════════ */

/* ---------- 🔊 SOUND ENGINE (WebAudio synth) ---------- */
let AC = null;
const ac = () => (AC ||= new (window.AudioContext || window.webkitAudioContext)());
function tone(freq, dur = 0.12, type = "sine", vol = 0.18, delay = 0) {
  try {
    const c = ac();
    if (c.state === "suspended") c.resume();
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + 0.05);
  } catch (e) {}
}
const SFX = {
  click: () => tone(600, 0.05, "square", 0.06),
  correct: () => { tone(523, 0.1); tone(784, 0.14, "sine", 0.18, 0.09); },
  crit: () => { tone(523, 0.08); tone(659, 0.08, "sine", 0.2, 0.07); tone(1047, 0.2, "sine", 0.2, 0.14); },
  wrong: () => tone(150, 0.26, "sawtooth", 0.1),
  coin: () => { tone(988, 0.06, "square", 0.1); tone(1319, 0.12, "square", 0.1, 0.06); },
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15, "triangle", 0.16, i * 0.11)),
  boss: () => { tone(110, 0.5, "sawtooth", 0.12); tone(98, 0.5, "sawtooth", 0.12, 0.4); },
  win: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, "triangle", 0.15, i * 0.13)),
  door: () => { tone(220, 0.2, "triangle", 0.12); tone(330, 0.25, "triangle", 0.12, 0.15); },
  step: () => { tone(480, 0.04, "square", 0.05); tone(500, 0.04, "square", 0.05, 0.16); tone(480, 0.04, "square", 0.05, 0.32); },
  heart: () => { tone(180, 0.18, "triangle", 0.14); tone(140, 0.25, "triangle", 0.12, 0.12); },
};
let soundOn = true;
const play = (name) => { if (soundOn) SFX[name]?.(); };

/* ---------- 🎵 AMBIENT MUSIC (مقطوعات أصلية مولّدة) ---------- */
let musicTimer = null, musicTimer2 = null;
function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  if (musicTimer2) clearInterval(musicTimer2);
  musicTimer = musicTimer2 = null;
}
// 🌙 "حالمة": باد بطيء حزين-هادئ (أجواء dream pop)
const DREAM_CHORDS = [[130.8, 196, 246.9], [110, 164.8, 220], [123.5, 185, 246.9], [98, 146.8, 196]];
// 🌈 "متوهجة": أربيجيو دافئ متموّج
const GLOW_ARP = [196, 246.9, 293.7, 370, 293.7, 246.9];
function startMusic(mood) {
  stopMusic();
  if (mood === "dream") {
    let ci = 0;
    const pad = () => {
      const ch = DREAM_CHORDS[ci % DREAM_CHORDS.length]; ci++;
      ch.forEach((f, i) => { tone(f, 4.2, "sine", 0.035, i * 0.06); tone(f * 2.0, 3.6, "sine", 0.012, 0.3); });
      if (Math.random() > 0.55) tone(ch[1] * 3, 1.8, "sine", 0.015, 1.2);
    };
    pad();
    musicTimer = setInterval(pad, 4600);
  } else if (mood === "glow") {
    let step = 0, base = 1;
    musicTimer = setInterval(() => {
      const f = GLOW_ARP[step % GLOW_ARP.length] * base;
      tone(f, 0.9, "triangle", 0.03);
      step++;
      if (step % 12 === 0) base = base === 1 ? 0.75 : 1;
    }, 460);
    musicTimer2 = setInterval(() => tone(98, 3.8, "sine", 0.03), 3800);
  }
}

/* ---------- ❓ QUESTION POOL ---------- */

/* ═══════════════════════════════════════════════════════════
   📦 QQ CONTENT REGISTRY — Content-Driven Architecture
   المحرك بلا محتوى: كل شيء يصل من content/*.js وقت البناء
   ═══════════════════════════════════════════════════════════ */
/* 🔌 جسر التخزين المحلي على الجهاز — مع ترحيل الحفظات القديمة */
const SAVE_KEY = "arise-save";
const store = {
  async get(k) {
    if (typeof window !== "undefined" && window.storage) { try { return await window.storage.get(k); } catch (e) { return null; } }
    try { const v = localStorage.getItem(k); return v ? { value: v } : null; } catch (e) { return null; }
  },
  async set(k, v) {
    if (typeof window !== "undefined" && window.storage) { try { return await window.storage.set(k, v); } catch (e) { return null; } }
    try { localStorage.setItem(k, v); } catch (e) {}
  },
};

const QQ = {
  _core: { mcq: [], num: [], match: [], order: [], verbalSecs: [] },
  _rich: [], _lessons: {}, _awl: {},
  registerCore(o) { ["mcq","num","match","order","verbalSecs"].forEach(k => o[k] && this._core[k].push(...o[k])); },
  registerQuestions(list, defaults = {}) { list.forEach(q => this._rich.push({ ...defaults, ...q })); },
  registerLessons(p) { Object.assign(this._lessons, p); },
  registerAWL(id, data) { this._awl[id] = data; },
  _gens: [], _blue: {}, _unitGen: {},
  registerGenerators(list) { this._gens.push(...list); },
  registerBlueprint(id, slots) { this._blue[id] = slots; },
  registerUnitGen(map) { Object.assign(this._unitGen, map); },
  manifest() {
    const words = Object.values(this._awl).reduce((a,s)=>a+s.packs.reduce((x,p)=>x+p.words.length,0),0);
    return { mcq: this._core.mcq.length, num: this._core.num.length, rich: this._rich.length, gens: this._gens.length,
             sublists: Object.keys(this._awl).length, awlWords: words, phases: Object.keys(this._lessons).length };
  },
};


/* ═══ content/awl-s1.js ═══ */
/* ═══ AWL Sublist 1 — مخطط الكلمة: { w, ar, ex, bl(_____), syn, ant? } ═══ */
const __W1 = {
a1: [
 { w: "analyse", ar: "يحلّل", ex: "Scientists analyse the data carefully.", bl: "We must _____ the results before deciding.", syn: "examine" },
 { w: "approach", ar: "نهج / طريقة تناول", ex: "Her approach to teaching is modern.", bl: "His _____ to the problem was creative.", syn: "method" },
 { w: "assess", ar: "يقيّم", ex: "Teachers assess students every month.", bl: "The bank will _____ the risk first.", syn: "evaluate" },
 { w: "assume", ar: "يفترض", ex: "Don't assume the test is easy.", bl: "We _____ prices will rise next year.", syn: "suppose", ant: "prove" },
 { w: "concept", ar: "مفهوم", ex: "Zero is a difficult concept for children.", bl: "The _____ of time travel is fascinating.", syn: "idea" },
 { w: "define", ar: "يعرّف", ex: "Please define this word simply.", bl: "Can you _____ what success means to you?", syn: "explain" },
 { w: "identify", ar: "يحدّد / يتعرّف على", ex: "Identify the main idea of the passage.", bl: "Police could not _____ the driver.", syn: "recognize" },
 { w: "indicate", ar: "يشير إلى", ex: "The results indicate a clear improvement.", bl: "Dark clouds _____ that rain is coming.", syn: "show" },
 { w: "interpret", ar: "يفسّر", ex: "How do you interpret this chart?", bl: "Judges _____ the law in court.", syn: "explain" },
 { w: "method", ar: "طريقة / أسلوب", ex: "This method saves time and money.", bl: "Scientists follow a strict _____.", syn: "way" },
],
a2: [
 { w: "data", ar: "بيانات", ex: "The data shows sales are rising.", bl: "We collected _____ from 500 students.", syn: "information" },
 { w: "research", ar: "بحث علمي", ex: "Her research changed medicine.", bl: "More _____ is needed on this topic.", syn: "study" },
 { w: "estimate", ar: "يقدّر / تقدير", ex: "Experts estimate the cost at one million.", bl: "Can you _____ how long it will take?", syn: "guess" },
 { w: "evident", ar: "واضح / جليّ", ex: "Her talent was evident from day one.", bl: "It is _____ that he studied hard.", syn: "clear", ant: "hidden" },
 { w: "factor", ar: "عامل مؤثر", ex: "Price is a key factor in any decision.", bl: "Weather was a major _____ in the delay.", syn: "element" },
 { w: "formula", ar: "معادلة / صيغة", ex: "Memorize the area formula.", bl: "There is no magic _____ for success.", syn: "equation" },
 { w: "theory", ar: "نظرية", ex: "His theory explains the results.", bl: "The _____ was tested in the lab.", syn: "hypothesis" },
 { w: "source", ar: "مصدر", ex: "The sun is our main source of energy.", bl: "Always check the _____ of your news.", syn: "origin" },
 { w: "specific", ar: "محدد / دقيق", ex: "Give me a specific example.", bl: "The doctor asked _____ questions.", syn: "exact", ant: "general" },
 { w: "vary", ar: "يختلف / يتنوع", ex: "Prices vary from city to city.", bl: "Results _____ depending on effort.", syn: "differ" },
],
a3: [
 { w: "economy", ar: "اقتصاد", ex: "Oil supports the national economy.", bl: "The _____ grew by three percent.", syn: "market" },
 { w: "finance", ar: "تمويل / يموّل", ex: "The bank will finance the project.", bl: "She works in _____ and banking.", syn: "fund" },
 { w: "income", ar: "دخل", ex: "His monthly income doubled.", bl: "Save part of your _____ every month.", syn: "earnings", ant: "expense" },
 { w: "benefit", ar: "فائدة / منفعة", ex: "Exercise has many health benefits.", bl: "Reading daily will _____ your mind.", syn: "advantage", ant: "harm" },
 { w: "contract", ar: "عقد", ex: "He signed a two-year contract.", bl: "Read the _____ before you sign it.", syn: "agreement" },
 { w: "export", ar: "يصدّر / صادرات", ex: "Saudi Arabia exports oil worldwide.", bl: "They _____ dates to forty countries.", syn: "ship", ant: "import" },
 { w: "labour", ar: "عمل / قوى عاملة", ex: "The project needs skilled labour.", bl: "Building this tower took years of _____.", syn: "work" },
 { w: "sector", ar: "قطاع", ex: "The energy sector is growing fast.", bl: "She works in the health _____.", syn: "field" },
 { w: "percent", ar: "بالمئة", ex: "Sales rose ten percent this year.", bl: "Ninety _____ of students passed.", syn: "percentage" },
 { w: "distribute", ar: "يوزّع", ex: "Volunteers distribute food daily.", bl: "The teacher will _____ the exams now.", syn: "spread", ant: "collect" },
],
a4: [
 { w: "authority", ar: "سلطة / جهة مختصة", ex: "Report the issue to the authorities.", bl: "The manager has the _____ to decide.", syn: "power" },
 { w: "legal", ar: "قانوني", ex: "Get legal advice before signing.", bl: "Driving without a license is not _____.", syn: "lawful", ant: "illegal" },
 { w: "legislate", ar: "يشرّع القوانين", ex: "Parliaments legislate for the nation.", bl: "Governments _____ to protect workers.", syn: "regulate" },
 { w: "policy", ar: "سياسة / نظام", ex: "The company changed its return policy.", bl: "The new _____ starts next month.", syn: "rule" },
 { w: "principle", ar: "مبدأ", ex: "Honesty is his first principle.", bl: "This machine works on a simple _____.", syn: "rule" },
 { w: "structure", ar: "هيكل / بنية", ex: "The essay has a clear structure.", bl: "Engineers checked the bridge _____.", syn: "framework" },
 { w: "process", ar: "عملية / إجراء", ex: "Learning is a slow process.", bl: "The visa _____ takes two weeks.", syn: "procedure" },
 { w: "function", ar: "وظيفة / يعمل", ex: "The heart's function is pumping blood.", bl: "This button's _____ is to restart.", syn: "role" },
 { w: "role", ar: "دور", ex: "Parents play a huge role in education.", bl: "She has a leading _____ in the team.", syn: "part" },
 { w: "section", ar: "قسم / جزء", ex: "Read the first section only.", bl: "The quant _____ has 24 questions.", syn: "part" },
],
a5: [
 { w: "context", ar: "سياق", ex: "Guess the meaning from context.", bl: "The word changes meaning by _____.", syn: "setting" },
 { w: "environment", ar: "بيئة", ex: "Plastic harms the environment.", bl: "A quiet _____ helps you study.", syn: "surroundings" },
 { w: "area", ar: "منطقة / مجال", ex: "This area is famous for farms.", bl: "Math is her strongest _____.", syn: "region" },
 { w: "period", ar: "فترة / مدة", ex: "He lived abroad for a long period.", bl: "The test _____ is two hours.", syn: "time" },
 { w: "issue", ar: "قضية / مشكلة", ex: "Traffic is a serious issue here.", bl: "We solved the technical _____.", syn: "problem" },
 { w: "individual", ar: "فرد / فردي", ex: "Each individual got a certificate.", bl: "Every _____ has a unique fingerprint.", syn: "person" },
 { w: "similar", ar: "مشابه", ex: "The twins have similar voices.", bl: "Your answer is _____ to mine.", syn: "alike", ant: "different" },
 { w: "significant", ar: "مهم / كبير الأثر", ex: "A significant discovery in medicine.", bl: "There was a _____ rise in prices.", syn: "important", ant: "minor" },
 { w: "major", ar: "رئيسي / كبير", ex: "Riyadh is a major business hub.", bl: "Rain caused a _____ delay.", syn: "main", ant: "minor" },
 { w: "available", ar: "متاح / متوفر", ex: "Tickets are available online.", bl: "The doctor is _____ after five.", syn: "accessible" },
],
a6: [
 { w: "create", ar: "ينشئ / يبتكر", ex: "Artists create beauty from nothing.", bl: "This app helps you _____ designs.", syn: "make", ant: "destroy" },
 { w: "establish", ar: "يؤسس", ex: "They established the company in 1933.", bl: "The king decided to _____ a new city.", syn: "found" },
 { w: "constitute", ar: "يشكّل / يكوّن", ex: "Women constitute half the class.", bl: "These rules _____ the new system.", syn: "form" },
 { w: "consist", ar: "يتكوّن (من)", ex: "Water consists of hydrogen and oxygen.", bl: "The exam will _____ of two parts.", syn: "comprise" },
 { w: "derive", ar: "يستمد / يشتق", ex: "This word derives from Latin.", bl: "Plants _____ energy from sunlight.", syn: "obtain" },
 { w: "involve", ar: "يتضمن / يشمل", ex: "The job involves a lot of travel.", bl: "Good plans _____ careful thinking.", syn: "include" },
 { w: "occur", ar: "يحدث", ex: "Earthquakes occur without warning.", bl: "The error _____s when you refresh.", syn: "happen" },
 { w: "proceed", ar: "يمضي / يواصل", ex: "Please proceed to gate twelve.", bl: "After the break, we will _____.", syn: "continue", ant: "stop" },
 { w: "require", ar: "يتطلب", ex: "This level requires daily practice.", bl: "Aramco jobs _____ strong English.", syn: "need" },
 { w: "respond", ar: "يستجيب / يرد", ex: "She responded to the email quickly.", bl: "How did he _____ to the news?", syn: "reply", ant: "ignore" },
],
};
QQ.registerAWL("s1", { title: "S1", packs: [
  { id: "a1", icon: "🔬", name: "حزمة التحليل",        words: __W1.a1 },
  { id: "a2", icon: "📊", name: "حزمة البيانات والبحث", words: __W1.a2 },
  { id: "a3", icon: "💰", name: "حزمة الاقتصاد",        words: __W1.a3 },
  { id: "a4", icon: "🏛️", name: "حزمة الأنظمة",         words: __W1.a4 },
  { id: "a5", icon: "🌍", name: "حزمة السياق",          words: __W1.a5 },
  { id: "a6", icon: "⚙️", name: "حزمة الفعل الأكاديمي", words: __W1.a6 },
]});


/* ═══ content/awl-s10.js ═══ */
/* ═══ AWL Sublist 10 — جاهز للتعبئة ═══
   انسخ مخطط awl-s1.js: const __W = { p1:[{ w, ar, ex, bl, syn, ant? }, ...] };
   ثم: QQ.registerAWL("s10", { title: "S10", packs: [ { id: "s10p1", icon: "📗", name: "...", words: __W.p1 }, ... ] });
   المحرك سيبني الحزم والتدريبات والمراجعة المتباعدة والمعارك تلقائيًا. */


/* ═══ content/awl-s2.js ═══ */
/* ═══ AWL Sublist 2 — 60 كلمة كاملة التأليف ═══ */
const __W2 = {
p1: [
 { w: "achieve", ar: "يحقق", ex: "She achieved her dream of studying abroad.", bl: "Work hard and you will _____ your goals.", syn: "accomplish", ant: "fail" },
 { w: "acquire", ar: "يكتسب", ex: "Children acquire language naturally.", bl: "You _____ skills through practice.", syn: "gain", ant: "lose" },
 { w: "affect", ar: "يؤثر على", ex: "Sleep affects your memory directly.", bl: "Stress can _____ your test results.", syn: "influence" },
 { w: "appropriate", ar: "مناسب / ملائم", ex: "Wear appropriate clothes for the interview.", bl: "Choose the _____ word for each blank.", syn: "suitable", ant: "improper" },
 { w: "aspect", ar: "جانب / ناحية", ex: "Consider every aspect of the plan.", bl: "Cost is one _____ of the decision.", syn: "side" },
 { w: "assist", ar: "يساعد", ex: "Volunteers assist the elderly daily.", bl: "This app will _____ you in studying.", syn: "help", ant: "hinder" },
 { w: "category", ar: "فئة / تصنيف", ex: "Sort the books by category.", bl: "This question belongs to the math _____.", syn: "class" },
 { w: "commission", ar: "لجنة / عمولة", ex: "A commission investigated the accident.", bl: "The agent earns a five percent _____.", syn: "committee" },
 { w: "complex", ar: "معقد", ex: "The brain is a complex organ.", bl: "This _____ problem needs simple steps.", syn: "complicated", ant: "simple" },
 { w: "conclude", ar: "يستنتج / يختتم", ex: "The study concluded that exercise helps.", bl: "What do you _____ from this data?", syn: "infer" },
],
p2: [
 { w: "conduct", ar: "يجري / سلوك", ex: "They conduct experiments every week.", bl: "Scientists _____ research carefully.", syn: "carry out" },
 { w: "construct", ar: "يبني / يشيّد", ex: "Engineers construct bridges and towers.", bl: "They will _____ a new stadium here.", syn: "build", ant: "demolish" },
 { w: "consume", ar: "يستهلك", ex: "This car consumes little fuel.", bl: "Teenagers _____ too much sugar.", syn: "use", ant: "produce" },
 { w: "credit", ar: "ائتمان / فضل", ex: "She deserves credit for the success.", bl: "He bought the phone on _____.", syn: "recognition" },
 { w: "culture", ar: "ثقافة", ex: "Saudi culture values generosity.", bl: "Travel teaches you about every _____.", syn: "heritage" },
 { w: "design", ar: "يصمم / تصميم", ex: "She designs mobile applications.", bl: "The _____ of this app is simple.", syn: "plan" },
 { w: "distinct", ar: "مميز / واضح الاختلاف", ex: "The twins have distinct personalities.", bl: "Keep the two files _____ and separate.", syn: "different", ant: "similar" },
 { w: "element", ar: "عنصر", ex: "Trust is a key element of teamwork.", bl: "Practice is the main _____ of success.", syn: "component" },
 { w: "equation", ar: "معادلة", ex: "Solve the equation for x.", bl: "Balance both sides of the _____.", syn: "formula" },
 { w: "evaluate", ar: "يقيّم", ex: "Teachers evaluate essays fairly.", bl: "We must _____ all options first.", syn: "assess" },
],
p3: [
 { w: "feature", ar: "ميزة / خاصية", ex: "The camera is this phone's best feature.", bl: "Search is a useful _____ of the app.", syn: "characteristic" },
 { w: "final", ar: "نهائي", ex: "The final exam is next week.", bl: "This is my _____ answer.", syn: "last", ant: "first" },
 { w: "focus", ar: "يركز / تركيز", ex: "Focus on one task at a time.", bl: "Turn off your phone and _____.", syn: "concentrate" },
 { w: "impact", ar: "أثر / تأثير قوي", ex: "Technology has a huge impact on jobs.", bl: "The new law had a positive _____.", syn: "effect" },
 { w: "injury", ar: "إصابة", ex: "He recovered from the knee injury.", bl: "Wear a helmet to avoid head _____.", syn: "wound" },
 { w: "institute", ar: "معهد", ex: "She joined a language institute.", bl: "The research _____ opened in Dhahran.", syn: "academy" },
 { w: "invest", ar: "يستثمر", ex: "Invest your time in learning.", bl: "Smart people _____ in themselves.", syn: "fund" },
 { w: "item", ar: "عنصر / غرض", ex: "Check every item on the list.", bl: "The last _____ costs ten riyals.", syn: "object" },
 { w: "journal", ar: "مجلة علمية / دفتر", ex: "The study appeared in a medical journal.", bl: "She writes in her _____ every night.", syn: "publication" },
 { w: "maintain", ar: "يحافظ على / يصون", ex: "Maintain your car regularly.", bl: "Exercise helps you _____ your health.", syn: "preserve", ant: "neglect" },
],
p4: [
 { w: "normal", ar: "طبيعي", ex: "It is normal to feel nervous.", bl: "Life returned to _____ after the storm.", syn: "usual", ant: "strange" },
 { w: "obtain", ar: "يحصل على", ex: "You must obtain a permit first.", bl: "How did you _____ this information?", syn: "get", ant: "lose" },
 { w: "participate", ar: "يشارك", ex: "All students participate in the contest.", bl: "She loves to _____ in class discussions.", syn: "take part" },
 { w: "perceive", ar: "يدرك / يرى", ex: "People perceive colors differently.", bl: "How do you _____ this problem?", syn: "notice" },
 { w: "positive", ar: "إيجابي", ex: "Keep a positive attitude.", bl: "The results were _____ and encouraging.", syn: "optimistic", ant: "negative" },
 { w: "potential", ar: "إمكانات / محتمل", ex: "This student has great potential.", bl: "Solar energy has huge _____ here.", syn: "capability" },
 { w: "previous", ar: "سابق", ex: "Review the previous lesson first.", bl: "Her _____ job was in a bank.", syn: "earlier", ant: "next" },
 { w: "primary", ar: "أساسي / أولي", ex: "Safety is our primary concern.", bl: "The _____ goal is passing the CPC.", syn: "main", ant: "secondary" },
 { w: "purchase", ar: "يشتري / شراء", ex: "You can purchase tickets online.", bl: "Keep the receipt after any _____.", syn: "buy", ant: "sell" },
 { w: "range", ar: "مدى / تشكيلة", ex: "The store offers a wide range of laptops.", bl: "Prices _____ from ten to fifty riyals.", syn: "variety" },
],
p5: [
 { w: "region", ar: "منطقة / إقليم", ex: "The Eastern region produces oil.", bl: "Dates grow well in this _____.", syn: "area" },
 { w: "regulation", ar: "لائحة / نظام", ex: "Follow the safety regulations.", bl: "New traffic _____s start next month.", syn: "rule" },
 { w: "relevant", ar: "ذو صلة", ex: "Only give relevant answers.", bl: "Is this detail _____ to the question?", syn: "related", ant: "irrelevant" },
 { w: "resident", ar: "مقيم / ساكن", ex: "Residents complained about the noise.", bl: "Every _____ received a warning letter.", syn: "inhabitant" },
 { w: "resource", ar: "مورد", ex: "Water is a precious resource.", bl: "Time is your most valuable _____.", syn: "asset" },
 { w: "restrict", ar: "يقيّد / يحدّ", ex: "The app restricts screen time.", bl: "New rules _____ parking downtown.", syn: "limit", ant: "allow" },
 { w: "secure", ar: "آمن / يؤمّن", ex: "Keep your password secure.", bl: "She worked hard to _____ the job.", syn: "safe", ant: "risky" },
 { w: "seek", ar: "يسعى / يبحث عن", ex: "Seek advice before deciding.", bl: "Graduates _____ jobs in energy.", syn: "pursue", ant: "avoid" },
 { w: "select", ar: "يختار", ex: "Select the best answer.", bl: "_____ one option from the menu.", syn: "choose", ant: "reject" },
 { w: "site", ar: "موقع", ex: "The construction site is closed.", bl: "This _____ is perfect for the factory.", syn: "location" },
],
p6: [
 { w: "strategy", ar: "استراتيجية", ex: "Elimination is a smart test strategy.", bl: "Our _____ is practice then simulate.", syn: "plan" },
 { w: "survey", ar: "استبيان / مسح", ex: "The survey included 1000 students.", bl: "Fill out this short _____ please.", syn: "poll" },
 { w: "text", ar: "نص", ex: "Read the text before the questions.", bl: "The _____ explains the whole process.", syn: "passage" },
 { w: "tradition", ar: "تقليد / عادة", ex: "Coffee is a proud Saudi tradition.", bl: "Family gatherings are a weekly _____.", syn: "custom" },
 { w: "transfer", ar: "ينقل / تحويل", ex: "Transfer the money before Thursday.", bl: "He will _____ to another university.", syn: "move" },
 { w: "community", ar: "مجتمع", ex: "The community built a new park.", bl: "Volunteers serve the local _____.", syn: "society" },
 { w: "computer", ar: "حاسوب", ex: "The test is taken on a computer.", bl: "Restart the _____ and try again.", syn: "PC" },
 { w: "consequence", ar: "نتيجة / عاقبة", ex: "Every choice has consequences.", bl: "Skipping sleep has a serious _____.", syn: "result", ant: "cause" },
 { w: "chapter", ar: "فصل (كتاب)", ex: "Read chapter three tonight.", bl: "The last _____ answers everything.", syn: "section" },
 { w: "administration", ar: "إدارة", ex: "The administration approved the plan.", bl: "Contact the _____ for your ID card.", syn: "management" },
],
};
QQ.registerAWL("s2", { title: "S2", packs: [
  { id: "b1", icon: "🏆", name: "حزمة الإنجاز",   words: __W2.p1 },
  { id: "b2", icon: "🔧", name: "حزمة الصناعة",   words: __W2.p2 },
  { id: "b3", icon: "🎯", name: "حزمة التركيز",   words: __W2.p3 },
  { id: "b4", icon: "🌱", name: "حزمة الإمكانات", words: __W2.p4 },
  { id: "b5", icon: "🗺️", name: "حزمة الموارد",   words: __W2.p5 },
  { id: "b6", icon: "🧵", name: "حزمة المجتمع",   words: __W2.p6 },
]});
/* قراءة تستخدم كلمات هذه القائمة — الكلمات في سياق حقيقي */
QQ.registerQuestions([
 { topic: "reading", diff: 2, skill: "AWL في القراءة", est: 60, type: "mcq",
   q: "«To achieve success in the CPC, students must maintain focus, evaluate their weak areas, and select an appropriate strategy.»\n\nThe passage says students should:", 
   options: ["avoid hard questions", "assess weaknesses and choose a suitable plan", "memorize every word", "take the test twice"], a: 1,
   ex: "evaluate = يقيّم، appropriate strategy = خطة مناسبة — إعادة صياغة مباشرة.", steps: ["حدد الأفعال: maintain, evaluate, select", "قارنها بالخيارات المعاد صياغتها"], hints: ["evaluate تعني assess"] },
 { topic: "sentence", diff: 2, skill: "AWL في الإكمال", est: 40, type: "mcq",
   q: "Reading every day will _____ both your vocabulary and your confidence.", options: ["injure", "restrict", "benefit", "consume"], a: 2,
   ex: "benefit = يفيد؛ القراءة تفيد لا تقيّد.", traps: { 1: "restrict عكس المطلوب تمامًا." } },
]);


/* ═══ content/awl-s3.js ═══ */
/* ═══ AWL Sublist 3 — 60 كلمة كاملة التأليف ═══ */
const __W3 = {
p1: [
 { w: "alternative", ar: "بديل", ex: "Tea is a healthy alternative to soda.", bl: "We need an _____ plan if it rains.", syn: "option" },
 { w: "circumstance", ar: "ظرف / ملابسات", ex: "He succeeded despite hard circumstances.", bl: "Under no _____ should you give up.", syn: "situation" },
 { w: "comment", ar: "تعليق / يعلّق", ex: "The teacher wrote a helpful comment.", bl: "Please _____ on my essay draft.", syn: "remark" },
 { w: "compensate", ar: "يعوّض", ex: "The airline compensated the passengers.", bl: "Hard work can _____ for weak talent.", syn: "make up" },
 { w: "component", ar: "مكوّن / جزء", ex: "The engine has many components.", bl: "Listening is a key _____ of English.", syn: "part" },
 { w: "consent", ar: "موافقة", ex: "Parents signed a consent form.", bl: "The doctor needs your _____ to operate.", syn: "approval", ant: "refusal" },
 { w: "considerable", ar: "كبير / معتبر", ex: "The project needs considerable effort.", bl: "She saved a _____ amount of money.", syn: "significant", ant: "slight" },
 { w: "constant", ar: "ثابت / مستمر", ex: "Success needs constant practice.", bl: "The machine runs at a _____ speed.", syn: "steady", ant: "changing" },
 { w: "constraint", ar: "قيد / عائق", ex: "Time is our biggest constraint.", bl: "Budget _____s delayed the project.", syn: "limitation" },
 { w: "contribute", ar: "يساهم", ex: "Everyone contributed to the success.", bl: "Sleep and diet _____ to good grades.", syn: "add to" },
],
p2: [
 { w: "convention", ar: "مؤتمر / عرف", ex: "Doctors met at a medical convention.", bl: "Shaking hands is a social _____.", syn: "conference" },
 { w: "coordinate", ar: "ينسّق", ex: "She coordinates the volunteer team.", bl: "We must _____ our study schedule.", syn: "organize" },
 { w: "core", ar: "جوهر / نواة", ex: "Honesty is the core of trust.", bl: "Math is a _____ subject in the CPC.", syn: "center", ant: "edge" },
 { w: "corporate", ar: "خاص بالشركات", ex: "He works in corporate finance.", bl: "The _____ office is in Dhahran.", syn: "company" },
 { w: "correspond", ar: "يتوافق / يتراسل", ex: "The results correspond with the theory.", bl: "Your answer should _____ to the data.", syn: "match" },
 { w: "criteria", ar: "معايير", ex: "The criteria for admission are clear.", bl: "GPA is one of the selection _____.", syn: "standards" },
 { w: "deduce", ar: "يستنبط", ex: "Detectives deduce facts from clues.", bl: "From the graph we can _____ the trend.", syn: "conclude" },
 { w: "demonstrate", ar: "يبرهن / يوضح عمليًا", ex: "The teacher demonstrated the method.", bl: "The test lets you _____ your skills.", syn: "show" },
 { w: "document", ar: "وثيقة / يوثّق", ex: "Sign every document carefully.", bl: "Keep a _____ of your expenses.", syn: "record" },
 { w: "dominant", ar: "مهيمن / سائد", ex: "Oil is the dominant export.", bl: "Blue is the _____ color in the logo.", syn: "leading", ant: "minor" },
],
p3: [
 { w: "emphasis", ar: "تأكيد / تركيز", ex: "The course puts emphasis on speaking.", bl: "Put more _____ on your weak sections.", syn: "stress" },
 { w: "ensure", ar: "يضمن", ex: "Check twice to ensure accuracy.", bl: "Sleep well to _____ a sharp mind.", syn: "guarantee" },
 { w: "exclude", ar: "يستبعد", ex: "Exclude the wrong options first.", bl: "Do not _____ anyone from the team.", syn: "leave out", ant: "include" },
 { w: "framework", ar: "إطار عمل", ex: "The law provides a legal framework.", bl: "This plan gives us a clear _____.", syn: "structure" },
 { w: "fund", ar: "يموّل / صندوق مالي", ex: "The state funds new schools.", bl: "Investors will _____ the startup.", syn: "finance" },
 { w: "illustrate", ar: "يوضح بمثال", ex: "Charts illustrate the data clearly.", bl: "Let me _____ the rule with an example.", syn: "explain" },
 { w: "immigration", ar: "هجرة (إلى بلد)", ex: "Immigration shaped many nations.", bl: "The _____ office checks passports.", syn: "migration" },
 { w: "imply", ar: "يلمّح / يعني ضمنًا", ex: "His smile implied agreement.", bl: "Dark clouds _____ that rain is near.", syn: "suggest" },
 { w: "initial", ar: "أولي / أول", ex: "The initial results look promising.", bl: "My _____ answer was wrong.", syn: "first", ant: "final" },
 { w: "instance", ar: "مثال / حالة", ex: "For instance, dates are rich in iron.", bl: "This is one _____ of good design.", syn: "example" },
],
p4: [
 { w: "interaction", ar: "تفاعل", ex: "Class interaction improves learning.", bl: "The app encourages student _____.", syn: "communication" },
 { w: "justify", ar: "يبرر", ex: "Can you justify this decision?", bl: "The results _____ the extra effort.", syn: "defend" },
 { w: "layer", ar: "طبقة", ex: "The cake has three layers.", bl: "The ozone _____ protects the earth.", syn: "level" },
 { w: "link", ar: "رابط / يربط", ex: "Studies link sleep to memory.", bl: "Click the _____ to open the file.", syn: "connect" },
 { w: "location", ar: "موقع", ex: "The location of the exam changed.", bl: "Share your _____ with the driver.", syn: "place" },
 { w: "maximum", ar: "الحد الأقصى", ex: "The maximum score is one hundred.", bl: "Drive at a _____ of 120 km/h.", syn: "highest", ant: "minimum" },
 { w: "minor", ar: "ثانوي / بسيط", ex: "It is only a minor mistake.", bl: "The car needs _____ repairs.", syn: "small", ant: "major" },
 { w: "negative", ar: "سلبي", ex: "Avoid negative thinking.", bl: "The test came back _____.", syn: "bad", ant: "positive" },
 { w: "outcome", ar: "نتيجة / حصيلة", ex: "The outcome exceeded expectations.", bl: "Effort decides the final _____.", syn: "result" },
 { w: "partner", ar: "شريك", ex: "Choose a study partner.", bl: "Aramco is a global energy _____.", syn: "ally" },
],
p5: [
 { w: "philosophy", ar: "فلسفة", ex: "Her philosophy is: learn daily.", bl: "The coach's _____ is simple: repeat.", syn: "belief" },
 { w: "physical", ar: "جسدي / مادي", ex: "Physical exercise sharpens the mind.", bl: "The job needs _____ strength.", syn: "bodily", ant: "mental" },
 { w: "proportion", ar: "نسبة / تناسب", ex: "A large proportion passed the test.", bl: "Mix the colors in equal _____.", syn: "ratio" },
 { w: "publish", ar: "ينشر", ex: "The journal published her research.", bl: "They will _____ the results Sunday.", syn: "release" },
 { w: "reaction", ar: "رد فعل / تفاعل", ex: "His reaction to the news was calm.", bl: "The chemical _____ produces heat.", syn: "response" },
 { w: "register", ar: "يسجّل", ex: "Register for the exam early.", bl: "_____ your name at the front desk.", syn: "enroll" },
 { w: "rely", ar: "يعتمد على", ex: "You can rely on daily practice.", bl: "Do not _____ on luck in exams.", syn: "depend" },
 { w: "remove", ar: "يزيل", ex: "Remove distractions while studying.", bl: "_____ your shoes at the door.", syn: "take away", ant: "add" },
 { w: "scheme", ar: "خطة / نظام", ex: "The saving scheme helps employees.", bl: "The color _____ looks professional.", syn: "plan" },
 { w: "sequence", ar: "تسلسل", ex: "Follow the steps in sequence.", bl: "Find the next number in the _____.", syn: "order" },
],
p6: [
 { w: "shift", ar: "وردية / تحوّل", ex: "He works the night shift.", bl: "There was a big _____ in opinion.", syn: "change" },
 { w: "specify", ar: "يحدد بدقة", ex: "Specify the exact time and place.", bl: "The rules _____ the dress code.", syn: "state" },
 { w: "sufficient", ar: "كافٍ", ex: "Two hours of review are sufficient.", bl: "Is the evidence _____ to decide?", syn: "enough", ant: "inadequate" },
 { w: "task", ar: "مهمة", ex: "Finish one task before the next.", bl: "The hardest _____ comes first.", syn: "job" },
 { w: "technical", ar: "تقني / فني", ex: "The team fixed a technical issue.", bl: "The manual is full of _____ terms.", syn: "specialized" },
 { w: "technique", ar: "أسلوب / تقنية أداء", ex: "Skimming is a reading technique.", bl: "Her memory _____ is very effective.", syn: "method" },
 { w: "technology", ar: "تقنية / تكنولوجيا", ex: "Technology changes how we learn.", bl: "Modern _____ powers the oil industry.", syn: "tech" },
 { w: "valid", ar: "صالح / سليم منطقيًا", ex: "Your passport must be valid.", bl: "That is a _____ argument.", syn: "sound", ant: "invalid" },
 { w: "volume", ar: "حجم / مستوى صوت", ex: "The volume of trade doubled.", bl: "Lower the _____ during the exam.", syn: "amount" },
 { w: "sector", ar: "قطاع", ex: "The private sector creates jobs.", bl: "She joined the energy _____.", syn: "field" },
],
};
QQ.registerAWL("s3", { title: "S3", packs: [
  { id: "d1", icon: "🧩", name: "حزمة الظروف",    words: __W3.p1 },
  { id: "d2", icon: "📐", name: "حزمة المعايير",  words: __W3.p2 },
  { id: "d3", icon: "🖼️", name: "حزمة الإيضاح",   words: __W3.p3 },
  { id: "d4", icon: "🔗", name: "حزمة الروابط",   words: __W3.p4 },
  { id: "d5", icon: "⚗️", name: "حزمة التفاعل",   words: __W3.p5 },
  { id: "d6", icon: "🛠️", name: "حزمة التقنية",   words: __W3.p6 },
]});
QQ.registerQuestions([
 { topic: "reading", diff: 3, skill: "AWL في القراءة", est: 60, type: "mcq",
   q: "«The initial data was not sufficient, so the team decided to conduct a second survey to ensure a valid outcome.»\n\nWhy did the team repeat the survey?",
   options: ["the first one was too long", "early data was not enough for a sound result", "the manager demanded it", "to publish faster"], a: 1,
   ex: "initial = أولي، sufficient = كافٍ، valid outcome = نتيجة سليمة.", steps: ["اربط not sufficient بالسبب", "valid outcome = هدف الإعادة"], hints: ["sufficient تعني enough"] },
 { topic: "sentence", diff: 3, skill: "AWL في الإكمال", est: 45, type: "mcq",
   q: "The evidence was not _____ to justify such a considerable investment.", options: ["sufficient", "negative", "physical", "initial"], a: 0,
   ex: "دليل غير كافٍ لا يبرر استثمارًا كبيرًا.", traps: { 3: "initial لا تناسب سياق التبرير." } },
]);


/* ═══ content/awl-s4.js ═══ */
/* ═══ AWL Sublist 4 — جاهز للتعبئة ═══
   انسخ مخطط awl-s1.js: const __W = { p1:[{ w, ar, ex, bl, syn, ant? }, ...] };
   ثم: QQ.registerAWL("s4", { title: "S4", packs: [ { id: "s4p1", icon: "📗", name: "...", words: __W.p1 }, ... ] });
   المحرك سيبني الحزم والتدريبات والمراجعة المتباعدة والمعارك تلقائيًا. */


/* ═══ content/awl-s5.js ═══ */
/* ═══ AWL Sublist 5 — جاهز للتعبئة ═══
   انسخ مخطط awl-s1.js: const __W = { p1:[{ w, ar, ex, bl, syn, ant? }, ...] };
   ثم: QQ.registerAWL("s5", { title: "S5", packs: [ { id: "s5p1", icon: "📗", name: "...", words: __W.p1 }, ... ] });
   المحرك سيبني الحزم والتدريبات والمراجعة المتباعدة والمعارك تلقائيًا. */


/* ═══ content/awl-s6.js ═══ */
/* ═══ AWL Sublist 6 — جاهز للتعبئة ═══
   انسخ مخطط awl-s1.js: const __W = { p1:[{ w, ar, ex, bl, syn, ant? }, ...] };
   ثم: QQ.registerAWL("s6", { title: "S6", packs: [ { id: "s6p1", icon: "📗", name: "...", words: __W.p1 }, ... ] });
   المحرك سيبني الحزم والتدريبات والمراجعة المتباعدة والمعارك تلقائيًا. */


/* ═══ content/awl-s7.js ═══ */
/* ═══ AWL Sublist 7 — جاهز للتعبئة ═══
   انسخ مخطط awl-s1.js: const __W = { p1:[{ w, ar, ex, bl, syn, ant? }, ...] };
   ثم: QQ.registerAWL("s7", { title: "S7", packs: [ { id: "s7p1", icon: "📗", name: "...", words: __W.p1 }, ... ] });
   المحرك سيبني الحزم والتدريبات والمراجعة المتباعدة والمعارك تلقائيًا. */


/* ═══ content/awl-s8.js ═══ */
/* ═══ AWL Sublist 8 — جاهز للتعبئة ═══
   انسخ مخطط awl-s1.js: const __W = { p1:[{ w, ar, ex, bl, syn, ant? }, ...] };
   ثم: QQ.registerAWL("s8", { title: "S8", packs: [ { id: "s8p1", icon: "📗", name: "...", words: __W.p1 }, ... ] });
   المحرك سيبني الحزم والتدريبات والمراجعة المتباعدة والمعارك تلقائيًا. */


/* ═══ content/awl-s9.js ═══ */
/* ═══ AWL Sublist 9 — جاهز للتعبئة ═══
   انسخ مخطط awl-s1.js: const __W = { p1:[{ w, ar, ex, bl, syn, ant? }, ...] };
   ثم: QQ.registerAWL("s9", { title: "S9", packs: [ { id: "s9p1", icon: "📗", name: "...", words: __W.p1 }, ... ] });
   المحرك سيبني الحزم والتدريبات والمراجعة المتباعدة والمعارك تلقائيًا. */


/* ═══ content/blueprints.js ═══ */
/* ═══════════════════════════════════════════════════════════
   🗺️ مخططات القياس — تحدّد «ماذا نقيس» لا «أي سؤال بعينه»
   الأسئلة تُولَّد وقت اللعب، فتختلف كل محاولة مع ثبات ما تقيسه.
   ═══════════════════════════════════════════════════════════ */

/* اختبار تحديد المستوى: ٦ خانات مغطّية لكل الأقسام، بصعوبة متدرجة */
QQ.registerBlueprint("placement", [
  { label: "حساب أساسي",        topics: ["arithmetic"],                 diffs: [1] },
  { label: "جبر تأسيسي",        topics: ["algebra"],                    diffs: [1] },
  { label: "نِسَب وتطبيقاتها",   topics: ["arithmetic"],                 diffs: [2] },
  { label: "هندسة وبيانات",      topics: ["geometry", "data"],           diffs: [1, 2] },
  { label: "تناظر لفظي",         topics: ["analogy"],                    diffs: [1, 2] },
  { label: "إكمال جمل",          topics: ["sentence"],                   diffs: [2] },
]);

/* خريطة الوحدة ← ما يقابلها في المولّدات (للمراجعة واختبار التجاوز)
   الوحدات غير المذكورة تبقى على تدريباتها المؤلَّفة (مقصود: دروس مفاهيمية). */
QQ.registerUnitGen({
  f1: { topics: ["arithmetic"], diffs: [1] },
  f2: { topics: ["arithmetic"], diffs: [1] },
  f3: { topics: ["arithmetic"], diffs: [1, 2] },
  f4: { topics: ["arithmetic", "algebra"], diffs: [1] },
  f5: { topics: ["algebra"], diffs: [1] },
  f6: { topics: ["sentence"], diffs: [1, 2] },
  f7: { topics: ["sentence"], diffs: [1, 2] },
  f8: { topics: ["vocab"], diffs: [1] },
  s1: { topics: ["arithmetic"], diffs: [2] },
  s2: { topics: ["algebra"], diffs: [1, 2] },
  s3: { topics: ["geometry"], diffs: [1, 2] },
  s4: { topics: ["data", "arithmetic"], diffs: [2] },
  s5: { topics: ["analogy"], diffs: [1, 2] },
  s6: { topics: ["sentence"], diffs: [2] },
  q2: { topics: ["analogy", "sentence"], diffs: [2] },
  q3: { topics: ["arithmetic", "analogy"], diffs: [2] },
  c1: { topics: ["arithmetic"], diffs: [1, 2] },
  c2: { topics: ["data"], diffs: [2, 3] },
});


/* ═══ content/generators-quant.js ═══ */
const gcd2 = (a, b) => b ? gcd2(b, a % b) : Math.abs(a);
const fact = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const nCr = (n, k) => fact(n) / (fact(k) * fact(n - k));
const frac = (num, den) => { const g = gcd2(num, den) || 1; return `${num / g}/${den / g}`; };
/* ═══════════════════════════════════════════════════════════
   ♾️ مولّدات الرياضيات — أسئلة لا تنتهي، تعمل أوفلاين بلا أي AI
   كل مولّد يُرجع: { q, correct, wrongs:[{v,why}], ex, steps, hints, alt? }
   المحرك يتولى: خلط الخيارات + ربط سبب كل خيار مضلل (traps) + الترقيم
   لإضافة مولّد جديد: أضف كائنًا هنا فقط — صفر تعديل على الكود.
   ═══════════════════════════════════════════════════════════ */
QQ.registerGenerators([

/* ── النِسَب ── */
{ id: "pct-of", topic: "arithmetic", diff: 1, skill: "نسبة من عدد", est: 30,
  gen: (R) => { const p = R.pick([10,20,25,30,40,50,60,75]), b = R.pick([40,60,80,120,160,200,240,300,400]);
    const ans = b*p/100;
    return { q: `${p}% of ${b} =`, correct: ans,
      wrongs: [{ v: b*(p+10)/100, why: `حسبت ${p+10}% بدل ${p}%.` }, { v: b-ans, why: "حسبت الباقي بعد النسبة، لا النسبة نفسها." }, { v: ans*2, why: "ضاعفت الناتج بلا سبب." }],
      ex: `10% من ${b} = ${b/10}، و${p}% = ${p/10} أضعافها = ${ans}.`,
      steps: [`10% من ${b} = ${b/10}`, `${p}% تعني ${p/10} × ${b/10}`, `= ${ans}`],
      hints: ["ابدأ بحيلة الـ10%: احذف صفرًا", `كم مرة يدخل 10 في ${p}؟`] }; } },

{ id: "pct-change", topic: "arithmetic", diff: 2, skill: "نسبة التغيّر", est: 45,
  gen: (R) => { const old = R.pick([20,25,40,50,60,80,120,150,200]), p = R.pick([10,20,25,50,75]), up = R.bool();
    const diff = old*p/100; if (!Number.isInteger(diff)) return null;
    const nw = up ? old+diff : old-diff; if (nw <= 0) return null;
    return { q: `A price ${up ? "rose" : "fell"} from ${old} to ${nw}. The percent ${up ? "increase" : "decrease"} is:`,
      correct: p+"%",
      wrongs: [{ v: R.fmt(diff/nw*100)+"%", why: "قسمت الفرق على القيمة الجديدة — القسمة دائمًا على القيمة القديمة." },
               { v: diff+"%", why: "هذا الفرق المطلق، لا النسبة." },
               { v: R.fmt(nw/old*100)+"%", why: "حسبت نسبة الجديدة من القديمة، لا نسبة التغيّر." }],
      ex: `الفرق ${diff} ÷ القديمة ${old} = ${p}%.`,
      steps: [`الفرق = |${nw} − ${old}| = ${diff}`, `اقسم على القيمة القديمة: ${diff} ÷ ${old} = ${R.fmt(diff/old)}`, `× 100 = ${p}%`],
      hints: ["على أي قيمة نقسم الفرق دائمًا؟", "القديمة — اللي بدأنا منها", `${diff} ÷ ${old}`],
      alt: `طريقة ثانية: ${old} تتحول إلى ${nw}، والفرق ${diff} يمثل ${p === 50 ? "نصف" : p === 25 ? "ربع" : p+"%"} القديمة.` }; } },

{ id: "pct-reverse", topic: "arithmetic", diff: 2, skill: "الرجوع للسعر الأصلي", est: 50,
  gen: (R) => { const d = R.pick([10,20,25,40,50]), orig = R.pick([40,60,80,120,160,200,240,300]);
    const fin = orig*(100-d)/100; if (!Number.isInteger(fin)) return null;
    return { q: `After a ${d}% discount, an item costs ${fin} SAR. The original price was:`, correct: orig,
      wrongs: [{ v: R.fmt(fin*(100+d)/100), why: `أضفت ${d}% على السعر النهائي — الخصم يُحسب من الأصل لا من الناتج.` },
               { v: fin+d, why: "جمعت النسبة كأنها ريالات." },
               { v: R.fmt(fin*(100-d)/100), why: "خصمت مرة ثانية بدل أن ترجع للأصل." }],
      ex: `${fin} تمثل ${100-d}% من الأصل → ${fin} ÷ ${R.fmt((100-d)/100)} = ${orig}.`,
      steps: [`بعد خصم ${d}% يبقى ${100-d}%`, `الأصل × ${R.fmt((100-d)/100)} = ${fin}`, `الأصل = ${fin} ÷ ${R.fmt((100-d)/100)} = ${orig}`],
      hints: [`${fin} يمثل كم % من الأصل؟`, "اقسم على النسبة المتبقية لا المخصومة"] }; } },

{ id: "pct-succ", topic: "arithmetic", diff: 3, skill: "خصمان متتاليان", est: 55,
  gen: (R) => { const a = R.pick([10,20,25,30]), b = R.pick([10,20,25]);
    const single = R.fmt(100*(1-(1-a/100)*(1-b/100)));
    return { q: `A ${a}% discount followed by a ${b}% discount equals a single discount of:`, correct: single+"%",
      wrongs: [{ v: (a+b)+"%", why: "جمعت الخصمين مباشرة — الخصم الثاني يقع على سعر أصغر، فالمجموع دائمًا أقل." },
               { v: R.fmt(a*b/100)+"%", why: "ضربت النسبتين ببعض بلا معنى." },
               { v: R.fmt(100-(a+b))+"%", why: "هذي نسبة المتبقي لو جُمعا، لا الخصم." }],
      ex: `المتبقي = ${R.fmt((100-a)/100)} × ${R.fmt((100-b)/100)} = ${R.fmt((1-a/100)*(1-b/100))} → الخصم ${single}%.`,
      steps: [`بعد ${a}%: يبقى ${100-a}%`, `ثم ${b}% من الجديد: ${R.fmt((100-a)/100)} × ${R.fmt((100-b)/100)} = ${R.fmt((1-a/100)*(1-b/100))}`, `المتبقي ${R.fmt(100*(1-a/100)*(1-b/100))}% → الخصم ${single}%`],
      hints: ["هل تُجمع الخصومات مباشرة؟", "اضرب النِسَب المتبقية لا المخصومة"],
      alt: `جرّب بـ100 ريال: بعد ${a}% ← ${100-a}، وبعد ${b}% ← ${R.fmt((100-a)*(100-b)/100)}. خصمت ${single}.` }; } },

{ id: "profit", topic: "arithmetic", diff: 2, skill: "الربح والخسارة", est: 45,
  gen: (R) => { const cost = R.pick([40,50,60,80,120,200]), p = R.pick([10,20,25,50]);
    const sell = cost*(100+p)/100; if (!Number.isInteger(sell)) return null;
    return { q: `An item bought for ${cost} SAR was sold for ${sell} SAR. The profit percent is:`, correct: p+"%",
      wrongs: [{ v: R.fmt((sell-cost)/sell*100)+"%", why: "قسمت الربح على سعر البيع — النسبة تُحسب من التكلفة." },
               { v: (sell-cost)+"%", why: "هذا الربح بالريال لا بالنسبة." },
               { v: R.fmt(sell/cost*100)+"%", why: "هذي نسبة البيع من التكلفة، والربح هو الزيادة فقط." }],
      ex: `الربح ${sell-cost} ÷ التكلفة ${cost} = ${p}%.`,
      steps: [`الربح = ${sell} − ${cost} = ${sell-cost}`, `÷ التكلفة ${cost}`, `= ${p}%`],
      hints: ["الربح يُنسب للتكلفة دائمًا"] }; } },

/* ── الجبر ── */
{ id: "eq-1step", topic: "algebra", diff: 1, skill: "معادلة بخطوة", est: 30,
  gen: (R) => { const a = R.i(3,19), x = R.i(4,25), plus = R.bool();
    const rhs = plus ? x+a : x-a;
    return { q: `If x ${plus ? "+" : "−"} ${a} = ${rhs}, then x =`, correct: x,
      wrongs: [{ v: plus ? rhs+a : rhs-a, why: `طبّقت نفس الإشارة بدل عكسها — عكس ${plus ? "الجمع طرح" : "الطرح جمع"}.` },
               { v: rhs, why: "نسيت أن تنقل العدد للطرف الآخر." }, { v: a, why: "أجبت بقيمة العدد لا بقيمة x." }],
      ex: `x = ${rhs} ${plus ? "−" : "+"} ${a} = ${x}.`,
      steps: [`انقل ${a} للطرف الآخر بعكس إشارتها`, `x = ${rhs} ${plus ? "−" : "+"} ${a}`, `x = ${x}`],
      hints: [`عكس ${plus ? "الجمع هو الطرح" : "الطرح هو الجمع"}`] }; } },

{ id: "eq-2step", topic: "algebra", diff: 2, skill: "معادلة بخطوتين", est: 45,
  gen: (R) => { const a = R.pick([2,3,4,5,6]), x = R.i(2,15), b = R.i(3,20);
    const c = a*x+b;
    return { q: `If ${a}x + ${b} = ${c}, then x =`, correct: x,
      wrongs: [{ v: c-b, why: "طرحت فقط ونسيت القسمة على المعامل." },
               { v: R.fmt(c/a), why: `قسمت على ${a} قبل أن تطرح ${b}.` },
               { v: x+1, why: "خطأ حسابي بسيط في القسمة." }],
      ex: `${a}x = ${c} − ${b} = ${a*x} → x = ${x}.`,
      steps: [`اطرح ${b}: ${a}x = ${c-b}`, `اقسم على ${a}: x = ${x}`],
      hints: ["اعزل الحد الذي فيه x أولًا", `${c} − ${b} ثم ÷ ${a}`] }; } },

{ id: "eq-sub", topic: "algebra", diff: 2, skill: "التعويض بين معادلتين", est: 50,
  gen: (R) => { const a = R.pick([2,3,4]), x = R.i(2,12), y = R.i(2,10);
    const s = a*x+y;
    return { q: `If ${a}x + y = ${s} and y = ${y}, then x =`, correct: x,
      wrongs: [{ v: s-y, why: "توقفت عند الطرح ونسيت القسمة." }, { v: R.fmt(s/a), why: "قسمت قبل التعويض." }, { v: y, why: "أجبت بقيمة y." }],
      ex: `عوّض y: ${a}x + ${y} = ${s} → ${a}x = ${a*x} → x = ${x}.`,
      steps: [`عوّض y = ${y}`, `${a}x = ${s} − ${y} = ${a*x}`, `x = ${x}`],
      hints: ["عوّض القيمة المعطاة مباشرة"] }; } },

{ id: "exp-eq", topic: "algebra", diff: 3, skill: "معادلات الأسس", est: 50,
  gen: (R) => { const b = R.pick([2,3,5]), n = R.i(2,4), k = R.pick([1,2]);
    const val = Math.pow(b, n+k);
    return { q: `If ${b}^(n+${k}) = ${val}, then n =`, correct: n,
      wrongs: [{ v: n+k, why: `هذا n+${k} وليس n — أكمل الخطوة الأخيرة.` }, { v: val, why: "أجبت بالقيمة نفسها لا بالأس." }, { v: n+1+k, why: "زدت الأس خطأً." }],
      ex: `${val} = ${b}^${n+k} → n + ${k} = ${n+k} → n = ${n}.`,
      steps: [`اكتب ${val} كقوة للأساس ${b}: ${b}^${n+k}`, `ساوِ الأسس: n + ${k} = ${n+k}`, `n = ${n}`],
      hints: [`${b} مضروبة في نفسها كم مرة تعطي ${val}؟`, "ساوِ الأسس عند تساوي الأساس"] }; } },

{ id: "ratio-split", topic: "algebra", diff: 2, skill: "تقسيم بنسبة", est: 50,
  gen: (R) => { const m = R.pick([1,2,3]), n = R.pick([2,3,4,5]); if (m >= n) return null;
    const unit = R.pick([10,15,20,25,30,40]), tot = (m+n)*unit, big = n*unit;
    return { q: `${tot} SAR is divided between two people in the ratio ${m}:${n}. The larger share is:`, correct: big,
      wrongs: [{ v: m*unit, why: "هذي الحصة الأصغر — السؤال يطلب الأكبر." },
               { v: R.fmt(tot/2), why: "قسمت بالتساوي وتجاهلت النسبة." },
               { v: tot-big+unit, why: "خطأ في عدد الأجزاء." }],
      ex: `الأجزاء ${m}+${n} = ${m+n}، والجزء = ${tot} ÷ ${m+n} = ${unit} → الأكبر ${n} × ${unit} = ${big}.`,
      steps: [`مجموع الأجزاء = ${m} + ${n} = ${m+n}`, `قيمة الجزء = ${tot} ÷ ${m+n} = ${unit}`, `الحصة الأكبر = ${n} × ${unit} = ${big}`],
      hints: ["اجمع أجزاء النسبة أولًا", "اقسم المبلغ على مجموع الأجزاء"] }; } },

{ id: "average", topic: "arithmetic", diff: 2, skill: "المتوسط الحسابي", est: 50,
  gen: (R) => { const n = R.pick([3,4,5]), avg = R.pick([10,12,15,20,25]);
    const vals = []; let sum = 0;
    for (let i = 0; i < n-1; i++) { const v = avg + R.i(-5,5); vals.push(v); sum += v; }
    const miss = avg*n - sum; if (miss <= 0) return null;
    return { q: `The average of ${n} numbers is ${avg}. If ${n-1} of them are ${vals.join(", ")}, the last number is:`, correct: miss,
      wrongs: [{ v: avg, why: "افترضت أن الناقص يساوي المتوسط نفسه." }, { v: R.fmt(sum/(n-1)), why: "حسبت متوسط المعطاة فقط." }, { v: avg*n, why: "هذا المجموع الكلي لا العدد الناقص." }],
      ex: `المجموع الكلي = ${avg} × ${n} = ${avg*n}، والمعطى ${sum} → الناقص ${miss}.`,
      steps: [`المجموع الكلي = المتوسط × العدد = ${avg} × ${n} = ${avg*n}`, `مجموع المعطاة = ${sum}`, `الناقص = ${avg*n} − ${sum} = ${miss}`],
      hints: ["ابدأ من المجموع الكلي لا من الأرقام", `${avg} × ${n}`] }; } },

{ id: "speed", topic: "arithmetic", diff: 2, skill: "السرعة والزمن", est: 50,
  gen: (R) => { const v = R.pick([40,50,60,80,90,120]), t = R.pick([2,3,4,5]);
    const d = v*t, mode = R.pick(["d","t","v"]);
    if (mode === "d") return { q: `A car travels at ${v} km/h for ${t} hours. The distance is:`, correct: d+" km",
      wrongs: [{ v: R.fmt(v/t)+" km", why: "قسمت بدل أن تضرب." }, { v: (v+t)+" km", why: "جمعت السرعة والزمن." }, { v: (d/2)+" km", why: "خطأ في الضرب." }],
      ex: `المسافة = السرعة × الزمن = ${v} × ${t} = ${d} km.`, steps: [`المسافة = ${v} × ${t}`, `= ${d} km`], hints: ["المسافة = سرعة × زمن"] };
    if (mode === "t") return { q: `A car covers ${d} km at ${v} km/h. The time taken is:`, correct: t+" hours",
      wrongs: [{ v: R.fmt(d*v)+" hours", why: "ضربت بدل أن تقسم." }, { v: (t+1)+" hours", why: "خطأ في القسمة." }, { v: R.fmt(v/d)+" hours", why: "قلبت القسمة." }],
      ex: `الزمن = المسافة ÷ السرعة = ${d} ÷ ${v} = ${t} ساعات.`, steps: [`الزمن = ${d} ÷ ${v}`, `= ${t}`], hints: ["الزمن = مسافة ÷ سرعة"] };
    return { q: `A car covers ${d} km in ${t} hours. Its speed is:`, correct: v+" km/h",
      wrongs: [{ v: R.fmt(d*t)+" km/h", why: "ضربت بدل أن تقسم." }, { v: R.fmt(t/d*100)+" km/h", why: "قلبت القسمة." }, { v: (v+10)+" km/h", why: "خطأ حسابي." }],
      ex: `السرعة = ${d} ÷ ${t} = ${v} km/h.`, steps: [`السرعة = المسافة ÷ الزمن`, `= ${d} ÷ ${t} = ${v}`], hints: ["السرعة = مسافة ÷ زمن"] }; } },

{ id: "proportion", topic: "arithmetic", diff: 2, skill: "التناسب الطردي", est: 45,
  gen: (R) => { const rate = R.pick([15,20,25,30,40]), t1 = R.pick([2,3,4]), t2 = R.pick([5,6,7,8]);
    return { q: `A machine makes ${rate*t1} units in ${t1} hours. At the same rate, in ${t2} hours it makes:`, correct: rate*t2,
      wrongs: [{ v: rate*t1+t2, why: "جمعت الساعات بدل استخدام المعدل." }, { v: rate, why: "هذا الإنتاج في ساعة واحدة." }, { v: rate*(t2-t1), why: "حسبت الفرق لا الإجمالي." }],
      ex: `المعدل = ${rate*t1} ÷ ${t1} = ${rate} وحدة/ساعة → ${rate} × ${t2} = ${rate*t2}.`,
      steps: [`المعدل في الساعة = ${rate*t1} ÷ ${t1} = ${rate}`, `× ${t2} ساعات = ${rate*t2}`],
      hints: ["أوجد إنتاج الساعة الواحدة أولًا"] }; } },

/* ── أنماط كمية إضافية على غرار القدرات ── */
{ id: "pct-of-pct", topic: "arithmetic", diff: 3, skill: "نسبة من نسبة", est: 55,
  gen: (R) => { const p1 = R.pick([10,20,25,50]), p2 = R.pick([20,40,50,60,80]), base = R.pick([200,300,400,500,600,800]);
    const ans = base * p1 / 100 * p2 / 100; if (!Number.isInteger(ans)) return null;
    const w1 = base * (p1 + p2) / 100, w2 = base * p1 / 100, w3 = R.fmt(base * (p1 * p2 / 100) / 100 * 2);
    if (new Set([ans, w1, w2, w3].map(String)).size < 4) return null;
    return { q: `${p1}% of ${p2}% of ${base} =`, correct: ans,
      wrongs: [{ v: w1, why: "جمعت النسبتين بدل ضربهما على التوالي." },
               { v: w2, why: `حسبت ${p1}% من ${base} فقط ونسيت الـ${p2}%.` },
               { v: w3, why: "ضاعفت الناتج بلا سبب." }],
      ex: `${p2}% من ${base} = ${base * p2 / 100}، ثم ${p1}% منها = ${ans}.`,
      steps: [`${p2}% × ${base} = ${base * p2 / 100}`, `${p1}% × ${base * p2 / 100} = ${ans}`],
      hints: ["طبّق النسبة الأولى ثم الثانية بالتتابع، لا بالجمع"] }; } },

{ id: "ratio-3part", topic: "arithmetic", diff: 2, skill: "تقسيم بنسبة ثلاثية", est: 50,
  gen: (R) => { const [a, b, c] = R.pick([[1,2,3],[2,3,5],[1,3,4],[2,4,5],[1,2,4],[3,4,5],[1,4,6],[2,3,4],[1,2,5]]);
    const unit = R.pick([10,12,15,20,25]), tot = (a + b + c) * unit, big = Math.max(a, b, c) * unit;
    const w1 = R.fmt(tot / 3), w2 = Math.min(a, b, c) * unit, w3 = tot - big;
    if (new Set([big, w1, w2, w3].map(String)).size < 4) return null;
    return { q: `${tot} is divided in the ratio ${a}:${b}:${c}. The largest share is:`, correct: big,
      wrongs: [{ v: w1, why: "قسمت بالتساوي على 3 وتجاهلت النسبة." },
               { v: w2, why: "هذي الحصة الأصغر لا الأكبر." },
               { v: w3, why: "هذا مجموع الحصتين الأخريين." }],
      ex: `الأجزاء = ${a}+${b}+${c} = ${a + b + c}، والجزء = ${tot} ÷ ${a + b + c} = ${unit} → الأكبر = ${Math.max(a, b, c)} × ${unit} = ${big}.`,
      steps: [`مجموع الأجزاء = ${a + b + c}`, `قيمة الجزء = ${tot} ÷ ${a + b + c} = ${unit}`, `الأكبر = ${Math.max(a, b, c)} × ${unit} = ${big}`],
      hints: ["اجمع أجزاء النسبة ثم اقسم الإجمالي عليها"] }; } },

{ id: "avg-combine", topic: "arithmetic", diff: 3, skill: "المتوسط المرجّح", est: 55,
  gen: (R) => { const [n1, a1, n2, a2, ans] = R.pick([[20,10,10,25,15],[15,10,5,18,12],[10,15,20,30,25],[20,15,10,30,20],[10,18,20,12,14],[30,10,10,30,15],[10,10,30,18,16],[5,20,15,12,14]]);
    const w1 = (a1 + a2) / 2, w2 = a2, w3 = a1;
    if (new Set([ans, w1, w2, w3].map(String)).size < 4) return null;
    return { q: `A group of ${n1} has average ${a1}; another of ${n2} has average ${a2}. The combined average is:`, correct: ans,
      wrongs: [{ v: w1, why: "أخذت متوسط المتوسطين وتجاهلت أحجام المجموعتين." },
               { v: w2, why: "هذا متوسط المجموعة الثانية فقط." },
               { v: w3, why: "هذا متوسط المجموعة الأولى فقط." }],
      ex: `المجموع الكلي = ${n1}×${a1} + ${n2}×${a2} = ${n1 * a1 + n2 * a2}، ÷ العدد الكلي ${n1 + n2} = ${ans}.`,
      steps: [`مجموع الأولى = ${n1 * a1}`, `مجموع الثانية = ${n2 * a2}`, `الكل ÷ ${n1 + n2} = ${ans}`],
      hints: ["المتوسط المرجّح: اجمع القيم الكلية ثم اقسم على العدد الكلي، لا تتوسط المتوسطات"] }; } },

{ id: "work-rate", topic: "arithmetic", diff: 3, skill: "معدل العمل المشترك", est: 55,
  gen: (R) => { const pairs = [[6,3,2],[4,4,2],[6,12,4],[10,15,6],[12,4,3],[8,8,4],[3,6,2],[20,5,4]];
    const [x, y, ans] = R.pick(pairs);
    const w1 = x + y, w2 = R.fmt((x + y) / 2), w3 = Math.abs(x - y);
    if (new Set([ans, w1, w2, w3].map(String)).size < 4) return null;
    return { q: `A finishes a job in ${x} hours, B in ${y} hours. Working together, they finish in:`, correct: ans + " hours",
      wrongs: [{ v: w1 + " hours", why: "جمعت الزمنين — العمل المشترك أسرع من كليهما." },
               { v: w2 + " hours", why: "أخذت متوسط الزمنين، وهذا غير صحيح لمعدلات العمل." },
               { v: w3 + " hours", why: "طرحت الزمنين بلا معنى." }],
      ex: `معدل مشترك = 1/${x} + 1/${y}؛ الزمن = 1 ÷ المعدل = ${ans} ساعة.`,
      steps: [`في الساعة: A ينجز 1/${x}، B ينجز 1/${y}`, `معًا = 1/${x} + 1/${y}`, `الزمن = مقلوب المعدل = ${ans} ساعة`],
      hints: ["اجمع معدلات الإنجاز في الساعة، لا الأزمنة", "الزمن المشترك = 1 ÷ مجموع المعدلات"] }; } },

{ id: "remainder", topic: "arithmetic", diff: 2, skill: "باقي القسمة", est: 40, type: "num",
  gen: (R) => { const d = R.pick([3,4,5,6,7,9]), q = R.i(4,20), r = R.i(1, d - 1);
    const n = d * q + r;
    return { q: `What is the remainder when ${n} is divided by ${d}?`, a: r,
      ex: `${n} = ${d}×${q} + ${r}، فالباقي ${r}.`,
      steps: [`أكبر مضاعف لـ${d} أقل من ${n} هو ${d * q}`, `${n} − ${d * q} = ${r}`],
      hints: ["اطرح أكبر مضاعف للقاسم لا يتجاوز العدد"] }; } },

/* ── الاحتمالات ── */
{ id: "prob-simple", topic: "data", diff: 2, skill: "الاحتمالات", est: 45,
  gen: (R) => { const kind = R.pick(["red", "blue"]); const red = R.i(2, 6), blue = R.i(2, 6); const tot = red + blue;
    const pick = kind === "red" ? red : blue, col = kind === "red" ? "حمراء" : "زرقاء", colE = kind === "red" ? "red" : "blue";
    const correct = frac(pick, tot);
    const w1 = frac(pick, tot - pick), w2 = frac(tot - pick, tot), w3 = frac(tot, pick);
    if (new Set([correct, w1, w2, w3]).size < 4) return null;
    return { q: `A bag has ${red} red and ${blue} blue balls. One ball is drawn at random. The probability that it is ${colE} is:`, correct,
      wrongs: [{ v: w1, why: "قسمت على عدد الكرات الأخرى بدل الإجمالي." },
               { v: w2, why: "حسبت احتمال اللون الآخر." },
               { v: w3, why: "قلبت الكسر — الاحتمال = المطلوب ÷ الكل." }],
      ex: `الاحتمال = عدد الـ${col} ÷ الإجمالي = ${pick}/${tot} = ${correct}.`,
      steps: [`الإجمالي = ${red} + ${blue} = ${tot}`, `الاحتمال = ${pick} ÷ ${tot} = ${correct}`],
      hints: ["الاحتمال = عدد الحالات المطلوبة ÷ عدد كل الحالات", "اجمع كل الكرات أولًا"] }; } },

/* ── العدّ: التباديل والتوافيق ── */
{ id: "count-perm", topic: "data", diff: 3, skill: "التباديل (الترتيب)", est: 50, type: "num",
  gen: (R) => { const n = R.pick([3, 4, 5, 6]);
    return { q: `In how many different ways can ${n} distinct books be arranged in a row?`, a: fact(n),
      ex: `الترتيب مهم → ${n}! = ${Array.from({ length: n }, (_, i) => n - i).join("×")} = ${fact(n)}.`,
      steps: [`عدد الترتيبات = ${n}!`, `= ${fact(n)}`],
      hints: ["حين يهم الترتيب استخدم المضروب !n", `${n}! = ${n}×${n - 1}×…×1`] }; } },
{ id: "count-comb", topic: "data", diff: 3, skill: "التوافيق (الاختيار)", est: 55,
  gen: (R) => { const n = R.pick([4, 5, 6, 7]), k = R.pick([2, 3]); if (k >= n) return null;
    const correct = nCr(n, k), wPerm = fact(n) / fact(n - k), wMul = n * k, wSum = n + k;
    if (new Set([correct, wPerm, wMul, wSum]).size < 4) return null;
    return { q: `From ${n} students, how many ways can a committee of ${k} be chosen (order does not matter)?`, correct,
      wrongs: [{ v: wPerm, why: "هذا عدد التباديل (يهتم بالترتيب)؛ اللجنة لا يهمها الترتيب فاقسم على !k." },
               { v: wMul, why: "ضربت العددين فقط." },
               { v: wSum, why: "جمعت العددين." }],
      ex: `الترتيب لا يهم → C(${n},${k}) = ${n}! ÷ (${k}!×${n - k}!) = ${correct}.`,
      steps: [`لأن الترتيب لا يهم نستخدم التوافيق`, `C(${n},${k}) = ${correct}`],
      hints: ["إذا لم يهم الترتيب استخدم التوافيق C(n,k)", "التوافيق = التباديل ÷ !k"] }; } },

/* ── المتباينات ── */
{ id: "inequality", topic: "algebra", diff: 2, skill: "حل المتباينات", est: 50,
  gen: (R) => { const a = R.pick([2, 3, 4, 5]), x = R.i(2, 9), b = R.i(1, 12), lt = R.bool();
    const c = a * x + b;   // a·x + b, threshold so solution is x < x  (strict)
    return { q: `If ${a}x + ${b} ${lt ? "<" : ">"} ${c}, then:`, correct: `x ${lt ? "<" : ">"} ${x}`,
      wrongs: [{ v: `x ${lt ? ">" : "<"} ${x}`, why: "عكست إشارة المتباينة بلا سبب — لم نقسم على عدد سالب." },
               { v: `x ${lt ? "<" : ">"} ${c - b}`, why: `توقفت عند ${c} − ${b} ونسيت القسمة على ${a}.` },
               { v: `x = ${x}`, why: "المتباينة تعطي مدى قيم لا قيمة واحدة." }],
      ex: `${a}x ${lt ? "<" : ">"} ${c} − ${b} = ${c - b} → x ${lt ? "<" : ">"} ${x}.`,
      steps: [`اطرح ${b}: ${a}x ${lt ? "<" : ">"} ${c - b}`, `اقسم على ${a} (موجب فلا تنقلب الإشارة): x ${lt ? "<" : ">"} ${x}`],
      hints: ["عامل المتباينة كالمعادلة", "الإشارة تنقلب فقط عند الضرب/القسمة على سالب"] }; } },

/* ── الجذور ── */
{ id: "sqrt", topic: "arithmetic", diff: 2, skill: "الجذور التربيعية", est: 40, type: "num",
  gen: (R) => { const r = R.i(4, 20); const kind = R.pick(["root", "eq"]);
    if (kind === "root") return { q: `√${r * r} = ?`, a: r,
      ex: `${r} × ${r} = ${r * r}، فالجذر ${r}.`, steps: [`ابحث عن عدد ضربه في نفسه = ${r * r}`, `= ${r}`], hints: ["أي عدد × نفسه يعطي هذا العدد؟"] };
    return { q: `If x² = ${r * r} and x > 0, then x = ?`, a: r,
      ex: `x = √${r * r} = ${r}.`, steps: [`خذ الجذر التربيعي للطرفين`, `x = ${r}`], hints: ["الجذر التربيعي يعكس التربيع"] }; } },

/* ── عمليات الكسور والأعداد العشرية ── */
{ id: "frac-add", topic: "arithmetic", diff: 2, skill: "جمع/طرح الكسور", est: 50,
  gen: (R) => { const d1 = R.pick([2, 3, 4, 6]), d2 = R.pick([2, 3, 4, 6]); const n1 = R.i(1, d1 - 1), n2 = R.i(1, d2 - 1);
    const sub = R.bool(); const L = d1 * d2 / gcd2(d1, d2);
    let num = sub ? n1 * (L / d1) - n2 * (L / d2) : n1 * (L / d1) + n2 * (L / d2); if (num <= 0) return null;
    const correct = frac(num, L);
    const w1 = sub ? `${n1 - n2}/${d1 - d2 || 1}` : `${n1 + n2}/${d1 + d2}`, w2 = frac(sub ? Math.abs(n1 - n2) : n1 + n2, L), w3 = `${n1}/${d2}`;
    if (new Set([correct, w1, w2, w3]).size < 4) return null;
    return { q: `${n1}/${d1} ${sub ? "−" : "+"} ${n2}/${d2} = ?`, correct,
      wrongs: [{ v: w1, why: "جمعت/طرحت البسوط والمقامات مباشرة — لا بد من مقام موحّد." },
               { v: w2, why: "خطأ في التوحيد أو الجمع." },
               { v: w3, why: "خلطت بين البسط والمقام." }],
      ex: `وحّد المقام إلى ${L}: ${n1 * (L / d1)}/${L} ${sub ? "−" : "+"} ${n2 * (L / d2)}/${L} = ${num}/${L} = ${correct}.`,
      steps: [`المقام الموحّد = ${L}`, `${n1 * (L / d1)} ${sub ? "−" : "+"} ${n2 * (L / d2)} = ${num}`, `= ${correct}`],
      hints: ["وحّد المقامات قبل الجمع أو الطرح", "لا تجمع المقامات"] }; } },
{ id: "decimal-op", topic: "arithmetic", diff: 1, skill: "الأعداد العشرية", est: 35, type: "num",
  gen: (R) => { const a = R.i(2, 40) / 10, b = R.i(2, 40) / 10, mul = R.bool();
    const ans = mul ? Math.round(a * b * 100) / 100 : Math.round((a + b) * 10) / 10;
    return { q: `${a} ${mul ? "×" : "+"} ${b} = ?`, a: ans,
      ex: mul ? `${a} × ${b} = ${ans}.` : `${a} + ${b} = ${ans}.`,
      steps: mul ? [`اضرب متجاهلًا الفاصلة ثم عدّ المنازل العشرية`, `= ${ans}`] : [`حاذِ الفواصل واجمع`, `= ${ans}`],
      hints: [mul ? "عدد المنازل العشرية في الناتج = مجموع منازل العددين" : "حاذِ الفاصلة العشرية"] }; } },

/* ── الإحصاء: الوسيط والمنوال والمدى ── */
{ id: "stat-measures", topic: "data", diff: 2, skill: "الوسيط/المنوال/المدى", est: 50, type: "num",
  gen: (R) => { const arr = Array.from({ length: 5 }, () => R.i(2, 20)); const measure = R.pick(["median", "range", "mode"]);
    if (measure === "mode") { const withDup = [...arr]; const v = R.pick(arr); withDup.push(v); // ensure a mode exists
      const counts = {}; withDup.forEach(x => counts[x] = (counts[x] || 0) + 1); const maxC = Math.max(...Object.values(counts));
      const modes = Object.keys(counts).filter(k => counts[k] === maxC); if (modes.length !== 1) return null;
      return { q: `Find the mode: ${R.shuffle(withDup).join(", ")}`, a: Number(modes[0]),
        ex: `المنوال = القيمة الأكثر تكرارًا = ${modes[0]}.`, steps: [`عُدّ تكرار كل قيمة`, `الأكثر تكرارًا = ${modes[0]}`], hints: ["المنوال = الأكثر ظهورًا"] }; }
    const sorted = [...arr].sort((x, y) => x - y);
    if (measure === "median") return { q: `Find the median: ${arr.join(", ")}`, a: sorted[2],
      ex: `رتّب تصاعديًا: ${sorted.join(", ")} → الوسيط (الأوسط) = ${sorted[2]}.`, steps: [`رتّب: ${sorted.join(", ")}`, `القيمة الوسطى = ${sorted[2]}`], hints: ["رتّب الأرقام ثم خذ الأوسط"] };
    return { q: `Find the range: ${arr.join(", ")}`, a: sorted[4] - sorted[0],
      ex: `المدى = الأكبر − الأصغر = ${sorted[4]} − ${sorted[0]} = ${sorted[4] - sorted[0]}.`, steps: [`الأكبر = ${sorted[4]}، الأصغر = ${sorted[0]}`, `المدى = ${sorted[4] - sorted[0]}`], hints: ["المدى = أكبر قيمة − أصغر قيمة"] }; } },

/* ── تحليل البيانات: قراءة جدول ── */
{ id: "data-table", topic: "data", diff: 2, skill: "قراءة جدول بيانات", est: 55,
  gen: (R) => { const items = [["Sat", R.i(20, 60)], ["Sun", R.i(20, 60)], ["Mon", R.i(20, 60)], ["Tue", R.i(20, 60)]];
    const tot = items.reduce((s, x) => s + x[1], 0); const kind = R.pick(["total", "most", "diff"]);
    const table = items.map(([d, v]) => `${d}: ${v}`).join(" | ");
    if (kind === "total") { const correct = tot, w1 = Math.round(tot / items.length), w2 = Math.max(...items.map(x => x[1])), w3 = tot - items[0][1];
      if (new Set([correct, w1, w2, w3]).size < 4) return null;
      return { q: `Sales per day — ${table}\nWhat is the total for the four days?`, correct,
        wrongs: [{ v: w1, why: "حسبت المتوسط لا المجموع." }, { v: w2, why: "أخذت أعلى يوم فقط." }, { v: w3, why: "نسيت إضافة أحد الأيام." }],
        ex: `المجموع = ${items.map(x => x[1]).join(" + ")} = ${tot}.`, steps: [`اجمع كل الأيام`, `= ${tot}`], hints: ["اجمع قيم كل الصفوف"] }; }
    if (kind === "most") { const top = items.reduce((a, b) => b[1] > a[1] ? b : a); const correct = top[1];
      const others = items.filter(x => x[0] !== top[0]).map(x => x[1]); if (new Set(items.map(x => x[1])).size < items.length) return null;
      return { q: `Sales per day — ${table}\nWhat were the sales on the best day?`, correct,
        wrongs: others.map(v => ({ v, why: "ليست أعلى قيمة في الجدول." })),
        ex: `أعلى قيمة = ${top[1]} (${top[0]}).`, steps: [`قارن القيم`, `الأعلى = ${top[1]}`], hints: ["ابحث عن أكبر رقم في الجدول"] }; }
    const mx = Math.max(...items.map(x => x[1])), mn = Math.min(...items.map(x => x[1])); const correct = mx - mn;
    const w1 = mx + mn, w2 = Math.round(tot / items.length), w3 = mx;
    if (new Set([correct, w1, w2, w3]).size < 4) return null;
    return { q: `Sales per day — ${table}\nWhat is the difference between the highest and lowest day?`, correct,
      wrongs: [{ v: w1, why: "جمعت بدل الطرح." }, { v: w2, why: "هذا المتوسط لا الفرق." }, { v: w3, why: "هذي أعلى قيمة فقط." }],
      ex: `الفرق = ${mx} − ${mn} = ${correct}.`, steps: [`الأعلى = ${mx}، الأدنى = ${mn}`, `الفرق = ${correct}`], hints: ["اطرح الأصغر من الأكبر"] }; } },

/* ── الهندسة ── */
{ id: "geo-rect", topic: "geometry", diff: 1, skill: "محيط ومساحة", est: 35,
  gen: (R) => { const w = R.i(3,15), h = R.i(3,15), wantArea = R.bool();
    const area = w*h, per = 2*(w+h);
    return { q: `A rectangle has sides ${w} and ${h}. Its ${wantArea ? "area" : "perimeter"} is:`, correct: wantArea ? area : per,
      wrongs: [{ v: wantArea ? per : area, why: wantArea ? "هذا المحيط لا المساحة (المساحة = طول × عرض)." : "هذي المساحة لا المحيط (المحيط = مجموع الأضلاع)." },
               { v: w+h, why: "جمعت ضلعين فقط." }, { v: wantArea ? area*2 : per/2, why: "ضاعفت/نصّفت بالخطأ." }],
      ex: wantArea ? `المساحة = ${w} × ${h} = ${area}.` : `المحيط = 2 × (${w} + ${h}) = ${per}.`,
      steps: wantArea ? [`المساحة = طول × عرض`, `= ${w} × ${h} = ${area}`] : [`المحيط = 2 × (طول + عرض)`, `= 2 × ${w+h} = ${per}`],
      hints: [wantArea ? "المساحة ضرب" : "المحيط جمع الأضلاع"] }; } },

{ id: "geo-circle", topic: "geometry", diff: 2, skill: "الدائرة", est: 50,
  gen: (R) => { const r = R.i(2,10), wantArea = R.bool();
    const area = R.fmt(3.14*r*r), circ = R.fmt(2*3.14*r);
    return { q: `A circle has radius ${r}. Its ${wantArea ? "area" : "circumference"} is (π ≈ 3.14):`, correct: wantArea ? area : circ,
      wrongs: [{ v: wantArea ? circ : area, why: wantArea ? "هذا المحيط (2πr) لا المساحة (πr²)." : "هذي المساحة (πr²) لا المحيط (2πr)." },
               { v: R.fmt(3.14*r), why: "نسيت التربيع أو الضرب في 2." }, { v: R.fmt(3.14*r*r*2), why: "ضاعفت المساحة بالخطأ." }],
      ex: wantArea ? `المساحة = πr² = 3.14 × ${r}² = ${area}.` : `المحيط = 2πr = 2 × 3.14 × ${r} = ${circ}.`,
      steps: wantArea ? [`المساحة = π × r²`, `= 3.14 × ${r*r}`, `= ${area}`] : [`المحيط = 2 × π × r`, `= 2 × 3.14 × ${r}`, `= ${circ}`],
      hints: [wantArea ? "المساحة فيها تربيع" : "المحيط فيه 2"] }; } },

{ id: "geo-composite", topic: "geometry", diff: 3, skill: "مساحة مركبة", est: 60,
  gen: (R) => { const r = R.i(2,16); const side = 2*r, sq = side*side, ci = 3.14*r*r;
    return { q: `A circle of radius ${r} fits exactly inside a square of side ${side}. The area OUTSIDE the circle is (π ≈ 3.14):`, correct: R.fmt(sq-ci),
      wrongs: [{ v: R.fmt(ci), why: "هذي مساحة الدائرة نفسها — السؤال يطلب ما خارجها." },
               { v: sq, why: "هذي مساحة المربع كاملًا بلا طرح." },
               { v: R.fmt(2*3.14*r), why: "هذا محيط الدائرة لا مساحتها." }],
      ex: `${sq} − ${R.fmt(ci)} = ${R.fmt(sq-ci)}.`,
      steps: [`مساحة المربع = ${side}² = ${sq}`, `مساحة الدائرة = 3.14 × ${r}² = ${R.fmt(ci)}`, `الفرق = ${R.fmt(sq-ci)}`],
      hints: ["المطلوب فرق بين مساحتين", "مربع − دائرة"] }; } },

{ id: "geo-angles", topic: "geometry", diff: 2, skill: "الزوايا", est: 45,
  gen: (R) => { const k = R.pick([2,3,4,5]), rest = R.pick([30,45,60,90,100,120]);
    const x = (180-rest)/k; if (!Number.isInteger(x) || x <= 0) return null;
    return { q: `Two angles on a straight line: one is ${k}x and the other is ${rest}°. Then x =`, correct: x,
      wrongs: [{ v: R.fmt((90-rest)/k), why: "استخدمت 90° — الزاويتان على مستقيم مجموعهما 180°." },
               { v: 180-rest, why: `هذي قيمة ${k}x كلها، اقسمها على ${k}.` }, { v: R.fmt(180/k), why: `نسيت طرح ${rest}.` }],
      ex: `${k}x + ${rest} = 180 → ${k}x = ${180-rest} → x = ${x}.`,
      steps: [`مجموع الزاويتين على مستقيم = 180°`, `${k}x = 180 − ${rest} = ${180-rest}`, `x = ${x}`],
      hints: ["كم مجموع زاويتين على خط مستقيم؟", `${k}x = 180 − ${rest}`] }; } },

{ id: "geo-triangle", topic: "geometry", diff: 2, skill: "مجموع زوايا المثلث", est: 45,
  gen: (R) => { const a = R.pick([30,40,50,55,60,70,80]), b = R.pick([40,50,60,65,70,80]);
    const c = 180-a-b; if (c <= 10) return null;
    return { q: `In a triangle, two angles are ${a}° and ${b}°. The third angle is:`, correct: c+"°",
      wrongs: [{ v: (360-a-b)+"°", why: "استخدمت 360° — مجموع زوايا المثلث 180°." }, { v: (a+b)+"°", why: "جمعت المعطاتين بدل الطرح من 180." }, { v: (180-a)+"°", why: "طرحت زاوية واحدة فقط." }],
      ex: `180 − ${a} − ${b} = ${c}°.`, steps: [`مجموع زوايا المثلث = 180°`, `180 − ${a} − ${b} = ${c}°`],
      hints: ["مجموع زوايا أي مثلث ثابت"] }; } },

{ id: "geo-pyth-hyp", topic: "geometry", diff: 2, skill: "نظرية فيثاغورس", est: 50,
  gen: (R) => { const triples = [[3,4,5],[6,8,10],[5,12,13],[8,15,17],[7,24,25],[9,12,15],[20,21,29]];
    const [a, b, c] = R.pick(triples), k = R.pick([1,1,1,2,2,3]);
    const A = a*k, B = b*k, C = c*k;
    const w1 = A+B, w2 = Math.max(A,B), w3 = C+2;
    if (new Set([C,w1,w2,w3].map(String)).size < 4) return null;
    return { q: `A right triangle has legs ${A} and ${B}. The hypotenuse is:`, correct: C,
      wrongs: [{ v: w1, why: "جمعت الضلعين مباشرة — فيثاغورس فيه تربيع وجذر لا جمع." },
               { v: w2, why: "الوتر أطول من كل ضلع قائم على حدة، لا يساوي أطولهما." },
               { v: w3, why: "خطأ حسابي بسيط في استخراج الجذر التربيعي." }],
      ex: `${A}² + ${B}² = ${A*A+B*B} = ${C}² → الوتر = ${C}.`,
      steps: [`مربع الوتر = ${A}² + ${B}² = ${A*A} + ${B*B} = ${A*A+B*B}`, `الجذر التربيعي لـ${A*A+B*B} = ${C}`],
      hints: ["الوتر هو الضلع الأطول، المقابل للزاوية القائمة", "مربع الوتر = مجموع مربعي الضلعين الآخرين"] }; } },

{ id: "geo-tri-area", topic: "geometry", diff: 1, skill: "مساحة المثلث", est: 40,
  gen: (R) => { const b = R.pick([4,6,8,10,12,14,16,20]), h = R.i(3,12);
    const area = (b*h)/2; if (!Number.isInteger(area)) return null;
    const w1 = b*h, w2 = R.fmt(b*h/4), w3 = 2*(b+h);
    if (new Set([area,w1,w2,w3].map(String)).size < 4) return null;
    return { q: `A triangle has base ${b} and height ${h}. Its area is:`, correct: area,
      wrongs: [{ v: w1, why: "ضربت القاعدة في الارتفاع بلا قسمة على 2 — هذي مساحة المستطيل لا المثلث." },
               { v: w2, why: "قسمت على 4 بدل 2." },
               { v: w3, why: "حسبت محيط الشكل لا مساحته." }],
      ex: `المساحة = (${b} × ${h}) ÷ 2 = ${area}.`,
      steps: [`مساحة المثلث = (القاعدة × الارتفاع) ÷ 2`, `= (${b} × ${h}) ÷ 2 = ${area}`],
      hints: ["نصف حاصل ضرب القاعدة في الارتفاع"] }; } },

{ id: "geo-parallelogram", topic: "geometry", diff: 1, skill: "مساحة متوازي الأضلاع", est: 35,
  gen: (R) => { const b = R.i(4,20), h = R.i(3,15);
    const area = b*h;
    const w1 = R.fmt(area/2), w2 = 2*(b+h), w3 = b+h;
    if (new Set([area,w1,w2,w3].map(String)).size < 4) return null;
    return { q: `A parallelogram has base ${b} and height ${h}. Its area is:`, correct: area,
      wrongs: [{ v: w1, why: "قسمت على 2 — هذي مساحة المثلث لا متوازي الأضلاع." },
               { v: w2, why: "هذا المحيط لا المساحة." },
               { v: w3, why: "جمعت البعدين بدل الضرب." }],
      ex: `المساحة = ${b} × ${h} = ${area}.`,
      steps: [`مساحة متوازي الأضلاع = القاعدة × الارتفاع`, `= ${b} × ${h} = ${area}`],
      hints: ["نفس فكرة المستطيل: قاعدة × ارتفاع"] }; } },

{ id: "geo-box-vol", topic: "geometry", diff: 2, skill: "حجم متوازي المستطيلات", est: 45,
  gen: (R) => { const l = R.i(2,12), w = R.i(2,10), h = R.i(2,8);
    const vol = l*w*h;
    const w1 = 2*(l*w+l*h+w*h), w2 = l*w, w3 = l+w+h;
    if (new Set([vol,w1,w2,w3].map(String)).size < 4) return null;
    return { q: `A rectangular box has length ${l}, width ${w}, and height ${h}. Its volume is:`, correct: vol,
      wrongs: [{ v: w1, why: "هذي المساحة الكلية للسطوح (مساحة السطح)، لا الحجم." },
               { v: w2, why: "ضربت بُعدين فقط ونسيت الارتفاع." },
               { v: w3, why: "جمعت الأبعاد بدل ضربها." }],
      ex: `الحجم = ${l} × ${w} × ${h} = ${vol}.`,
      steps: [`حجم متوازي المستطيلات = الطول × العرض × الارتفاع`, `= ${l} × ${w} × ${h} = ${vol}`],
      hints: ["اضرب الأبعاد الثلاثة معًا"] }; } },

{ id: "geo-cube", topic: "geometry", diff: 2, skill: "المكعب", est: 40,
  gen: (R) => { const s = R.i(2,12), wantVol = R.bool();
    const vol = s*s*s, surf = 6*s*s;
    const correct = wantVol ? vol : surf;
    const w1 = wantVol ? surf : vol, w2 = s*s, w3 = wantVol ? s*s*s*2 : surf/2;
    if (new Set([correct,w1,w2,w3].map(String)).size < 4) return null;
    return { q: `A cube has side ${s}. Its ${wantVol ? "volume" : "surface area"} is:`, correct,
      wrongs: [{ v: w1, why: wantVol ? "هذي مساحة السطح (6×الضلع²) لا الحجم (الضلع³)." : "هذا الحجم (الضلع³) لا مساحة السطح (6×الضلع²)." },
               { v: w2, why: "حسبت مساحة وجه واحد فقط." },
               { v: w3, why: "ضاعفت/نصّفت بالخطأ." }],
      ex: wantVol ? `الحجم = ${s}³ = ${vol}.` : `مساحة السطح = 6 × ${s}² = ${surf}.`,
      steps: wantVol ? [`حجم المكعب = الضلع³`, `= ${s}³ = ${vol}`] : [`مساحة السطح = 6 أوجه متطابقة`, `= 6 × ${s}² = ${surf}`],
      hints: [wantVol ? "الضلع مضروب في نفسه 3 مرات" : "6 أوجه متساوية"] }; } },

{ id: "geo-cylinder", topic: "geometry", diff: 3, skill: "حجم الأسطوانة", est: 55,
  gen: (R) => { const r = R.pick([2,3,4,5,7]), h = R.pick([5,7,10,14,20]);
    const vol = R.fmt(3.14*r*r*h);
    const w1 = R.fmt(2*3.14*r*h), w2 = r*r*h, w3 = R.fmt(3.14*r*h);
    if (new Set([vol,w1,w2,w3].map(String)).size < 4) return null;
    return { q: `A cylinder has radius ${r} and height ${h}. Its volume is (π ≈ 3.14):`, correct: vol,
      wrongs: [{ v: w1, why: "هذي المساحة الجانبية (2πrh) لا الحجم." },
               { v: w2, why: "نسيت الضرب في π." },
               { v: w3, why: "نسيت تربيع نصف القطر." }],
      ex: `الحجم = πr²h = 3.14 × ${r}² × ${h} = ${vol}.`,
      steps: [`حجم الأسطوانة = π × (نصف القطر)² × الارتفاع`, `= 3.14 × ${r*r} × ${h}`, `= ${vol}`],
      hints: ["الحجم فيه تربيع نصف القطر ثم ضرب بالارتفاع"] }; } },

/* ── المتتابعات والمنطق العددي ── */
{ id: "seq-arith", topic: "data", diff: 1, skill: "متتابعة حسابية", est: 40,
  gen: (R) => { const s = R.i(2,12), d = R.pick([3,4,5,6,7,8]);
    const t = [s, s+d, s+2*d, s+3*d], nx = s+4*d;
    return { q: `${t.join(", ")}, ___`, correct: nx,
      wrongs: [{ v: nx+d, why: "قفزت حدين بدل حد واحد." }, { v: nx-1, why: "خطأ حسابي بسيط." }, { v: t[3]*2, why: "ضاعفت بدل أن تضيف الفرق الثابت." }],
      ex: `الفرق الثابت ${d} → ${t[3]} + ${d} = ${nx}.`,
      steps: [`الفرق بين كل حدين = ${d}`, `${t[3]} + ${d} = ${nx}`], hints: ["احسب الفرق بين كل حدين متتاليين"] }; } },

{ id: "seq-geo", topic: "data", diff: 2, skill: "متتابعة هندسية", est: 45,
  gen: (R) => { const s = R.pick([1,2,3,4,5]), r = R.pick([2,3]);
    const t = [s, s*r, s*r*r, s*r*r*r], nx = s*Math.pow(r,4);
    return { q: `${t.join(", ")}, ___`, correct: nx,
      wrongs: [{ v: t[3]+t[2], why: "جمعت الحدين — النمط ضرب لا جمع." }, { v: t[3]+r, why: "أضفت النسبة بدل الضرب فيها." }, { v: nx*r, why: "قفزت حدًا زائدًا." }],
      ex: `كل حد يُضرب في ${r} → ${t[3]} × ${r} = ${nx}.`,
      steps: [`اقسم أي حد على سابقه: ${t[1]} ÷ ${t[0]} = ${r}`, `${t[3]} × ${r} = ${nx}`],
      hints: ["جرّب القسمة بين الحدود لا الطرح"] }; } },

{ id: "seq-diff2", topic: "data", diff: 3, skill: "فروق متزايدة", est: 55,
  gen: (R) => { const s = R.i(2,8), d0 = R.pick([1,2,3]), step = R.pick([1,2]);
    const t = [s]; let d = d0;
    for (let i = 0; i < 4; i++) { t.push(t[t.length-1]+d); d += step; }
    const nx = t.pop();
    return { q: `${t.join(", ")}, ___`, correct: nx,
      wrongs: [{ v: t[3]+(d-step), why: "ثبّت الفرق بدل أن تزيده." }, { v: t[3]+d0, why: "استخدمت أول فرق لكل الحدود." }, { v: nx+step, why: "زدت الفرق مرة إضافية." }],
      ex: `الفروق تتزايد بمقدار ${step} كل مرة → آخر فرق ${d-step} → ${t[3]} + ${d-step} = ${nx}.`,
      steps: [`اكتب الفروق: ${t.slice(1).map((v,i)=>v-t[i]).join(", ")}`, `لاحظ أنها تتزايد بـ${step}`, `الفرق التالي = ${d-step} → ${nx}`],
      hints: ["الفرق نفسه يتغير — احسب فروق الفروق"] }; } },

{ id: "data-share", topic: "data", diff: 2, skill: "الحصة من الإجمالي", est: 50,
  gen: (R) => { const u = R.pick([10,20,25,40,50]); const a = u*R.i(2,4), b = u*R.i(2,5), c = u*R.i(3,6);
    const tot = a+b+c, pct = R.fmt(b/tot*100);
    return { q: `Units sold — A: ${a}, B: ${b}, C: ${c}. B's share of the total is:`, correct: pct+"%",
      wrongs: [{ v: R.fmt(b/(a+c)*100)+"%", why: "قسمت على الباقي بدل المجموع الكلي." },
               { v: b+"%", why: "هذا العدد نفسه لا نسبته." }, { v: R.fmt(b/c*100)+"%", why: "قارنت B بـC فقط." }],
      ex: `${b} ÷ ${tot} = ${pct}%.`, steps: [`المجموع = ${a} + ${b} + ${c} = ${tot}`, `${b} ÷ ${tot} = ${pct}%`],
      hints: ["اجمع الكل أولًا", `${b} من ${tot}`] }; } },

{ id: "compare", topic: "comparison", diff: 2, skill: "المقارنة بالتعويض", est: 45,
  gen: (R) => { const kind = R.pick(["frac","sum","sq"]);
    if (kind === "frac") return { q: `0 < x < 1\nQuantity A: x²\nQuantity B: x`, correct: "B greater",
      wrongs: [{ v: "A greater", why: "قست على الأعداد الأكبر من 1 — تربيع الكسر يصغّره." }, { v: "Equal", why: "تتساويان فقط عند 0 و1، وهما خارج المدى." }, { v: "Cannot be determined", why: "المدى محدد، والنتيجة ثابتة داخله." }],
      ex: "جرّب ½: A = ¼ و B = ½ → B أكبر دائمًا في هذا المدى.",
      steps: ["x كسر بين 0 و1", "جرّب x = ½ → A = ¼، B = ½", "التربيع يصغّر الكسور → B أكبر"], hints: ["جرّب قيمة كسرية", "هل التربيع يكبّر الكسر؟"] };
    if (kind === "sum") { const s = R.pick([10,12,20]); return { q: `x + y = ${s}\nQuantity A: x\nQuantity B: ${s/2}`, correct: "Cannot be determined",
      wrongs: [{ v: "A greater", why: `صحيح فقط لو x أكبر من ${s/2}، وليس مضمونًا.` }, { v: "B greater", why: "صحيح في حالة واحدة فقط لا في كلها." }, { v: "Equal", why: "افترضت تساوي المتغيرين، والمعطى لا يقول ذلك." }],
      ex: `جرّب x = 2 ثم x = ${s-2} — النتيجة تنقلب، فلا يمكن التحديد.`,
      steps: [`جرّب x = 2, y = ${s-2} → B أكبر`, `جرّب x = ${s-2}, y = 2 → A أكبر`, "تغيّرت النتيجة → لا يمكن التحديد"], hints: ["هل x محددة بقيمة واحدة؟", "جرّب توزيعين متعاكسين"] }; }
    const n = R.i(2,9); return { q: `Quantity A: ${n}²\nQuantity B: 2 × ${n}`, correct: n > 2 ? "A greater" : "Equal",
      wrongs: [{ v: n > 2 ? "Equal" : "A greater", why: `عند ${n}: ${n*n} مقابل ${2*n} — احسبهما مباشرة.` }, { v: "B greater", why: "التربيع يتجاوز المضاعفة بعد 2." }, { v: "Cannot be determined", why: "كل القيم معلومة، فالمقارنة محسومة." }],
      ex: `${n}² = ${n*n} و2 × ${n} = ${2*n}.`, steps: [`A = ${n*n}`, `B = ${2*n}`, n > 2 ? "A أكبر" : "متساويان"], hints: ["احسب الطرفين عدديًا"] } ; } },

/* ── الرياضيات الذهنية (CPC — بلا آلة حاسبة) ── */
{ id: "mental-mult", topic: "arithmetic", diff: 1, skill: "ضرب ذهني بالتفكيك", est: 30, type: "num",
  gen: (R) => { const a = R.i(21,89), b = R.i(3,9); const t = Math.floor(a/10)*10, o = a%10;
    return { q: `${a} × ${b} =`, a: a*b,
      ex: `(${t}×${b}) + (${o}×${b}) = ${t*b} + ${o*b} = ${a*b}.`,
      steps: [`فكّك ${a} إلى ${t} + ${o}`, `${t} × ${b} = ${t*b}`, `${o} × ${b} = ${o*b}`, `اجمع: ${a*b}`],
      hints: ["فكّك العدد لعشرات وآحاد", `${t} × ${b} أولًا`] }; } },

{ id: "mental-trick", topic: "arithmetic", diff: 2, skill: "حيل الضرب السريع", est: 30, type: "num",
  gen: (R) => { const kind = R.pick(["x11","x25","x9","near100"]);
    if (kind === "x11") { const n = R.i(12,88); return { q: `${n} × 11 =`, a: n*11,
      ex: `اجمع الرقمين وضعهما بينهما: ${Math.floor(n/10)}(${Math.floor(n/10)}+${n%10})${n%10} = ${n*11}.`,
      steps: [`الرقمان: ${Math.floor(n/10)} و${n%10}`, `مجموعهما = ${Math.floor(n/10)+n%10}`, `النتيجة = ${n*11}`], hints: ["حيلة ×11: اجمع الرقمين وضع الناتج بينهما"] }; }
    if (kind === "x25") { const n = R.pick([12,16,20,24,28,32,36,40,44,48]); return { q: `${n} × 25 =`, a: n*25,
      ex: `${n} ÷ 4 = ${n/4} ثم × 100 = ${n*25}.`, steps: [`×25 = ÷4 ثم ×100`, `${n} ÷ 4 = ${n/4}`, `× 100 = ${n*25}`], hints: ["25 = 100 ÷ 4"] }; }
    if (kind === "x9") { const n = R.i(12,49); return { q: `${n} × 9 =`, a: n*9,
      ex: `${n} × 10 = ${n*10} ثم اطرح ${n} = ${n*9}.`, steps: [`×9 = ×10 ثم اطرح العدد`, `${n*10} − ${n} = ${n*9}`], hints: ["×9 = ×10 ناقص العدد نفسه"] }; }
    const n = R.i(91,99), m = R.i(91,99); return { q: `${n} × ${m} =`, a: n*m,
      ex: `(100−${100-n})(100−${100-m}): ${n}−${100-m} = ${n-(100-m)} ثم أضف ${(100-n)*(100-m)} → ${n*m}.`,
      steps: [`النقص: ${100-n} و${100-m}`, `${n} − ${100-m} = ${n-(100-m)} (أول رقمين)`, `${100-n} × ${100-m} = ${(100-n)*(100-m)} (آخر رقمين)`, `= ${n*m}`],
      hints: ["استخدم بُعد كل عدد عن 100"] }; } },

{ id: "mental-estimate", topic: "arithmetic", diff: 1, skill: "التقريب والتصحيح", est: 30, type: "num",
  gen: (R) => { const a = R.pick([197,198,297,298,396,398,495,497]), b = R.i(120,480);
    const round = Math.round(a/100)*100;
    return { q: `${a} + ${b} =`, a: a+b,
      ex: `${round} + ${b} = ${round+b} ثم اطرح ${round-a} = ${a+b}.`,
      steps: [`قرّب ${a} إلى ${round}`, `${round} + ${b} = ${round+b}`, `صحّح: − ${round-a} = ${a+b}`],
      hints: ["قرّب العدد القريب من مئة ثم صحّح"] }; } },

{ id: "mental-div", topic: "arithmetic", diff: 2, skill: "قسمة ذهنية", est: 35, type: "num",
  gen: (R) => { const d = R.pick([12,15,16,18,25]), q = R.i(4,40);
    return { q: `${d*q} ÷ ${d} =`, a: q,
      ex: `${d} × ${q} = ${d*q} → الناتج ${q}.`,
      steps: [`اسأل: ${d} × كم = ${d*q}؟`, `= ${q}`], hints: ["اقلبها لضرب: القاسم × ؟ = المقسوم"] }; } },


/* ── لوحة الأرقام: تغطية كل المواضيع الكمية (كان الحساب فقط ← سبب تكرار) ── */
{ id: "num-alg-mult", topic: "algebra", diff: 1, skill: "معادلة ضرب", est: 30, type: "num",
  gen: (R) => { const a = R.pick([3,4,5,6,7,8,9,12]), x = R.i(3,19);
    return { q: `If ${a}x = ${a*x}, then x =`, a: x, ex: `x = ${a*x} ÷ ${a} = ${x}.`,
      steps: [`اقسم الطرفين على ${a}`, `x = ${x}`], hints: [`${a} × كم = ${a*x}؟`] }; } },
{ id: "num-alg-2step", topic: "algebra", diff: 2, skill: "معادلة بخطوتين", est: 40, type: "num",
  gen: (R) => { const a = R.pick([2,3,4,5,6,7]), x = R.i(2,18), b = R.i(3,25);
    return { q: `If ${a}x + ${b} = ${a*x+b}, then x =`, a: x,
      ex: `${a}x = ${a*x} → x = ${x}.`, steps: [`اطرح ${b}: ${a}x = ${a*x}`, `اقسم على ${a}: x = ${x}`], hints: ["اعزل حد x أولًا"] }; } },
{ id: "num-alg-eval", topic: "algebra", diff: 2, skill: "تعويض في تعبير", est: 40, type: "num",
  gen: (R) => { const a = R.i(2,9), b = R.i(1,12), x = R.i(2,11);
    return { q: `If x = ${x}, then ${a}x + ${b} =`, a: a*x+b,
      ex: `${a}×${x} + ${b} = ${a*x+b}.`, steps: [`عوّض x = ${x}`, `${a} × ${x} = ${a*x}`, `+ ${b} = ${a*x+b}`], hints: ["اضرب أولًا ثم اجمع"] }; } },
{ id: "num-geo-area", topic: "geometry", diff: 1, skill: "مساحة ومحيط", est: 35, type: "num",
  gen: (R) => { const w = R.i(4,20), h = R.i(3,18), area = R.bool();
    return { q: area ? `Rectangle ${w} × ${h} → Area =` : `Rectangle ${w} × ${h} → Perimeter =`, a: area ? w*h : 2*(w+h),
      ex: area ? `${w} × ${h} = ${w*h}.` : `2 × (${w} + ${h}) = ${2*(w+h)}.`,
      steps: area ? [`المساحة = طول × عرض`, `= ${w*h}`] : [`المحيط = 2 × (${w} + ${h})`, `= ${2*(w+h)}`], hints: [area ? "المساحة ضرب" : "المحيط جمع ثم ×2"] }; } },
{ id: "num-geo-angle", topic: "geometry", diff: 2, skill: "زوايا المثلث", est: 35, type: "num",
  gen: (R) => { const a = R.pick([25,30,35,40,45,50,55,60,70,80,90]), b = R.pick([20,30,40,45,50,55,60,65,70]);
    if (a+b >= 175) return null;
    return { q: `Triangle angles ${a}° and ${b}° → third =`, a: 180-a-b,
      ex: `180 − ${a} − ${b} = ${180-a-b}.`, steps: [`مجموع زوايا المثلث 180°`, `180 − ${a} − ${b} = ${180-a-b}`], hints: ["مجموع الزوايا ثابت"] }; } },
{ id: "num-geo-square", topic: "geometry", diff: 1, skill: "المربع", est: 30, type: "num",
  gen: (R) => { const s = R.i(3,25), area = R.bool();
    return { q: area ? `Square with side ${s} → Area =` : `Square with side ${s} → Perimeter =`, a: area ? s*s : 4*s,
      ex: area ? `${s}² = ${s*s}.` : `4 × ${s} = ${4*s}.`,
      steps: area ? [`المساحة = الضلع²`, `= ${s*s}`] : [`المحيط = 4 × الضلع`, `= ${4*s}`], hints: [area ? "الضلع في نفسه" : "أربعة أضلاع متساوية"] }; } },
{ id: "num-geo-pyth", topic: "geometry", diff: 2, skill: "نظرية فيثاغورس", est: 40, type: "num",
  gen: (R) => { const triples = [[3,4,5],[6,8,10],[5,12,13],[8,15,17],[7,24,25],[9,12,15],[20,21,29]];
    const [a, b, c] = R.pick(triples), k = R.pick([1,1,2,2,3]);
    const A = a*k, B = b*k, C = c*k;
    return { q: `Right triangle legs ${A} and ${B} → Hypotenuse =`, a: C,
      ex: `${A}² + ${B}² = ${A*A+B*B} = ${C}².`,
      steps: [`مربع الوتر = ${A}² + ${B}²`, `= ${A*A+B*B}`, `الجذر التربيعي = ${C}`], hints: ["فيثاغورس: تربيع الضلعين ثم الجذر"] }; } },
{ id: "num-geo-tri-area", topic: "geometry", diff: 1, skill: "مساحة المثلث", est: 35, type: "num",
  gen: (R) => { const b = R.pick([4,6,8,10,12,14,16,20]), h = R.i(3,12);
    const area = (b*h)/2; if (!Number.isInteger(area)) return null;
    return { q: `Triangle base ${b}, height ${h} → Area =`, a: area,
      ex: `(${b} × ${h}) ÷ 2 = ${area}.`, steps: [`(القاعدة × الارتفاع) ÷ 2`, `= ${area}`], hints: ["نصف حاصل الضرب"] }; } },
{ id: "num-geo-box-vol", topic: "geometry", diff: 2, skill: "حجم متوازي المستطيلات", est: 40, type: "num",
  gen: (R) => { const l = R.i(2,12), w = R.i(2,10), h = R.i(2,8);
    return { q: `Box ${l} × ${w} × ${h} → Volume =`, a: l*w*h,
      ex: `${l} × ${w} × ${h} = ${l*w*h}.`, steps: [`الحجم = طول × عرض × ارتفاع`, `= ${l*w*h}`], hints: ["اضرب الأبعاد الثلاثة"] }; } },
{ id: "num-seq", topic: "data", diff: 2, skill: "إكمال النمط", est: 40, type: "num",
  gen: (R) => { const s = R.i(2,15), kind = R.pick(["add","mul","grow"]);
    if (kind === "add") { const d = R.pick([4,6,7,8,9,11,12]); const t = [s, s+d, s+2*d, s+3*d];
      return { q: `${t.join(", ")}, ?`, a: s+4*d, ex: `الفرق الثابت ${d} → ${s+4*d}.`, steps: [`الفرق = ${d}`, `${t[3]} + ${d} = ${s+4*d}`], hints: ["اطرح كل حدين"] }; }
    if (kind === "mul") { const r = R.pick([2,3]); const t = [s, s*r, s*r*r, s*r*r*r];
      return { q: `${t.join(", ")}, ?`, a: s*Math.pow(r,4), ex: `كل حد × ${r} → ${s*Math.pow(r,4)}.`, steps: [`النسبة = ${r}`, `${t[3]} × ${r} = ${s*Math.pow(r,4)}`], hints: ["جرّب القسمة بين الحدود"] }; }
    const d0 = R.pick([2,3]), st = R.pick([1,2]); const t = [s]; let d = d0;
    for (let i = 0; i < 4; i++) { t.push(t[t.length-1]+d); d += st; }
    const ans = t.pop();
    return { q: `${t.join(", ")}, ?`, a: ans, ex: `الفروق تتزايد بـ${st} → ${ans}.`, steps: [`الفروق: ${t.slice(1).map((v,i)=>v-t[i]).join(", ")}`, `الفرق التالي ${d-st} → ${ans}`], hints: ["احسب فروق الفروق"] }; } },
{ id: "num-data-avg", topic: "data", diff: 2, skill: "المتوسط", est: 40, type: "num",
  gen: (R) => { const n = R.pick([3,4,5]), avg = R.pick([8,10,12,15,20,24]);
    const vals = []; let sum = 0;
    for (let i = 0; i < n; i++) { const v = avg + R.i(-6,6); vals.push(v); sum += v; }
    if (sum % n !== 0) return null;
    return { q: `Average of ${vals.join(", ")} =`, a: sum/n, ex: `${sum} ÷ ${n} = ${sum/n}.`,
      steps: [`المجموع = ${sum}`, `÷ ${n} = ${sum/n}`], hints: ["اجمع ثم اقسم على العدد"] }; } },
{ id: "fraction-simplify", topic: "arithmetic", diff: 1, skill: "تبسيط الكسور", est: 35,
  gen: (R) => { let a = R.pick([2,3,4,5,6,7,8,9]), b = R.pick([2,3,4,5,7,9,11]); if (a === b) return null;
    const gcd = (x, y) => y ? gcd(y, x % y) : x; const d0 = gcd(a, b); a /= d0; b /= d0;   // اجعل الكسر غير قابل لمزيد من الاختصار
    if (a === b) return null;
    const k = R.pick([2,3,4,5,6,7]);
    return { q: `Simplify: ${a*k}/${b*k}`, correct: `${a}/${b}`,
      wrongs: [{ v: `${b}/${a}`, why: "قلبت البسط والمقام." }, { v: `${a*k}/${b}`, why: "بسّطت المقام فقط." }, { v: `${a}/${b*k}`, why: "بسّطت البسط فقط." }],
      ex: `اقسم الطرفين على ${k} → ${a}/${b}.`,
      steps: [`القاسم المشترك = ${k}`, `${a*k} ÷ ${k} = ${a}`, `${b*k} ÷ ${k} = ${b}`],
      hints: ["ابحث عن عدد يقسم البسط والمقام معًا"] }; } },
]);


/* ═══ content/generators-verbal.js ═══ */
/* ═══════════════════════════════════════════════════════════
   ♾️ مولّدات اللفظي — تناظر وإكمال جمل ومفردات، بلا إنترنت
   التناظر يُبنى من «قاعدة علاقات» حقيقية لا من عشوائية:
   كل علاقة لها أزواج متجانسة، والمشتتات تُسحب من علاقات أخرى.
   لإضافة المزيد: أضف علاقة أو زوجًا هنا فقط.
   ═══════════════════════════════════════════════════════════ */
const REL = [
  { k: "tool",   ar: "أداة ← وظيفتها",        pairs: [["KNIFE","CUT"],["PEN","WRITE"],["BROOM","SWEEP"],["KEY","UNLOCK"],["HAMMER","POUND"],["SHOVEL","DIG"],["LAMP","ILLUMINATE"]] },
  { k: "place",  ar: "مهنة ← مكان عملها",     pairs: [["CHEF","KITCHEN"],["TEACHER","CLASSROOM"],["JUDGE","COURT"],["PILOT","COCKPIT"],["SURGEON","OPERATING ROOM"],["FARMER","FIELD"],["ACTOR","STAGE"]] },
  { k: "part",   ar: "جزء ← كُل",             pairs: [["PAGE","BOOK"],["WHEEL","CAR"],["PETAL","FLOWER"],["BRANCH","TREE"],["ROOM","HOUSE"],["ISLAND","ARCHIPELAGO"],["CHAPTER","NOVEL"]] },
  { k: "degree", ar: "درجة أخف ← أشد",        pairs: [["WARM","HOT"],["DRIZZLE","DOWNPOUR"],["WHISPER","SHOUT"],["SAD","DEVASTATED"],["BREEZE","GALE"],["LIKE","ADORE"],["CHUCKLE","ROAR"]] },
  { k: "cause",  ar: "سبب ← نتيجة",           pairs: [["SPARK","FIRE"],["SEED","TREE"],["VIRUS","ILLNESS"],["RAIN","FLOOD"],["EXERCISE","FITNESS"],["STUDY","KNOWLEDGE"],["FRICTION","HEAT"]] },
  { k: "anto",   ar: "تضاد",                  pairs: [["ANCIENT","MODERN"],["EXPAND","SHRINK"],["ASCEND","DESCEND"],["PRAISE","CRITICIZE"],["ACCEPT","REJECT"],["SCARCE","ABUNDANT"],["RIGID","FLEXIBLE"]] },
  { k: "syno",   ar: "ترادف",                 pairs: [["BEGIN","START"],["HUGE","ENORMOUS"],["RAPID","SWIFT"],["BRAVE","COURAGEOUS"],["QUIET","SILENT"],["ODD","STRANGE"],["WEALTHY","AFFLUENT"]] },
  { k: "worker", ar: "حِرَفي ← أداته",         pairs: [["CARPENTER","SAW"],["PAINTER","BRUSH"],["SURGEON","SCALPEL"],["TAILOR","NEEDLE"],["WRITER","PEN"],["ARCHER","BOW"],["CHEMIST","BEAKER"]] },
  { k: "categ",  ar: "فرد ← فئته",            pairs: [["ROSE","FLOWER"],["COPPER","METAL"],["ARABIC","LANGUAGE"],["OAK","TREE"],["TROUT","FISH"],["RUBY","GEM"],["SPARROW","BIRD"]] },
  { k: "lack",   ar: "مكان ← ما ينعدم فيه",   pairs: [["DESERT","WATER"],["VACUUM","AIR"],["SILENCE","SOUND"],["DARKNESS","LIGHT"],["DROUGHT","RAIN"],["FAMINE","FOOD"],["VOID","MATTER"]] },
  { k: "mater",  ar: "شيء ← مادته",           pairs: [["SHIRT","FABRIC"],["WINDOW","GLASS"],["TIRE","RUBBER"],["BOOK","PAPER"],["STATUE","MARBLE"],["COIN","METAL"],["ROPE","FIBER"]] },
  { k: "action", ar: "فعل ← ناتجه",           pairs: [["COOK","MEAL"],["BUILD","STRUCTURE"],["PLANT","CROP"],["TEACH","LEARNING"],["PAINT","PORTRAIT"],["COMPOSE","SYMPHONY"],["WELD","JOINT"]] },
];
/* علاقات لا تُستخدم مشتتات لبعضها (متقاربة جدًا فتلتبس) */
const CLASH = { degree: ["syno"], syno: ["degree", "anto"], anto: ["syno"] };

/* إطارات إكمال الجمل: كلمة إشارة + الفراغ الصحيح + مشتتات مشخّصة */
const FRAMES = [
  { q: "The room looked ___, but the furniture inside was brand new.", a: "old", w: [["modern","«but» تفرض تضادًا، وmodern تكرر معنى new."],["clean","لا تضاد ولا علاقة بـnew."],["large","الحجم لا علاقة له بالتضاد المطلوب."]], sig: "but", ex: "but = تضاد: المظهر قديم والمحتوى جديد." },
  { q: "She spoke ___ because the baby was sleeping.", a: "quietly", w: [["loudly","نقيض المطلوب — الطفل نائم."],["quickly","السرعة لا تعالج سبب النوم."],["angrily","لا يرتبط بالسبب المذكور."]], sig: "because", ex: "because = سبب: النوم يستدعي الهدوء." },
  { q: "Although the test was ___, most students passed it easily.", a: "difficult", w: [["easy","يلغي التضاد الذي صنعته Although."],["short","الطول لا يصنع تضادًا مع النجاح."],["free","لا علاقة بالصعوبة."]], sig: "although", ex: "Although = تضاد: صعب ومع ذلك نجحوا." },
  { q: "The evidence was ___, so the judge closed the case immediately.", a: "conclusive", w: [["weak","دليل ضعيف لا يُغلق قضية فورًا."],["missing","الغياب يمنع الإغلاق لا يسرّعه."],["expensive","صفة لا تناسب الأدلة هنا."]], sig: "so", ex: "so = نتيجة: دليل حاسم ← إغلاق سريع." },
  { q: "He is usually calm, yet yesterday he seemed unusually ___.", a: "agitated", w: [["relaxed","يكرر calm بدل أن يعاكسها."],["polite","لا تضاد مع calm."],["tired","التعب ليس نقيض الهدوء."]], sig: "yet", ex: "yet = تضاد مع calm." },
  { q: "Since the road was flooded, the trip was ___.", a: "postponed", w: [["enjoyable","لا تنتج عن طريق غارق."],["shortened","الغرق يمنع لا يقصّر."],["repeated","لا علاقة بالسبب."]], sig: "since", ex: "Since = سبب: الفيضان ← التأجيل." },
  { q: "The manager praised the team for its ___ work despite the tight deadline.", a: "outstanding", w: [["careless","المدح لا يناسب الإهمال."],["delayed","يناقض إنجازهم رغم ضيق الوقت."],["ordinary","المدح يعني تميزًا لا اعتيادية."]], sig: "praised", ex: "المدح يقتضي صفة إيجابية قوية." },
  { q: "Water is ___ in the desert, so every drop is treasured.", a: "scarce", w: [["abundant","لو كانت وفيرة لما صارت ثمينة."],["heavy","الوزن لا يفسّر الثمن."],["clean","النقاء لا يفسّر الندرة."]], sig: "so", ex: "الندرة سبب التقدير." },
  { q: "Far from being helpful, his advice only ___ the problem.", a: "worsened", w: [["solved","Far from تنفي النفع، فلا حل."],["explained","التفسير ليس ضررًا."],["prevented","المنع نفع لا ضرر."]], sig: "far from", ex: "Far from being helpful = ضارّ لا نافع." },
  { q: "The instructions were so ___ that even a child could follow them.", a: "clear", w: [["confusing","يناقض قدرة الطفل على الاتباع."],["long","الطول لا يسهّل الاتباع."],["technical","التقنية تصعّب على الطفل."]], sig: "so…that", ex: "so…that = نتيجة: الوضوح يتيح الاتباع." },
  { q: "Unlike her talkative brother, Sara is quite ___.", a: "reserved", w: [["chatty","Unlike تفرض العكس لا التشابه."],["friendly","الود لا يعاكس الثرثرة."],["clever","الذكاء ليس نقيض الكلام."]], sig: "unlike", ex: "Unlike = تضاد مع talkative." },
  { q: "The company reduced prices in order to ___ more customers.", a: "attract", w: [["avoid","التخفيض لا يهدف للتجنب."],["ignore","يناقض الغاية التجارية."],["charge","التخفيض عكس زيادة الرسوم."]], sig: "in order to", ex: "in order to = غاية: التخفيض يجذب." },
];

/* الكلمة الشاذة (الارتباط والاختلاف): ثلاث كلمات من فئة + كلمة دخيلة */
const ODD = [
  { grp: ["rose", "tulip", "lily"], odd: "oak", cat: "أزهار", oddCat: "شجرة", ex: "الثلاثة أزهار، بينما oak شجرة." },
  { grp: ["copper", "silver", "iron"], odd: "marble", cat: "معادن", oddCat: "حجر", ex: "الثلاثة معادن، وmarble حجر." },
  { grp: ["mango", "apple", "grape"], odd: "carrot", cat: "فواكه", oddCat: "خضار", ex: "الثلاثة فواكه، وcarrot خضار." },
  { grp: ["eagle", "sparrow", "owl"], odd: "bat", cat: "طيور", oddCat: "ثديي", ex: "الثلاثة طيور، وbat ثديي يطير." },
  { grp: ["hammer", "drill", "saw"], odd: "timber", cat: "أدوات", oddCat: "مادة خام", ex: "الثلاثة أدوات، وtimber خشب (مادة)." },
  { grp: ["doctor", "teacher", "engineer"], odd: "hospital", cat: "مهن", oddCat: "مكان", ex: "الثلاثة مهن، وhospital مكان." },
  { grp: ["water", "oil", "milk"], odd: "oxygen", cat: "سوائل", oddCat: "غاز", ex: "الثلاثة سوائل، وoxygen غاز." },
  { grp: ["square", "circle", "triangle"], odd: "cube", cat: "أشكال مستوية", oddCat: "مجسم", ex: "الثلاثة أشكال ثنائية، وcube مجسم." },
  { grp: ["hour", "minute", "second"], odd: "meter", cat: "وحدات زمن", oddCat: "وحدة طول", ex: "الثلاثة وحدات زمن، وmeter وحدة طول." },
  { grp: ["Mars", "Venus", "Jupiter"], odd: "Moon", cat: "كواكب", oddCat: "قمر", ex: "الثلاثة كواكب، وMoon قمر تابع." },
  { grp: ["anger", "joy", "fear"], odd: "running", cat: "مشاعر", oddCat: "فعل حركي", ex: "الثلاثة مشاعر، وrunning فعل حركي." },
  { grp: ["cotton", "wool", "silk"], odd: "plastic", cat: "أقمشة طبيعية", oddCat: "مادة صناعية", ex: "الثلاثة أقمشة طبيعية، وplastic صناعي." },
];

/* الخطأ السياقي: جملة فيها كلمة واحدة تكسر المعنى — bad هو موضعها */
const CTX = [
  { q: "The loyal dog protected its owner but attacked him with great affection.", options: ["loyal", "protected", "attacked", "affection"], bad: 2, ex: "«attacked» يناقض الولاء والحماية والمودة في الجملة." },
  { q: "She studied hard, prepared well, and carelessly passed the difficult exam.", options: ["studied", "prepared", "carelessly", "passed"], bad: 2, ex: "«carelessly» يناقض الاجتهاد والاستعداد." },
  { q: "The fresh fruit tasted sweet, juicy, and rotten at the same time.", options: ["fresh", "sweet", "juicy", "rotten"], bad: 3, ex: "«rotten» يناقض «fresh» وبقية الأوصاف." },
  { q: "The generous man donated money, helped the poor, and stole from the charity.", options: ["generous", "donated", "helped", "stole"], bad: 3, ex: "«stole» يناقض الكرم والعطاء والمساعدة." },
  { q: "The bright sun gave us warmth, light, and darkness throughout the day.", options: ["bright", "warmth", "light", "darkness"], bad: 3, ex: "«darkness» يناقض سطوع الشمس والضوء." },
  { q: "The skilled surgeon worked calmly, precisely, and clumsily during the operation.", options: ["skilled", "calmly", "precisely", "clumsily"], bad: 3, ex: "«clumsily» يناقض المهارة والدقة." },
  { q: "The ancient castle looked old, historic, and newly-built to the visitors.", options: ["ancient", "old", "historic", "newly-built"], bad: 3, ex: "«newly-built» يناقض «ancient» و«old»." },
  { q: "The honest judge ruled fairly, wisely, and dishonestly in the case.", options: ["honest", "fairly", "wisely", "dishonestly"], bad: 3, ex: "«dishonestly» يناقض النزاهة والعدل والحكمة." },
];

/* الترادف: كلمة + مرادفها + مشتّتات (مع معانيها) */
const SYN = [
  { w: "abundant", a: "plentiful", ar: "وفير", w3: [["scarce", "نادر — عكسها"], ["fragile", "هشّ"], ["distant", "بعيد"]] },
  { w: "brave", a: "courageous", ar: "شجاع", w3: [["timid", "خجول — عكسها"], ["clever", "ذكي"], ["polite", "مؤدّب"]] },
  { w: "rapid", a: "swift", ar: "سريع", w3: [["slow", "بطيء — عكسها"], ["heavy", "ثقيل"], ["silent", "صامت"]] },
  { w: "difficult", a: "challenging", ar: "صعب", w3: [["simple", "بسيط — عكسها"], ["cheap", "رخيص"], ["bright", "مشرق"]] },
  { w: "happy", a: "joyful", ar: "سعيد", w3: [["sad", "حزين — عكسها"], ["tired", "متعب"], ["hungry", "جائع"]] },
  { w: "wealthy", a: "affluent", ar: "ثري", w3: [["poor", "فقير — عكسها"], ["famous", "مشهور"], ["honest", "أمين"]] },
  { w: "essential", a: "crucial", ar: "أساسي", w3: [["optional", "اختياري — عكسها"], ["obvious", "واضح"], ["temporary", "مؤقّت"]] },
  { w: "enormous", a: "immense", ar: "ضخم", w3: [["tiny", "ضئيل — عكسها"], ["empty", "فارغ"], ["gentle", "لطيف"]] },
  { w: "accurate", a: "precise", ar: "دقيق", w3: [["vague", "غامض — عكسها"], ["ancient", "قديم"], ["loud", "عالٍ"]] },
  { w: "generous", a: "giving", ar: "كريم", w3: [["stingy", "بخيل — عكسها"], ["quiet", "هادئ"], ["curious", "فضولي"]] },
];

/* التضاد: كلمة + ضدّها + مشتّتات */
const ANT = [
  { w: "ancient", a: "modern", ar: "قديم ↔ حديث", w3: [["old", "قديم — مرادف لا ضد"], ["historic", "تاريخي"], ["fragile", "هشّ"]] },
  { w: "expand", a: "shrink", ar: "يتمدّد ↔ ينكمش", w3: [["grow", "ينمو — مرادف"], ["build", "يبني"], ["move", "يتحرّك"]] },
  { w: "victory", a: "defeat", ar: "نصر ↔ هزيمة", w3: [["success", "نجاح — مرادف"], ["battle", "معركة"], ["reward", "مكافأة"]] },
  { w: "generous", a: "stingy", ar: "كريم ↔ بخيل", w3: [["kind", "لطيف — مرادف"], ["wealthy", "ثري"], ["polite", "مؤدّب"]] },
  { w: "increase", a: "decrease", ar: "يزيد ↔ ينقص", w3: [["rise", "يرتفع — مرادف"], ["change", "يتغيّر"], ["repeat", "يكرّر"]] },
  { w: "accept", a: "reject", ar: "يقبل ↔ يرفض", w3: [["agree", "يوافق — مرادف"], ["receive", "يستلم"], ["decide", "يقرّر"]] },
  { w: "artificial", a: "natural", ar: "اصطناعي ↔ طبيعي", w3: [["fake", "زائف — مرادف"], ["modern", "حديث"], ["cheap", "رخيص"]] },
  { w: "temporary", a: "permanent", ar: "مؤقّت ↔ دائم", w3: [["brief", "وجيز — مرادف"], ["urgent", "عاجل"], ["hidden", "مخفي"]] },
  { w: "praise", a: "criticize", ar: "يمدح ↔ ينتقد", w3: [["admire", "يُعجب — مرادف"], ["notice", "يلاحظ"], ["explain", "يشرح"]] },
  { w: "brighten", a: "darken", ar: "يُضيء ↔ يُعتم", w3: [["shine", "يلمع — مرادف"], ["reflect", "يعكس"], ["cover", "يغطّي"]] },
];

/* القواعد (Grammar): إكمال بالخيار الصحيح نحويًا */
const GRAMMAR = [
  { q: "She ___ to school every day.", a: "goes", w3: [["go", "الفاعل مفرد غائب يتطلّب goes."], ["going", "يحتاج فعل مساعد قبل going."], ["gone", "gone تصريف ثالث يحتاج have/has."]], ex: "مع he/she/it نضيف s للفعل: goes." },
  { q: "They have ___ their homework already.", a: "finished", w3: [["finish", "بعد have نستخدم التصريف الثالث."], ["finishing", "يحتاج is/are لا have."], ["finishes", "have + p.p لا s."]], ex: "have + تصريف ثالث (finished)." },
  { q: "There ___ many books on the table.", a: "are", w3: [["is", "many books جمع فيتطلّب are."], ["was", "الزمن مضارع لا ماضٍ."], ["be", "be مجرّدة لا تصلح خبرًا هنا."]], ex: "جمع (many books) → are." },
  { q: "He is taller ___ his brother.", a: "than", w3: [["then", "then للزمن لا للمقارنة."], ["that", "that لا تُستخدم بعد صفة تفضيل."], ["from", "المقارنة بـtaller than."]], ex: "صيغة المقارنة: -er + than." },
  { q: "If it rains, we ___ stay home.", a: "will", w3: [["would", "الجملة شرط أول → will."], ["are", "يحتاج فعل بعده."], ["did", "did للماضي لا للشرط المستقبلي."]], ex: "الشرط الأول: If + مضارع, will + مصدر." },
  { q: "I have lived here ___ 2019.", a: "since", w3: [["for", "for مع مدة لا مع نقطة زمنية."], ["from", "مع الحاضر التام نستخدم since لنقطة البداية."], ["at", "at للأوقات المحددة القصيرة."]], ex: "since + نقطة زمنية (2019)." },
  { q: "Each of the students ___ a book.", a: "has", w3: [["have", "each يُعامل معاملة المفرد."], ["having", "يحتاج فعل مساعد."], ["are", "each مفرد لا جمع."]], ex: "each + فعل مفرد: has." },
  { q: "The movie was ___ than I expected.", a: "better", w3: [["good", "المقارنة تتطلّب better."], ["best", "best تفضيل مطلق لا مقارنة بين اثنين."], ["well", "well ظرف لا صفة مقارنة."]], ex: "good → better (مقارنة)." },
];

/* تحديد الخطأ النحوي (Error Identification): أي جزء تحته خط خطأ */
const ERRID = [
  { q: "She (don't) (like) (to) (swim).", options: ["don't", "like", "to", "swim"], bad: 0, ex: "مع she نستخدم doesn't لا don't." },
  { q: "The children (is) (playing) (in) (the park).", options: ["is", "playing", "in", "the park"], bad: 0, ex: "children جمع → are لا is." },
  { q: "He (have) (finished) (his) (work).", options: ["have", "finished", "his", "work"], bad: 0, ex: "مع he نستخدم has لا have." },
  { q: "They (was) (very) (happy) (yesterday).", options: ["was", "very", "happy", "yesterday"], bad: 0, ex: "they → were لا was." },
  { q: "I (enjoy) (to read) (books) (daily).", options: ["enjoy", "to read", "books", "daily"], bad: 1, ex: "بعد enjoy نستخدم reading لا to read." },
  { q: "She is (more) (taller) (than) (him).", options: ["more", "taller", "than", "him"], bad: 0, ex: "لا نجمع more مع taller؛ taller وحدها تكفي." },
  { q: "We (didn't) (went) (to) (the mall).", options: ["didn't", "went", "to", "the mall"], bad: 1, ex: "بعد didn't نستخدم المصدر go لا went." },
  { q: "There (are) (a) (book) (on the desk).", options: ["are", "a", "book", "on the desk"], bad: 0, ex: "a book مفرد → is لا are." },
];

/* الاستدلال اللغوي/المنطقي (Verbal Reasoning): استنتاج من مقدّمة */
const VREASON = [
  { q: "All engineers can code. Sara is an engineer. Therefore:", a: "Sara can code.", w3: [["Sara cannot code.", "يناقض المقدّمة."], ["All coders are engineers.", "عكس غير صحيح منطقيًا."], ["Sara is a coder by profession.", "المقدّمة تقول تستطيع، لا أن مهنتها كذلك."]], ex: "قياس مباشر: كل مهندس يبرمج، وسارة مهندسة ← تستطيع البرمجة." },
  { q: "No reptiles are warm-blooded. A snake is a reptile. Therefore a snake is:", a: "not warm-blooded", w3: [["warm-blooded", "يناقض المقدّمة."], ["a mammal", "لا يلزم من المعطى."], ["cold to touch always", "استنتاج زائد غير مذكور."]], ex: "لا زواحف حارّة الدم، والثعبان زاحف ← ليس حارّ الدم." },
  { q: "If it rains, the match is cancelled. The match was NOT cancelled. Therefore:", a: "It did not rain.", w3: [["It rained.", "يناقض المنطق (نفي اللازم)."], ["The match was postponed.", "غير مذكور."], ["It will rain later.", "لا يلزم من المعطى."]], ex: "نفي النتيجة يستلزم نفي السبب: لم يُلغَ ← لم تمطر." },
  { q: "Some students are athletes. All athletes are fit. Therefore:", a: "Some students are fit.", w3: [["All students are fit.", "«بعض» لا تعني «كل»."], ["All fit people are students.", "عكس غير صحيح."], ["No students are fit.", "يناقض المعطى."]], ex: "بعض الطلاب رياضيون، وكل رياضي لائق ← بعض الطلاب لائقون." },
  { q: "Ali is older than Sara. Sara is older than Huda. Therefore:", a: "Ali is older than Huda.", w3: [["Huda is older than Ali.", "يناقض الترتيب."], ["Sara is the youngest.", "هدى الأصغر."], ["Ali and Huda are the same age.", "غير صحيح."]], ex: "ترتيب متعدٍّ: علي > سارة > هدى ← علي > هدى." },
  { q: "Every book in the shop is on sale. This item is NOT on sale. Therefore:", a: "This item is not a book from the shop.", w3: [["This item is a book.", "يناقض المنطق."], ["The shop has no books.", "لا يلزم."], ["All items are on sale.", "يناقض المعطى."]], ex: "نفي النتيجة (ليس مخفّضًا) ينفي كونه كتابًا من المتجر." },
];

QQ.registerGenerators([

/* ── التناظر اللفظي من قاعدة العلاقات ── */
{ id: "v-analogy", topic: "analogy", diff: 2, skill: "التناظر اللفظي", est: 35,
  gen: (R) => {
    const rel = R.pick(REL);
    const two = R.shuffle([...rel.pairs]).slice(0, 2);
    const [stem, right] = two;
    const banned = [rel.k, ...(CLASH[rel.k] || [])];
    const pool = REL.filter(r => !banned.includes(r.k));
    const wrongs = R.shuffle(pool).slice(0, 3).map(r => {
      const p = R.pick(r.pairs);
      return { v: `${p[0].toLowerCase()} : ${p[1].toLowerCase()}`, why: `هذي علاقة «${r.ar}» لا «${rel.ar}».` };
    });
    return { q: `${stem[0]} : ${stem[1]} ::`, correct: `${right[0].toLowerCase()} : ${right[1].toLowerCase()}`, wrongs,
      ex: `العلاقة: ${rel.ar}. ${stem[0]}→${stem[1]} مثل ${right[0]}→${right[1]}.`,
      steps: [`كوّن جملة تربط الطرفين: «${rel.ar}»`, `طبّق الجملة على كل خيار`, `الوحيد المطابق: ${right[0].toLowerCase()} : ${right[1].toLowerCase()}`],
      hints: ["كوّن جملة العلاقة قبل النظر للخيارات", `العلاقة هنا: ${rel.ar}`] };
  } },

{ id: "v-analogy-hard", topic: "analogy", diff: 3, skill: "تمييز علاقات متقاربة", est: 45,
  gen: (R) => {
    const rel = R.pick(REL.filter(r => CLASH[r.k]));
    const two = R.shuffle([...rel.pairs]).slice(0, 2);
    const [stem, right] = two;
    const near = REL.find(r => r.k === CLASH[rel.k][0]);
    const nearPair = R.pick(near.pairs);
    const others = R.shuffle(REL.filter(r => ![rel.k, near.k].includes(r.k))).slice(0, 2)
      .map(r => { const p = R.pick(r.pairs); return { v: `${p[0].toLowerCase()} : ${p[1].toLowerCase()}`, why: `علاقة «${r.ar}» — بعيدة عن المطلوب.` }; });
    return { q: `${stem[0]} : ${stem[1]} ::`, correct: `${right[0].toLowerCase()} : ${right[1].toLowerCase()}`,
      wrongs: [{ v: `${nearPair[0].toLowerCase()} : ${nearPair[1].toLowerCase()}`, why: `فخ قريب: هذي «${near.ar}» بينما المطلوب «${rel.ar}» — الفرق دقيق فانتبه.` }, ...others],
      ex: `المطلوب ${rel.ar}: ${right[0]}→${right[1]}.`,
      steps: [`العلاقة: ${rel.ar}`, `احذر الخيار القريب (${near.ar})`, `الصحيح: ${right[0].toLowerCase()} : ${right[1].toLowerCase()}`],
      hints: ["فيه خيار قريب جدًا — حدد نوع العلاقة بدقة", `المطلوب: ${rel.ar}`] };
  } },

/* ── إكمال الجمل: إطارات مصمّمة ── */
{ id: "v-frame", topic: "sentence", diff: 2, skill: "كلمات الإشارة", est: 40,
  gen: (R) => { const f = R.pick(FRAMES);
    return { q: f.q, correct: f.a, wrongs: f.w.map(([v, why]) => ({ v, why })), ex: f.ex,
      steps: [`حدّد كلمة الإشارة: «${f.sig}»`, `هل تطلب تضادًا أم سببًا أم نتيجة؟`, `اختر ما يوافقها: ${f.a}`],
      hints: [`ركّز على كلمة «${f.sig}»`, "الإشارة تحدد اتجاه المعنى"] }; } },

/* ── الكلمة الشاذة (الارتباط والاختلاف) ── */
{ id: "v-odd", topic: "vocab", diff: 2, skill: "الكلمة الشاذة", est: 35,
  gen: (R) => { const e = R.pick(ODD);
    return { q: "اختر الكلمة الشاذّة (التي لا تنتمي للمجموعة):", correct: e.odd,
      wrongs: e.grp.map(w => ({ v: w, why: `${w} تنتمي لفئة «${e.cat}» مثل الكلمتين الأخريين.` })),
      ex: e.ex,
      steps: [`ابحث عن الرابط المشترك بين ثلاث كلمات: «${e.cat}»`, `الكلمة التي تخرج عن الفئة: ${e.odd} (${e.oddCat})`],
      hints: ["حدّد الفئة التي تجمع ثلاث كلمات", "الكلمة الرابعة هي الشاذّة"] }; } },

/* ── الخطأ السياقي ── */
{ id: "v-ctxerr", topic: "sentence", diff: 3, skill: "الخطأ السياقي", est: 45,
  gen: (R) => { const e = R.pick(CTX); const bad = e.options[e.bad];
    return { q: `أي كلمة تكسر معنى الجملة؟\n«${e.q}»`, correct: bad,
      wrongs: e.options.filter((_, i) => i !== e.bad).map(w => ({ v: w, why: `«${w}» تناسب سياق الجملة، فهي ليست الخطأ.` })),
      ex: e.ex,
      steps: [`اقرأ الجملة كاملة وتحسّس الكلمة التي تناقض بقيتها`, `الكلمة الخاطئة سياقيًا: «${bad}»`],
      hints: ["الكلمة الخاطئة تناقض المعنى العام للجملة", "بقية الكلمات منسجمة مع بعضها"] }; } },

/* ── الترادف ── */
{ id: "v-syn", topic: "vocab", diff: 2, skill: "الترادف", est: 35,
  gen: (R) => { const e = R.pick(SYN);
    return { q: `Choose the word closest in meaning to «${e.w}»:`, correct: e.a,
      wrongs: e.w3.map(([v, why]) => ({ v, why })),
      ex: `${e.w} = ${e.ar}، وأقرب مرادف: ${e.a}.`,
      steps: [`معنى «${e.w}» = ${e.ar}`, `المرادف الأقرب: ${e.a}`],
      hints: ["ابحث عن الكلمة الأقرب في المعنى، لا الضد", `معنى الكلمة: ${e.ar}`] }; } },

/* ── التضاد ── */
{ id: "v-ant", topic: "vocab", diff: 2, skill: "التضاد", est: 35,
  gen: (R) => { const e = R.pick(ANT);
    return { q: `Choose the OPPOSITE of «${e.w}»:`, correct: e.a,
      wrongs: e.w3.map(([v, why]) => ({ v, why })),
      ex: `${e.ar}. الضد الصحيح: ${e.a}.`,
      steps: [`المطلوب عكس «${e.w}»`, `الضد: ${e.a}`],
      hints: ["انتبه: المطلوب الضد لا المرادف", "أحد المشتّتات مرادف لتضليلك"] }; } },

/* ── القواعد (Grammar) ── */
{ id: "v-grammar", topic: "sentence", diff: 2, skill: "القواعد", est: 40,
  gen: (R) => { const e = R.pick(GRAMMAR);
    return { q: `Complete correctly:\n«${e.q}»`, correct: e.a,
      wrongs: e.w3.map(([v, why]) => ({ v, why })),
      ex: e.ex,
      steps: [`حدّد القاعدة المطلوبة (زمن/عدد/مقارنة)`, `الصحيح نحويًا: ${e.a}`],
      hints: ["طابق الفعل مع الفاعل والزمن", "اقرأ الجملة كاملة قبل الاختيار"] }; } },

/* ── تحديد الخطأ النحوي (Error Identification) ── */
{ id: "v-errid", topic: "sentence", diff: 3, skill: "تحديد الخطأ النحوي", est: 45,
  gen: (R) => { const e = R.pick(ERRID); const bad = e.options[e.bad];
    return { q: `أي جزء يحوي خطأً نحويًا؟\n«${e.q}»`, correct: bad,
      wrongs: e.options.filter((_, i) => i !== e.bad).map(w => ({ v: w, why: `«${w}» سليم نحويًا في الجملة.` })),
      ex: e.ex,
      steps: [`افحص تطابق الفعل والزمن والعدد في كل جزء`, `الخطأ في: «${bad}»`],
      hints: ["ابحث عن عدم تطابق الفاعل مع الفعل أو الزمن"] }; } },

/* ── الاستدلال اللغوي/المنطقي ── */
{ id: "v-reason", topic: "reading", diff: 3, skill: "الاستدلال المنطقي", est: 55,
  gen: (R) => { const e = R.pick(VREASON);
    return { q: e.q, correct: e.a,
      wrongs: e.w3.map(([v, why]) => ({ v, why })),
      ex: e.ex,
      steps: [`اعتمد على المقدّمات المذكورة فقط`, `الاستنتاج الصحيح: ${e.a}`],
      hints: ["لا تُدخل معلومات من خارج النص", "«بعض» لا تساوي «كل»، ونفي النتيجة ينفي السبب"] }; } },

/* ── إكمال الجمل من كلمات AWL التي تعلّمها اللاعب ── */
{ id: "v-awl-blank", topic: "sentence", diff: 2, skill: "AWL في سياق", est: 40,
  gen: (R, g) => { const pool = R.awlPool(g); if (pool.length < 4) return null;
    const w = R.pick(pool), others = R.shuffle(pool.filter(x => x.w !== w.w)).slice(0, 3);
    return { q: w.bl, correct: w.w, wrongs: others.map(o => ({ v: o.w, why: `${o.w} تعني «${o.ar}» ولا تناسب سياق الجملة.` })),
      ex: `${w.w} = ${w.ar}. مثال: ${w.ex}`,
      steps: [`اقرأ الجملة كاملة وحدد المعنى الناقص`, `${w.w} تعني «${w.ar}»`, `عوّضها وتأكد أن الجملة تستقيم`],
      hints: ["ترجم الجملة ذهنيًا أولًا", `المعنى المطلوب قريب من: ${w.ar}`] }; } },

{ id: "v-awl-mean", topic: "vocab", diff: 1, skill: "معاني AWL", est: 30,
  gen: (R, g) => { const pool = R.awlPool(g); if (pool.length < 4) return null;
    const w = R.pick(pool), others = R.shuffle(pool.filter(x => x.w !== w.w)).slice(0, 3);
    const rev = R.bool();
    if (rev) return { q: `Which word means «${w.ar}»?`, correct: w.w, wrongs: others.map(o => ({ v: o.w, why: `${o.w} تعني «${o.ar}».` })),
      ex: `${w.w} = ${w.ar}. ${w.ex}`, steps: [`المطلوب مقابل «${w.ar}»`, `= ${w.w}`], hints: [`تذكّر جملة المثال للكلمة`] };
    return { q: `«${w.w}» means:`, correct: w.ar, wrongs: others.map(o => ({ v: o.ar, why: `هذا معنى ${o.w}.` })),
      ex: `${w.w} = ${w.ar}. ${w.ex}`, steps: [`استرجع الكلمة في جملتها: ${w.ex}`, `المعنى: ${w.ar}`], hints: ["استرجع الكلمة داخل جملة لا وحدها"] }; } },

{ id: "v-awl-syn", topic: "vocab", diff: 2, skill: "مرادفات وأضداد AWL", est: 35,
  gen: (R, g) => { const pool = R.awlPool(g); if (pool.length < 4) return null;
    const withAnt = pool.filter(x => x.ant);
    const useAnt = withAnt.length >= 1 && R.bool();
    const w = useAnt ? R.pick(withAnt) : R.pick(pool);
    const others = R.shuffle(pool.filter(x => x.w !== w.w)).slice(0, 3);
    const correct = useAnt ? w.ant : w.syn;
    return { q: `${useAnt ? "The OPPOSITE of" : "A synonym of"} «${w.w}» is:`, correct,
      wrongs: others.map(o => ({ v: useAnt ? o.w : o.syn, why: `${useAnt ? o.w : o.syn} لا ${useAnt ? "يعاكس" : "يرادف"} ${w.w} (${w.ar}).` })),
      ex: `${w.w} (${w.ar}) ${useAnt ? "عكسها" : "≈"} ${correct}.`,
      steps: [`${w.w} تعني ${w.ar}`, `المطلوب ${useAnt ? "العكس" : "المرادف"}: ${correct}`],
      hints: [`ابدأ بمعنى ${w.w} بالعربية`] }; } },
]);


/* ═══ content/lessons-core.js ═══ */
/* ═══ مناهج الأكاديمية (F,S,Q,P,C) + اختبار تحديد المستوى ═══ */
QQ.registerLessons({
  F: {
    id: "F", name: "المرحلة الأولى: التأسيس", icon: "🧱", color: "#7B5EA7",
    desc: "من الصفر تمامًا — حتى لو نسيت جدول الضرب",
    units: [
      { id: "f1", icon: "✖️", name: "جدول الضرب والحيل الذهنية", genDrills: true,
        steps: [
          { k: "teach", h: "الضرب = جمع متكرر", t: "‏4 × 3 يعني أربع مجموعات، كل مجموعة فيها ثلاثة: 3+3+3+3. إذا رسّخت هذي الفكرة، فهمت الضرب كله — الباقي مجرد سرعة.", ex: "4 × 3 = 3+3+3+3 = 12" },
          { k: "example", h: "حيلة الضرب في 9", q: "كيف نحسب 9 × 7 بسرعة بدون حفظ؟", steps: ["بدل الضرب في 9، اضرب في 10 (أسهل): 7 × 10 = 70", "ثم اطرح العدد مرة واحدة: 70 − 7", "الناتج = 63"], answer: "63" },
          { k: "check", q: "جرّب بنفسك بنفس الحيلة: 9 × 6 = ؟", options: ["45", "54", "56", "63"], a: 1, ex: "‏6 × 10 = 60، ثم اطرح 6 → 54. لاحظ أن مجموع رقمي الناتج (5+4) يساوي 9 دائمًا في جدول التسعة." },
          { k: "example", h: "حيلة الضرب في 5", q: "كيف نحسب 5 × 14 ذهنيًا؟", steps: ["خذ نصف العدد: نصف 14 = 7", "ثم اضرب في 10: 7 × 10", "الناتج = 70"], answer: "70" },
          { k: "trap", h: "لا تخلط الحيلتين", t: "حيلة الـ9: اضرب في 10 ثم اطرح العدد. حيلة الـ5: خذ النصف ثم اضرب في 10. كثير يخلط بينهما تحت ضغط الوقت — ثبّت كل واحدة بمثالها." },
        ],
        cards: [
        { h: "الضرب = جمع متكرر", t: "4 × 3 يعني أربع مجموعات من ثلاثة: 3+3+3+3 = 12. إذا فهمت هذي، فهمت الضرب كله." },
        { h: "حيلة الضرب في 9", t: "اضرب في 10 ثم اطرح العدد مرة: 9×7 = 70 − 7 = 63. أسرع من الحفظ الأعمى.", ex: "9 × 8 = 80 − 8 = 72" },
        { h: "حيلة الضرب في 5", t: "خذ نصف العدد ثم اضرب في 10: 5×14 = 7×10 = 70.", ex: "5 × 18 = 9 × 10 = 90" },
      ], drills: [
        { q: "7 × 8 =", options: ["54", "56", "63", "48"], a: 1, ex: "7×8 = 56. حيلة: 7×8 = 7×10 − 7×2 = 70 − 14." },
        { q: "9 × 6 =", options: ["52", "56", "54", "63"], a: 2, ex: "حيلة الـ9: 60 − 6 = 54." },
        { kind: "num", q: "12 × 5 =", a: 60, ex: "نصف 12 = 6، ثم ×10 = 60." },
        { q: "8 × 4 =", options: ["28", "36", "24", "32"], a: 3, ex: "8×4 = 8×2×2 = 16×2 = 32." },
        { kind: "num", q: "6 × 7 =", a: 42, ex: "6×7 = 42 — من الأزواج اللي لازم تصير تلقائية." },
      ]},
      { id: "f2", icon: "🍕", name: "الكسور من البداية", genDrills: true,
        steps: [
          { k: "teach", h: "الكسر = جزء من كل", t: "‏3/4 تعني: قسمنا البيتزا إلى 4 قطع متساوية (المقام، تحت)، وأخذنا 3 منها (البسط، فوق). المقام يقول «كم قطعة»، والبسط يقول «كم أخذنا»." },
          { k: "example", h: "التبسيط: نفس الكسر بشكل أنظف", q: "بسّط 6/8 لأصغر صورة:", steps: ["ابحث عن عدد يقسم البسط والمقام معًا: 2 يقسم 6 و 8", "اقسم كليهما على 2: 6÷2 = 3 و 8÷2 = 4", "الناتج 3/4 — نفس القيمة تمامًا، شكل أبسط"], answer: "3/4" },
          { k: "check", q: "بسّط 10/15 لأصغر صورة:", options: ["2/3", "5/3", "1/2", "3/5"], a: 0, ex: "‏5 يقسم الاثنين: 10÷5 = 2 و 15÷5 = 3 → 2/3." },
          { k: "teach", h: "الجمع بمقام موحّد", t: "لا تجمع المقامات أبدًا! إذا اختلفت المقامات، وحّدها أولًا ثم اجمع البسوط فقط.", ex: "1/2 + 1/4 → 2/4 + 1/4 = 3/4" },
          { k: "check", q: "‏1/3 + 1/6 = ؟ (المقام الموحّد 6)", options: ["2/9", "1/2", "2/6", "1/9"], a: 1, ex: "‏1/3 = 2/6، ثم 2/6 + 1/6 = 3/6 = 1/2." },
          { k: "trap", h: "الفخ القاتل", t: "‏1/2 + 1/4 لا يساوي 2/6! جمع البسوط والمقامات مباشرة خطأ. القاعدة: وحّد المقام، ثم اجمع البسوط فقط، والمقام يبقى كما هو." },
        ],
        cards: [
        { h: "الكسر = جزء من كل", t: "3/4 تعني: قسمنا البيتزا 4 قطع (المقام) وأخذنا 3 (البسط)." },
        { h: "التبسيط", t: "اقسم البسط والمقام على نفس العدد: 6/8 ÷2 = 3/4. الكسر ما تغيّر، شكله بس صار أبسط.", ex: "10/15 ÷5 = 2/3" },
        { h: "جمع المقامات المتشابهة", t: "المقام واحد؟ اجمع البسوط فقط: 1/4 + 2/4 = 3/4." },
      ], drills: [
        { q: "1/2 + 1/4 =", options: ["2/6", "3/4", "1/3", "2/4"], a: 1, ex: "حوّل: 1/2 = 2/4، ثم 2/4 + 1/4 = 3/4." },
        { q: "بسّط: 6/8", options: ["3/4", "2/3", "4/6", "1/2"], a: 0, ex: "اقسم الاثنين على 2: 6÷2=3 و 8÷2=4." },
        { q: "أيهما أكبر؟", options: ["2/3", "3/5", "متساويان", "لا يمكن المقارنة"], a: 0, ex: "وحّد المقام: 2/3=10/15 و 3/5=9/15 → 2/3 أكبر." },
        { kind: "num", q: "3/4 of 20 =", a: 15, ex: "20 ÷ 4 = 5 (الربع)، ثم ×3 = 15." },
      ]},
      { id: "f3", icon: "🔁", name: "كسر ↔ عشري ↔ نسبة", genDrills: true,
        steps: [
          { k: "teach", h: "النسبة = من كل 100", t: "‏% تعني «من كل مئة». فـ 50% = 50 من كل 100 = النصف. الكسر والعشري والنسبة ثلاثة أسماء لنفس القيمة، بس بلبس مختلف — وفهم التنقّل بينها يفتح لك نصف أسئلة الكمي." },
          { k: "teach", h: "الجدول الذهبي — احفظه", t: "هذي التحويلات تتكرر كثير، احفظها فورًا فتوفّر ثوانٍ ثمينة:", ex: "1/2 = 0.5 = 50%   |   1/4 = 0.25 = 25%\n3/4 = 0.75 = 75%   |   1/5 = 0.2 = 20%\n1/10 = 0.1 = 10%" },
          { k: "example", h: "عشري → نسبة", q: "حوّل 0.35 إلى نسبة مئوية:", steps: ["القاعدة: اضرب في 100 (= حرّك الفاصلة خانتين لليمين)", "0.35 → 35.", "الناتج = 35%"], answer: "35%" },
          { k: "check", q: "‏3/10 = كم نسبة مئوية؟", options: ["3%", "13%", "30%", "0.3%"], a: 2, ex: "المقام 10؟ اضرب البسط والمقام في 10 → 30/100 = 30%. أو: 3/10 = 0.3 = 30%." },
          { k: "trap", h: "لا تعكس الاتجاه", t: "من عشري إلى نسبة: اضرب ×100 (الفاصلة يمين). من نسبة إلى عشري: اقسم ÷100 (الفاصلة يسار). عكس الاتجاه يعطي 100 ضعف أو جزء من مئة من الجواب الصحيح — غلط شائع تحت الضغط." },
        ],
        cards: [
        { h: "النسبة = من كل 100", t: "50% تعني 50 من كل 100، يعني النصف. النسبة كسر لابس بدلة رسمية." },
        { h: "جدول التحويلات الذهبي (احفظه)", t: "1/2 = 0.5 = 50% • 1/4 = 0.25 = 25% • 3/4 = 0.75 = 75% • 1/5 = 0.2 = 20% • 1/10 = 0.1 = 10%" },
        { h: "قاعدة التحويل", t: "عشري → نسبة: اضرب ×100 (حرّك الفاصلة يمين). نسبة → عشري: اقسم ÷100.", ex: "0.35 → 35%   |   8% → 0.08" },
      ], drills: [
        { kind: "num", q: "0.75 = ?%", a: 75, ex: "حرّك الفاصلة خانتين يمين." },
        { kind: "num", q: "1/5 = ?%", a: 20, ex: "1/5 = 0.2 = 20% — من الجدول الذهبي." },
        { q: "40% كعدد عشري =", options: ["4.0", "0.04", "0.4", "40"], a: 2, ex: "اقسم على 100: 40 → 0.40." },
        { q: "3/10 =", options: ["3%", "30%", "0.03", "13%"], a: 1, ex: "المقام 10؟ البسط ×10 هو النسبة: 30%." },
      ]},
      { id: "f4", icon: "🧮", name: "ترتيب العمليات", genDrills: true,
        steps: [
          { k: "teach", h: "الترتيب ليس اختياريًا", t: "الآلة الحاسبة والاختبار يتبعان ترتيبًا صارمًا: (1) الأقواس، ثم (2) الضرب والقسمة من اليسار، ثم (3) الجمع والطرح. لو خالفت الترتيب، بتطلع بجواب «غلط بثقة»." },
          { k: "example", h: "لماذا 2 + 3 × 4 ليست 20", q: "احسب 2 + 3 × 4 بالترتيب الصحيح:", steps: ["الضرب قبل الجمع: 3 × 4 = 12", "الآن اجمع: 2 + 12", "الناتج = 14 (وليس 20!)"], answer: "14" },
          { k: "check", q: "احسب: 20 − 8 ÷ 2", options: ["6", "16", "12", "10"], a: 1, ex: "القسمة أولًا: 8 ÷ 2 = 4، ثم 20 − 4 = 16. لو طرحت أولًا لأخطأت." },
          { k: "trap", h: "دور الأقواس", t: "الأقواس تكسر الترتيب لأنها الأولى: (2 + 3) × 4 = 5 × 4 = 20، بينما 2 + 3 × 4 = 14. نفس الأرقام، جواب مختلف تمامًا — اقرأ الأقواس بعناية." },
        ],
        cards: [
        { h: "القانون", t: "الأقواس أولًا، ثم الضرب والقسمة (من اليسار)، وأخيرًا الجمع والطرح. مخالفة الترتيب = جواب غلط بثقة." },
        { h: "مثال محلول", t: "2 + 3 × 4: الضرب أول → 3×4=12، ثم 2+12 = 14. (مو 20!)", ex: "لكن (2+3) × 4 = 5 × 4 = 20" },
      ], drills: [
        { q: "2 + 3 × 4 =", options: ["20", "14", "24", "10"], a: 1, ex: "الضرب قبل الجمع: 2 + 12 = 14." },
        { q: "(2 + 3) × 4 =", options: ["14", "24", "20", "11"], a: 2, ex: "القوس أولًا: 5 × 4 = 20." },
        { kind: "num", q: "20 − 8 ÷ 2 =", a: 16, ex: "القسمة أولًا: 20 − 4 = 16." },
        { kind: "num", q: "5 × 2 + 10 ÷ 5 =", a: 12, ex: "10 + 2 = 12." },
      ]},
      { id: "f5", icon: "➖", name: "الأعداد السالبة", genDrills: true,
        steps: [
          { k: "teach", h: "تخيّل خط الأعداد", t: "الأعداد السالبة تقع يسار الصفر. تخيّل مسطرة: الجمع يمشي يمينًا، والطرح يمشي يسارًا. هذي الصورة الذهنية تحل معظم أخطاء الإشارات." },
          { k: "example", h: "‏−3 + 7 على الخط", q: "احسب −3 + 7:", steps: ["ابدأ واقفًا على −3", "«+7» يعني امشِ 7 خطوات يمينًا", "من −3: (−2, −1, 0, 1, 2, 3, 4) → توصل 4"], answer: "4" },
          { k: "teach", h: "قاعدتا الإشارات", t: "‏(1) الضرب/القسمة: نفس الإشارتين → موجب، مختلفتان → سالب. (2) طرح سالب = جمع.", ex: "‏−4 × −3 = +12\n5 − (−2) = 5 + 2 = 7" },
          { k: "check", q: "احسب: −4 × −3", options: ["−12", "−7", "12", "7"], a: 2, ex: "سالب × سالب = موجب → 12. الإشارتان متماثلتان فالناتج موجب." },
          { k: "trap", h: "الفخ الأشهر", t: "طرح عدد سالب يقلبه إلى جمع: 5 − (−2) = 7، وليس 3. الإشارتان المتجاورتان (− −) تصيران (+). ركّز على هذا — أكثر خطأ في الأعداد السالبة." },
        ],
        cards: [
        { h: "خط الأعداد", t: "السالب يسار الصفر. −3 + 7 يعني: قف على −3 وامشِ 7 خطوات يمين → توصل 4." },
        { h: "قاعدتا الإشارات", t: "سالب × سالب = موجب. وطرح سالب = جمع: 5 − (−2) = 5 + 2 = 7." },
      ], drills: [
        { q: "−3 + 7 =", options: ["−10", "10", "4", "−4"], a: 2, ex: "من −3 امشِ 7 يمين → 4." },
        { kind: "num", q: "5 − (−2) =", a: 7, ex: "طرح سالب = جمع: 5 + 2." },
        { q: "−4 × −3 =", options: ["−12", "12", "−7", "7"], a: 1, ex: "سالب × سالب = موجب: 12." },
        { q: "−10 ÷ 2 =", options: ["5", "−5", "−20", "8"], a: 1, ex: "إشارة واحدة سالبة → الناتج سالب." },
      ]},
      { id: "f6", icon: "🔤", name: "لبنات الجملة الإنجليزية", genDrills: true,
        steps: [
          { k: "teach", h: "ثلاثة أنواع تفكّ لك نصف الاختبار", t: "أي جملة إنجليزية مبنية من: Noun اسم (cat, Ali, book) • Verb فعل/حدث (run, eat, read) • Adjective صفة تصف (big, happy, fast). تمييزها يساعدك في التناظر وإكمال الجمل والقواعد." },
          { k: "example", h: "اصطد الفعل", q: "في جملة «Ali reads books» — أين الفعل؟", steps: ["الفعل هو الحدث/الفعل نفسه", "‏Ali اسم (فاعل)، books اسم (مفعول)", "‏reads = يقرأ → هو الفعل"], answer: "reads" },
          { k: "check", q: "كلمة «beautiful» نوعها:", options: ["noun اسم", "verb فعل", "adjective صفة", "name"], a: 2, ex: "«جميل» تصف شيئًا، فهي صفة adjective." },
          { k: "trap", h: "ترتيب الجملة الإنجليزية", t: "الترتيب: فاعل + فعل + مفعول. «She eats apples» ✓ لكن «Eats she apples» ✗. الإنجليزية صارمة في الترتيب على عكس العربية." },
        ],
        cards: [
        { h: "ثلاثة أنواع تحل لك نص الاختبار", t: "Noun اسم (cat, Ali, book) • Verb فعل (run, eat, read) • Adjective صفة (big, happy, fast)." },
        { h: "بنية الجملة", t: "الإنجليزية تمشي: فاعل + فعل + مفعول. Ali reads books = علي(فاعل) يقرأ(فعل) كتبًا(مفعول).", ex: "She eats apples ✓   |   Eats she apples ✗" },
      ], drills: [
        { q: "'cat' is a:", options: ["verb", "noun", "adjective", "sentence"], a: 1, ex: "القطة اسم شيء → noun." },
        { q: "In 'Ali reads books', the verb is:", options: ["Ali", "books", "reads", "in"], a: 2, ex: "الفعل هو الحدث: reads = يقرأ." },
        { q: "'beautiful' is a(n):", options: ["noun", "verb", "adjective", "name"], a: 2, ex: "تصف شيئًا (جميل) → صفة." },
        { q: "Which sentence is correct?", options: ["Eats she apples", "She apples eats", "She eats apples", "Apples she eats"], a: 2, ex: "فاعل + فعل + مفعول." },
      ]},
      { id: "f7", icon: "⏳", name: "الزمنان الأساسيان", genDrills: true,
        steps: [
          { k: "teach", h: "المضارع البسيط — للعادات", t: "يُستخدم للأشياء المتكررة/الحقائق. القاعدة الذهبية: مع He / She / It أضِف s للفعل.", ex: "I play — He plays\nThey go — She goes" },
          { k: "teach", h: "الماضي البسيط — لما انتهى", t: "لأحداث حصلت وانتهت. أضِف ed لأغلب الأفعال (watch → watched). لكن أفعالًا شائعة «شاذة» تُحفظ:", ex: "go → went • eat → ate • see → saw • buy → bought" },
          { k: "example", h: "اختر الزمن من الدليل", q: "Yesterday she ___ TV. (watch)", steps: ["كلمة الدليل: Yesterday = أمس → ماضٍ", "watch فعل عادي فنضيف ed", "→ watched"], answer: "watched" },
          { k: "check", q: "I ___ pizza last night.", options: ["eat", "eats", "ate", "eaten"], a: 2, ex: "last night = ماضٍ، وeat فعل شاذ ماضيه ate (ليس eated)." },
          { k: "trap", h: "الأفعال الشاذة لا تأخذ ed", t: "«eated» و«goed» أخطاء! الأفعال الشاذة لها صيغة ماضٍ خاصة تُحفظ: ate, went, saw… ابحث عن كلمات الزمن (yesterday, every day, now) لتحديد الزمن أولًا." },
        ],
        cards: [
        { h: "المضارع البسيط", t: "للعادات اليومية. مع He/She/It أضف s للفعل: He plays every day." },
        { h: "الماضي البسيط", t: "لأحداث انتهت. أضف ed (watched) — وبعض الأفعال شاذة تُحفظ: go→went, eat→ate, see→saw.", ex: "Yesterday I went to the market." },
      ], drills: [
        { q: "He ___ to school every day.", options: ["go", "goes", "going", "went"], a: 1, ex: "عادة يومية + He → المضارع مع s." },
        { q: "Yesterday she ___ TV.", options: ["watch", "watches", "watched", "watching"], a: 2, ex: "Yesterday = ماضٍ → watched." },
        { q: "I ___ pizza last night.", options: ["eat", "eats", "ate", "eaten"], a: 2, ex: "eat فعل شاذ: ماضيه ate." },
        { q: "They ___ happy now.", options: ["is", "are", "was", "be"], a: 1, ex: "They + الآن → are." },
      ]},
      { id: "f8", icon: "🗝️", name: "مفردات البداية", genDrills: true,
        steps: [
          { k: "teach", h: "لا تحفظ ترجمة جافّة — اربط بصورة", t: "الكلمة المرتبطة بصورة ذهنية تثبت أضعاف الترجمة المجرّدة. تخيّل مشهدًا لكل كلمة، والمشهد يستدعيها لك يوم الاختبار." },
          { k: "example", h: "كيف تبني الصورة", q: "كيف نثبّت كلمة «scarce» (نادر)؟", steps: ["تخيّل مشهدًا حيًّا: صحراء قاحلة", "وآخر قطرة ماء في قارورة", "«الماء scarce» — الصورة تلتصق بالذهن أقوى من كلمة «نادر»"], answer: "scarce = نادر" },
          { k: "check", q: "كلمة «buy» تعني:", options: ["يبيع", "يأخذ", "يشتري", "يدفع"], a: 2, ex: "buy = يشتري (المشتري). البائع يقول sell — لا تخلط بينهما." },
          { k: "trap", h: "احذر الكلمات المتقاربة", t: "buy/sell، borrow/lend، teach/learn — أزواج متعاكسة يسهل خلطها. اربط كل واحدة بدورها في مشهد (مشترٍ مقابل بائع) لتفرّقها بثقة." },
        ],
        cards: [
        { h: "استراتيجية الربط", t: "اربط كل كلمة بصورة: scarce = آخر قطرة ماء بالصحراء. الصورة تثبت أضعاف الترجمة الجافة." },
      ], drills: [
        { q: "'big' تعني:", options: ["صغير", "كبير", "سريع", "بطيء"], a: 1, ex: "big = كبير. عكسها small." },
        { q: "'buy' تعني:", options: ["يبيع", "يأخذ", "يشتري", "يدفع"], a: 2, ex: "buy = يشتري. البائع يقول sell." },
        { q: "'fast' تعني:", options: ["سريع", "قوي", "بعيد", "أول"], a: 0, ex: "fast = سريع، مثل fast food." },
        { q: "'happy' تعني:", options: ["حزين", "جائع", "سعيد", "متعب"], a: 2, ex: "happy = سعيد. عكسها sad." },
      ]},
    ],
  },
  S: {
    id: "S", name: "المرحلة الثانية: بناء المهارات", icon: "🔨", color: "#3B82C4",
    desc: "مسائل بسيطة بشرح وتطبيق حتى الإتقان",
    units: [
      { id: "s1", icon: "٪", name: "النسبة المئوية خطوة بخطوة", genDrills: true,
        steps: [
          { k: "teach", h: "سلاحك السري: حيلة الـ10%", t: "‏10% من أي عدد = حرّك فاصلته خانة واحدة لليسار. 10% من 90 = 9. من هذي الحيلة تبني كل شيء بسرعة: 20% = ضعفها، 5% = نصفها، 30% = ثلاثة أضعافها." },
          { k: "example", h: "‏15% من 200 ذهنيًا", q: "احسب 15% من 200 بدون آلة:", steps: ["‏10% من 200 = 20 (حرّك الفاصلة)", "‏5% = نصف الـ10% = 10", "‏15% = 20 + 10 = 30"], answer: "30" },
          { k: "check", q: "احسب 25% من 80:", options: ["15", "20", "25", "40"], a: 1, ex: "‏25% = الربع، و80 ÷ 4 = 20. (أو: 10%+10%+5% = 8+8+4 = 20.)" },
          { k: "trap", h: "النسبة «من» تعني ضرب", t: "«‏15% of 200» تعني (15 ÷ 100) × 200. لا تجمع ولا تطرح النسبة من العدد — النسبة «من» شيءٍ دائمًا تعني الضرب." },
        ],
        cards: [
        { h: "سلاحك: حيلة الـ10%", t: "10% من أي عدد = حرّك فاصلته خانة لليسار. 10% من 90 = 9. ومنها تبني كل شي: 20% = ضعفها، 5% = نصفها." },
        { h: "القانون العام", t: "النسبة من عدد = (النسبة ÷ 100) × العدد.", ex: "15% of 200 = 0.15 × 200 = 30" },
      ], drills: [
        { kind: "num", q: "10% of 90 =", a: 9, ex: "حرّك الفاصلة: 90 → 9." },
        { kind: "num", q: "20% of 50 =", a: 10, ex: "10% = 5، والضعف = 10." },
        { q: "25% of 80 =", options: ["15", "25", "20", "40"], a: 2, ex: "25% = الربع: 80 ÷ 4 = 20." },
        { kind: "num", q: "15% of 200 =", a: 30, ex: "10% = 20 + 5% = 10 → 30." },
      ]},
      { id: "s2", icon: "⚖️", name: "معادلة من خطوة واحدة", genDrills: true,
        steps: [
          { k: "teach", h: "المعادلة ميزان", t: "علامة «=» تعني أن الطرفين متساويان تمامًا كميزان متوازن. أي شيء تفعله بطرف، افعله بالطرف الآخر، فيبقى متوازنًا — هذي روح حل المعادلات كلها." },
          { k: "example", h: "اعزل x بعكس العملية", q: "حل: x + 5 = 12", steps: ["‏x مضاف له 5؛ عكس الجمع هو الطرح", "اطرح 5 من الطرفين: x + 5 − 5 = 12 − 5", "‏x = 7"], answer: "7" },
          { k: "check", q: "حل: 3x = 21", options: ["x = 18", "x = 24", "x = 7", "x = 63"], a: 2, ex: "‏x مضروب في 3؛ عكس الضرب القسمة: اقسم الطرفين على 3 → x = 7." },
          { k: "trap", h: "اعكس العملية الصحيحة", t: "لعزل x استخدم العملية العكسية: جمع↔طرح، ضرب↔قسمة. الخطأ الشائع: عند 3x = 21 يطرح البعض 3 بدل القسمة. x مضروب فاقسم." },
        ],
        cards: [
        { h: "المعادلة ميزان", t: "أي شي تسويه لطرف، سوّه للطرف الثاني، ويظل الميزان متوازنًا." },
        { h: "اعزل x بعكس العملية", t: "x + 5 = 12؟ اطرح 5 من الطرفين → x = 7. جمع↔طرح، ضرب↔قسمة.", ex: "3x = 21 → ÷3 → x = 7" },
      ], drills: [
        { q: "x + 5 = 12 → x =", options: ["17", "7", "5", "8"], a: 1, ex: "اطرح 5: x = 12 − 5." },
        { q: "x − 4 = 9 → x =", options: ["5", "36", "13", "6"], a: 2, ex: "أضف 4: x = 13." },
        { kind: "num", q: "3x = 21 → x =", a: 7, ex: "اقسم على 3." },
        { kind: "num", q: "x ÷ 2 = 6 → x =", a: 12, ex: "اضرب في 2." },
      ]},
      { id: "s3", icon: "📐", name: "الأشكال الأساسية", genDrills: true,
        steps: [
          { k: "teach", h: "محيط أم مساحة؟", t: "المحيط = المشي حول الشكل (اجمع الأضلاع، وحدته طول). المساحة = كم بلاطة تملأ داخله (وحدتها مربّعة). التمييز بينهما يمنع أشهر أخطاء الهندسة." },
          { k: "teach", h: "قوانين البداية", t: "مستطيل: مساحة = طول × عرض. مربع: ضلع × ضلع. مثلث: ½ × قاعدة × ارتفاع.", ex: "مستطيل 5×3 → مساحة = 15، محيط = 2×(5+3) = 16" },
          { k: "example", h: "مساحة مثلث", q: "مثلث قاعدته 8 وارتفاعه 3 — مساحته؟", steps: ["قانون المثلث: ½ × القاعدة × الارتفاع", "= ½ × 8 × 3", "= ½ × 24 = 12"], answer: "12" },
          { k: "check", q: "مستطيل 5 × 3 — ما مساحته؟", options: ["8", "15", "16", "30"], a: 1, ex: "المساحة = طول × عرض = 5 × 3 = 15. (لاحظ: 16 هو المحيط — لا تخلط.)" },
          { k: "trap", h: "لا تنسَ نصف المثلث", t: "مساحة المثلث فيها ½. من ينسى النصف يحصل على ضعف الجواب (24 بدل 12). المستطيل بلا نصف، المثلث بنصف — احفظ الفرق." },
        ],
        cards: [
        { h: "المحيط والمساحة", t: "المحيط = المشي حول الشكل (اجمع الأضلاع). المساحة = كم بلاطة تغطيه من الداخل." },
        { h: "قوانين البداية", t: "مستطيل: المساحة = طول × عرض. مربع: ضلع × ضلع. مثلث: ½ × قاعدة × ارتفاع.", ex: "مستطيل 5×3 → مساحة 15، محيط 16" },
      ], drills: [
        { q: "مستطيل 5 × 3، مساحته =", options: ["8", "16", "15", "30"], a: 2, ex: "5 × 3 = 15." },
        { kind: "num", q: "مربع ضلعه 6، محيطه =", a: 24, ex: "4 أضلاع × 6 = 24." },
        { q: "مثلث قاعدته 8 وارتفاعه 3، مساحته =", options: ["24", "12", "11", "16"], a: 1, ex: "½ × 8 × 3 = 12." },
        { kind: "num", q: "مستطيل محيطه 20 وطوله 6، عرضه =", a: 4, ex: "الطول+العرض = 10 → العرض = 4." },
      ]},
      { id: "s4", icon: "📊", name: "المتوسط ببساطة", genDrills: true,
        steps: [
          { k: "teach", h: "اجمع ثم اقسم", t: "المتوسط (المعدّل) هو «نقطة العدل» بين الأعداد: اجمعها كلها ثم اقسم على عددها. متوسط 4 و 6 = (4+6) ÷ 2 = 5." },
          { k: "example", h: "الجملة السحرية", q: "متوسط 3 أعداد يساوي 7 — ما مجموعها؟", steps: ["اقلب القانون: المجموع = المتوسط × العدد", "= 7 × 3", "= 21"], answer: "21" },
          { k: "check", q: "ما متوسط 10، 20، 30؟", options: ["15", "20", "25", "60"], a: 1, ex: "المجموع = 60، ÷ العدد 3 = 20." },
          { k: "trap", h: "احفظ «المجموع = المتوسط × العدد»", t: "أكثر أسئلة المتوسط تعطيك المتوسط وتطلب عددًا ناقصًا. المفتاح دائمًا: ارجع للمجموع الكلي أولًا (متوسط × عدد)، لا تحاول الحل من الأرقام مباشرة." },
        ],
        cards: [
        { h: "اجمع واقسم", t: "متوسط 4 و 6: المجموع 10 ÷ 2 = 5. المتوسط هو نقطة العدل بين الأعداد." },
        { h: "التحويل السحري", t: "المجموع = المتوسط × العدد. هذي الجملة تحل نص أسئلة المتوسط بالاختبار.", ex: "متوسط 3 أعداد = 7 → مجموعها 21" },
      ], drills: [
        { q: "متوسط 4 و 6 =", options: ["10", "5", "4", "6"], a: 1, ex: "(4+6) ÷ 2." },
        { q: "متوسط 10, 20, 30 =", options: ["60", "15", "20", "25"], a: 2, ex: "المجموع 60 ÷ 3." },
        { kind: "num", q: "متوسط 3 أعداد = 7. مجموعها =", a: 21, ex: "متوسط × عدد = 7 × 3." },
        { q: "متوسط 2, 4, 6, 8 =", options: ["5", "4", "6", "20"], a: 0, ex: "المجموع 20 ÷ 4 = 5." },
      ]},
      { id: "s5", icon: "🔗", name: "التناظر التدريبي", genDrills: true,
        steps: [
          { k: "teach", h: "القاعدة الذهبية للتناظر", t: "لا تنظر للخيارات أولًا! كوّن جملة دقيقة تربط الكلمتين الأصليتين، ثم طبّق نفس الجملة على كل خيار. الخيار الوحيد الذي تنطبق عليه الجملة هو الصحيح." },
          { k: "example", h: "طبّق الجملة", q: "‏HAND : GLOVE :: ؟", steps: ["الجملة الرابطة: «اليد تلبس القفاز»", "طبّقها: هل «الرأس يلبس الشعر»؟ لا. «العين تلبس الرؤية»؟ لا", "«القدم تلبس الجورب» ✓ → foot : sock"], answer: "foot : sock" },
          { k: "check", q: "‏PEN : WRITE :: ؟ (أداة ووظيفتها)", options: ["book : page", "knife : cut", "ink : blue", "paper : white"], a: 1, ex: "القلم أداةٌ وظيفتها الكتابة ↔ السكين أداةٌ وظيفتها القطع." },
          { k: "trap", h: "انتبه لاتجاه العلاقة", t: "‏BIG : SMALL ليست كـ SMALL : BIG. لو كانت جملتك «الجرو صغير الكلب»، فالترتيب مهم: الصغير أولًا. لو انعكس الترتيب في خيار، فهو فخ." },
        ],
        cards: [
        { h: "القاعدة الذهبية", t: "كوّن جملة تربط الكلمتين، ثم طبّقها على الخيارات. HAND : GLOVE → 'اليد تلبس القفاز' → القدم تلبس الجورب." },
        { h: "علاقات البداية", t: "جزء/كل (صفحة:كتاب) • أداة/وظيفة (قلم:كتابة) • صغير/كبير (جرو:كلب)." },
      ], drills: [
        { q: "HAND : GLOVE ::", options: ["foot : sock", "head : hair", "eye : see", "arm : long"], a: 0, ex: "اليد تلبس القفاز ↔ القدم تلبس الجورب." },
        { q: "PEN : WRITE ::", options: ["book : page", "knife : cut", "paper : white", "ink : blue"], a: 1, ex: "أداة ووظيفتها: السكين للقطع." },
        { q: "PUPPY : DOG ::", options: ["cat : animal", "bird : fly", "kitten : cat", "lion : jungle"], a: 2, ex: "صغير الكلب جرو ↔ صغير القط هريرة." },
      ]},
      { id: "s6", icon: "✍️", name: "إكمال الجمل بإشارات واضحة", genDrills: true,
        steps: [
          { k: "teach", h: "كلمات الإشارة توجّهك", t: "كل جملة فيها «كلمة إشارة» تكشف اتجاه المعنى: but = عكس/تضاد • because = سبب • so = نتيجة. اصطد هذي الكلمة أولًا، فهي البوصلة." },
          { k: "example", h: "توقّع قبل الخيارات", q: "It was raining, ___ we stayed home.", steps: ["الإشارة المطلوبة: علاقة «المطر» بـ«البقاء في البيت»", "المطر سبب، والبقاء نتيجة منطقية", "نتيجة → so"], answer: "so" },
          { k: "check", q: "The test was hard, ___ he passed.", options: ["so", "because", "but", "and"], a: 2, ex: "«صعب» ثم «نجح» = مفاجأة/تضاد → but. لو كانت so لتوقعنا أنه رسب." },
          { k: "trap", h: "لا تخلط so بـ because", t: "so تُدخل النتيجة، because تُدخل السبب. «تعب so نام» صحيح، «تعب because نام» خطأ منطقي. حدّد: أيهما السبب وأيهما النتيجة قبل الاختيار." },
        ],
        cards: [
        { h: "ثلاث إشارات تكفيك الآن", t: "but = عكس الاتجاه • because = السبب • so = النتيجة." },
        { h: "طريقة الحل", t: "اقرأ، حدد الإشارة، توقّع المعنى قبل الخيارات.", ex: "It was raining, SO we stayed home (نتيجة منطقية)" },
      ], drills: [
        { q: "It was raining, ___ we stayed home.", options: ["but", "so", "because", "or"], a: 1, ex: "المطر سبب والبقاء نتيجة → so." },
        { q: "She is tired ___ she worked all day.", options: ["because", "but", "so", "if"], a: 0, ex: "شغل اليوم كله هو السبب → because." },
        { q: "The test was hard, ___ he passed.", options: ["so", "because", "but", "and"], a: 2, ex: "صعب لكنه نجح = تضاد → but." },
      ]},
    ],
  },
  Q: {    id: "Q", name: "المرحلة الثالثة: القدرات", icon: "🧭", color: "#C89235",
    desc: "استراتيجيات الحل وإدارة الوقت — ثم ميدانك: معارك العالم",
    units: [
      { id: "q1", icon: "⏱", name: "إدارة وقت الاختبار",
        steps: [
          { k: "teach", h: "قاعدة الدقيقة", t: "متوسط وقتك دقيقة واحدة لكل سؤال. لو التزمت بها، تنهي القسم وتبقى لك دقائق للمراجعة. السؤال الذي يبتلع وقتك هو عدوّك الحقيقي، لا صعوبة السؤال." },
          { k: "teach", h: "لا تترك فراغًا أبدًا", t: "اختبار القدرات بلا درجات سالبة — التخمين لا يضرّك أبدًا. الورقة الفاضية هي الخسارة الوحيدة المضمونة. خمّن على كل ما تتركه ولو في الثانية الأخيرة." },
          { k: "check", q: "صرفت دقيقتين على سؤال ولم تحلّه. الأذكى:", options: ["أكمل حتى أحله مهما طال", "أتركه فارغًا وأنسحب", "أحذف خيارين، أخمّن، أعلّمه وأكمل", "أغيّر إجاباتي السابقة"], a: 2, ex: "التخمين بعد الحذف يعطيك ~50% بدل 0%، والوقت المُنقَذ يربح لك أسئلة كاملة قادمة." },
          { k: "trap", h: "لا تكابر، وابدأ بقوّتك", t: "الإصرار على سؤال واحد يضيّع خمسة غيره. علّمه وارجع له آخِرًا. ونصيحة: افتح بالقسم الذي دقّتك فيه أعلى (شف 📊) — الثقة المبكرة وقود لبقية الاختبار." },
        ],
        cards: [
        { h: "قاعدة الدقيقة", t: "متوسطك دقيقة للسؤال. سؤال أخذ دقيقتين بلا حل؟ لا تكابر: احذف خيارين، خمّن بذكاء، علّمه وارجع له بالنهاية." },
        { h: "لا تترك فراغًا أبدًا", t: "الاختبار بلا درجات سالبة — الورقة الفاضية هي الخسارة الوحيدة المضمونة." },
        { h: "ابدأ بقوتك", t: "افتح بالقسم اللي دقتك فيه أعلى (شف 📊 إحصائياتك). الثقة المبكرة وقود بقية الاختبار." },
      ], drills: [
        { q: "صرفت دقيقتين على سؤال ولم تحله. الأفضل:", options: ["أكمل حتى أحله مهما طال", "أتركه فارغًا وأنسحب", "أحذف خيارين وأخمّن وأعلّمه", "أغيّر إجابات سابقة"], a: 2, ex: "التخمين الذكي بعد الحذف يعطيك 50% فرصة بدل 0% — والوقت المُنقَذ يربح أسئلة كاملة." },
        { q: "بقي 3 أسئلة ودقيقة واحدة. تفعل:", options: ["أحل الأول بتأنٍ وأترك الباقي", "أخمّن الثلاثة بسرعة بعد حذف الواضح", "أسلّم فورًا", "أعيد مراجعة القسم الأول"], a: 1, ex: "ثلاث تخمينات = ثلاث فرص. سؤال متقَن + فراغان = فرصة واحدة." },
      ]},
      { id: "q2", icon: "✂️", name: "فن الحذف الذكي",
        steps: [
          { k: "teach", h: "استبعد قبل أن تختار", t: "في كل سؤال غالبًا خياران واضحا الخطأ (رقم أكبر من المنطقي، إشارة معكوسة، قيمة خارج المدى). احذفهما أولًا، فتقفز فرصتك من 25% إلى 50% حتى لو خمّنت الباقي." },
          { k: "example", h: "احذف بالمنطق قبل الحساب", q: "متوسط عددين هما 10 و20 — أي خيار تحذفه فورًا؟ (15، 14، 40، 16)", steps: ["المتوسط يقع دائمًا بين أصغر وأكبر قيمة", "أي بين 10 و20", "40 خارج المدى تمامًا → احذفه بلا حساب"], answer: "احذف 40" },
          { k: "check", q: "Quantity A: 5 + 3   |   Quantity B: 4 × 2 — أي خيار تحذفه فورًا؟", options: ["A greater", "B greater", "Equal", "Cannot be determined"], a: 3, ex: "أرقام صريحة بلا متغيّرات → التحديد ممكن دائمًا، فـ«Cannot be determined» مستحيل هنا (وهما متساويان: 8 = 8)." },
          { k: "trap", h: "متى تحذف «لا يمكن التحديد»", t: "في المقارنات: إن كانت الكميتان أرقامًا صريحة بلا أي متغيّر، فـ«لا يمكن التحديد» خطأ دائمًا — احذفه فورًا. لكن إن وُجد متغيّر حر، فقد يكون هو الصحيح." },
        ],
        cards: [
        { h: "الاستبعاد قبل الاختيار", t: "غالبًا خياران واضحا الخطأ (أكبر من المنطقي، إشارة غلط، خارج المدى). احذفهما وستتضاعف فرصتك حتى لو خمّنت." },
        { h: "بالمقارنات", t: "جرّب أرقامًا مختلفة الأنواع. وإذا كانت الكميتان أرقامًا صريحة بلا متغير، احذف (لا يمكن التحديد) فورًا." },
      ], drills: [
        { q: "متوسط عددين هما 10 و 20. أي خيار تحذفه فورًا؟", options: ["15", "14", "40", "16"], a: 2, ex: "المتوسط مستحيل يتجاوز أكبر العددين — 40 خارج المدى منطقيًا." },
        { q: "Quantity A: 5 + 3   Quantity B: 4 × 2. أي خيار تحذفه فورًا؟", options: ["A greater", "B greater", "Equal", "Cannot be determined"], a: 3, ex: "أرقام صريحة بلا متغيرات → التحديد ممكن دائمًا. (وهما متساويان: 8 = 8)." },
      ]},
      { id: "q3", icon: "🗺️", name: "خريطة الاختبار وأنماطه",
        steps: [
          { k: "teach", h: "ماذا تتوقّع يوم الاختبار", t: "قسمان رئيسيان: كمّي (حساب، جبر، هندسة، مقارنات، تحليل بيانات) ولفظي (تناظر، إكمال جمل، خطأ سياقي، استيعاب مقروء). محوسب غالبًا، والوقت محسوب لكل قسم على حدة — لهذا تدرّبت على المؤقّت." },
          { k: "teach", h: "العالم كله قاعة تدريبك", t: "كل معارك العالم — من وحش الكسل إلى زعماء الفصول — أسئلة قدرات فعلية بنمط الاختبار. المدرب 🦉 يوجّهك، والإحصائيات 📊 بوصلتك لأضعف أقسامك." },
          { k: "check", q: "أفضل ترتيب لرحلتك في هذه الأكاديمية:", options: ["حفظ أسئلة بلا فهم", "أساس متين ← مهارة ← متقدّم ← استراتيجية ← محاكاة", "محاكاة فقط من اليوم الأول", "لفظي فقط وإهمال الكمّي"], a: 1, ex: "هذا بالضبط تسلسل المراحل الذي تمشي فيه: تبني الأساس، تضيف المهارة والمواضيع المتقدّمة، ثم الاستراتيجية فالمحاكاة." },
          { k: "trap", h: "التوازن ثم المحاكاة", t: "لا تُهمل قسمًا لأنه أصعب — الدرجة مجموع القسمين. وازِن ضعفك أولًا (شف 📊)، واترك المحاكاة الكاملة لما تبني الأساس، لا من اليوم الأول." },
        ],
        cards: [
        { h: "وش تتوقع يوم الاختبار", t: "قسمان: كمي (حساب، جبر، هندسة، مقارنات، تحليل بيانات) ولفظي إنجليزي (تناظر، إكمال جمل، استيعاب مقروء). محوسب، والوقت محسوب لكل قسم." },
        { h: "ميدان تدريبك الحقيقي", t: "كل معارك العالم — من وحش الكسل إلى زعماء الفصول — هي أسئلة قدرات فعلية بنمط الاختبار. العالم كله صار قاعة تدريبك. المدرب 🦉 يوجهك، والإحصائيات 📊 بوصلتك." },
      ], drills: [
        { q: "أفضل ترتيب لمذاكرتك حسب هذه الأكاديمية:", options: ["حفظ أسئلة بدون فهم", "أساس متين ← مهارة ← استراتيجية ← محاكاة", "محاكاة فقط من اليوم الأول", "لفظي فقط وإهمال الكمي"], a: 1, ex: "هذا بالضبط تسلسل المراحل الأربع اللي تمشي فيه الآن." },
      ]},
    ],
  },
  P: {
    id: "P", name: "المرحلة الرابعة: الاحتراف", icon: "🥇", color: "#B3402F",
    desc: "محاكاة يوم الاختبار الحقيقي وتحليل دقيق لأدائك",
    units: [
      { id: "p1", icon: "🎭", name: "محاكاة يوم الاختبار", sim: { n: 12, time: 30, hard: false }, cards: [
        { h: "قوانين المحاكاة", t: "12 سؤالًا من كل الأقسام • 30 ثانية للسؤال • بلا تلميحات، بلا تجميد، بلا قلوب — مثل القاعة الحقيقية بالضبط. بالنهاية: تقرير تحليلي ودرجة تقديرية." },
      ]},
      { id: "p2", icon: "🏅", name: "تحدي الصفوة", sim: { n: 10, time: 22, hard: true }, cards: [
        { h: "فوق مستوى الاختبار", t: "10 أسئلة بـ22 ثانية فقط. إذا تنفست هنا، قاعة قياس بتحس لك ببطء الحركة. للمحترفين فقط." },
      ]},
    ],
  },
  C: {
  id: "C", name: "Aramco Track: CPC Preparation", icon: "🏭", color: "#8C4A2F",
  desc: "سرعة ذهنية، منطق، قراءة سريعة — بنمط اختبارات قبول أرامكو",
  units: [
    { id: "c1", icon: "🧮", name: "الرياضيات الذهنية (بلا آلة حاسبة)", cards: [
      { h: "قاعدة CPC الأولى", t: "لا آلة حاسبة أبدًا. سلاحك التفكيك: 47 × 6 = (40×6) + (7×6) = 240 + 42 = 282." },
      { h: "التقريب ثم التصحيح", t: "398 + 267؟ قرّب: 400 + 267 = 667 ثم اطرح 2 = 665. أسرع وأدق من الجمع العمودي الذهني.", ex: "99 × 7 = 700 − 7 = 693" },
      { h: "حيلة ×11 و×25", t: "×11: 34×11 = 3(3+4)4 = 374. ×25: اقسم على 4 ثم ×100: 36×25 = 9×100 = 900." },
    ], drills: [
      { kind: "num", q: "47 × 6 =", a: 282, ex: "(40×6)+(7×6) = 240+42." },
      { kind: "num", q: "398 + 267 =", a: 665, ex: "400+267 = 667 ثم −2." },
      { kind: "num", q: "36 × 25 =", a: 900, ex: "36÷4 = 9 ثم ×100." },
      { kind: "num", q: "72 × 11 =", a: 792, ex: "7(7+2)2 = 792." },
      { kind: "num", q: "840 ÷ 12 =", a: 70, ex: "84÷12 = 7 ثم ×10." },
    ]},
    { id: "c2", icon: "🧩", name: "التفكير المنطقي", cards: [
      { h: "متتابعات الأنماط", t: "اسأل دائمًا: ما الفرق بين كل حدين؟ ثابت؟ متضاعف؟ متزايد؟ 2, 6, 18, 54 → كل حد ×3." },
      { h: "الشاذ بينها", t: "دوّر الخاصية المشتركة أولًا، والعنصر الذي يكسرها هو الجواب." },
    ], drills: [
      { q: "2, 6, 18, 54, ___", options: ["108", "162", "216", "72"], a: 1, ex: "كل حد ×3: 54×3 = 162." },
      { q: "5, 8, 12, 17, ___", options: ["21", "22", "23", "25"], a: 2, ex: "الفروق تتزايد: +3 +4 +5 → +6 = 23." },
      { q: "Which is the odd one out?", options: ["Square", "Triangle", "Circle", "Rectangle"], a: 2, ex: "الدائرة الوحيدة بلا أضلاع مستقيمة." },
      { q: "All engineers are planners. Sami is an engineer. So Sami…", options: ["is not a planner", "is a planner", "may be a planner", "hates planning"], a: 1, ex: "قياس منطقي مباشر: الكل ⊃ سامي." },
      { q: "3, 4, 6, 9, 13, ___", options: ["17", "18", "16", "20"], a: 1, ex: "الفروق +1 +2 +3 +4 → +5 = 18." },
    ]},
    { id: "c3", icon: "⚡", name: "القراءة السريعة الذكية", cards: [
      { h: "اقرأ عناقيد لا كلمات", t: "عينك تلتقط 3-4 كلمات بنظرة واحدة. تدرّب أن تقفز بين العناقيد بدل الزحف كلمة كلمة — سرعتك تتضاعف بلا فقد للفهم." },
      { h: "أوقف الصوت الداخلي", t: "لا تنطق الكلمات في رأسك وأنت تقرأ — عينك أسرع من لسانك الداخلي بثلاث مرات." },
      { h: "أول وآخر جملة", t: "في CPC الوقت خانق: الفكرة تسكن أول جملة وآخر جملة من كل فقرة. ابدأ منهما ثم املأ الوسط عند الحاجة." },
    ], drills: [
      { q: "«Aramco, founded in 1933, discovered oil at Dammam Well No. 7 in 1938 after years of failure.» — Oil was found in:", options: ["1933", "1935", "1938", "1940"], a: 2, ex: "التقاط الرقم المرتبط بـdiscovered لا founded — قراءة انتقائية." },
      { q: "Same text: The years before 1938 were years of:", options: ["success", "failure", "war", "planning"], a: 1, ex: "after years of failure — نص صريح." },
      { q: "أفضل نقطة تبدأ منها عند ضيق الوقت في فقرة طويلة:", options: ["منتصف الفقرة", "أول وآخر جملة", "الأسماء فقط", "الأرقام فقط"], a: 1, ex: "الفكرة الرئيسية تسكنهما غالبًا." },
    ]},
    { id: "c4", icon: "🏭", name: "محاكاة CPC — بوابة أرامكو", sim: { n: 14, time: 20, hard: true, cpc: true }, cards: [
      { h: "قوانين محاكاة CPC", t: "14 سؤالًا مختلطًا (رياضيات + إنجليزي) • 20 ثانية فقط للسؤال • بلا أي مساعدات — أقسى من قياس عمدًا، حتى يصير يوم الاختبار الحقيقي نزهة. بالنهاية تقرير تحليلي كامل." },
    ]},
  ],
},
  PLACEMENT: [
  { q: "8 × 7 =", options: ["54", "56", "63", "49"], a: 1 },
  { q: "بسّط: 10/15", options: ["2/3", "5/10", "1/5", "3/5"], a: 0 },
  { q: "25% of 60 =", options: ["12", "15", "20", "25"], a: 1 },
  { q: "PEN : WRITE ::", options: ["book : paper", "scissors : cut", "table : wood", "fast : slow"], a: 1 },
  { q: "A shirt costs 80 after a 20% discount. Original price =", options: ["96", "100", "104", "120"], a: 1 },
],
});


/* ═══ content/questions-core.js ═══ */
/* ═══ بنك الأسئلة الأساسي — انسخ الملف باسم جديد لإضافة آلاف الأسئلة، المحرك يلتقطه تلقائيًا ═══ */
QQ.registerCore({
  mcq: [
  { sec: "analogy", q: "SEED : PLANT ::", options: ["nest : tree", "egg : bird", "water : river", "leaf : branch"], a: 1, ex: "الأول يتطوّر ليصبح الثاني: البذرة→نبتة، البيضة→طائر." },
  { sec: "analogy", q: "THERMOMETER : TEMPERATURE ::", options: ["clock : wall", "scale : weight", "ruler : pencil", "camera : light"], a: 1, ex: "أداة تقيس شيئًا: الميزان يقيس الوزن." },
  { sec: "analogy", q: "ANONYMOUS : NAME ::", options: ["famous : fans", "silent : sound", "bright : light", "heavy : weight"], a: 1, ex: "خالٍ من: anonymous بلا اسم، silent بلا صوت." },
  { sec: "analogy", q: "DROUGHT : WATER ::", options: ["flood : rain", "famine : food", "storm : wind", "winter : snow"], a: 1, ex: "نقص حاد في: الجفاف نقص ماء، المجاعة نقص طعام." },
  { sec: "analogy", q: "AUTHOR : NOVEL ::", options: ["reader : library", "sculptor : statue", "teacher : school", "singer : stage"], a: 1, ex: "صانع ومنتَجه: النحّات يصنع التمثال." },
  { sec: "analogy", q: "SCISSORS : CUT ::", options: ["hammer : nail", "pen : write", "book : read", "door : open"], a: 1, ex: "أداة ووظيفتها الأساسية: القلم للكتابة." },
  { sec: "sentence", q: "Although the experiment failed, the researchers were not ______; they began a new approach immediately.", options: ["excited", "discouraged", "prepared", "successful"], a: 1, ex: "Although = تضاد: فشلوا لكنهم لم يُحبَطوا." },
  { sec: "sentence", q: "The desert climate is so ______ that only a few adapted plants survive there.", options: ["mild", "pleasant", "harsh", "fertile"], a: 2, ex: "قلة الناجين تدل على مناخ قاسٍ harsh." },
  { sec: "sentence", q: "Her explanation was so ______ that even children could understand it.", options: ["complicated", "lucid", "lengthy", "vague"], a: 1, ex: "lucid = واضح؛ الدليل: حتى الأطفال فهموا." },
  { sec: "sentence", q: "The two studies reached ______ conclusions; one supported the theory while the other rejected it.", options: ["similar", "identical", "contradictory", "expected"], a: 2, ex: "دراسة تؤيد وأخرى ترفض = متناقضة." },
  { sec: "sentence", q: "Because the evidence was ______, the committee postponed its decision until more data arrived.", options: ["conclusive", "insufficient", "abundant", "convincing"], a: 1, ex: "أجّلوا وطلبوا بيانات = الأدلة غير كافية." },
  { sec: "sentence", q: "Despite his ______ schedule, he always finds time to help his colleagues.", options: ["empty", "flexible", "demanding", "boring"], a: 2, ex: "Despite = تضاد: جدول مُرهق لكنه يساعد." },
  { sec: "reading", q: "\"Camels are adapted to desert life. Their humps store fat, not water, converted to energy when food is scarce. Wide padded feet prevent sinking into sand. A camel can lose 25% of its body water — fatal to most mammals.\"\n\nThe main purpose of the passage is to:", options: ["compare camels with other mammals", "describe camel adaptations to the desert", "explain why deserts are dangerous", "argue camels need protection"], a: 1, ex: "كل الجمل تخدم فكرة التكيّف؛ المقارنة تفصيلة داعمة." },
  { sec: "reading", q: "(Same passage)\nA camel's hump stores:", options: ["water", "fat", "sand", "moisture only"], a: 1, ex: "نص صريح: fat, not water — انتبه لفخ الماء." },
  { sec: "reading", q: "(Same passage)\nLosing 25% of body water would cause most mammals to:", options: ["adapt quickly", "store more fat", "die", "sleep longer"], a: 2, ex: "fatal = مميت؛ استنتاج مباشر." },
  { sec: "arithmetic", q: "What is 15% of 240?", options: ["24", "30", "36", "48"], a: 2, ex: "10% = 24، و5% = 12 → 36." },
  { sec: "arithmetic", q: "A shirt costs 80 SAR after a 20% discount. Original price?", options: ["96", "100", "104", "120"], a: 1, ex: "80 = 80% من الأصل → 80 ÷ 0.8 = 100." },
  { sec: "arithmetic", q: "Average of 12, 18, 24, 30?", options: ["20", "21", "22", "24"], a: 1, ex: "متتابعة بفرق ثابت: (12+30)÷2 = 21." },
  { sec: "arithmetic", q: "Two numbers in ratio 3:5 sum to 96. The larger is:", options: ["36", "48", "60", "64"], a: 2, ex: "8 أجزاء، الجزء 12، الأكبر 5×12=60." },
  { sec: "arithmetic", q: "What is 35 × 12?", options: ["380", "400", "420", "460"], a: 2, ex: "35×12 = 35×10 + 35×2 = 350+70 = 420." },
  { sec: "algebra", q: "If 3x − 7 = 14, then x =", options: ["3", "5", "7", "9"], a: 2, ex: "3x = 21 → x = 7." },
  { sec: "algebra", q: "If x + y = 10 and x − y = 4, then xy =", options: ["16", "21", "24", "28"], a: 1, ex: "بالجمع 2x=14 → x=7, y=3 → 21." },
  { sec: "algebra", q: "If 2ⁿ = 32, then n =", options: ["4", "5", "6", "8"], a: 1, ex: "32 = 2⁵." },
  { sec: "algebra", q: "If 5x = 3x + 18, then x =", options: ["6", "9", "12", "18"], a: 1, ex: "2x = 18 → x = 9." },
  { sec: "geometry", q: "Two triangle angles are 65° and 45°. The third is:", options: ["60°", "70°", "80°", "90°"], a: 1, ex: "180 − 110 = 70°." },
  { sec: "geometry", q: "Rectangle: perimeter 36, length 10. Its area is:", options: ["60", "70", "80", "90"], a: 2, ex: "الطول+العرض=18 → العرض 8 → 80." },
  { sec: "geometry", q: "Circle radius 7. Circumference =", options: ["7π", "14π", "49π", "28π"], a: 1, ex: "2πr = 14π (المساحة 49π فخ)." },
  { sec: "geometry", q: "A right triangle has legs 6 and 8. The hypotenuse is:", options: ["9", "10", "12", "14"], a: 1, ex: "ثلاثية (6,8,10) — مضاعف (3,4,5)." },
  { sec: "comparison", q: "Quantity A: 25% of 80\nQuantity B: 80% of 25", options: ["A greater", "B greater", "Equal", "Cannot be determined"], a: 2, ex: "a% من b = b% من a دائمًا = 20." },
  { sec: "comparison", q: "Quantity A: √50\nQuantity B: 7", options: ["A greater", "B greater", "Equal", "Cannot be determined"], a: 0, ex: "7 = √49 → √50 أكبر." },
  { sec: "comparison", q: "x > 0\nQuantity A: (x+1)²\nQuantity B: x² + 1", options: ["A greater", "B greater", "Equal", "Cannot be determined"], a: 0, ex: "الفرق 2x موجب دائمًا." },
  { sec: "data", q: "Sales: Mon 120, Tue 150, Wed 90, Thu 140. Average =", options: ["115", "120", "125", "130"], a: 2, ex: "500 ÷ 4 = 125." },
  { sec: "data", q: "Mon 120 → Tue 150. Percent increase =", options: ["20%", "25%", "30%", "Cannot be found"], a: 1, ex: "30 ÷ 120 = 25% (اقسم على القديم)." },
],
  num: [
  { sec: "arithmetic", q: "12 × 15 =", a: 180, ex: "12×10 + 12×5 = 120 + 60" },
  { sec: "arithmetic", q: "20% of 350 =", a: 70, ex: "10% = 35 → ضعفها" },
  { sec: "arithmetic", q: "Average of 14 and 26 =", a: 20, ex: "(14+26) ÷ 2" },
  { sec: "arithmetic", q: "45 + 38 + 17 =", a: 100, ex: "45+38=83 ثم +17" },
  { sec: "algebra", q: "If 4x = 52, then x =", a: 13, ex: "52 ÷ 4" },
  { sec: "algebra", q: "If x − 9 = 17, then x =", a: 26, ex: "17 + 9" },
  { sec: "geometry", q: "Square with side 9 → Area =", a: 81, ex: "9² = 81" },
  { sec: "geometry", q: "Triangle angles 90° and 35° → third =", a: 55, ex: "180 − 125" },
  { sec: "data", q: "Sales 80, 120, 100 → Total =", a: 300, ex: "جمع مباشر" },
],
  match: [
  { pairs: [["scarce", "نادر"], ["vital", "حيوي"], ["harsh", "قاسٍ"], ["lucid", "واضح"]] },
  { pairs: [["reluctant", "متردد"], ["abundant", "وفير"], ["fragile", "هشّ"], ["vague", "مبهم"]] },
  { pairs: [["enhance", "يعزّز"], ["diminish", "يتضاءل"], ["mitigate", "يخفّف"], ["contradict", "يناقض"]] },
  { pairs: [["inevitable", "حتمي"], ["feasible", "ممكن التنفيذ"], ["obsolete", "قديم"], ["profound", "عميق"]] },
],
  order: [
  { sec: "algebra", title: "رتّب خطوات حل: 3x − 7 = 14", steps: ["أضف 7 للطرفين → 3x = 21", "اقسم على 3 → x = 7", "تحقق: 3(7) − 7 = 14 ✓"] },
  { sec: "arithmetic", title: "رتّب الحل: السعر بعد خصم 20% صار 80. كم الأصلي؟", steps: ["المتبقي بعد الخصم = 80% من الأصل", "الأصل × 0.8 = 80", "الأصل = 80 ÷ 0.8 = 100"] },
  { sec: "geometry", title: "رتّب الحل: مستطيل محيطه 36 وطوله 10. كم مساحته؟", steps: ["الطول + العرض = 36 ÷ 2 = 18", "العرض = 18 − 10 = 8", "المساحة = 10 × 8 = 80"] },
],
  verbalSecs: ["analogy", "sentence", "reading"],
});
/* أسئلة غنية: خطوات + تلميحات + فخوخ + طرق بديلة */
QQ.registerQuestions([
  { topic: "arithmetic", diff: 2, skill: "نسبة التغيّر", est: 45, q: "A price rose from 80 to 100. The percent increase is:", options: ["20%", "25%", "80%", "125%"], a: 1,
    ex: "الفرق 20 ÷ القديمة 80 = 25%.",
    steps: ["احسب الفرق: 100 − 80 = 20", "اقسم على القيمة القديمة: 20 ÷ 80 = 0.25", "حوّل لنسبة: 25%"],
    hints: ["على أي قيمة نقسم الفرق دائمًا؟", "القديمة… اللي بدأنا منها", "20 ÷ 80"],
    traps: { 0: "قسمت الفرق على الجديدة (100) — هذا أشهر فخ في النسب.", 3: "قسمت الجديدة على القديمة وحوّلتها كما هي." },
    alt: "طريقة ثانية: 80→100 يعني كل 4 صارت 5، والزيادة ربع = 25%." },
  { topic: "arithmetic", diff: 3, skill: "خصمان متتاليان", est: 55, q: "A 20% discount followed by a 10% discount equals a single discount of:", options: ["30%", "28%", "32%", "25%"], a: 1,
    ex: "المتبقي 0.8 × 0.9 = 0.72 → الخصم 28%.",
    steps: ["بعد 20%: يبقى 80%", "بعد 10% من الجديد: 0.8 × 0.9 = 0.72", "المتبقي 72% → الخصم الكلي 28%"],
    hints: ["هل الخصومات تُجمع مباشرة؟", "اضرب النِسَب المتبقية لا المخصومة", "0.8 × 0.9"],
    traps: { 0: "جمعت الخصمين مباشرة — الخصم الثاني يقع على سعر أصغر." },
    alt: "جرّب بـ100: بعد 20% ← 80، بعد 10% ← 72. خصمت 28." },
  { topic: "arithmetic", diff: 1, skill: "نسبة من عدد", est: 30, q: "30% of 90 =", options: ["18", "27", "30", "63"], a: 1,
    ex: "10% = 9 → ×3 = 27.", steps: ["10% من 90 = 9", "30% = ثلاثة أعشار = 9 × 3 = 27"], hints: ["ابدأ بحيلة الـ10%", "9 × 3"], traps: { 0: "حسبت 20%." } },
  { topic: "arithmetic", diff: 2, skill: "الرجوع للأصل", est: 50, q: "After a 25% discount, a bag costs 60 SAR. The original price was:", options: ["75", "80", "85", "90"], a: 1,
    ex: "60 = 75% من الأصل → 60 ÷ 0.75 = 80.",
    steps: ["المتبقي بعد الخصم = 75%", "الأصل × 0.75 = 60", "الأصل = 60 ÷ 0.75 = 80"],
    hints: ["60 يمثل كم % من الأصل؟", "اقسم على النسبة المتبقية", "60 ÷ 0.75"],
    traps: { 0: "أضفت 25% على 60 — الخصم يُحسب من الأصل لا من السعر النهائي." },
    alt: "طريقة الأرباع: 60 = ثلاثة أرباع → الربع 20 → الأصل 80." },
  { topic: "algebra", diff: 2, skill: "معادلتان", est: 55, q: "If 2x + y = 11 and y = 3, then x =", options: ["3", "4", "7", "8"], a: 1,
    ex: "عوّض: 2x + 3 = 11 → x = 4.", steps: ["عوّض y = 3", "2x = 8", "x = 4"], hints: ["عوّض قيمة y مباشرة", "2x = 11 − 3"], traps: { 2: "نسيت القسمة على 2." } },
  { topic: "algebra", diff: 3, skill: "قوى", est: 50, q: "If 3ⁿ⁺¹ = 81, then n =", options: ["2", "3", "4", "27"], a: 1,
    ex: "81 = 3⁴ → n+1 = 4 → n = 3.", steps: ["اكتب 81 كقوة لـ3: 3⁴", "ساوِ الأسس: n + 1 = 4", "n = 3"], hints: ["81 = 3 مضروبة كم مرة؟", "ساوِ الأسس"], traps: { 2: "هذا n+1 وليس n." } },
  { topic: "algebra", diff: 1, skill: "معادلة خطوة", est: 30, q: "If x − 7 = 15, then x =", options: ["8", "22", "21", "23"], a: 1,
    ex: "x = 15 + 7 = 22.", steps: ["انقل 7 بعكس إشارتها", "x = 22"], hints: ["عكس الطرح جمع"], traps: { 0: "طرحت بدل الجمع." } },
  { topic: "geometry", diff: 2, skill: "زوايا متوازيات", est: 50, q: "Two angles on a straight line: one is 3x, the other is 60°. x =", options: ["30", "40", "60", "120"], a: 1,
    ex: "3x + 60 = 180 → x = 40.", steps: ["الزاويتان على مستقيم مجموعهما 180°", "3x = 120", "x = 40"], hints: ["كم مجموع زاويتين على خط مستقيم؟", "3x = 180 − 60"], traps: { 0: "قسمت 90 بدل 120 — ليست زاوية قائمة." } },
  { topic: "geometry", diff: 3, skill: "مساحة مركبة", est: 60, q: "A square of side 10 has a circle of radius 5 inside it. The area OUTSIDE the circle ≈ (π≈3.14):", options: ["21.5", "78.5", "100", "31.4"], a: 0,
    ex: "100 − 78.5 = 21.5.", steps: ["مساحة المربع = 100", "مساحة الدائرة = πr² = 78.5", "المطلوب خارج الدائرة: 100 − 78.5 = 21.5"], hints: ["المطلوب فرق مساحتين", "مربع − دائرة"], traps: { 1: "هذي مساحة الدائرة نفسها — اقرأ OUTSIDE.", 3: "هذا محيط الدائرة لا مساحتها." } },
  { topic: "geometry", diff: 1, skill: "محيط", est: 35, q: "Perimeter of a square with side 7 =", options: ["14", "21", "28", "49"], a: 2,
    ex: "4 × 7 = 28.", steps: ["المربع 4 أضلاع متساوية", "4 × 7 = 28"], hints: ["كم ضلعًا للمربع؟"], traps: { 3: "هذي المساحة (7²) لا المحيط." } },
  { topic: "comparison", diff: 2, skill: "تعويض", est: 45, q: "0 < x < 1\nQuantity A: x²\nQuantity B: x", options: ["A greater", "B greater", "Equal", "Cannot be determined"], a: 1,
    ex: "تربيع كسر يصغّره: (½)² = ¼ < ½.", steps: ["x كسر بين 0 و1", "جرّب ½: A = ¼، B = ½", "B أكبر دائمًا في هذا المدى"], hints: ["جرّب x = ½", "التربيع يكبّر ولا يصغّر الكسور؟"], traps: { 0: "قست على الأعداد الأكبر من 1 — هنا المدى كسور فقط." } },
  { topic: "comparison", diff: 3, skill: "متغيران", est: 50, q: "x + y = 10\nQuantity A: x\nQuantity B: 5", options: ["A greater", "B greater", "Equal", "Cannot be determined"], a: 3,
    ex: "x قد تكون 2 أو 8 — النتيجة تتغير.", steps: ["جرّب x=2,y=8 → B أكبر", "جرّب x=8,y=2 → A أكبر", "تغيّرت النتيجة → لا يمكن التحديد"], hints: ["هل x محددة بقيمة واحدة؟", "جرّب توزيعين مختلفين"], traps: { 2: "افترضت أنهما متساويان — المعطى لا يقول ذلك." } },
  { topic: "data", diff: 2, skill: "قراءة جدول", est: 55, q: "Units sold: A=40, B=60, C=100. B's share of total =", options: ["25%", "30%", "40%", "60%"], a: 1,
    ex: "60 ÷ 200 = 30%.", steps: ["المجموع = 200", "حصة B = 60 ÷ 200", "= 30%"], hints: ["اجمع الكل أولًا", "60 من 200"], traps: { 3: "قارنت B بنفسها لا بالمجموع." } },
  { topic: "data", diff: 3, skill: "أكبر تغيّر نسبي", est: 60, q: "Jan→Feb: A went 20→30, B went 100→115. Which grew more IN PERCENT?", options: ["A", "B", "Equal", "Cannot say"], a: 0,
    ex: "A: 50% مقابل B: 15%.", steps: ["A: 10÷20 = 50%", "B: 15÷100 = 15%", "النسبي مع A رغم أن المطلق مع B"], hints: ["النسبة تُقسم على قيمة البداية", "قارن 10/20 بـ 15/100"], traps: { 1: "هذي أكبر زيادة مطلقة — السؤال عن النسبة." } },
  { topic: "analogy", diff: 2, skill: "سبب ونتيجة", est: 35, q: "SPARK : FIRE ::", options: ["smoke : ash", "seed : tree", "water : ice", "wind : storm"], a: 1,
    ex: "شرارة صغيرة تُنتج نارًا ↔ بذرة صغيرة تُنتج شجرة.", steps: ["الجملة: «الأول الصغير يؤدي إلى الثاني الكبير»", "طبّقها: البذرة → شجرة ✓"], hints: ["كوّن جملة العلاقة أولًا", "شيء صغير يقود لكبير"], traps: { 0: "الدخان نتيجة للنار لا سببًا." } },
  { topic: "analogy", diff: 3, skill: "تدرّج شدة", est: 40, q: "WHISPER : SHOUT ::", options: ["walk : run", "glance : stare", "drizzle : downpour", "talk : speak"], a: 2,
    ex: "همس→صراخ = رذاذ→هطول غزير (نفس الفعل بشدة أعلى).", steps: ["العلاقة: نفس الفعل بدرجة أقوى بكثير", "drizzle مطر خفيف وdownpour غزير ✓"], hints: ["الفرق درجة لا نوع", "أيهما (خفيف→عنيف)؟"], traps: { 1: "glance/stare عن المدة لا الشدة الصوتية — قريبة لكن أضعف تطابقًا." } },
  { topic: "analogy", diff: 1, skill: "أداة/وظيفة", est: 30, q: "KEY : LOCK ::", options: ["door : house", "password : account", "car : road", "ring : finger"], a: 1,
    ex: "المفتاح يفتح القفل ↔ كلمة المرور تفتح الحساب.", steps: ["الجملة: «الأول يفتح الثاني»"], hints: ["وش يسوي المفتاح للقفل؟"], traps: { 0: "الباب جزء من البيت — علاقة مختلفة." } },
  { topic: "sentence", diff: 2, skill: "تضاد", est: 40, q: "The book looked ______, but its ideas were surprisingly modern.", options: ["new", "ancient", "colorful", "expensive"], a: 1,
    ex: "but = تضاد: شكله قديم وأفكاره حديثة.", steps: ["حدد الإشارة: but", "الفراغ عكس modern", "ancient ✓"], hints: ["وش كلمة الإشارة؟", "عكس «حديثة»"], traps: { 0: "new تلغي التضاد الذي صنعته but." } },
  { topic: "sentence", diff: 3, skill: "فراغان", est: 55, q: "Far from being ______, the results were so ______ that the team repeated the test twice.", options: ["surprising … expected", "conclusive … ambiguous", "useful … helpful", "final … clear"], a: 1,
    ex: "Far from = نفي الأولى؛ إعادة الاختبار دليل غموض النتائج.", steps: ["Far from being X = ليست X", "إعادة الاختبار ← النتائج غير حاسمة/غامضة", "conclusive…ambiguous ✓"], hints: ["Far from تنفي الكلمة الأولى", "ليش يعيدون الاختبار مرتين؟"], traps: { 3: "clear تناقض سبب الإعادة." } },
  { topic: "sentence", diff: 1, skill: "سبب", est: 30, q: "He wore a coat ______ it was cold.", options: ["but", "because", "so", "although"], a: 1,
    ex: "البرد سبب لبس المعطف.", steps: ["العلاقة سبب مباشر", "because ✓"], hints: ["البرد سبب ولا نتيجة؟"], traps: { 2: "so تجعل البرد نتيجة للمعطف!" } },
]);


/* ═══ content/questions-reading.js ═══ */
/* ═══ استيعاب المقروء — نصوص مؤلَّفة (المولّد لا يصلح للقراءة) ═══
   للتوسع: أضف نصًا جديدًا بنفس الشكل، وكل أسئلته تدخل البنك تلقائيًا. */
QQ.registerQuestions([
/* ١ — أرامكو والبئر رقم ٧ */
{ topic: "reading", diff: 2, skill: "التقاط التفاصيل", est: 60, type: "mcq",
  q: "«After five years of failed attempts, engineers nearly abandoned the project. In 1938, Dammam Well No. 7 finally produced oil in commercial quantities, transforming the region's economy within a single decade.»\n\nAccording to the passage, the well succeeded:",
  options: ["immediately after drilling began", "after years of unsuccessful attempts", "before 1930", "without any engineering effort"], a: 1,
  ex: "النص يقول «after five years of failed attempts» — النجاح جاء بعد إخفاقات.",
  steps: ["ابحث عن الكلمة المفتاحية failed", "«خمس سنوات من المحاولات الفاشلة» تسبق النجاح", "الخيار الثاني إعادة صياغة لها"],
  hints: ["ابحث عن كلمة تدل على الفشل قبل النجاح"], traps: { 0: "immediately يناقض «بعد خمس سنوات»." } },
{ topic: "reading", diff: 2, skill: "الاستنتاج", est: 60, type: "mcq",
  q: "Same passage. The word «transforming» suggests that the discovery:",
  options: ["had a small effect", "caused major change", "was kept secret", "delayed development"], a: 1,
  ex: "transform = يُحدث تحولًا جذريًا، ويؤكده «within a single decade».",
  steps: ["transform تعني التحويل الجذري", "قرينة الجملة: خلال عقد واحد فقط"],
  hints: ["ما معنى transform؟"], traps: { 0: "small effect يناقض قوة الفعل transform." } },
{ topic: "reading", diff: 3, skill: "نبرة الكاتب", est: 60, type: "mcq",
  q: "Same passage. The writer's attitude toward the engineers is best described as:",
  options: ["dismissive", "appreciative", "hostile", "indifferent"], a: 1,
  ex: "ذكر مثابرتهم رغم الفشل ثم التحول الكبير = نبرة تقدير.",
  steps: ["ابحث عن كلمات محمّلة عاطفيًا: nearly abandoned, finally, transforming", "الصورة العامة: مثابرة أثمرت", "= تقدير"],
  hints: ["هل يمدح النص المهندسين أم ينتقدهم؟"], traps: { 3: "indifferent لا تناسب نصًا يبرز التحول الكبير." } },

/* ٢ — النوم والذاكرة */
{ topic: "reading", diff: 2, skill: "الفكرة الرئيسية", est: 60, type: "mcq",
  q: "«Students who sleep seven hours before an exam recall more than those who study all night. Sleep does not merely rest the brain; it consolidates what was learned during the day.»\n\nThe main idea is:",
  options: ["studying all night is best", "sleep strengthens memory", "exams are unfair", "seven hours is too much"], a: 1,
  ex: "consolidates = يثبّت المتعلَّم؛ الفكرة أن النوم يقوّي الذاكرة.",
  steps: ["الجملة الأخيرة تحمل الفكرة عادة", "«يثبّت ما تعلمته» = تقوية الذاكرة"],
  hints: ["ابدأ من الجملة الأخيرة"], traps: { 0: "النص يقول العكس تمامًا." } },
{ topic: "reading", diff: 2, skill: "معنى من السياق", est: 55, type: "mcq",
  q: "Same passage. «consolidates» most nearly means:",
  options: ["erases", "strengthens", "delays", "measures"], a: 1,
  ex: "consolidate = يرسّخ ويقوّي — قرينتها التضاد مع «merely rest».",
  steps: ["السياق: النوم لا يريح فقط بل يفعل شيئًا أقوى", "= يرسّخ"],
  hints: ["ما الذي يفعله النوم بما تعلمته؟"], traps: { 0: "erases تناقض سياق التحسن." } },
{ topic: "reading", diff: 3, skill: "ما لا يقوله النص", est: 65, type: "mcq",
  q: "Same passage. Which statement is NOT supported?",
  options: ["sleep affects recall", "all-night study is less effective", "sleep has a role beyond rest", "seven hours guarantees a perfect score"], a: 3,
  ex: "النص يقول «recall more» لا «درجة كاملة مضمونة» — تعميم زائد.",
  steps: ["افحص كل خيار: هل نصّ عليه النص؟", "«يضمن درجة كاملة» لم يرد إطلاقًا"],
  hints: ["احذر الخيار المبالغ (يضمن/دائمًا/كل)"], traps: { 0: "هذا مذكور صراحة في أول جملة." } },

/* ٣ — الطاقة الشمسية */
{ topic: "reading", diff: 2, skill: "السبب والنتيجة", est: 60, type: "mcq",
  q: "«Because desert regions receive intense sunlight for most of the year, they are ideal for solar farms. However, dust storms reduce panel efficiency, so frequent cleaning is required.»\n\nWhy is cleaning necessary?",
  options: ["panels are fragile", "dust lowers efficiency", "sunlight is weak", "storms destroy panels"], a: 1,
  ex: "النص يربط: dust storms → reduce efficiency → cleaning.",
  steps: ["تتبع سلسلة السبب: dust storms ← reduce efficiency ← so cleaning"],
  hints: ["ابحث عن so وما قبلها"], traps: { 3: "destroy أقوى مما قاله النص (reduce فقط)." } },
{ topic: "reading", diff: 1, skill: "التقاط التفاصيل", est: 50, type: "mcq",
  q: "Same passage. Desert regions suit solar farms because they have:",
  options: ["cheap land", "strong sunlight most of the year", "no dust", "cool weather"], a: 1,
  ex: "«intense sunlight for most of the year» سبب صريح.",
  steps: ["الجملة تبدأ بـBecause — السبب بعدها مباشرة"],
  hints: ["Because تدل على السبب"], traps: { 2: "النص يذكر أن الغبار موجود ويسبب مشكلة." } },
{ topic: "reading", diff: 3, skill: "وظيفة أداة الربط", est: 60, type: "mcq",
  q: "Same passage. The word «However» signals:",
  options: ["an added example", "a contrast with the previous idea", "a conclusion", "a repetition"], a: 1,
  ex: "However تُدخل تضادًا: المكان مثالي… لكن هناك عائق.",
  steps: ["ما قبلها: ميزة", "ما بعدها: عيب", "= تضاد"],
  hints: ["قارن ما قبل الكلمة بما بعدها"], traps: { 2: "الاستنتاج يأتي عادة مع therefore." } },

/* ٤ — التعلّم بالتكرار المتباعد */
{ topic: "reading", diff: 3, skill: "المقارنة داخل النص", est: 65, type: "mcq",
  q: "«Reviewing material once a week for four weeks produces stronger retention than reviewing it four times in one day, even though the total study time is identical.»\n\nThe passage emphasizes the importance of:",
  options: ["total hours studied", "how study is spaced over time", "studying in groups", "reading speed"], a: 1,
  ex: "نفس الزمن الكلي لكن التوزيع مختلف — العبرة في التباعد.",
  steps: ["لاحظ «total study time is identical»", "إذن الفرق في التوزيع لا في الكم"],
  hints: ["ما الشيء المتساوي بين الحالتين؟"], traps: { 0: "النص ينفي أن الساعات الكلية هي الفارق." } },
{ topic: "reading", diff: 2, skill: "التقاط التفاصيل", est: 55, type: "mcq",
  q: "Same passage. Retention was strongest when review happened:",
  options: ["four times in one day", "once weekly across four weeks", "only before the exam", "twice a year"], a: 1,
  ex: "النص صريح: مرة أسبوعيًا لأربعة أسابيع أقوى.",
  steps: ["قارن الحالتين المذكورتين", "الأقوى هي الموزّعة"],
  hints: ["أي الحالتين وُصفت بـstronger؟"] },

/* ٥ — المقابلة الوظيفية */
{ topic: "reading", diff: 2, skill: "الاستنتاج", est: 60, type: "mcq",
  q: "«Candidates who prepare specific examples of past problems they solved perform better in interviews than those who describe their skills in general terms.»\n\nThe passage implies that interviewers value:",
  options: ["long answers", "concrete evidence", "formal clothing", "technical vocabulary"], a: 1,
  ex: "أمثلة محددة لمشكلات حُلّت = دليل ملموس أفضل من الكلام العام.",
  steps: ["قارن: specific examples مقابل general terms", "المفضّل: المحدد الملموس"],
  hints: ["ما الفرق بين المجموعتين؟"], traps: { 0: "الطول لم يُذكر إطلاقًا." } },
{ topic: "reading", diff: 3, skill: "ما لا يقوله النص", est: 65, type: "mcq",
  q: "Same passage. Which is NOT stated or implied?",
  options: ["examples help candidates", "general descriptions are weaker", "preparation matters", "interviews last one hour"], a: 3,
  ex: "مدة المقابلة لم تُذكر بأي شكل.",
  steps: ["افحص كل خيار مقابل النص", "المدة معلومة خارجية لا نصية"],
  hints: ["ابحث عن الخيار الذي يضيف معلومة جديدة"] },

/* ٦ — الماء والزراعة */
{ topic: "reading", diff: 2, skill: "الفكرة الرئيسية", est: 60, type: "mcq",
  q: "«Drip irrigation delivers water directly to plant roots, losing far less to evaporation than traditional flooding. Farms that switched reported similar yields using nearly half the water.»\n\nThe passage is mainly about:",
  options: ["a more efficient irrigation method", "the history of farming", "types of crops", "the cost of water"], a: 0,
  ex: "المحور: طريقة ريّ توفّر الماء بنفس الإنتاج.",
  steps: ["ما الذي يتكرر في الجملتين؟ الري والماء والكفاءة", "= طريقة أكفأ"],
  hints: ["ابحث عن الموضوع المشترك بين الجملتين"], traps: { 3: "التكلفة لم تُذكر، بل كمية الماء." } },
{ topic: "reading", diff: 2, skill: "المقارنة داخل النص", est: 55, type: "mcq",
  q: "Same passage. Compared with flooding, drip irrigation:",
  options: ["produces far lower yields", "uses about half the water", "requires no equipment", "increases evaporation"], a: 1,
  ex: "«nearly half the water» مع «similar yields».",
  steps: ["ابحث عن الرقم/النسبة", "نصف الماء تقريبًا"],
  hints: ["ركّز على الجملة الثانية"], traps: { 0: "النص يقول الإنتاج متشابه لا أقل." } },

/* ٧ — المدن الذكية */
{ topic: "reading", diff: 3, skill: "الاستنتاج", est: 65, type: "mcq",
  q: "«Sensors placed at intersections adjust traffic lights in real time. In pilot districts, average commute times fell by 18 percent, though residents in areas without sensors noticed no change.»\n\nWhat can be concluded?",
  options: ["the system helps only where installed", "the system failed", "all residents benefited", "sensors increase traffic"], a: 0,
  ex: "التحسن ظهر في مناطق التجربة فقط — أثر محدود بالتغطية.",
  steps: ["قارن مناطق الحساسات بغيرها", "الفائدة حيث رُكِّبت فقط"],
  hints: ["ماذا حدث في المناطق بلا حساسات؟"], traps: { 2: "«جميع السكان» يناقض «no change» للبعض." } },
{ topic: "reading", diff: 2, skill: "التقاط التفاصيل", est: 55, type: "mcq",
  q: "Same passage. Commute times in pilot districts:",
  options: ["rose by 18%", "fell by 18%", "stayed the same", "doubled"], a: 1,
  ex: "«fell by 18 percent» نص صريح.",
  steps: ["ابحث عن الرقم 18 وما يسبقه"], hints: ["fell = انخفض"] },

/* ٨ — الاختبارات القياسية */
{ topic: "reading", diff: 3, skill: "نبرة الكاتب", est: 65, type: "mcq",
  q: "«Standardized tests measure a narrow slice of ability. They predict first-year performance reasonably well, yet they say little about creativity or persistence — qualities employers repeatedly rank as decisive.»\n\nThe writer's view is best described as:",
  options: ["fully supportive of such tests", "balanced but critical of their limits", "completely opposed to testing", "uninterested in the topic"], a: 1,
  ex: "اعترف بفائدة (تنبؤ معقول) ثم بيّن قصورًا — نبرة متوازنة ناقدة.",
  steps: ["الجملة الأولى: قصور", "الثانية: اعتراف بفائدة ثم yet ينقد", "= توازن مع نقد"],
  hints: ["هل النص يمدح فقط أم يذم فقط أم الاثنان؟"], traps: { 2: "completely opposed يتجاهل اعترافه بالتنبؤ الجيد." } },
{ topic: "reading", diff: 2, skill: "معنى من السياق", est: 55, type: "mcq",
  q: "Same passage. «decisive» most nearly means:",
  options: ["unclear", "determining the outcome", "expensive", "optional"], a: 1,
  ex: "decisive = حاسم يحدد النتيجة؛ لذلك يصنّفها أصحاب العمل كذلك.",
  steps: ["السياق: صفات يعتبرها أصحاب العمل الأهم", "= حاسمة"],
  hints: ["ما الصفة التي تجعل أصحاب العمل يقررون؟"], traps: { 3: "optional عكس الحسم." } },
{ topic: "reading", diff: 2, skill: "الاستنتاج", est: 60, type: "mcq",
  q: "Same passage. The writer would most likely agree that:",
  options: ["test scores alone define a candidate", "tests should be one factor among several", "creativity cannot be observed", "first-year grades are meaningless"], a: 1,
  ex: "يعترف بقيمتها المحدودة ويطالب ضمنًا بمعايير أخرى.",
  steps: ["اجمع: مفيدة جزئيًا + تُغفل صفات حاسمة", "= عامل ضمن عوامل"],
  hints: ["ما الموقف الوسط الذي يوافق النبرة؟"], traps: { 0: "يناقض نقده لضيق ما تقيسه." } },
]);


/* ═══════════════════════════════════════════════════════════
   🏦 CONTENT BANK — بنك المحتوى الموحّد القابل للتوسع
   أضف آلاف الأسئلة عبر addQuestions() فقط — بلا أي تعديل كود
   ═══════════════════════════════════════════════════════════ */
const BANK = [];
let _bid = 0;
/** مخطط السؤال الكامل:
 * subject: 'quant'|'verbal'   المادة
 * topic:   sec                الموضوع (arithmetic, analogy, ...)
 * diff:    1|2|3              الصعوبة (تأسيسي/قدرات/صفوة)
 * skill:   نص المهارة         ("نسبة التغيّر", "كلمات الإشارة"...)
 * est:     ثوانٍ متوقعة للحل
 * type:    'mcq'|'num'
 * q, options?, a, ex          نص السؤال والإجابة والشرح المختصر
 * steps?:  string[]           خطوات الحل بالتدريج
 * hints?:  string[]           تلميحات تدريجية (من الأخف للأصرح)
 * traps?:  {idx: سبب اختياره} تشخيص سبب الخطأ لكل خيار مضلل
 * alt?:    string             طريقة حل ثانية                       */
function addQuestions(list, defaults = {}) {
  list.forEach(raw => {
    const q = { diff: 2, type: raw.options ? "mcq" : "num", est: 45, ...defaults, ...raw };
    q.subject ||= ["analogy", "sentence", "reading", "vocab"].includes(q.topic) ? "verbal" : "quant";
    q.id = q.id || `${q.topic}-${_bid++}`;
    BANK.push(q);
  });
}

/* ═══════════════════════════════════════════════════════════
   ♾️ GENERATOR ENGINE — أسئلة لا تنتهي، أوفلاين، بلا أي AI
   يبني من كل مولّد سؤالًا مكتملًا: خيارات مخلوطة + تشخيص كل مشتت
   ═══════════════════════════════════════════════════════════ */
const GENS = QQ._gens;
const RECENT = [];                       // بصمات آخر ما رآه اللاعب (منع التكرار)
const RECENT_MAX = 240;
const sigOf = (s) => { let h = 0; const t = String(s); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h.toString(36); };
const noteSeen = (id) => { if (!id) return; RECENT.push(id); if (RECENT.length > RECENT_MAX) RECENT.splice(0, RECENT.length - RECENT_MAX); };
const fmtN = (n) => String(Math.round(n * 100) / 100);

const GR = {
  i: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  bool: () => Math.random() < 0.5,
  shuffle: (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
  fmt: fmtN,
  awlPool: (g) => {
    const all = Object.keys(AWL_WORDS);
    if (!all.length) return [];
    if (g) { const L = all.filter(id => acadDone(g, id)).flatMap(id => AWL_WORDS[id]); if (L.length >= 4) return L; }
    return AWL_WORDS[all[0]] || [];
  },
};

/* يبني خيارات: يخلطها ويُبقي سبب كل مشتت مرتبطًا بموضعه بعد الخلط */
function mkMC(correct, wrongs) {
  const C = String(correct);
  if (C === "" || C === "NaN" || C === "undefined") return null;
  const seen = new Set([C]); const picked = [];
  (wrongs || []).forEach(w => {
    if (picked.length >= 3) return;
    const v = String(w.v);
    if (seen.has(v) || v === "NaN" || v === "undefined" || v === "Infinity" || v === "") return;
    seen.add(v); picked.push({ v, why: w.why });
  });
  const m = C.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  let k = 1;
  while (picked.length < 3 && m && k < 30) {
    const base = parseFloat(m[1]), suf = m[2];
    const step = Math.max(1, Math.round(Math.abs(base) * 0.1)) * Math.ceil(k / 2);
    const v = fmtN(base + (k % 2 ? step : -step)) + suf;
    k++;
    if (seen.has(v) || v.indexOf("NaN") >= 0) continue;
    seen.add(v); picked.push({ v, why: null });
  }
  if (picked.length < 3) return null;
  const arr = GR.shuffle([{ v: C, ok: true }, ...picked]);
  const traps = {};
  arr.forEach((o, i) => { if (o.why) traps[i] = o.why; });
  return { options: arr.map(o => o.v), a: arr.findIndex(o => o.ok), traps };
}

/* ينتج سؤالًا واحدًا من مولّد، بنفس مخطط بنك الأسئلة تمامًا */
function makeGen(gn, g) {
  for (let t = 0; t < 8; t++) {
    let o = null;
    try { o = gn.gen(GR, g); } catch (e) { o = null; }
    if (!o || !o.q) continue;
    const isNum = (gn.type || "mcq") === "num";
    const base = { subject: gn.subject || (["analogy", "sentence", "reading", "vocab"].includes(gn.topic) ? "verbal" : "quant"),
      topic: gn.topic, sec: gn.topic, diff: gn.diff, skill: gn.skill, est: gn.est,
      q: o.q, ex: o.ex, steps: o.steps, hints: o.hints, alt: o.alt,
      genId: gn.id, id: "g:" + gn.id + ":" + sigOf(o.q) };
    if (isNum) { if (typeof o.a !== "number" || !isFinite(o.a)) continue; return { ...base, type: "num", a: o.a }; }
    const mc = mkMC(o.correct, o.wrongs);
    if (!mc) continue;
    return { ...base, type: "mcq", options: mc.options, a: mc.a, traps: mc.traps };
  }
  return null;
}

/* ترتيب الخطوات: يُبنى من خطوات أي مولّد — لا نهائي بلا محتوى إضافي */
function makeOrderGen(topics, g) {
  const cands = GENS.filter(x => (x.type || "mcq") === "mcq" && (!topics || !topics.length || topics.includes(x.topic)));
  for (let t = 0; t < 8 && cands.length; t++) {
    const q = makeGen(GR.pick(cands), g);
    if (q && q.steps && q.steps.length >= 3 && RECENT.indexOf("o:" + q.id) < 0) {
      noteSeen("o:" + q.id);
      return { kind: "order", sec: q.topic, title: `رتّب خطوات الحل: ${q.q.replace(/\n/g, " ")}`, steps: q.steps.slice(0, 4), ex: q.ex, id: "o:" + q.id };
    }
  }
  return null;
}


/* يبني اختبارًا من مخطط: خانة خانة، بلا تكرار مولّد داخل المحاولة الواحدة */
function buildFromBlueprint(id, g) {
  const slots = QQ._blue[id] || [];
  const usedGen = [], out = [];
  slots.forEach(slot => {
    let q = null;
    for (let t = 0; t < 14 && !q; t++) {
      const cands = GENS.filter(x => (x.type || "mcq") === "mcq" && slot.topics.includes(x.topic)
        && slot.diffs.includes(x.diff) && usedGen.indexOf(x.id) < 0);
      if (!cands.length) break;
      const made = makeGen(GR.pick(cands), g);
      if (made && !out.some(o => o.q === made.q)) { q = made; usedGen.push(made.genId); }
    }
    if (!q) {   // احتياط: من البنك المؤلَّف بنفس المواصفات
      const pool = BANK.filter(x => x.type === "mcq" && slot.topics.includes(x.topic) && slot.diffs.includes(x.diff) && !out.some(o => o.id === x.id));
      if (pool.length) q = GR.pick(pool);
    }
    if (q) { noteSeen(q.id); out.push({ ...q, slot: slot.label }); }
  });
  return out;
}

/* أسئلة مولَّدة تخص وحدة أكاديمية بعينها (للمراجعة واختبار التجاوز) */
function unitGenQs(unitId, n, g) {
  const map = QQ._unitGen[unitId];
  if (!map) return [];
  const out = [];
  for (let t = 0; t < n * 6 && out.length < n; t++) {
    const cands = GENS.filter(x => (x.type || "mcq") === "mcq"
      && (map.gens ? map.gens.includes(x.id) : (map.topics.includes(x.topic) && map.diffs.includes(x.diff))));
    if (!cands.length) break;
    const q = makeGen(GR.pick(cands), g);
    if (q && !out.some(o => o.q === q.q)) { noteSeen(q.id); out.push(q); }
  }
  return out;
}

const genBatch = (topics, diffs, g, per = 3) => {
  const out = [];
  GENS.filter(x => topics.includes(x.topic) && diffs.includes(x.diff) && (x.type || "mcq") === "mcq").forEach(gn => {
    for (let k = 0; k < per; k++) { const q = makeGen(gn, g); if (q && RECENT.indexOf(q.id) < 0 && !out.some(e => e.id === q.id)) out.push(q); }
  });
  return out;
};

const bankPick = ({ topics, n, diffs = [1, 2, 3], g = null, exclude = [] }) => {
  const fresh = (x) => !exclude.includes(x.id) && RECENT.indexOf(x.id) < 0;
  const statics = BANK.filter(x => topics.includes(x.topic) && diffs.includes(x.diff) && fresh(x));
  let pool = [...statics, ...genBatch(topics, diffs, g)];
  if (pool.length < n) pool = pool.concat(BANK.filter(x => topics.includes(x.topic) && diffs.includes(x.diff) && !exclude.includes(x.id)));
  if (!pool.length) return [];
  let out;
  if (!g) out = GR.shuffle(pool).slice(0, n);
  else {
    const byT = {}; topics.forEach(t => byT[t] = GR.shuffle(pool.filter(x => x.topic === t)));
    out = [];
    while (out.length < n) {
      const avail = topics.filter(t => byT[t] && byT[t].length);
      if (!avail.length) break;
      const tot = avail.reduce((a, t) => a + weightOf(g, t), 0);
      let r = Math.random() * tot, pick = avail[0];
      for (const t of avail) { r -= weightOf(g, t); if (r <= 0) { pick = t; break; } }
      out.push(byT[pick].shift());
    }
  }
  out.forEach(q => noteSeen(q.id));
  return out;
};
const bankSimilar = (q) => {
  // 🧑‍🏫 «جرّبني بسؤال مشابه» صار لا نهائيًا: نولّد من نفس المهارة
  const same = GENS.filter(x => (x.type || "mcq") === "mcq" && (x.skill === q.skill || x.topic === (q.topic || q.sec)));
  for (let t = 0; t < 5 && same.length; t++) {
    const made = makeGen(GR.pick(same), null);
    if (made && made.q !== q.q) return made;
  }
  const c = BANK.filter(x => x.topic === (q.topic || q.sec) && x.id !== q.id && x.type === "mcq" && x.diff <= (q.diff || 3));
  return c.length ? GR.pick(c) : null;
};
const battleDiffs = (g, isBoss) => {
  const base = g.chapter <= 2 ? 1 : g.chapter <= 5 ? 2 : 3;
  return isBoss ? [Math.min(3, base), Math.min(3, base + 1)] : [Math.max(1, base - 1), base];
};

/* ── تسجيل الرصيد الحالي في البنك (المهارة والوقت لكل موضوع) ── */
const TOPIC_META = {
  arithmetic: { skill: "حساب ونسب", est: 45 }, algebra: { skill: "جبر", est: 45 },
  geometry: { skill: "هندسة", est: 50 }, comparison: { skill: "مقارنات", est: 40 },
  data: { skill: "تحليل بيانات", est: 50 }, analogy: { skill: "تناظر لفظي", est: 35 },
  sentence: { skill: "إكمال جمل", est: 40 }, reading: { skill: "استيعاب مقروء", est: 60 },
};

/* ── دفعة أسئلة غنية: خطوات + تلميحات + تشخيص فخوخ + طرق بديلة ── */
function buildChallenges(secs, count, g, isBoss) {
  // 🧠 اختيار موزون من البنك: الأقسام الضعيفة تظهر أكثر + صعوبة تتدرج مع تقدمك
  const out = bankMCQ(secs, count, g, battleDiffs(g, isBoss)).map(q => ({ kind: "mcq", ...q, sec: q.topic }));
  while (out.length < count) {
    const extra = bankMCQ(secs, count - out.length, g, [1, 2, 3]).map(q => ({ kind: "mcq", ...q, sec: q.topic }));
    if (!extra.length) break;
    out.push(...extra);
  }
  const quantIn = secs.filter(s => ["arithmetic", "algebra", "geometry", "data"].includes(s));
  const hasVerbal = secs.some(s => VERBAL_SECS.includes(s));
  if (quantIn.length) {
    // لوحة الأرقام تستهدف أضعف قسم كمي عند اللاعب
    const target = weakestOf(g, quantIn);
    const numGens = GENS.filter(x => x.type === "num" && quantIn.includes(x.topic));
    const ordered = [...numGens.filter(x => x.topic === target), ...numGens.filter(x => x.topic !== target)];
    const nums = [];
    ordered.forEach(gn => { if (nums.length < 2) { const q = makeGen(gn, g); if (q && RECENT.indexOf(q.id) < 0) { noteSeen(q.id); nums.push({ kind: "num", ...q }); } } });
    if (nums.length < 2) {
      NUMQ.filter(n => quantIn.includes(n.sec)).sort(() => Math.random() - 0.5).slice(0, 2 - nums.length)
        .forEach(n => nums.push({ kind: "num", ...n }));
    }
    out.splice(1, Math.min(nums.length, out.length > 3 ? nums.length : 1), ...nums);
  }
  if (hasVerbal && (weightOf(g, "vocab") > 45 || Math.random() < 0.6)) {
    // 🎓 لو تعلمت حزم AWL، معارك الكلمات تستخدم كلماتك أنت
    const learned = Object.keys(AWL_WORDS).filter(id => acadDone(g, id)).flatMap(id => AWL_WORDS[id]);
    const src4 = learned.length >= 4 ? learned : Object.values(AWL_WORDS).flat();
    const m = src4.length >= 4
      ? { pairs: GR.shuffle(src4).slice(0, 4).map(w => [w.w, w.ar]) }
      : MATCH_SETS[Math.floor(Math.random() * MATCH_SETS.length)];
    out.splice(Math.min(2, out.length), 0, { kind: "match", sec: "vocab", ...m });
  }
  // ✍️ كلماتك المتعلمة تتحول لأسئلة إكمال جمل بنمط الاختبار
  if (secs.includes("sentence")) {
    const learned = Object.keys(AWL_WORDS).filter(id => acadDone(g, id)).flatMap(id => AWL_WORDS[id]);
    if (learned.length >= 4 && Math.random() < 0.5) {
      const w = learned[Math.floor(Math.random() * learned.length)];
      const wrong = learned.filter(x => x.w !== w.w).sort(() => Math.random() - 0.5).slice(0, 3).map(x => x.w);
      const opts = [w.w, ...wrong].sort(() => Math.random() - 0.5);
      out.splice(Math.min(1, out.length), 0, { kind: "mcq", sec: "sentence", skill: "AWL في سياق", diff: 2,
        q: w.bl, options: opts, a: opts.indexOf(w.w), ex: `${w.w} (${w.ar}) — ${w.ex}` });
    }
  }
  if (quantIn.length) {
    const gen = makeOrderGen(quantIn, g);
    if (gen) out.splice(Math.min(4, out.length), 0, gen);
    else {
      const pool = ORDER_QS.filter(o => quantIn.includes(o.sec));
      if (pool.length) {
        const target = weakestOf(g, pool.map(o => o.sec));
        const chosen = pool.filter(o => o.sec === target)[0] || pool[Math.floor(Math.random() * pool.length)];
        out.splice(Math.min(4, out.length), 0, { kind: "order", ...chosen });
      }
    }
  }
  return out;
}


/* ═══════════════════════════════════════════════════════════
   🎓 THE ACADEMY — رحلة تعليم كاملة من الصفر إلى القدرات
   4 مراحل: تأسيس → بناء مهارات → قدرات → احتراف
   ═══════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════
   🎓 ARAMCO TRACK — AWL Engine + CPC Prep
   الكلمات بيانات فقط: addAWL() يستقبل بقية القوائم لاحقًا بلا كود
   ═══════════════════════════════════════════════════════════ */
function say(w) { try { const u = new SpeechSynthesisUtterance(w); u.lang = "en-US"; u.rate = 0.88; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {} }

/* AWL Sublist 1 — 60 كلمة كاملة التأليف */
/* مولّد تدريبات AWL: معنى ← فراغ ← مرادف/ضد — من البيانات مباشرة */
function awlDrills(words) {
  const pick3 = (arr) => [...arr].sort(() => Math.random() - 0.5).slice(0, 3);
  return words.map((w, i) => {
    const others = words.filter(x => x.w !== w.w);
    const shuffle = (opts, right) => { const o = [...opts].sort(() => Math.random() - 0.5); return { o, a: o.indexOf(right) }; };
    if (i % 3 === 0) {
      const { o, a } = shuffle([w.ar, ...pick3(others).map(x => x.ar)], w.ar);
      return { q: `«${w.w}» means:`, options: o, a, ex: `${w.w} = ${w.ar}. مثال: ${w.ex}` };
    }
    if (i % 3 === 1) {
      const { o, a } = shuffle([w.w, ...pick3(others).map(x => x.w)], w.w);
      return { q: w.bl.replace("_____", "_____ "), options: o, a, ex: `${w.w} (${w.ar}) — ${w.ex}` };
    }
    if (w.ant && i % 6 === 5) {
      const { o, a } = shuffle([w.ant, ...pick3(others.map(x => x.w))], w.ant);
      return { q: `The OPPOSITE of «${w.w}» is:`, options: o, a, ex: `${w.w} (${w.ar}) عكسها ${w.ant}.` };
    }
    const { o, a } = shuffle([w.syn, ...pick3(others.map(x => x.w))], w.syn);
    return { q: `A synonym of «${w.w}» is:`, options: o, a, ex: `${w.w} ≈ ${w.syn} — كلاهما بمعنى ${w.ar}.` };
  });
}
function addAWL(id, icon, name, words) {
  return { id, icon, name, awl: words, need: 5, cards: words.map(w => ({ h: w.w, t: w.ar })), drills: awlDrills(words) };
}
const SRS_INT = [1, 2, 4, 8, 14, 25];   // فواصل المراجعة بأيام اللعبة
const PREREQ = {
  f1: [], f2: ["f1"], f3: ["f2"], f4: ["f1"], f5: ["f4"], f6: [], f7: ["f6"], f8: ["f6"],
  s1: ["f3"], s2: ["f5"], s3: ["f1"], s4: ["f2"], s5: ["f8"], s6: ["f7"],
  q1: ["s4"], q2: ["s2"], q3: ["q1"],
  p1: ["q1", "q2", "q3"], p2: ["p1"],
  c1: ["p2"], c2: ["c1"], c3: ["c2"], c4: ["c3"],
};
const unitById = (id) => { for (const ph of ACADEMY) { const u = ph.units.find(x => x.id === id); if (u) return { u, ph }; } return null; };
const prereqMet = (g, uid) => (PREREQ[uid] || []).every(pid => acadDone(g, pid));
const dueList = (g) => Object.entries(g.srs || {})
  .filter(([id, s]) => s.due <= g.day)
  .map(([id]) => unitById(id))
  .filter(x => x && x.u.drills && x.u.drills.length);

// حالة كل مفهوم على الخريطة
function nodeState(g, uid, phaseIdx) {
  const s = (g.srs || {})[uid];
  if (acadDone(g, uid)) {
    if (s && s.due <= g.day) return { k: "review", label: "يحتاج مراجعة", c: "#E58E26", e: "🟠" };
    if (s && s.lvl >= 3) return { k: "master", label: "أتقنه", c: "#C89235", e: "🥇" };
    return { k: "known", label: "فهمه", c: "#1F7A5C", e: "🟢" };
  }
  const open = prereqMet(g, uid) || phaseIdx <= (g.acad?.placed ?? -1);
  if (g.acad?.opened?.[uid]) return { k: "learning", label: "يتعلمه", c: "#3B82C4", e: "🔵" };
  if (open) return { k: "ready", label: "جاهز للتعلم", c: "#3B82C4", e: "🔵" };
  return { k: "locked", label: "لم يبدأ", c: "#8A968E", e: "⚪" };
}

// مسارات الشجرة للعرض
const KNOW_TRACKS = [
  { name: "🧮 مسار الحساب", ids: ["f1", "f2", "f3", "s1"] },
  { name: "⚖️ مسار الجبر", ids: ["f1", "f4", "f5", "s2"] },
  { name: "📐 الهندسة والبيانات", ids: ["f1", "s3", "s4"] },
  { name: "🔤 مسار اللغة", ids: ["f6", "f7", "s6"] },
  { name: "🗝️ مسار المفردات", ids: ["f6", "f8", "s5"] },
  { name: "🧭 الاستراتيجيات", ids: ["s4", "q1", "q3"] },
  { name: "🥇 الاحتراف", ids: ["q3", "p1", "p2"] },
  { name: "🎓 مسار AWL الأكاديمي", ids: ["f8", "a1", "a3", "a6"] },
  { name: "🏭 مسار CPC", ids: ["p2", "c1", "c3", "c4"] },
];


/* ═══ FINALIZE — بناء هياكل اللعبة من سجل المحتوى ═══ */
const QUESTIONS = QQ._core.mcq;
const NUMQ = QQ._core.num;
const MATCH_SETS = QQ._core.match;
const ORDER_QS = QQ._core.order;
const VERBAL_SECS = QQ._core.verbalSecs;
const PLACEMENT = QQ._lessons.PLACEMENT;

addQuestions(QUESTIONS.map(q => ({ ...q, topic: q.sec, ...TOPIC_META[q.sec], diff: 2 })));
addQuestions(QQ._rich);
addQuestions(NUMQ.map(q => ({ ...q, topic: q.sec, type: "num", ...TOPIC_META[q.sec], diff: 1 })));
const bankMCQ = (topics, n, g, diffs) => bankPick({ topics, n, g, diffs }).filter(x => x.type === "mcq");

/* مرحلة AWL تُبنى ديناميكيًا من كل القوائم المسجلة، مع سلسلة متطلباتها */
const AWL_WORDS = {};
function buildAWLPhase() {
  const units = []; let prev = "f8";
  Object.keys(QQ._awl).sort().forEach(sid => QQ._awl[sid].packs.forEach(p => {
    AWL_WORDS[p.id] = p.words;
    units.push(addAWL(p.id, p.icon, `${QQ._awl[sid].title} • ${p.name}`, p.words));
    PREREQ[p.id] = [prev]; prev = p.id;
  }));
  return { id: "A", name: "Aramco Track: الإنجليزية الأكاديمية (AWL)", icon: "🎓", color: "#2E7DA6",
    desc: `${units.length} حزمة • ${Object.values(AWL_WORDS).reduce((a,w)=>a+w.length,0)} كلمة — معنى ونطق ومعارك ومراجعة متباعدة`, units };
}
const PHASE_AWL = buildAWLPhase();
function validateContent() {
  const issues = [];
  BANK.forEach(q => {
    if (q.type === "mcq" && (!q.options || q.options.length !== 4 || q.a < 0 || q.a > 3)) issues.push("bank mcq: " + q.id);
    if (!q.ex) issues.push("bank بلا شرح: " + q.id);
  });
  Object.entries(AWL_WORDS).forEach(([pid, ws]) => ws.forEach(w => {
    if (!w.w || !w.ar || !w.ex || !w.syn || !w.bl || !w.bl.includes("_____")) issues.push(`awl ${pid}: ${w.w || "?"}`);
  }));
  ACADEMY.forEach(ph => ph.units.forEach(u => (u.drills || []).forEach((d, i) => {
    if (d.kind !== "num" && (!d.options || d.a >= d.options.length)) issues.push(`درل ${u.id}#${i}`);
  })));
  if (issues.length) console.warn("⚠️ Content issues:", issues);
  return issues.length;
}
/* 🚀 المرحلة المتقدّمة — تُعلّم الأنواع التي كانت تُختبر بلا درس */
QQ.registerLessons({
  X: {
    id: "X", name: "المرحلة المتقدّمة", icon: "🚀", color: "#7B5EA7",
    desc: "الأنواع التي يكثر الوقوع فيها — بشرح تفاعلي من الصفر",
    units: [
      { id: "x1", icon: "√", name: "الأسس والجذور",
        steps: [
          { k: "teach", h: "الأس = ضرب متكرر", t: "‏2³ تعني 2 مضروبة في نفسها 3 مرات: 2×2×2 = 8. الرقم الصغير (الأس) يقول «كم مرة»، لا «اضرب في كم».", ex: "3² = 3×3 = 9   |   5³ = 5×5×5 = 125" },
          { k: "teach", h: "الجذر التربيعي = العملية العكسية", t: "‏√ يسأل: أي عدد ضربته في نفسه يعطي هذا؟ √49 = 7 لأن 7×7 = 49. الجذر يفكّ التربيع تمامًا كما يفكّ الطرح الجمع." },
          { k: "example", h: "حل معادلة بالتربيع", q: "إذا كان x² = 64 و x موجب، فما x؟", steps: ["خذ الجذر التربيعي للطرفين", "√64 = 8 لأن 8×8 = 64", "x = 8"], answer: "8" },
          { k: "check", q: "‏√81 = ؟", options: ["9", "8", "40.5", "18"], a: 0, ex: "‏9×9 = 81 → √81 = 9. (40.5 = 81÷2 خطأ شائع: الجذر ليس القسمة على 2.)" },
          { k: "trap", h: "الجذر ليس القسمة على 2", t: "‏√16 = 4 (لأن 4×4=16)، وليس 8. ولا تخلط 2³ (=8) مع 2×3 (=6). الأس ضرب متكرر، والجذر يبحث عن العدد المتساوي." },
        ],
        drills: [
          { q: "√36 =", options: ["6", "18", "9", "12"], a: 0, ex: "6×6 = 36." },
          { q: "4² =", options: ["8", "16", "12", "6"], a: 1, ex: "4×4 = 16 (وليس 4×2)." },
          { q: "إذا x² = 25 (x>0) فإن x =", options: ["5", "12.5", "625", "50"], a: 0, ex: "√25 = 5." },
          { q: "2³ =", options: ["6", "9", "8", "5"], a: 2, ex: "2×2×2 = 8." },
        ]},
      { id: "x2", icon: "⚖️", name: "المتباينات", genDrills: true,
        steps: [
          { k: "teach", h: "المتباينة معادلة بإشارة اتجاه", t: "بدل «=» فيها < (أصغر) أو > (أكبر). تُحَل تمامًا كالمعادلة: اعزل x بنفس الخطوات. لكن لها قاعدة ذهبية واحدة إضافية." },
          { k: "example", h: "حلّها كالمعادلة", q: "حل: 2x + 3 < 11", steps: ["اطرح 3 من الطرفين: 2x < 8", "اقسم على 2 (موجب، فالإشارة تبقى): x < 4", "الحل: كل قيمة أصغر من 4"], answer: "x < 4" },
          { k: "teach", h: "⚠️ القاعدة الذهبية", t: "عند الضرب أو القسمة على عدد سالب، تنقلب إشارة المتباينة! مثال: −2x < 6 → اقسم على −2 واقلب → x > −3. هذي أهم قاعدة في الباب." },
          { k: "check", q: "حل: 3x < 12", options: ["x < 4", "x > 4", "x = 4", "x < 9"], a: 0, ex: "اقسم على 3 (موجب فلا تنقلب): x < 4." },
          { k: "trap", h: "متى تنقلب الإشارة", t: "الإشارة تنقلب فقط مع الضرب/القسمة على سالب — لا مع الجمع أو الطرح. النسيان هنا أشهر خطأ في المتباينات." },
        ],
        drills: [{ q: "if 2x + 3 < 11, then:", options: ["x < 4", "x > 4", "x < 7", "x = 4"], a: 0, ex: "2x < 8 → x < 4." }] },
      { id: "x3", icon: "🎲", name: "الاحتمالات", genDrills: true,
        steps: [
          { k: "teach", h: "الاحتمال = المطلوب ÷ الكل", t: "احتمال حدث = (عدد الحالات المطلوبة) ÷ (عدد كل الحالات الممكنة). قيمته دائمًا بين 0 (مستحيل) و1 (مؤكد)، وغالبًا يُكتب كسرًا." },
          { k: "example", h: "كرة من كيس", q: "كيس فيه 3 كرات حمراء و5 زرقاء. ما احتمال سحب حمراء؟", steps: ["عدد المطلوب (الحمراء) = 3", "عدد الكل = 3 + 5 = 8", "الاحتمال = 3/8"], answer: "3/8" },
          { k: "check", q: "كيس فيه 2 حمراء و2 زرقاء. احتمال الأحمر؟", options: ["1/2", "2/2", "1/4", "2"], a: 0, ex: "2 من أصل 4 = 2/4 = 1/2." },
          { k: "trap", h: "المقام هو الإجمالي دائمًا", t: "لا تقسم على «الكرات الأخرى» بل على العدد الكلي. احتمال الأحمر من (3 حمراء + 5 زرقاء) = 3/8 وليس 3/5." },
        ],
        drills: [
          { q: "كيس فيه 4 حمراء و6 زرقاء. احتمال سحب حمراء =", options: ["2/5", "4/6", "6/10", "2/3"], a: 0, ex: "4 من 10 = 4/10 = 2/5." },
          { q: "احتمال ظهور «صورة» عند رمي قطعة نقود =", options: ["1/2", "1", "1/4", "2"], a: 0, ex: "حالة واحدة مطلوبة من حالتين." },
        ]},
      { id: "x4", icon: "🔀", name: "العدّ: التباديل والتوافيق", genDrills: true,
        steps: [
          { k: "teach", h: "متى يهمّ الترتيب؟", t: "السؤال الحاسم: هل يهمّ ترتيب العناصر؟ ترتيب أشخاص في صف → يهمّ (تبديلة). اختيار لجنة → لا يهمّ (توافيق). هذا السؤال يحدد القانون." },
          { k: "example", h: "الترتيب يهمّ = تبديلة", q: "بكم طريقة نرتّب 3 كتب مختلفة في صف؟", steps: ["الترتيب مهمّ → نستخدم المضروب !", "‏3! = 3×2×1", "= 6 طرق"], answer: "6" },
          { k: "teach", h: "الترتيب لا يهمّ = توافيق", t: "لاختيار مجموعة دون ترتيب نستخدم C(n,k) = n! ÷ (k!×(n−k)!). مثال: اختيار 2 من 4 = C(4,2) = 6.", ex: "C(5,2) = 10 طريقة لاختيار 2 من 5" },
          { k: "check", q: "من 5 طلاب، بكم طريقة نختار لجنة من 2 (الترتيب لا يهمّ)؟", options: ["10", "20", "25", "7"], a: 0, ex: "C(5,2) = 10. (20 = التباديل P(5,2) وهي للترتيب المهم.)" },
          { k: "trap", h: "لا تخلط التبديلة بالتوافيق", t: "«مصافحات/لجان/أزواج» → توافيق (لا ترتيب). «ترتيب/سباق/كلمة سر» → تباديل (ترتيب مهم). التوافيق دائمًا أقل عددًا لأنها تتجاهل الترتيب." },
        ],
        drills: [
          { q: "بكم طريقة نرتّب 4 كتب مختلفة في صف؟", options: ["24", "12", "16", "8"], a: 0, ex: "الترتيب مهم → 4! = 24." },
          { q: "اختيار لجنة من 2 من أصل 4 (الترتيب لا يهمّ) =", options: ["6", "12", "8", "4"], a: 0, ex: "C(4,2) = 6." },
        ]},
      { id: "x5", icon: "🧊", name: "الهندسة الفراغية", genDrills: true,
        steps: [
          { k: "teach", h: "من المستوى إلى المجسّم", t: "الأشكال المجسّمة لها حجم (ثلاثة أبعاد). حجم متوازي المستطيلات (صندوق) = الطول × العرض × الارتفاع. الوحدة مكعّبة." },
          { k: "example", h: "حجم صندوق", q: "صندوق أبعاده 2 × 3 × 4 — ما حجمه؟", steps: ["الحجم = طول × عرض × ارتفاع", "= 2 × 3 × 4", "= 24 وحدة مكعّبة"], answer: "24" },
          { k: "teach", h: "المكعب والأسطوانة", t: "المكعب: الحجم = الضلع³، ومساحة سطحه = 6×الضلع². الأسطوانة: الحجم = π×نق²×الارتفاع.", ex: "مكعب ضلعه 3 → حجم 27، سطح 54" },
          { k: "check", q: "مكعب ضلعه 4 — ما حجمه؟", options: ["64", "16", "48", "12"], a: 0, ex: "الحجم = 4³ = 4×4×4 = 64. (48 = مساحة السطح 6×16 — لا تخلط.)" },
          { k: "trap", h: "الحجم يضرب ثلاثة أبعاد", t: "لا تضرب بعدين فقط (هذي مساحة وجه). الحجم يضرب الأبعاد الثلاثة، ووحدته مكعّبة (سم³) لا مربّعة." },
        ],
        drills: [
          { q: "صندوق أبعاده 2 × 3 × 5، حجمه =", options: ["30", "10", "31", "25"], a: 0, ex: "2 × 3 × 5 = 30." },
          { q: "مكعب ضلعه 3، حجمه =", options: ["27", "9", "18", "81"], a: 0, ex: "3³ = 27." },
        ]},
      { id: "x6", icon: "📈", name: "الإحصاء: الوسيط والمنوال والمدى",
        steps: [
          { k: "teach", h: "ثلاثة مقاييس تُخلط كثيرًا", t: "الوسيط = القيمة الوسطى بعد الترتيب. المنوال = الأكثر تكرارًا. المدى = الأكبر − الأصغر. لكل واحد سؤاله، والخلط بينها فخّ متكرر." },
          { k: "example", h: "أوجد الوسيط", q: "أوجد وسيط: 7, 3, 9, 4, 5", steps: ["رتّب تصاعديًا: 3, 4, 5, 7, 9", "الوسيط = القيمة في المنتصف", "= 5"], answer: "5" },
          { k: "check", q: "ما مدى القيم: 4, 8, 2, 10, 6؟", options: ["8", "6", "10", "5"], a: 0, ex: "المدى = الأكبر − الأصغر = 10 − 2 = 8." },
          { k: "trap", h: "رتّب قبل إيجاد الوسيط", t: "الوسيط يتطلّب الترتيب أولًا! في «7,3,9,4,5» الوسيط ليس 9 (العنصر الأوسط بلا ترتيب) بل 5 بعد الترتيب. والمنوال قد لا يوجد إن لم يتكرّر شيء." },
        ],
        drills: [
          { q: "median of 3, 1, 5 =", options: ["3", "1", "5", "9"], a: 0, ex: "رتّب: 1,3,5 → الأوسط 3." },
          { q: "mode of 2, 4, 4, 7 =", options: ["4", "2", "7", "17"], a: 0, ex: "4 الأكثر تكرارًا." },
          { q: "range of 5, 9, 2 =", options: ["7", "9", "2", "16"], a: 0, ex: "9 − 2 = 7." },
        ]},
      { id: "x7", icon: "🔁", name: "الترادف والتضاد", genDrills: true,
        steps: [
          { k: "teach", h: "الترادف = نفس المعنى، التضاد = العكس", t: "سؤال الترادف يطلب أقرب كلمة في المعنى، وسؤال التضاد يطلب العكس تمامًا. اقرأ رأس السؤال جيدًا: SYNONYM (مرادف) أم OPPOSITE (ضد)؟" },
          { k: "example", h: "ابحث عن المرادف", q: "أقرب كلمة لـ «rapid»:", steps: ["‏rapid تعني «سريع»", "‏slow = بطيء (ضد، لا مرادف)", "‏swift = سريع → المرادف الصحيح"], answer: "swift" },
          { k: "check", q: "عكس (OPPOSITE) كلمة «ancient»:", options: ["modern", "old", "historic", "fragile"], a: 0, ex: "ancient = قديم، وضدها modern = حديث. (old مرادف لا ضد — فخ!)" },
          { k: "trap", h: "احذر الخيار «المرادف» في سؤال التضاد", t: "في أسئلة التضاد يضعون مرادفًا للكلمة كخيار لتضليلك (مثل old مع ancient). حدّد المطلوب أولًا: ضد أم مرادف، ثم اختر." },
        ],
        drills: [
          { q: "مرادف (SYNONYM) كلمة «brave»:", options: ["courageous", "timid", "clever", "polite"], a: 0, ex: "brave = شجاع = courageous." },
          { q: "عكس (OPPOSITE) كلمة «increase»:", options: ["decrease", "rise", "change", "grow"], a: 0, ex: "increase يزيد ↔ decrease ينقص (rise مرادف)." },
        ]},
      { id: "x8", icon: "📝", name: "القواعد وتحديد الخطأ", genDrills: true,
        steps: [
          { k: "teach", h: "طابق الفاعل مع الفعل", t: "الفاعل المفرد الغائب (he/she/it) يأخذ فعلًا بـ s: «She goes». الجمع لا: «They go». وeach/every تُعامل مفردًا. هذا أكثر ما يُختبر في القواعد." },
          { k: "example", h: "أكمل صحيحًا", q: "There ___ many books on the table.", steps: ["‏many books جمع", "الجمع يأخذ are لا is", "→ There are many books"], answer: "are" },
          { k: "check", q: "أي جزء فيه خطأ؟ «She (don't) (like) (to) (swim).»", options: ["don't", "like", "to", "swim"], a: 0, ex: "مع she نستخدم doesn't لا don't. تطابق الفاعل مع الفعل." },
          { k: "trap", h: "الزمن والمقارنة", t: "بعد did/didn't نستخدم المصدر (didn't go لا didn't went). ولا نجمع more مع صيغة er (more taller خطأ؛ taller تكفي). راقب هذي الأنماط." },
        ],
        drills: [
          { q: "They ___ happy now.", options: ["are", "is", "was", "be"], a: 0, ex: "they + الآن → are." },
          { q: "أي جزء فيه خطأ؟ «He (have) (finished) (his) (work).»", options: ["have", "finished", "his", "work"], a: 0, ex: "مع he نستخدم has لا have." },
        ]},
      { id: "x9", icon: "🧩", name: "الاستدلال اللغوي", genDrills: true,
        steps: [
          { k: "teach", h: "استنتج من المعطى فقط", t: "أسئلة الاستدلال تعطيك مقدّمات وتطلب النتيجة الحتمية منها — دون إدخال معلومات من خارج النص. صدق المقدّمة مهما كانت، وابنِ عليها." },
          { k: "example", h: "قياس مباشر", q: "كل المهندسين يبرمجون. سارة مهندسة. إذن:", steps: ["المقدّمة 1: كل مهندس يبرمج", "المقدّمة 2: سارة مهندسة", "النتيجة الحتمية: سارة تبرمج"], answer: "سارة تبرمج" },
          { k: "check", q: "«إن أمطرت، أُلغيت المباراة. المباراة لم تُلغَ.» إذن:", options: ["لم تمطر", "أمطرت", "ستمطر لاحقًا", "المباراة أُجّلت"], a: 0, ex: "نفي النتيجة يستلزم نفي السبب: ما دامت لم تُلغَ، فلم تمطر." },
          { k: "trap", h: "«بعض» ليست «كل»، والعكس ليس دائمًا صحيحًا", t: "«بعض الطلاب رياضيون» لا تعني «كلهم». و«كل مهندس يبرمج» لا تعني «كل مبرمج مهندس». احذر تعميم بعض، وقلب الجملة." },
        ],
        drills: [
          { q: "كل الطيور تبيض. الببغاء طائر. إذن:", options: ["الببغاء يبيض", "الببغاء لا يبيض", "كل ما يبيض طائر", "الببغاء ثديي"], a: 0, ex: "قياس مباشر: كل طائر يبيض، والببغاء طائر." },
          { q: "إن ذاكرت نجحت. لم تنجح. إذن:", options: ["لم تذاكر", "ذاكرت", "ستذاكر", "نجحت جزئيًا"], a: 0, ex: "نفي النتيجة يستلزم نفي السبب." },
        ]},
    ],
  },
});
QQ.registerUnitGen({
  x2: { gens: ["inequality"] },
  x3: { gens: ["prob-simple"] },
  x4: { gens: ["count-comb"] },
  x5: { gens: ["geo-box-vol", "geo-cube", "geo-cylinder"] },
  x7: { gens: ["v-syn", "v-ant"] },
  x8: { gens: ["v-grammar", "v-errid"] },
  x9: { gens: ["v-reason"] },
});
Object.assign(PREREQ, {
  x1: ["f5"], x2: ["s2"], x3: ["s1"], x4: ["s1"], x5: ["s3"], x6: ["s4"], x7: ["s5"], x8: ["f7"], x9: ["s6"],
});

const ACADEMY = [QQ._lessons.F, QQ._lessons.S, QQ._lessons.X, PHASE_AWL, QQ._lessons.Q, QQ._lessons.P, QQ._lessons.C];
{
  const aw = KNOW_TRACKS.find(t => t.name.includes("AWL"));
  const U = PHASE_AWL.units;
  if (aw && U.length) aw.ids = ["f8", U[0].id, U[Math.floor(U.length/2)].id, U[U.length-1].id];
}
validateContent();

const acadDone = (g, unitId) => !!(g.acad && g.acad.units && g.acad.units[unitId]);
const phaseDone = (g, phaseId) => { const ph = ACADEMY.find(p => p.id === phaseId); return ph.units.every(u => acadDone(g, u.id)); };
const phaseProg = (g, ph) => Math.round((ph.units.filter(u => acadDone(g, u.id)).length / ph.units.length) * 100);

/* ---------- 🌳 SKILL TREE ---------- */
const SKILLS = [
  { id: "qtime", branch: "الكمي", icon: "🧮", name: "عين المحلّل", desc: "+8 ثوانٍ في أسئلة الكمي", cost: 1 },
  { id: "qcrit", branch: "الكمي", icon: "💥", name: "ضربة حسابية", desc: "الكريت في الكمي يبدأ من كومبو ×2", cost: 2 },
  { id: "vtime", branch: "اللفظي", icon: "📖", name: "قارئ سريع", desc: "+8 ثوانٍ في أسئلة اللفظي", cost: 1 },
  { id: "vhint", branch: "اللفظي", icon: "🔮", name: "حدس لغوي", desc: "تلميح مجاني بداية كل معركة", cost: 2 },
  { id: "heart4", branch: "عام", icon: "🫀", name: "قلب المحارب", desc: "قلب رابع دائم في المعارك", cost: 3 },
  { id: "gold", branch: "عام", icon: "💰", name: "جيب عميق", desc: "+50% عملات من كل معركة", cost: 2 },
];

/* ---------- 🛒 SHOP ---------- */
const SHOP_ITEMS = [
  { id: "hint", icon: "💡", name: "تلميح", desc: "يحذف خيارين خاطئين", price: 30 },
  { id: "freeze", icon: "🧊", name: "تجميد الوقت", desc: "يوقف العداد لسؤال واحد", price: 40 },
  { id: "potion", icon: "🧪", name: "جرعة حياة", desc: "يرجع قلبًا مفقودًا في المعركة", price: 50 },
];
const AVATARS = [
  { id: "a1", e: "🧑‍🎓", name: "طالب", price: 0 },
  { id: "a2", e: "🥷", name: "نينجا القدرات", price: 120 },
  { id: "a3", e: "🦅", name: "الصقر", price: 160 },
  { id: "a4", e: "🐪", name: "ابن الصحراء", price: 140 },
  { id: "a5", e: "👨‍🚀", name: "رائد المستقبل", price: 220 },
];

/* ---------- 🏅 ACHIEVEMENTS ---------- */
const ACHV = [
  { id: "first", icon: "🩸", name: "أول انتصار", desc: "اربح أول معركة" },
  { id: "combo5", icon: "🔥", name: "سلسلة نارية", desc: "كومبو ×5 في معركة" },
  { id: "ch1", icon: "🎒", name: "خريج الثانوية", desc: "أنهِ الفصل الأول" },
  { id: "gat90", icon: "🏆", name: "نادي الـ90", desc: "حقق 90+ في اختبار القدرات" },
  { id: "rich", icon: "💰", name: "التاجر", desc: "اجمع 500 عملة" },
  { id: "usa", icon: "✈️", name: "مغترب", desc: "اوصل إلى أمريكا" },
  { id: "grad", icon: "🎓", name: "بكالوريوس", desc: "تخرّج من الجامعة" },
  { id: "aramco", icon: "🛢️", name: "حلم أرامكو", desc: "احصل على الوظيفة" },
  { id: "streak3", icon: "⚡", name: "منضبط", desc: "3 أيام لعب متتالية" },
  { id: "skills3", icon: "🌳", name: "متطوّر", desc: "افتح 3 مهارات" },
];

const TITLES = [
  { xp: 0, name: "طالب ثانوي", icon: "🎒" },
  { xp: 150, name: "مجتهد", icon: "📚" },
  { xp: 350, name: "محارب القدرات", icon: "⚔️" },
  { xp: 650, name: "عابر المحيط", icon: "🌊" },
  { xp: 1000, name: "طالب جامعي", icon: "🎓" },
  { xp: 1500, name: "مشروع مهندس", icon: "⚙️" },
  { xp: 2200, name: "أسطورة أرامكو", icon: "👑" },
];


const lvlOf = (xp) => Math.floor(Math.sqrt(xp / 60)) + 1;
const xpForLvl = (l) => 60 * (l - 1) * (l - 1);
const titleOf = (xp) => TITLES.reduce((a, t) => (xp >= t.xp ? t : a), TITLES[0]);

/* ═══════════════════════════════════════════════════════════
   🔁 LOOP ENGINE — مهام دورية، موسم، مقتنيات، خط الرحلة
   ═══════════════════════════════════════════════════════════ */

const DAILY_POOL = [
  { id: "win2", t: "اربح معركتين", goal: 2, ev: "win", r: { coins: 30, xp: 20 } },
  { id: "ans10", t: "أجب 10 إجابات صحيحة", goal: 10, ev: "correct", r: { coins: 25, xp: 15 } },
  { id: "combo3", t: "حقق كومبو ×3 في معركة", goal: 1, ev: "combo3", r: { coins: 20, xp: 15 } },
  { id: "work1", t: "اشتغل وردية عمل", goal: 1, ev: "work", r: { coins: 35, xp: 5 } },
  { id: "perfect", t: "اربح معركة بلا أي خطأ", goal: 1, ev: "perfect", r: { coins: 40, xp: 25 } },
  { id: "talk1", t: "تحدث مع شخصية", goal: 1, ev: "talk", r: { coins: 15, xp: 10 } },
  { id: "awl5", t: "أتقن أو راجع 5 كلمات AWL", goal: 5, ev: "awlword", r: { coins: 30, xp: 20 } },
];
const WEEKLY_POOL = [
  { id: "win8", t: "اربح 8 معارك هذا الأسبوع", goal: 8, ev: "win", r: { coins: 120, xp: 80, item: "potion" } },
  { id: "ans50", t: "50 إجابة صحيحة هذا الأسبوع", goal: 50, ev: "correct", r: { coins: 100, xp: 70, item: "freeze" } },
  { id: "boss2", t: "اهزم زعيمين (تُحسب الإعادة)", goal: 2, ev: "bosswin", r: { coins: 150, xp: 100, item: "hint" } },
  { id: "perfect3", t: "3 معارك مثالية بلا أخطاء", goal: 3, ev: "perfect", r: { coins: 140, xp: 90, item: "potion" } },
  { id: "awl30", t: "30 كلمة AWL هذا الأسبوع", goal: 30, ev: "awlword", r: { coins: 130, xp: 90, item: "hint" } },
];
const SEASON = {
  name: "موسم الرحلة الأول: طريق الـ90",
  tiers: [
    { p: 60, e: "🪙", t: "كيس عملات", r: { coins: 80 } },
    { p: 150, e: "💡", t: "حزمة تلميحات", r: { items: { hint: 2 } } },
    { p: 280, e: "🧪", t: "حزمة بقاء", r: { items: { potion: 2, freeze: 1 } } },
    { p: 450, e: "💰", t: "كنز الموسم", r: { coins: 250 } },
    { p: 650, e: "🏆", t: "صندوق الأسطورة", r: { coins: 300, items: { hint: 2, freeze: 2, potion: 2 } } },
  ],
};
const Q_SECS = ["arithmetic", "algebra", "geometry", "comparison", "data"];
const V_SECS = ["analogy", "sentence", "reading"];

const COLLECT = [
  { id: "cert1", e: "📜", n: "شهادة الثانوية", h: "اهزم الاختبار التجريبي", cond: (g) => g.done["1:boss"] },
  { id: "gatcard", e: "🎫", n: "بطاقة نتيجة قياس", h: "ادخل اختبار القدرات", cond: (g) => !!g.gatScore },
  { id: "gat90m", e: "🥇", n: "وسام نادي الـ90", h: "حقق 90+ في القدرات", cond: (g) => (g.gatScore || 0) >= 90 },
  { id: "accept", e: "✉️", n: "خطاب القبول الجامعي", h: "انقبل في جامعة", cond: (g) => !!g.uni },
  { id: "board", e: "🛂", n: "بطاقة صعود الطائرة", h: "اعبر فرز الابتعاث", cond: (g) => g.done["3:boss"] },
  { id: "mug", e: "☕", n: "كوب ليالي الفاينلات", h: "انجُ من أسبوع الفاينلات", cond: (g) => g.done["5:boss"] },
  { id: "cap", e: "🎓", n: "قبعة التخرج", h: "تخرّج بالبكالوريوس", cond: (g) => g.done["6:boss"] },
  { id: "badge", e: "🪪", n: "بطاقة موظف أرامكو", h: "حقق النهاية الأسطورية", cond: (g) => g.ending === "legend" },
  { id: "flame", e: "🔥", n: "شعلة الكومبو", h: "كومبو ×5", cond: (g) => g.stats.bestCombo >= 5 },
  { id: "bolt", e: "⚡", n: "صاعقة الانضباط", h: "سلسلة 7 أيام", cond: (g) => g.streak >= 7 || g.ach.includes("streak7") },
  { id: "lv5m", e: "🏵️", n: "وسام المستوى 5", h: "اوصل المستوى 5", cond: (g) => lvlOf(g.xp) >= 5 },
  { id: "lv10m", e: "💠", n: "وسام المستوى 10", h: "اوصل المستوى 10", cond: (g) => lvlOf(g.xp) >= 10 },
  { id: "dipF", e: "🧱", n: "شهادة التأسيس", h: "أكمل مرحلة التأسيس بالأكاديمية", cond: (g) => phaseDone(g, "F") },
  { id: "dipS", e: "🔨", n: "شهادة بناء المهارات", h: "أكمل المرحلة الثانية بالأكاديمية", cond: (g) => phaseDone(g, "S") },
  { id: "dipQ", e: "🧭", n: "درع الاستراتيجيات", h: "أكمل مرحلة القدرات بالأكاديمية", cond: (g) => phaseDone(g, "Q") },
  { id: "dipP", e: "🥇", n: "ختم الاحتراف", h: "أكمل المحاكاة والتحدي", cond: (g) => phaseDone(g, "P") },
  { id: "dipA", e: "🎓", n: "شهادة AWL الأكاديمية", h: "أتقن حزم الكلمات الست", cond: (g) => phaseDone(g, "A") },
  { id: "dipC", e: "🏭", n: "شهادة CPC Prep", h: "أكمل تحضير أرامكو", cond: (g) => phaseDone(g, "C") },
  { id: "road6", e: "🏢", n: "طريق أرامكو مكتمل", h: "أنهِ محطات الرحلة الست", cond: (g) => roadMilestones(g).M.every(m => m.done) },
  { id: "steel", e: "🧠", n: "الذاكرة الفولاذية", h: "أوصل مفهومًا لأعلى مستوى تثبيت", cond: (g) => Object.values(g.srs || {}).some(s => s.lvl >= 4) },
];

const dayKey = () => new Date().toDateString();
const weekKey = () => { const d = new Date(); return d.getFullYear() + "-w" + Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 6048e5); };
const seedPick = (pool, seed, count) => {
  let h = 7; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const arr = [...pool]; const out = [];
  for (let i = 0; i < count && arr.length; i++) { h = (h * 1103515245 + 12345) >>> 0; out.push(arr.splice(h % arr.length, 1)[0].id); }
  return out;
};
function ensurePeriods(n) {
  if (!n.daily || n.daily.date !== dayKey()) n.daily = { date: dayKey(), ids: seedPick(DAILY_POOL, dayKey(), 3), prog: {}, claimed: {} };
  if (!n.weekly || n.weekly.week !== weekKey()) n.weekly = { week: weekKey(), ids: seedPick(WEEKLY_POOL, weekKey(), 2), prog: {}, claimed: {} };
  if (!n.season) n.season = { pts: 0, claimed: [] };
  if (!n.history) n.history = [];
  if (!n.timeline) n.timeline = [];
}
function questEv(n, ev, amt = 1) {
  ensurePeriods(n);
  const upd = (scope, pool) => scope.ids.forEach(id => {
    const d = pool.find(p => p.id === id);
    if (d && d.ev === ev && !scope.claimed[id]) scope.prog[id] = Math.min(d.goal, (scope.prog[id] || 0) + amt);
  });
  upd(n.daily, DAILY_POOL); upd(n.weekly, WEEKLY_POOL);
}
function tl(n, k, e, t, b) { if (!n.timeline.some(x => x.k === k)) n.timeline.push({ k, day: n.day, e, t, b }); }

/* ═══ 🪞 شخصية اللاعب المستنتجة من أفعاله ═══ */
function traitsOf(g) {
  const m = g.mem || {};
  return {
    studious: (m.study || 0) >= 6 && (m.study || 0) >= (m.work || 0),
    worker: (m.work || 0) >= 4 && (m.work || 0) > (m.study || 0),
    tired: g.energy < 30,
    comeback: !!m.lastComeback,
    precise: (m.perfects || 0) >= 3,
  };
}

const SEC_AR = { analogy: "التناظر اللفظي", sentence: "إكمال الجمل", reading: "الاستيعاب", arithmetic: "الحساب والنسب", algebra: "الجبر", geometry: "الهندسة", comparison: "المقارنات", data: "تحليل البيانات", vocab: "المفردات" };

/* ═══════════════════════════════════════════════════════════
   🧠 ADAPTIVE BRAIN — اللعبة تراقب، تحلل، وتكيّف المحتوى
   ═══════════════════════════════════════════════════════════ */
const ALL_SECS = ["arithmetic", "algebra", "geometry", "comparison", "data", "analogy", "sentence", "reading", "vocab"];
const secStat = (g, s) => g.stats.bySec[s] || { a: 0, c: 0, t: 0, to: 0 };

// مستوى الإتقان لكل قسم
function masteryOf(g, s) {
  const v = secStat(g, s);
  if (v.a < 4) return { lvl: 0, label: "جديد", e: "🌱" };
  const acc = (v.c / v.a) * 100;
  if (acc >= 85 && v.a >= 8) return { lvl: 3, label: "متقن", e: "🏆" };
  if (acc >= 70) return { lvl: 2, label: "متمكن", e: "💪" };
  if (acc >= 50) return { lvl: 1, label: "يتطور", e: "📈" };
  return { lvl: 0, label: "ركّز هنا", e: "🎯" };
}
// وزن ظهور القسم: الضعيف يظهر أكثر، المتقن يقل
function weightOf(g, s) {
  const v = secStat(g, s);
  if (v.a < 4) return 60;                       // قسم جديد: اعطه فرصة عادلة
  const acc = (v.c / v.a) * 100;
  return Math.max(8, Math.round(112 - acc));    // 40% دقة → وزن 72، 90% دقة → وزن 22
}
const weakestOf = (g, secs) => [...secs].sort((a, b) => weightOf(g, b) - weightOf(g, a))[0];

// نصائح مخصصة لكل قسم (تُدمج مع أرقام اللاعب الفعلية)
const TIP_FIX = {
  arithmetic: "خطأ النسب الأشهر: القسمة على القيمة الجديدة. القاعدة: نسبة التغيّر = الفرق ÷ (القديمة). وللرجوع لسعر قبل الخصم: اقسم على النسبة المتبقية، لا تجمع.",
  algebra: "اعزل x بعكس العملية خطوة خطوة، وتحقق بالتعويض قبل ما تضغط — 5 ثوانٍ تحقق توفر قلبًا كاملًا.",
  geometry: "احفظ الخمسة الذهبية: مثلث 180°، فيثاغورس وثلاثية (3,4,5)، مساحة الدائرة πr² ومحيطها 2πr، والمحيط = 2(طول+عرض). أغلب أخطائك من الخلط بين المساحة والمحيط.",
  comparison: "لا تحكم من أول نظرة. جرّب دائمًا: عدد كبير ← 1 ← 0 ← كسر بين 0 و1. إذا اختلفت النتيجة بين تجربتين فالجواب Cannot be determined فورًا.",
  data: "قبل أي رقم: اقرأ عنوان الجدول ووحدته. ونسبة التغير تُقسم على القيمة الأصلية دائمًا.",
  analogy: "كوّن جملة تربط الكلمتين قبل ما تشوف الخيارات (A hammer drives a nail)، ثم طبّقها حرفيًا على كل خيار — خيار واحد فقط ستنطبق عليه.",
  sentence: "أول شي حدد كلمة الإشارة: although/but = عكس الاتجاه، because/so = نفس الاتجاه. توقّع الكلمة بنفسك ثم احذف المخالف.",
  reading: "اقرأ السؤال قبل القطعة، وجاوب الفكرة الرئيسية بما يغطي القطعة كلها — الخيار اللي يذكر تفصيلة صحيحة لكن جزئية هو الفخ.",
  vocab: "اربط كل كلمة جديدة بصورة أو موقف (scarce = ماء الصحراء النادر). المراجعة بعد النوم مباشرة تثبّت ضعف ما تثبّته المذاكرة المتواصلة.",
};
const TIP_SPEED = {
  arithmetic: "درّب نفسك على حيلة الـ10%: حرّك الفاصلة ثم ركّب. الحساب الذهني السريع = وقت إضافي لباقي الأسئلة.",
  reading: "لا تترجم في راسك — اقرأ وافهم بالإنجليزي مباشرة. الترجمة الذهنية تلتهم نصف وقتك.",
  default: "إذا أخذ السؤال منك دقيقة: احذف خيارين وخمّن بذكاء وواصل — سؤال واحد لا يستحق طاقة معركة كاملة.",
};

// المدرب الذكي: يختار أهم ملاحظة بناء على البيانات الفعلية
function coachInsight(g) {
  const cand = [];
  ALL_SECS.forEach(s => {
    const v = secStat(g, s);
    if (v.a < 4) return;
    const acc = Math.round((v.c / v.a) * 100);
    const avg = Math.round((v.t || 0) / v.a);
    const name = SEC_AR[s] || s;
    if (acc < 55)
      cand.push({ p: 110 - acc, e: "🎯", h: `${name}: ${acc}% صح من ${v.a} محاولة`, d: `${TIP_FIX[s]} — رفعت ظهور ${name} في معاركك القادمة حتى تكسره.` });
    else if ((v.to || 0) >= 3)
      cand.push({ p: 65, e: "⏰", h: `${v.to} إجابات ضاعت بانتهاء الوقت في ${name}`, d: TIP_SPEED[s] || TIP_SPEED.default });
    else if (avg >= 50 && acc >= 60)
      cand.push({ p: 45, e: "🐢", h: `${name}: دقتك ${acc}% لكن متوسط حلّك ${avg} ثانية`, d: TIP_SPEED[s] || TIP_SPEED.default });
    else if (acc >= 85 && v.a >= 8)
      cand.push({ p: 25, e: "🏆", h: `أتقنت ${name} — ${acc}% عبر ${v.a} محاولة`, d: `خفّضت ظهوره ووجّهت أسئلتك نحو ${SEC_AR[weakestOf(g, ALL_SECS.filter(x => secStat(g, x).a > 0 && x !== s))] || "أقسام جديدة"}. الإتقان يُصان بالتنويع.` });
  });
  if (!cand.length) return null;
  return cand.sort((a, b) => b.p - a.p)[0];
}

const accOf = (g, secs) => { let a = 0, c = 0; secs.forEach(s => { const v = g.stats.bySec[s]; if (v) { a += v.a; c += v.c; } }); return a ? Math.round((c / a) * 100) : null; };

/* ---------- 📜 CHAPTERS: STORY + QUESTS ---------- */
const CH = [
  {
    id: 1, emoji: "🏫", title: "الفصل الأول: الثانوية", place: "حيّك — المملكة العربية السعودية",
    intro: [
      { who: "الراوي", e: "📖", t: "سنة التخرج. كل شيء في حياتك القادمة يمر من بوابة واحدة: اختبار القدرات." },
      { who: "أبوك", e: "👳", t: "يا وليدي، أنا أعرف قدك. أرامكو ما تاخذ إلا اللي يتعب... ورّني وش عندك." },
      { who: "سلطان (صديقك)", e: "😎", t: "تراهم يقولون اللي ياخذ 90+ يفتح له باب الابتعاث. أنا بذاكر معك... بس أول واحد ينهزم يعزم الثاني 🍔" },
    ],
    quests: [
      { id: "q1", type: "battle", name: "وحش الكسل", icon: "😴", desc: "أول ليلة مذاكرة. الكسل يجلس على كتفك — اطرده بالأرقام.", enemy: { hp: 3, secs: ["arithmetic"], time: 45, xp: 40, coins: 25 } },
      { id: "q2", type: "battle", name: "شبح النسيان", icon: "👻", desc: "القوانين تتبخر من راسك؟ ثبّتها بمعركة جبر.", enemy: { hp: 3, secs: ["algebra"], time: 45, xp: 40, coins: 25 } },
      { id: "q3", type: "battle", name: "متاهة الكلمات", icon: "🌀", desc: "بوابة المكتبة مقفلة بألغاز لفظية. كل إجابة تفك قفلًا.", enemy: { hp: 3, secs: ["analogy", "sentence"], time: 45, xp: 45, coins: 30 } },
      { id: "side1", type: "battle", side: true, repeat: true, name: "وردية الكشك 🕐", icon: "🏪", desc: "شغلة جانبية: حاسب الزبائن بسرعة واكسب عملات. (قابلة للتكرار)", enemy: { hp: 4, secs: ["arithmetic", "data"], time: 30, xp: 15, coins: 45 } },
    ],
    boss: { name: "الاختبار التجريبي", icon: "📝", desc: "بروفة القدرات في المدرسة. اهزمه لتثبت أنك جاهز للحقيقي.", hp: 5, secs: ["arithmetic", "algebra", "analogy", "sentence"], time: 40, xp: 90, coins: 60 },
    outro: [{ who: "المرشد الطلابي", e: "🧑‍🏫", t: "نتيجتك التجريبية ممتازة. سجلتك في اختبار القدرات الرسمي... الأسبوع الجاي. لا تخذل نفسك." }],
  },
  {
    id: 2, emoji: "🏛️", title: "الفصل الثاني: يوم الاختبار", place: "مقر قياس",
    intro: [
      { who: "الراوي", e: "📖", t: "قاعة صامتة. شاشة أمامك. قلبك يدق. هذا هو اليوم اللي تدربت له." },
      { who: "أنت", e: "😤", t: "كل سؤال جاوبته، كل قلب خسرته، كل كومبو... كان لأجل هذي اللحظة." },
    ],
    quests: [
      { id: "q1", type: "battle", name: "قهر التوتر", icon: "😰", desc: "قبل الدخول، توترك يهاجمك. اهزمه بأسئلة إحماء سريعة.", enemy: { hp: 3, secs: ["arithmetic", "geometry"], time: 35, xp: 40, coins: 20 } },
    ],
    boss: { name: "⚡ اختبار القدرات ⚡", icon: "🐉", desc: "المعركة الكبرى: 10 أسئلة من كل الأقسام. أداؤك هنا يحدد درجتك... ودرجتك تحدد مستقبلك.", hp: 10, secs: ["arithmetic", "algebra", "geometry", "comparison", "data", "analogy", "sentence", "reading"], time: 40, xp: 150, coins: 100, isGat: true },
    outro: [{ who: "الراوي", e: "📖", t: "أسبوعان من الانتظار... ثم وصلت الرسالة النصية: نتيجتك ظهرت." }],
  },
  {
    id: 3, emoji: "🎓", title: "الفصل الثالث: أبواب الجامعات", place: "منصة القبول الموحد",
    intro: [{ who: "الراوي", e: "📖", t: "درجتك صارت مفتاحًا. بعض الأبواب تنفتح لها... وبعضها يحتاج مفتاحًا أثقل." }],
    quests: [
      { id: "choice", type: "choice", name: "اختر جامعتك", icon: "🗝️", desc: "درجتك تحدد الأبواب المفتوحة." },
      { id: "q1", type: "battle", name: "مقابلة القبول", icon: "🎤", desc: "لجنة القبول تختبر لغتك. أثبت جدارتك.", enemy: { hp: 3, secs: ["sentence", "reading"], time: 45, xp: 50, coins: 30 } },
    ],
    boss: { name: "اختبار الابتعاث المبدئي", icon: "🛂", desc: "أرامكو تفرز المتقدمين. تجاوز الفرز لتحجز مقعدك في الطائرة.", hp: 5, secs: ["comparison", "algebra", "reading"], time: 40, xp: 100, coins: 70 },
    outro: [{ who: "أمك", e: "🤲", t: "دمعت عيونها وهي تودعك في المطار: الله يوفقك يا ضاوي... لا تنسانا من دعائك." }],
  },
  {
    id: 4, emoji: "🗽", title: "الفصل الرابع: أمريكا", place: "الولايات المتحدة — بيئة جديدة كليًا",
    usa: true,
    intro: [
      { who: "الراوي", e: "📖", t: "14 ساعة طيران. لغة ثانية. وجوه جديدة. برد ما تعرفه. أهلًا بك في الغربة." },
      { who: "Officer", e: "🛂", t: "Welcome to the United States. Purpose of your visit?" },
      { who: "أنت", e: "💼", t: "Scholarship student. Petroleum Engineering... إن شاء الله." },
    ],
    quests: [
      { id: "q1", type: "battle", name: "متاهة المطار", icon: "🛄", desc: "لافتات، إعلانات، اتجاهات — كلها بالإنجليزي. اقرأ صح توصل صح.", enemy: { hp: 3, secs: ["reading", "sentence"], time: 45, xp: 55, coins: 35 } },
      { id: "q2", type: "battle", name: "Roommate Jake", icon: "🧑‍🤝‍🧑", desc: "زميل سكنك يتكلم بسرعة صاروخ. افهمه وجاوبه لتكسب أول صديق.", enemy: { hp: 3, secs: ["analogy", "sentence"], time: 40, xp: 55, coins: 35 } },
      { id: "side1", type: "battle", side: true, repeat: true, name: "شفت المقهى ☕", icon: "🧋", desc: "شغل جزئي: احسب الفواتير والباقي بسرعة. (قابل للتكرار)", enemy: { hp: 4, secs: ["arithmetic", "data"], time: 28, xp: 15, coins: 50 } },
    ],
    boss: { name: "امتحان تحديد المستوى", icon: "🏛️", desc: "الجامعة تقرر: تبدأ مباشرة أم سنة تحضيرية؟ قرارها بيدك أنت.", hp: 6, secs: ["reading", "sentence", "algebra", "arithmetic"], time: 38, xp: 120, coins: 80 },
    outro: [{ who: "Prof. Johnson", e: "👨‍🏫", t: "Impressive placement. See you in class, Mr. Dhawi." }],
  },
  {
    id: 5, emoji: "📚", title: "الفصل الخامس: الحياة الجامعية", place: "الحرم الجامعي",
    usa: true,
    intro: [{ who: "الراوي", e: "📖", t: "محاضرات، مشاريع، ليالي سهر، وقهوة كثيرة. هنا يُصنع المهندسون." }],
    quests: [
      { id: "q1", type: "battle", name: "Midterm الرياضيات", icon: "📐", desc: "أول ميدترم. البروفيسور لا يرحم.", enemy: { hp: 4, secs: ["algebra", "geometry"], time: 40, xp: 60, coins: 40 } },
      { id: "q2", type: "battle", name: "مشروع الفريق", icon: "🧪", desc: "فريقك تأخر والتسليم غدًا. حلّل البيانات وأنقذ المشروع.", enemy: { hp: 4, secs: ["data", "comparison"], time: 40, xp: 60, coins: 40 } },
      { id: "q3", type: "battle", name: "نادي المناظرات", icon: "🗣️", desc: "مثّل الطلاب السعوديين في مناظرة الجامعة.", enemy: { hp: 3, secs: ["sentence", "reading"], time: 40, xp: 55, coins: 35 } },
    ],
    boss: { name: "أسبوع الفاينلات", icon: "🌪️", desc: "كل المواد في أسبوع واحد. أطول معركة في الرحلة — لا تنهار.", hp: 7, secs: ["arithmetic", "algebra", "geometry", "comparison", "data", "sentence", "reading"], time: 36, xp: 140, coins: 90 },
    outro: [{ who: "سلطان (مكالمة فيديو)", e: "📱", t: "يا بعد حيي! باقي لك سنة وتتخرج.. تراي محتفظ بفاتورة البرجر لا تنسى 🍔" }],
  },
  {
    id: 6, emoji: "🎓", title: "الفصل السادس: التخرج", place: "قاعة الاحتفالات الكبرى",
    usa: true,
    intro: [{ who: "الراوي", e: "📖", t: "أربع سنين اختصرتها اللحظة هذي: اسمك يُنادى على المسرح... لكن قبلها، آخر عقبة." }],
    quests: [
      { id: "q1", type: "battle", name: "مناقشة مشروع التخرج", icon: "🎤", desc: "لجنة من ثلاثة بروفيسورات. دافع عن مشروعك رقمًا رقمًا.", enemy: { hp: 4, secs: ["data", "comparison", "reading"], time: 38, xp: 70, coins: 45 } },
    ],
    boss: { name: "الاختبار الشامل النهائي", icon: "🏰", desc: "آخر بوابة قبل الشهادة. كل ما تعلمته في الرحلة... الآن.", hp: 7, secs: ["arithmetic", "algebra", "geometry", "comparison", "data", "analogy", "sentence", "reading"], time: 35, xp: 160, coins: 110 },
    outro: [{ who: "الراوي", e: "📖", t: "🎓 \"Dhawi... Bachelor of Engineering, with Honors.\" — تصفيق. دموع. ومكالمة لأهلك ما تُنسى." }],
  },
  {
    id: 7, emoji: "🛢️", title: "الفصل الأخير: طريق أرامكو", place: "الظهران — المملكة",
    intro: [
      { who: "الراوي", e: "📖", t: "رجعت للوطن بشهادة... لكن الحلم ما اكتمل بعد. برج أرامكو ينتظر." },
      { who: "م. خالد (التوظيف)", e: "🧑‍💼", t: "سيرتك قوية يا ضاوي. عندنا مقابلة فنية واختبار قبول. الأفضل فقط يعبرون." },
    ],
    quests: [
      { id: "q1", type: "battle", name: "المقابلة الفنية", icon: "🎙️", desc: "أسئلة سريعة بالإنجليزي أمام لجنة. كل تلعثم يحسب عليك.", enemy: { hp: 4, secs: ["sentence", "analogy", "reading"], time: 35, xp: 70, coins: 50 } },
    ],
    boss: { name: "👑 اختبار قبول أرامكو 👑", icon: "🏯", desc: "المعركة الأخيرة في الرحلة كلها. أصعب توقيت، أقوى أسئلة. أداؤك هنا + درجة قدراتك = نهايتك.", hp: 8, secs: ["arithmetic", "algebra", "geometry", "comparison", "data", "analogy", "sentence", "reading"], time: 30, xp: 200, coins: 150, isFinal: true },
    outro: [],
  },
];

const UNIS = [
  { name: "جامعة البترول والمعادن (KFUPM)", need: 90, e: "⛽" },
  { name: "جامعة الملك سعود", need: 85, e: "🏛️" },
  { name: "جامعة الملك عبدالعزيز", need: 80, e: "🌊" },
  { name: "جامعة إقليمية", need: 0, e: "🏫" },
];


/* ═══════════════════════════════════════════════════════════
   🌍 WORLD LAYER — عالم حر، وقت، شخصيات حية، أحداث
   ═══════════════════════════════════════════════════════════ */

const eraOf = (ch) => (ch <= 3 ? "sa" : ch <= 6 ? "us" : "sa2");
const SLOTS = ["🌅 الصباح", "☀️ الظهر", "🌆 المساء"];

const LOCS = {
  sa: [
    { id: "home", e: "🏠", name: "البيت" },
    { id: "library", e: "📚", name: "الأكاديمية" },
    { id: "school", e: "🏫", name: "المدرسة" },
    { id: "kiosk", e: "🏪", name: "الكشك" },
    { id: "qiyas", e: "🏛️", name: "مركز قياس", minCh: 2 },
  ],
  us: [
    { id: "dorm", e: "🛏️", name: "السكن الجامعي" },
    { id: "campus", e: "🎓", name: "الحرم الجامعي" },
    { id: "cafe", e: "☕", name: "المقهى" },
    { id: "airport", e: "🛫", name: "المطار", maxCh: 4 },
  ],
  sa2: [
    { id: "home2", e: "🏠", name: "بيت الأهل" },
    { id: "library", e: "📚", name: "الأكاديمية" },
    { id: "aramco", e: "🛢️", name: "برج أرامكو" },
  ],
};

// السماء تتغير مع الوقت والمكان
const SKY = {
  sa: ["linear-gradient(#FFE3B3,#FDF6E3)", "linear-gradient(#AEE1F9,#F4F6F3)", "linear-gradient(#F2A65A,#5B3A6E)"],
  us: ["linear-gradient(#C9D9F0,#EDF2F9)", "linear-gradient(#9CC3E8,#E8EEF5)", "linear-gradient(#31456E,#141F38)"],
  sa2: ["linear-gradient(#FFE3B3,#FDF6E3)", "linear-gradient(#AEE1F9,#F4F6F3)", "linear-gradient(#F2A65A,#5B3A6E)"],
};
const NIGHT = "linear-gradient(#0B1020,#1A1030)";

/* ---------- 🎲 أحداث الصباح العشوائية ---------- */
const EVENTS = [
  { id: "mom", e: "📞", t: "اتصال من أمك", d: "«اشتقنا لك يا وليدي… انتبه لنفسك.» — دعواتها شحنتك.", fx: (n) => { n.energy = Math.min(100, n.energy + 20); }, tag: "+20 طاقة" },
  { id: "fire", e: "🔥", t: "يوم حماس", d: "صحيت وأنت شعلة. كل XP اليوم مضاعف!", fx: (n) => { n.dayFlags.x2 = true; }, tag: "XP ×2 اليوم" },
  { id: "sale", e: "🏷️", t: "تخفيضات المتجر", d: "كل أدوات المعركة بنص السعر اليوم فقط.", fx: (n) => { n.dayFlags.sale = true; }, tag: "خصم 50%" },
  { id: "gift", e: "🎁", t: "هدية من سلطان", d: "«خذ هذي ولا تقول أحد» — حوّل لك مصروف.", fx: (n) => { n.coins += 35; }, tag: "+35 🪙" },
  { id: "bad", e: "😴", t: "نوم متقطع", d: "سهرت على جوالك… صحيت مكسّر.", fx: (n) => { n.energy = Math.max(20, n.energy - 20); }, tag: "−20 طاقة" },
  { id: "hint", e: "💡", t: "فكرة قبل الفطور", d: "خطرت لك طريقة حل ذكية. سجلتها.", fx: (n) => { n.items.hint++; }, tag: "+1 تلميح" },
];

/* ---------- 🗣️ الشخصيات الحية — تتذكر وتتفاعل ---------- */
function awlFlavor(g) {
  const learned = Object.keys(AWL_WORDS).filter(id => acadDone(g, id)).flatMap(id => AWL_WORDS[id]);
  return learned.length ? learned[Math.floor(Math.random() * learned.length)] : null;
}
function npcLines(id, g) {
  const lb = g.lastBattle, m = g.mem || {}, tr = traitsOf(g);
  const L = [];
  if (id === "dad") {
    if (m.lastComeback) L.push({ who: "أبوك", e: "👳", t: `سمعت إنك رجعت لـ"${m.lastComeback}" وكسرته بعد ما طرحك… هذا بالضبط اللي أعرفه فيك: ما تنكسر، تتأخر بس.` });
    else if (tr.tired) L.push({ who: "أبوك", e: "👳", t: "تعال… عيونك تعبانة يا وليدي. المذاكرة بعقل مرتاح تسوى ثلاث ليالي سهر. نم مبكر الليلة." });
    else if (tr.worker) L.push({ who: "أبوك", e: "👳", t: "الكشك زين والرزق حلال، بس لا يأكل مذاكرتك. إذا ضاق عليك المصروف… أنا موجود." });
    if ((g.gatScore || 0) >= 90) L.push({ who: "أبوك", e: "👳", t: `تسعين يا ${g.name}؟! والله إني فخور فيك… هذا اللي كنت أقوله لك.` });
    else if (lb && !lb.won) L.push({ who: "أبوك", e: "👳", t: "شفتك طالع من المعركة مكسور… اسمعني: اللي ينهزم ويرجع، هذا اللي يوصل." });
    else if (tr.studious) L.push({ who: "أبوك", e: "👳", t: `صرت أسمع اسمك بالمجلس… "ولد فلان ما يرفع راسه من الكتاب". كمّل يا بعد حيي.` });
    else if (g.streak >= 3) L.push({ who: "أبوك", e: "👳", t: `${g.streak} أيام ورا بعض وأنت مواصل… كذا يكون الرجال.` });
    else L.push({ who: "أبوك", e: "👳", t: "المذاكرة أول، والباقي يجي. تحتاج شي قول لي." });
  }
  if (id === "sultan") {
    if (m.gatImproved) L.push({ who: "سلطان", e: "😎", t: `لحظة لحظة… من ${m.gatImproved.from} إلى ${m.gatImproved.to}؟! يا وحش الإعادة 😤🔥 أنا اللي علمته ترا (أمزح، كله منك).` });
    else if (m.lastComeback && g.chapter <= 3) L.push({ who: "سلطان", e: "😎", t: `كل المدرسة تتكلم عن رجعتك لـ"${m.lastComeback}". قلت لهم: هذا ربعي وأنا أعرفه من زمان 😌` });
    if (g.chapter === 1) L.push({ who: "سلطان", e: "😎", t: tr.worker ? "يا شيخ خذ لك إجازة من الكشك… المعدل ما ينسحب من الكاشير 🍔" : lb?.won ? "سمعت إنك دمرت آخر معركة… خل نشوفك بالتجريبي" : "متوتر؟ عادي كلنا. المهم عزيمة البرجر قايمة على الخسران." });
    else if (g.chapter <= 3) L.push({ who: "سلطان", e: "😎", t: g.gatScore ? (g.gatScore >= 90 ? `${g.gatScore}؟ يا وحش!! أرامكو جات تجيك` : `درجتك ${g.gatScore}… قريبة. عيدها وارفعها، وأنا وياك`) : "خلصت قياس؟ طمني أول ما تطلع النتيجة!" });
    else L.push({ who: "سلطان (مكالمة)", e: "📱", t: tr.studious ? "يا مغترب! صرت تذاكر أكثر مني أنا بالسعودية… فاتورة البرجر لسا محفوظة 🍔" : "يا مغترب! أمريكا غيرتك؟ ترا فاتورة البرجر لسا محفوظة عندي 🍔" });
  }
  if (id === "jake") {
    if (tr.tired) L.push({ who: "Jake", e: "🧑‍🤝‍🧑", t: "Bro, you look wrecked. Sleep IS a study strategy — trust me, I learned the hard way." });
    else if (m.lastComeback) L.push({ who: "Jake", e: "🧑‍🤝‍🧑", t: `You went back and beat "${m.lastComeback}"? That's the comeback spirit, man. Respect.` });
    const fw = awlFlavor(g);
    if (fw) L.push({ who: "Jake", e: "🧑‍🤝‍🧑", t: `Word of the day from your flashcards: «${fw.w}» — ${fw.ar}. Drop it in an essay and profs will love you.` });
    if (g.chapter === 4) L.push({ who: "Jake", e: "🧑‍🤝‍🧑", t: lb?.won ? "Dude, you're crushing it! Placement test next — you got this." : "Rough day? Happens. Coffee, reset, try again tomorrow." });
    else L.push({ who: "Jake", e: "🧑‍🤝‍🧑", t: g.chapter >= 6 ? `Graduation soon, ${g.name}! Remember when you couldn't find gate B12? Look at you now.` : "Midterms week is brutal. Library at 8? I'll bring snacks." });
  }
  if (id === "prof") {
    if (tr.precise) L.push({ who: "Prof. Johnson", e: "👨‍🏫", t: `${m.perfects} flawless battles, ${g.name}. That level of precision is what separates engineers from students.` });
    else if (m.comeback["5:boss"]) L.push({ who: "Prof. Johnson", e: "👨‍🏫", t: "Your resilience after stumbling in finals week impressed me more than any grade could." });
    if (g.stats.answered && g.stats.correct / g.stats.answered >= 0.8) L.push({ who: "Prof. Johnson", e: "👨‍🏫", t: `Your accuracy is remarkable, ${g.name}. Top of the class material.` });
    else L.push({ who: "Prof. Johnson", e: "👨‍🏫", t: "Struggling is part of learning. Review your mistakes — they teach more than victories." });
    const pw = awlFlavor(g);
    if (pw) L.push({ who: "Prof. Johnson", e: "👨‍🏫", t: `Vocabulary shapes thought. Today's word: «${pw.w}» (${pw.ar}) — try using it in a sentence before we meet again.` });
  }
  if (id === "khaled") {
    if (phaseDone(g, "C")) L.push({ who: "م. خالد", e: "🧑‍💼", t: `شهادة CPC Preparation مكتملة في ملفك يا ${g.name}… قليلون يجون بهذا الاستعداد. الاختبار الأخير صار تحصيل حاصل.` });
    else if (g.chapter === 7) L.push({ who: "م. خالد", e: "🧑‍💼", t: "قبل ما تدخل اختبار القبول: برنامجنا يشترط إتمام تحضير CPC. الأكاديمية عندك في الحي — أكمله وارجع لي." });
    if (m.gatImproved) L.push({ who: "م. خالد", e: "🧑‍💼", t: `ملفك يحكي قصة: أعدت القدرات ورفعتها من ${m.gatImproved.from} إلى ${m.gatImproved.to}. نحن لا نوظف الكمال… نوظف من لا يستسلم.` });
    L.push({ who: "م. خالد", e: "🧑‍💼", t: (g.gatScore || 0) >= 90 ? `ملفك من الأقوى اللي شفتها يا ${g.name}. باقي عليك الاختبار الأخير… ولا أشك فيك.` : "المنافسة شرسة هالسنة. اللي يعبر الاختبار الأخير بجدارة، الوظيفة له." });
  }
  if (id === "mom") {
    if (tr.tired) L.push({ who: "أمك", e: "🤲", t: "وجهك شاحب يا قلبي… لا تذبح نفسك. ارتاح، وأنا أدعي لك بالتوفيق كل سجدة." });
    else L.push({ who: "أمك", e: "🤲", t: g.chapter >= 4 ? "يا قلب أمك… كل ليلة أدعي لك. كل زين؟ تاكل عدل؟" : "قم تعش يا ولدي، والمذاكرة لها بقية بكرة بإذن الله." });
  }
  return L.slice(0, 2);
}

/* ---------- 🏠 محتوى المباني حسب الفصل ---------- */
function locContent(locId, g) {
  const ch = g.chapter;
  const c = { npcs: [], quests: [], acts: [] };
  const CQ = (chId, qid) => {
    const chd = CH.find(x => x.id === chId);
    if (qid === "boss") return { chId, qid, isBoss: true, name: chd.boss.name, icon: chd.boss.icon, desc: chd.boss.desc, enemy: { hp: chd.boss.hp, secs: chd.boss.secs, time: chd.boss.time, xp: chd.boss.xp, coins: chd.boss.coins, isGat: chd.boss.isGat, isFinal: chd.boss.isFinal }, mainsDone: chd.quests.filter(q => !q.side).every(q => g.done[`${chId}:${q.id}`]) };
    const q = chd.quests.find(x => x.id === qid);
    return { chId, qid, name: q.name, icon: q.icon, desc: q.desc, enemy: q.enemy, side: q.side, repeat: q.repeat, type: q.type };
  };
  if (locId === "home") {
    c.npcs = ["dad", "mom"];
    if (ch === 1) c.quests.push(CQ(1, "q1"));
    if (ch === 3) { c.quests.push(CQ(3, "choice"), CQ(3, "q1"), CQ(3, "boss")); }
    c.acts.push("rest", "daily", "sleep");
  }
  if (locId === "school") {
    c.npcs = ["sultan"];
    if (ch === 1) c.quests.push(CQ(1, "q2"), CQ(1, "q3"), CQ(1, "boss"));
  }
  if (locId === "library") c.acts.push("academy");
  if (locId === "kiosk") c.quests.push(CQ(1, "side1"));
  if (locId === "qiyas") {
    if (ch === 2) c.quests.push(CQ(2, "q1"), CQ(2, "boss"));
    if (ch >= 3 && (g.gatScore || 0) < 90) c.acts.push("retake");
  }
  if (locId === "airport" && ch === 4) c.quests.push(CQ(4, "q1"));
  if (locId === "dorm") {
    c.npcs = ["jake"];
    if (ch === 4) c.quests.push(CQ(4, "q2"));
    c.acts.push("call", "rest", "daily", "sleep");
  }
  if (locId === "campus") {
    c.npcs = ["prof"];
    c.acts.push("academy");
    if (ch === 4) c.quests.push(CQ(4, "boss"));
    if (ch === 5) c.quests.push(CQ(5, "q1"), CQ(5, "q2"), CQ(5, "q3"), CQ(5, "boss"));
    if (ch === 6) c.quests.push(CQ(6, "q1"), CQ(6, "boss"));
  }
  if (locId === "cafe") c.quests.push(CQ(4, "side1"));
  if (locId === "home2") { c.npcs = ["dad", "mom", "sultan"]; c.acts.push("rest", "daily", "sleep"); }
  if (locId === "aramco") {
    c.npcs = ["khaled"];
    const q1 = CQ(7, "q1"), boss = CQ(7, "boss");
    if (!phaseDone(g, "C")) { boss.mainsDone = false; boss.desc = "🔒 التوظيف يشترط إنهاء CPC Preparation في الأكاديمية أولًا — هذا شرط أرامكو الحقيقي."; }
    c.quests.push(q1, boss);
  }
  return c;
}

/* ---------- 🎬 انتقالات سينمائية ---------- */
function Transition({ card, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, card.ms || 2100); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: card.bg || "#0B0F14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "fadein .5s ease", color: "#fff", textAlign: "center", padding: 20 }}>
      <div style={{ fontSize: 64, animation: "pop .6s ease" }}>{card.e}</div>
      <div style={{ fontSize: 24, fontWeight: 900, margin: "10px 0 4px", animation: "drop .7s ease" }}>{card.t}</div>
      {card.sub && <div style={{ fontSize: 14.5, opacity: .8, animation: "drop .9s ease", lineHeight: 1.9 }}>{card.sub}</div>}
    </div>
  );
}

/* ---------- 🚶 الشارع — تجوال حر ---------- */
function Street({ g, theme, night, pos, setPos, onEnter }) {
  const era = eraOf(g.chapter);
  const locs = LOCS[era].filter(l => (!l.minCh || g.chapter >= l.minCh) && (!l.maxCh || g.chapter <= l.maxCh));
  const [walking, setWalking] = useState(false);
  const av = AVATARS.find(a => a.id === g.avatar);
  const sky = night ? NIGHT : SKY[era][Math.min(g.slot, 2)];
  const w = 100 / locs.length;

  const go = (i, loc) => {
    if (walking) return;
    play("click");
    if (i === pos) { onEnter(loc); return; }
    play("step");
    setWalking(true); setPos(i);
    setTimeout(() => { setWalking(false); play("door"); onEnter(loc); }, 750);
  };

  return (
    <div style={{ borderRadius: 18, overflow: "hidden", border: `1px solid ${theme.line}`, marginBottom: 12 }}>
      <div style={{ background: sky, transition: "background 1.2s ease", padding: "22px 8px 0", position: "relative" }}>
        <div style={{ position: "absolute", top: 10, left: 14, fontSize: 22 }}>{night ? "🌙" : g.slot === 0 ? "🌅" : g.slot === 1 ? "☀️" : "🌆"}</div>
        {era === "us" && <div style={{ position: "absolute", top: 10, right: 14, fontSize: 18, opacity: .8 }}>🗽</div>}
        <div style={{ display: "flex" }}>
          {locs.map((l, i) => {
            const active = i === pos;
            return (
              <button key={l.id} onClick={() => go(i, l)}
                style={{ flex: 1, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "6px 2px 14px", textAlign: "center", filter: night ? "brightness(.65)" : "none" }}>
                <div style={{ fontSize: 42, transform: active ? "scale(1.12)" : "scale(1)", transition: "transform .3s" }}>{l.e}</div>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: night ? "#cbd5e8" : "#3A3A3A", marginTop: 2, background: "rgba(255,255,255,.55)", borderRadius: 8, display: "inline-block", padding: "1px 7px" }}>{l.name}</div>
              </button>
            );
          })}
        </div>
        {/* الرصيف واللاعب */}
        <div style={{ height: 46, background: night ? "#1C1C28" : "#8A8A8A", position: "relative", borderTop: `4px dashed ${night ? "#3A3A55" : "#C9C9C9"}` }}>
          <div style={{ position: "absolute", bottom: 8, left: `calc(${pos * w}% + ${w / 2}% - 16px)`, transition: "left .75s ease-in-out", fontSize: 30, transform: walking ? "translateY(-2px)" : "none" }}>
            <span style={{ display: "inline-block", animation: walking ? "walkbob .3s infinite alternate" : "none" }}>{av.e}</span>
          </div>
        </div>
      </div>
      <div style={{ background: theme.card, padding: "8px 12px", fontSize: 12, color: theme.sub, textAlign: "center", fontWeight: 700 }}>
        {night ? "🌙 الليل هبط — ارجع البيت ونم لتبدأ يومًا جديدًا" : "اضغط مبنى للمشي إليه، واضغطه مرة ثانية للدخول"}
      </div>
    </div>
  );
}

/* ---------- 🚪 داخل المبنى ---------- */
function Interior({ g, theme, loc, night, canAct, onQuest, onAct, onTalk, close }) {
  const c = locContent(loc.id, g);
  return (
    <div style={{ animation: "drop .3s ease" }}>
      <button onClick={close} style={{ background: "none", border: "none", color: theme.text, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: 8, opacity: .8 }}>→ اخرج للشارع</button>
      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44 }}>{loc.e}</div>
        <div style={{ fontWeight: 900, fontSize: 17 }}>{loc.name}</div>
      </div>

      {c.npcs.length > 0 && <>
        <div style={{ fontWeight: 900, fontSize: 13.5, color: "#C89235", margin: "6px 4px" }}>الموجودون هنا</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {c.npcs.map(id => {
            const l = npcLines(id, g)[0];
            return (
              <button key={id} className="card" onClick={() => onTalk(npcLines(id, g))} style={{ flex: 1, textAlign: "center", fontFamily: "inherit", cursor: "pointer", margin: 0, color: theme.text }}>
                <div style={{ fontSize: 30 }}>{l.e}</div>
                <div style={{ fontWeight: 800, fontSize: 12.5, marginTop: 2 }}>{l.who.split(" (")[0]}</div>
                <div style={{ fontSize: 10.5, color: theme.sub }}>💬 تكلم</div>
              </button>
            );
          })}
        </div>
      </>}

      {c.quests.length > 0 && <div style={{ fontWeight: 900, fontSize: 13.5, color: "#C89235", margin: "6px 4px" }}>المهمات هنا</div>}
      {c.quests.map(q => {
        if (q.type === "choice") {
          const done = g.done[`${q.chId}:${q.qid}`];
          return (
            <button key={q.qid} className="card" disabled={done} onClick={() => !done && onAct("choice")}
              style={{ width: "100%", textAlign: "right", fontFamily: "inherit", cursor: done ? "default" : "pointer", display: "flex", gap: 12, alignItems: "center", opacity: done ? .55 : 1, color: theme.text }}>
              <div style={{ fontSize: 28 }}>{done ? "✅" : "💻"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 14.5 }}>منصة القبول الجامعي</div>
                <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>{done ? `مقبول في: ${g.uni}` : "قدّم على الجامعات المتاحة لدرجتك"}</div>
              </div>
            </button>
          );
        }
        const done = g.done[`${q.chId}:${q.qid}`];
        const locked = q.isBoss && !q.mainsDone;
        const playable = canAct && !locked && (q.repeat || !done);
        return (
          <button key={q.qid} className="card" disabled={!playable}
            onClick={() => playable && onQuest(q)}
            style={{ width: "100%", textAlign: "right", fontFamily: "inherit", cursor: playable ? "pointer" : "default", display: "flex", gap: 12, alignItems: "center", opacity: (done && !q.repeat) || locked || !canAct ? .55 : 1, background: q.isBoss ? "#17251F" : theme.card, color: q.isBoss ? "#fff" : theme.text, border: q.isBoss ? "none" : `1px solid ${theme.line}` }}>
            <div style={{ fontSize: 30 }}>{done && !q.repeat ? (q.isBoss ? "🏆" : "✅") : locked ? "🔒" : q.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 14.5 }}>{q.name} {q.side && <span style={{ fontSize: 10.5, background: "#C8923522", color: "#C89235", borderRadius: 6, padding: "1px 6px" }}>عمل 🪙</span>}{q.isBoss && !done && <span style={{ fontSize: 10.5, background: "#B3402F33", color: "#F0A090", borderRadius: 6, padding: "1px 6px", marginRight: 4 }}>زعيم</span>}</div>
              <div style={{ fontSize: 12, color: q.isBoss ? "rgba(255,255,255,.75)" : theme.sub, marginTop: 2, lineHeight: 1.6 }}>{locked ? "أنهِ مهمات الفصل الرئيسية أولًا" : q.desc}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#C89235", marginTop: 2 }}>⭐ {q.enemy.xp} XP • 🪙 {q.enemy.coins} • يستهلك: وقت + طاقة</div>
            </div>
          </button>
        );
      })}

      {c.acts.length > 0 && <div style={{ fontWeight: 900, fontSize: 13.5, color: "#C89235", margin: "6px 4px" }}>أنشطة</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {c.acts.includes("academy") && <button className="card" onClick={() => onAct("academy")} style={{ margin: 0, fontFamily: "inherit", cursor: "pointer", textAlign: "center", color: theme.text, gridColumn: "1 / -1", border: "2px solid #7B5EA755" }}>
          <div style={{ fontSize: 26 }}>🎓</div><div style={{ fontWeight: 900, fontSize: 13 }}>ادخل قاعات الأكاديمية</div><div style={{ fontSize: 11, color: theme.sub }}>تعلّم من الصفر → الاحتراف • لا يستهلك وقتك اليومي</div></button>}
        {c.acts.includes("rest") && <button className="card" disabled={!canAct} onClick={() => canAct && onAct("rest")} style={{ margin: 0, fontFamily: "inherit", cursor: canAct ? "pointer" : "default", textAlign: "center", opacity: canAct ? 1 : .5, color: theme.text }}>
          <div style={{ fontSize: 26 }}>🛋️</div><div style={{ fontWeight: 900, fontSize: 13 }}>استراحة</div><div style={{ fontSize: 11, color: theme.sub }}>+40 طاقة • يستهلك وقت</div></button>}
        {c.acts.includes("call") && <button className="card" disabled={g.dayFlags?.called} onClick={() => !g.dayFlags?.called && onAct("call")} style={{ margin: 0, fontFamily: "inherit", cursor: g.dayFlags?.called ? "default" : "pointer", textAlign: "center", opacity: g.dayFlags?.called ? .5 : 1, color: theme.text }}>
          <div style={{ fontSize: 26 }}>📞</div><div style={{ fontWeight: 900, fontSize: 13 }}>اتصل بأهلك</div><div style={{ fontSize: 11, color: theme.sub }}>{g.dayFlags?.called ? "اتصلت اليوم ✓" : "+15 طاقة • مجاني"}</div></button>}
        {c.acts.includes("daily") && <button className="card" onClick={() => onAct("daily")} style={{ margin: 0, fontFamily: "inherit", cursor: "pointer", textAlign: "center", color: theme.text, border: g.dailyDate !== new Date().toDateString() ? "2px solid #C89235" : `1px solid ${theme.line}` }}>
          <div style={{ fontSize: 26, animation: g.dailyDate !== new Date().toDateString() ? "pulse 1.6s infinite" : "none" }}>🎁</div><div style={{ fontWeight: 900, fontSize: 13 }}>صندوق اليوم</div><div style={{ fontSize: 11, color: theme.sub }}>عملات + غرض</div></button>}
        {c.acts.includes("retake") && <button className="card" disabled={!canAct} onClick={() => canAct && onAct("retake")} style={{ margin: 0, fontFamily: "inherit", cursor: canAct ? "pointer" : "default", textAlign: "center", color: theme.text, opacity: canAct ? 1 : .5 }}>
          <div style={{ fontSize: 26 }}>🔁</div><div style={{ fontWeight: 900, fontSize: 13 }}>أعد اختبار القدرات</div><div style={{ fontSize: 11, color: theme.sub }}>{canAct ? `ارفع درجتك (${g.gatScore})` : "المركز مغلق ليلًا"}</div></button>}
        {c.acts.includes("sleep") && <button className="card" onClick={() => onAct("sleep")} style={{ margin: 0, fontFamily: "inherit", cursor: "pointer", textAlign: "center", color: theme.text, gridColumn: c.acts.length % 2 ? "auto" : "1 / -1" }}>
          <div style={{ fontSize: 26 }}>😴</div><div style={{ fontWeight: 900, fontSize: 13 }}>نَم — ابدأ يومًا جديدًا</div><div style={{ fontSize: 11, color: theme.sub }}>طاقة كاملة + حدث صباحي</div></button>}
      </div>
    </div>
  );
}




/* ═══════════════ 🎓 ACADEMY UI — التعلم داخل القصة ═══════════════ */

function Academy({ g, theme, onExit, onPlace, onFinishUnit, onSimDone, onReview, onOpenUnit, startReview }) {
  const [sub, setSub] = useState(() => (startReview ? "review" : null));
  const fresh = g.acad.placed === null && Object.keys(g.acad.units || {}).length === 0;
  const due = dueList(g);

  if (sub === "ask") return <AskTeacher g={g} theme={theme} onBack={() => setSub(null)} onBonus={(b) => onFinishUnit({ id: "__bonus", drills: null }, ACADEMY[0], { bonusOnly: b })} />;
  if (sub === "place") return <Placement g={g} theme={theme} onDone={(rec) => { onPlace(rec); setSub(null); }} onBack={() => setSub(null)} />;
  if (sub === "review") return <ReviewSession g={g} theme={theme} onFinish={onReview} onExit={() => setSub(null)} />;
  if (sub === "map") return <KnowledgeMap g={g} theme={theme} close={() => setSub(null)} onPick={({ u, ph }) => {
    const i = ACADEMY.findIndex(x => x.id === ph.id);
    const open = prereqMet(g, u.id) || i <= (g.acad.placed ?? -1);
    setSub(open ? { unit: u, phase: ph } : { lock: u, phase: ph });
  }} />;
  if (sub && sub.lock) {
    const U = sub.lock;
    return (
      <div style={{ animation: "drop .3s ease" }}>
        <button onClick={() => setSub(null)} style={{ background: "none", border: "none", color: theme.text, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: 8, opacity: .8 }}>→ رجوع</button>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <div style={{ fontWeight: 900, fontSize: 16, margin: "6px 0" }}>{U.icon} {U.name}</div>
          <div style={{ fontSize: 13, color: theme.sub, lineHeight: 1.9 }}>هذا المفهوم يقف على أكتاف مفاهيم قبله — القفز فوقها يبني فهمًا مكسورًا.</div>
        </div>
        <div className="card">
          <div style={{ fontWeight: 900, fontSize: 13.5, marginBottom: 8 }}>متطلباته:</div>
          {(PREREQ[U.id] || []).map(pid => {
            const f = unitById(pid); const done = acadDone(g, pid);
            return <div key={pid} style={{ display: "flex", gap: 8, fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}><span>{done ? "✅" : "⬜"}</span><span>{f.u.icon} {f.u.name}</span></div>;
          })}
        </div>
        {(() => { const miss = (PREREQ[U.id] || []).find(pid => !acadDone(g, pid)); const f = miss && unitById(miss); return f && (
          <button className="btn" style={{ width: "100%", padding: 12, marginBottom: 8 }} onClick={() => setSub({ unit: f.u, phase: f.ph })}>📖 تعلّم المتطلب الناقص: {f.u.name} ←</button>
        ); })()}
        <button className="btn ghost" style={{ width: "100%", padding: 11 }} onClick={() => setSub({ unit: U, phase: sub.phase, test: true })}>🔓 أعرفه أصلًا — اختبار الإتقان الصارم (3/3 بلا خطأ)</button>
      </div>
    );
  }
  if (sub && sub.unit) {
    const U = sub.unit, PH = sub.phase;
    if (U.sim) return <SimFlow g={g} theme={theme} unit={U} onDone={(res) => { onSimDone(U, PH, res); setSub(null); }} onBack={() => setSub(null)} />;
    return <LessonPlayer g={g} theme={theme} unit={U} test={sub.test} onOpen={() => onOpenUnit(U)} onDone={(fail) => { if (!fail) onFinishUnit(U, PH, { tested: !!sub.test }); setSub(null); }} onBack={() => setSub(null)} />;
  }

  const placedIdx = g.acad.placed ?? -1;
  const phaseOpen = (i) => i === 0 || i <= placedIdx || phaseDone(g, ACADEMY[i - 1].id);

  return (
    <div style={{ animation: "drop .3s ease" }}>
      <button onClick={onExit} style={{ background: "none", border: "none", color: theme.text, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: 8, opacity: .8 }}>→ اخرج من الأكاديمية</button>
      <div className="card" style={{ textAlign: "center", background: "#17251F", color: "#fff", border: "none" }}>
        <div style={{ fontSize: 40 }}>📚</div>
        <div style={{ fontWeight: 900, fontSize: 17 }}>الأكاديمية</div>
        <div style={{ fontSize: 12.5, opacity: .85, marginTop: 4, lineHeight: 1.8 }}>رحلة كاملة: من لا شيء… إلى درجة عالية في القدرات. بدون أي مصدر خارجي.</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
          <button className="btn ghost" style={{ padding: "8px 14px", fontSize: 12.5, color: "#fff", borderColor: "rgba(255,255,255,.35)" }} onClick={() => { play("click"); setSub("map"); }}>🗺️ خريطة المعرفة</button>
          <button className="btn gold" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => { play("click"); setSub("ask"); }}>💬 غرفة المعلم</button>
        </div>
      </div>
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", padding: 11 }}>
        <TeacherFace size={38} />
        <div style={{ fontSize: 12.5, lineHeight: 1.7, color: theme.sub }}><b style={{ color: theme.text }}>المعلم حاضر دائمًا:</b> غلطت بأي تطبيق؟ زر «🧑‍🏫 لم أفهم» يفتح شرحًا متدرجًا، تلميحات، وسؤالًا مشابهًا حتى ترسخ.</div>
      </div>
      {due.length > 0 && (
        <button className="card" onClick={() => { play("click"); setSub("review"); }} style={{ width: "100%", textAlign: "right", fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: "2px solid #7B5EA7", color: theme.text }}>
          <div style={{ fontSize: 30, animation: "pulse 1.8s infinite" }}>🧠</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 14.5 }}>مراجعة اليوم: {due.length} {due.length === 1 ? "مفهوم" : "مفاهيم"}</div>
            <div style={{ fontSize: 12, color: theme.sub, marginTop: 2 }}>حان موعدها بالضبط — 3 دقائق تحفظها لك حتى يوم الاختبار</div>
          </div>
          <div style={{ fontWeight: 900, color: "#7B5EA7", fontSize: 13 }}>ابدأ ←</div>
        </button>
      )}

      {fresh && (
        <div className="card" style={{ border: "2px solid #C89235" }}>
          <div style={{ fontWeight: 900, fontSize: 14.5, marginBottom: 6 }}>👋 أول مرة هنا — من وين نبدأ؟</div>
          <div style={{ fontSize: 13, color: theme.sub, lineHeight: 1.8, marginBottom: 10 }}>دقيقة واحدة تحدد مستواك، أو ابدأ من الصفر تمامًا — كلاهما طريق صحيح.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn gold" style={{ flex: 1, padding: 11, fontSize: 13.5 }} onClick={() => { play("click"); setSub("place"); }}>🧪 حدد مستواي</button>
            <button className="btn ghost" style={{ flex: 1, padding: 11, fontSize: 13.5 }} onClick={() => { play("click"); onPlace(0); }}>🧱 أبدأ من الصفر</button>
          </div>
        </div>
      )}

      {ACADEMY.map((ph, i) => {
        const open = phaseOpen(i);
        const prog = phaseProg(g, ph);
        const skipped = i < placedIdx && prog < 100;
        return (
          <div key={ph.id} className="card" style={{ opacity: open ? 1 : .55, border: prog === 100 ? `2px solid ${ph.color}` : `1px solid ${theme.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 30 }}>{prog === 100 ? "✅" : open ? ph.icon : "🔒"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 14.5 }}>{ph.name}</div>
                <div style={{ fontSize: 12, color: theme.sub, marginTop: 2 }}>{open ? ph.desc : `أكمل ${ACADEMY[i - 1].name.split(":")[1]} أولًا`}{skipped ? " • 🟡 متجاوَز بالتشخيص — متاح للمراجعة" : ""}</div>
                <div style={{ background: theme.line, borderRadius: 99, height: 6, overflow: "hidden", marginTop: 6 }}>
                  <div style={{ width: `${prog}%`, height: "100%", background: ph.color, borderRadius: 99, transition: "width .5s" }} />
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 900, color: ph.color }}>{prog}%</div>
            </div>
            {open && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${theme.line}`, paddingTop: 8 }}>
                {ph.units.map((u, ui) => {
                  const done = acadDone(g, u.id);
                  const uOpen = prereqMet(g, u.id) || i <= placedIdx;
                  const st = nodeState(g, u.id, i);
                  return (
                    <button key={u.id} onClick={() => { play("click"); setSub(uOpen ? { unit: u, phase: ph } : { lock: u, phase: ph }); }}
                      style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, background: "none", border: "none", padding: "8px 2px", cursor: uOpen ? "pointer" : "default", fontFamily: "inherit", color: theme.text, opacity: uOpen ? 1 : .45, textAlign: "right" }}>
                      <span style={{ fontSize: 20 }}>{done ? "✅" : uOpen ? u.icon : "🔒"}</span>
                      <span style={{ flex: 1, fontWeight: 800, fontSize: 13.5 }}>{u.name} <span style={{ fontSize: 10 }}>{st.e}</span></span>
                      <span style={{ fontSize: 11.5, color: ph.color, fontWeight: 900 }}>{done ? "مراجعة ↺" : !uOpen ? "🔓 اختبر" : u.sim ? "ابدأ 🎬" : "تعلّم ←"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {g.acad.simBest && <div className="card" style={{ textAlign: "center", fontWeight: 900, fontSize: 13.5 }}>🎭 أفضل درجة محاكاة: <span style={{ color: "#C89235", fontSize: 17 }}>{g.acad.simBest.score}</span></div>}
    </div>
  );
}

/* ---------- 🧪 اختبار تحديد المستوى ---------- */
function Placement({ g, theme, onDone, onBack }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [end, setEnd] = useState(false);
  const [teach, setTeach] = useState(false);
  // 🎲 أسئلة جديدة كل محاولة، بنفس ما تقيسه بالضبط
  const [qs] = useState(() => { const b = buildFromBlueprint("placement", g); return b.length >= 4 ? b : PLACEMENT; });
  const N = qs.length;
  const q = qs[i];
  if (end) {
    const rec = score <= Math.floor(N * 0.34) ? 0 : score <= Math.floor(N * 0.72) ? 1 : 2;
    return (
      <div className="card" style={{ textAlign: "center", padding: 24, animation: "pop .4s ease" }}>
        <div style={{ fontSize: 46 }}>{["🧱", "🔨", "🧭"][rec]}</div>
        <div style={{ fontWeight: 900, fontSize: 16, margin: "8px 0" }}>نتيجتك: {score}/{N}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.9, color: theme.sub }}>نوصيك بالبدء من <b style={{ color: theme.text }}>{ACADEMY[rec].name}</b>{rec > 0 ? " — والمراحل الأسبق تظل متاحة للمراجعة متى شئت." : " — أساس متين يبني كل ما بعده."}</div>
        <button className="btn gold" style={{ width: "100%", marginTop: 14, padding: 12 }} onClick={() => onDone(rec)}>ابدأ رحلتي 🎓</button>
      </div>
    );
  }
  return (
    <div style={{ animation: "drop .3s ease" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: theme.text, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: 8, opacity: .8 }}>→ رجوع</button>
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 900, color: "#C89235", marginBottom: 8 }}>🧪 تحديد المستوى • {i + 1}/{N}{q.slot ? " • " + q.slot : ""} — لا توجد إجابة "غلط"، فقط خريطة</div>
        <div dir="ltr" style={{ textAlign: "left", fontSize: 15.5, fontWeight: 600, marginBottom: 12, lineHeight: 1.7 }}>{q.q}</div>
        {q.options.map((o, idx) => {
          let st = {};
          if (picked !== null) { if (idx === q.a) st = { borderColor: "#1F7A5C", background: "#1F7A5C22" }; else if (idx === picked) st = { borderColor: "#B3402F", background: "#B3402F22" }; }
          return <button key={idx} className="opt" style={st} onClick={() => {
            if (picked !== null) return;
            setPicked(idx); play(idx === q.a ? "correct" : "click");
            if (idx === q.a) {
              const ns = score + 1;
              setTimeout(() => { setScore(ns); setPicked(null); if (i + 1 >= N) setEnd(true); else setI(i + 1); }, 650);
            }
          }}>{String.fromCharCode(65 + idx)}. {o}</button>;
        })}
        {picked !== null && picked !== q.a && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, lineHeight: 1.85, background: "#B3402F10", borderRadius: 10, padding: "9px 12px" }}>
              <b style={{ color: "#B3402F" }}>الصحيح: {q.options[q.a]}</b>{q.ex ? " — " + q.ex : ""}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn ghost" style={{ flex: 1, padding: 10, fontSize: 13 }} onClick={() => { play("click"); setTeach(true); }}>🧑‍🏫 لم أفهم</button>
              <button className="btn" style={{ flex: 2, padding: 10 }} onClick={() => { play("click"); setPicked(null); if (i + 1 >= N) setEnd(true); else setI(i + 1); }}>التالي ←</button>
            </div>
          </div>
        )}
      </div>
      {teach && <Teacher g={g || newSave()} theme={theme} q={q} picked={picked} onClose={() => setTeach(false)} />}
    </div>
  );
}

/* ---------- 🎓 الدرس التفاعلي: يشرح ويسأل ويثبّت (لا مجرد "التالي") ---------- */
/* أنواع الخطوات: teach (مفهوم) • example (مثال محلول يُكشف خطوة‑بخطوة) •
   check (سؤال تثبيت فوري باستدعاء نشط) • trap (الفخ الشائع) */
function LessonSteps({ theme, unit, onComplete }) {
  const steps = unit.steps;
  const [si, setSi] = useState(0);
  const [revealed, setRevealed] = useState(1);   // للمثال المحلول
  const [pick, setPick] = useState(null);        // لسؤال التثبيت
  const s = steps[si];
  const last = si >= steps.length - 1;
  const go = () => { play("click"); setRevealed(1); setPick(null); if (last) onComplete(); else setSi(si + 1); };

  const kindMeta = {
    teach: { c: "#C89235", label: "💡 الفكرة" },
    example: { c: "#2E7DA6", label: "📝 مثال محلول" },
    check: { c: "#1F7A5C", label: "🧠 ثبّت المعلومة" },
    trap: { c: "#B3402F", label: "⚠️ الفخ الشائع" },
  }[s.k] || { c: "#C89235", label: "" };

  return (
    <div style={{ animation: "drop .25s ease" }}>
      {/* مؤشر التقدّم */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {steps.map((_, i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 99, background: i <= si ? kindMeta.c : theme.line }} />)}
      </div>
      <div className="card" style={{ minHeight: 190, borderColor: kindMeta.c + "44" }}>
        <div style={{ fontSize: 11.5, fontWeight: 900, color: kindMeta.c, marginBottom: 8 }}>{unit.icon} {unit.name} • {kindMeta.label} • {si + 1}/{steps.length}</div>

        {s.k === "teach" && <>
          {s.h && <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>{s.h}</div>}
          <div style={{ fontSize: 14.5, lineHeight: 2 }}>{s.t}</div>
          {s.ex && <div dir="ltr" style={{ textAlign: "left", background: "#1F7A5C18", border: "1.5px solid #1F7A5C44", borderRadius: 10, padding: "9px 12px", marginTop: 10, fontSize: 14, fontWeight: 800, fontFamily: "Menlo, Consolas, monospace" }}>{s.ex}</div>}
        </>}

        {s.k === "trap" && <>
          {s.h && <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8, color: "#B3402F" }}>{s.h}</div>}
          <div style={{ fontSize: 14.5, lineHeight: 2 }}>{s.t}</div>
        </>}

        {s.k === "example" && <>
          {s.h && <div style={{ fontWeight: 900, fontSize: 15.5, marginBottom: 8 }}>{s.h}</div>}
          <div dir="auto" style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.8, marginBottom: 10 }}>{s.q}</div>
          {s.steps.slice(0, revealed).map((line, i) => (
            <div key={i} dir="auto" style={{ background: theme.line + "44", borderRadius: 10, padding: "8px 12px", marginBottom: 6, fontSize: 14, fontWeight: 700, lineHeight: 1.7, animation: "drop .2s ease" }}>
              <span style={{ color: "#2E7DA6", fontWeight: 900 }}>{i + 1}) </span>{line}
            </div>
          ))}
          {revealed < s.steps.length
            ? <button className="btn ghost" style={{ width: "100%", padding: 10, marginTop: 4 }} onClick={() => { play("click"); setRevealed(revealed + 1); }}>اكشف الخطوة التالية ↓</button>
            : s.answer != null && <div style={{ textAlign: "center", fontWeight: 900, fontSize: 15, color: "#1F7A5C", marginTop: 8 }}>✓ الإجابة: {s.answer}</div>}
        </>}

        {s.k === "check" && <>
          <div dir="auto" style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.8, marginBottom: 12 }}>{s.q}</div>
          {s.options.map((o, idx) => {
            let st = { textAlign: "start" };
            if (pick !== null) { if (idx === s.a) st = { ...st, borderColor: "#1F7A5C", background: "#1F7A5C22", fontWeight: 700 }; else if (idx === pick) st = { ...st, borderColor: "#B3402F", background: "#B3402F18" }; else st = { ...st, opacity: .5 }; }
            return <button key={idx} className="opt" style={st} disabled={pick !== null} onClick={() => { setPick(idx); play(idx === s.a ? "correct" : "wrong"); }}>{String.fromCharCode(65 + idx)}. {o}</button>;
          })}
          {pick !== null && <div style={{ marginTop: 8, background: (pick === s.a ? "#1F7A5C1d" : "#B3402F14"), border: `1.5px solid ${(pick === s.a ? "#1F7A5C44" : "#B3402F33")}`, borderRadius: 12, padding: "10px 13px", fontSize: 13.5, lineHeight: 1.9, fontWeight: 700 }}>
            <b style={{ color: pick === s.a ? "#1F7A5C" : "#B3402F" }}>{pick === s.a ? "✓ أحسنت! " : "التقط الفكرة: "}</b>{s.ex}
          </div>}
        </>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {si > 0 && <button className="btn ghost" style={{ flex: 1, padding: 12 }} onClick={() => { play("click"); setRevealed(1); setPick(null); setSi(si - 1); }}>السابق</button>}
        <button className="btn" style={{ flex: 2, padding: 12, opacity: (s.k === "check" && pick === null) ? .5 : 1 }}
          disabled={s.k === "check" && pick === null}
          onClick={go}>{last ? "✏️ طبّق اللي تعلّمته ←" : "التالي ←"}</button>
      </div>
    </div>
  );
}

/* ---------- 📖 مشغّل الدرس: بطاقات → تطبيق → إتقان ---------- */
function LessonPlayer({ g, theme, unit, onDone, onBack, test, onOpen }) {
  const [stage, setStage] = useState(test ? "drill" : "cards");
  const [teach, setTeach] = useState(false);
  useEffect(() => { if (!test && onOpen) onOpen(); }, []);
  const [ci, setCi] = useState(0);
  const [di, setDi] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState(null);
  const [numVal, setNumVal] = useState("");
  // 🎲 AWL يُعاد توليد تدريباته كل مرة (مشتتات وترتيب جديد)،
  //    والمراجعة/اختبار التجاوز يسحبان أسئلة مولَّدة تخص نفس مهارة الوحدة
  const [drills] = useState(() => {
    const authored = unit.awl ? awlDrills(unit.awl) : (unit.drills || []);
    const wantGen = test || (g && acadDone(g, unit.id)) || unit.genDrills;
    if (wantGen) {
      const want = unit.need || Math.min(3, authored.length || 3);
      const gen = unitGenQs(unit.id, Math.max(want + 2, 5), g);
      if (gen.length >= want) return gen;
    }
    return authored;
  });
  const need = unit.need || Math.min(3, drills.length || 0);
  const drill = drills[di % (drills.length || 1)];
  const review = acadDone(g, unit.id);

  const answer = (ok) => {
    if (test && !ok) { play("wrong"); setStage("fail"); return; }
    play(ok ? "correct" : "wrong");
    setPicked(ok ? "ok" : "no");
    if (ok) {
      const nc = correct + 1;
      setTimeout(() => {
        setCorrect(nc); setPicked(null); setNumVal("");
        if (nc >= need) setStage("pass"); else setDi(di + 1);
      }, 800);
    }
  };
  const nextAfterWrong = () => { setPicked(null); setNumVal(""); setDi(di + 1); };

  if (stage === "fail") return (
    <div className="card" style={{ textAlign: "center", padding: 24, animation: "pop .4s ease" }}>
      <div style={{ fontSize: 46 }}>🧱</div>
      <div style={{ fontWeight: 900, fontSize: 16, margin: "8px 0", color: "#B3402F" }}>الاختبار الصارم لا يسامح</div>
      <div style={{ fontSize: 13.5, color: theme.sub, lineHeight: 1.9 }}>خطأ واحد يعني أن الأساس يحتاج بناء فعليًا — وهذا خبر جيد: عرفناه قبل يوم الاختبار الحقيقي. ادرس متطلباته ثم ارجع.</div>
      <button className="btn" style={{ width: "100%", marginTop: 12, padding: 12 }} onClick={() => onDone(true)}>فهمت — ارجعني ←</button>
    </div>
  );
  if (stage === "pass") return (
    <div className="card" style={{ textAlign: "center", padding: 26, animation: "pop .45s ease", position: "relative", overflow: "hidden" }}>
      {["✨", "🎓", "⭐", "✨", "🌟"].map((c, i) => <span key={i} style={{ position: "absolute", bottom: 8, left: `${12 + i * 18}%`, fontSize: 18, animation: `confetti ${1 + i * .15}s ease forwards` }}>{c}</span>)}
      <div style={{ fontSize: 52 }}>🎓</div>
      <div style={{ fontWeight: 900, fontSize: 18, margin: "8px 0 4px", color: "#1F7A5C" }}>{test ? "🔓 اجتزت اختبار الإتقان!" : review ? "مراجعة مكتملة" : "أتقنت الدرس!"}</div>
      <div style={{ fontSize: 14, color: theme.sub }}>{unit.name}</div>
      <button className="btn gold" style={{ width: "100%", marginTop: 14, padding: 12 }} onClick={() => onDone(false)}>{review ? "رجوع" : "استلم مكافأتك ←"}</button>
    </div>
  );

  return (
    <div style={{ animation: "drop .3s ease" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: theme.text, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: 8, opacity: .8 }}>→ رجوع للأكاديمية</button>

      {stage === "cards" && unit.steps && <LessonSteps theme={theme} unit={unit} onComplete={() => { setStage(drills.length ? "drill" : "pass"); }} />}

      {stage === "cards" && !unit.steps && <>
        {unit.awl ? (() => { const w = unit.awl[ci]; return (
          <div className="card" style={{ minHeight: 200, textAlign: "center" }}>
            <div style={{ fontSize: 11.5, fontWeight: 900, color: "#2E7DA6", marginBottom: 10 }}>{unit.icon} كلمة {ci + 1}/{unit.awl.length}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div dir="ltr" style={{ fontSize: 30, fontWeight: 900, letterSpacing: .5 }}>{w.w}</div>
              <button onClick={() => { play("click"); say(w.w); }} style={{ border: "none", background: "#2E7DA61a", color: "#2E7DA6", borderRadius: 99, width: 40, height: 40, fontSize: 18, cursor: "pointer" }}>🔊</button>
            </div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "#0F5147", margin: "6px 0 10px" }}>{w.ar}</div>
            <div dir="ltr" style={{ textAlign: "left", background: theme.line + "44", borderRadius: 12, padding: "10px 13px", fontSize: 14, lineHeight: 1.8, fontStyle: "italic" }}>“{w.ex}”</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
              <span style={{ background: "#1F7A5C18", color: "#1F7A5C", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 800 }} dir="ltr">≈ {w.syn}</span>
              {w.ant && <span style={{ background: "#B3402F14", color: "#B3402F", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 800 }} dir="ltr">≠ {w.ant}</span>}
            </div>
            <div dir="ltr" style={{ textAlign: "left", fontSize: 12.5, color: theme.sub, marginTop: 10, lineHeight: 1.7 }}>✍️ {w.bl.replace("_____", `[${w.w}]`)}</div>
          </div>
        ); })() : (
        <div className="card" style={{ minHeight: 180 }}>
          <div style={{ fontSize: 11.5, fontWeight: 900, color: "#C89235", marginBottom: 8 }}>{unit.icon} {unit.name} • مفهوم {ci + 1}/{unit.cards.length}</div>
          <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>{unit.cards[ci].h}</div>
          <div style={{ fontSize: 14.5, lineHeight: 2 }}>{unit.cards[ci].t}</div>
          {unit.cards[ci].ex && <div dir="ltr" style={{ textAlign: "left", background: "#1F7A5C18", border: "1.5px solid #1F7A5C44", borderRadius: 10, padding: "9px 12px", marginTop: 10, fontSize: 14, fontWeight: 800, color: theme.text, fontFamily: "Menlo, Consolas, monospace" }}>{unit.cards[ci].ex}</div>}
        </div>)}
        <div style={{ display: "flex", gap: 8 }}>
          {ci > 0 && <button className="btn ghost" style={{ flex: 1, padding: 12 }} onClick={() => { play("click"); setCi(ci - 1); }}>السابق</button>}
          <button className="btn" style={{ flex: 2, padding: 12 }} onClick={() => { play("click"); ci + 1 < unit.cards.length ? setCi(ci + 1) : setStage(drills.length ? "drill" : "pass"); }}>
            {ci + 1 < unit.cards.length ? "فهمت — التالي ←" : drills.length ? "✏️ طبّق اللي تعلمته" : "إنهاء"}
          </button>
        </div>
      </>}

      {stage === "drill" && drill && <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
          <span style={{ fontSize: 12.5, fontWeight: 900, color: test ? "#B3402F" : "#C89235" }}>{test ? "🔓 اختبار صارم: 3/3 — أي خطأ ينهيه" : "✏️ تطبيق بلا خوف — الخطأ هنا معلّم، مو عقوبة"}</span>
          <span style={{ fontSize: 12.5, fontWeight: 900 }}>{"🟢".repeat(correct)}{"⚪".repeat(Math.max(0, need - correct))}</span>
        </div>
        <div className="card">
          <div dir="ltr" style={{ textAlign: "left", fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.7 }}>{drill.q}</div>
          {drill.kind === "num" ? <>
            <div dir="ltr" style={{ textAlign: "center", fontSize: 24, fontWeight: 900, letterSpacing: 3, background: theme.line + "55", borderRadius: 12, padding: "9px 0", marginBottom: 10, minHeight: 48, color: picked === "ok" ? "#1F7A5C" : picked === "no" ? "#B3402F" : theme.text }}>{numVal || "؟"}</div>
            {picked === null && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>
              {[1,2,3,4,5,6,7,8,9,"⌫",0,"✓"].map(k => (
                <button key={k} className="opt" style={{ textAlign: "center", fontSize: 17, fontWeight: 900, padding: "12px 0", margin: 0, background: k === "✓" ? "#0F5147" : undefined, color: k === "✓" ? "#fff" : undefined, opacity: k === "✓" && !numVal ? .45 : 1 }}
                  onClick={() => { play("click"); if (k === "⌫") setNumVal(v => v.slice(0, -1)); else if (k === "✓") { if (numVal) answer(parseInt(numVal, 10) === drill.a); } else if (numVal.length < 6) setNumVal(v => v + k); }}>{k}</button>
              ))}
            </div>}
          </> : drill.options.map((o, idx) => {
            let st = {};
            if (picked !== null) { if (idx === drill.a) st = { borderColor: "#1F7A5C", background: "#1F7A5C22", fontWeight: 700 }; else st = { opacity: .5 }; }
            return <button key={idx} className="opt" style={st} onClick={() => picked === null && answer(idx === drill.a)}>{String.fromCharCode(65 + idx)}. {o}</button>;
          })}
          {picked === "ok" && <div style={{ marginTop: 8, background: "#1F7A5C1d", borderRadius: 12, padding: "10px 13px", fontSize: 13.5, fontWeight: 800, color: "#1F7A5C" }}>✓ صحيح! {drill.ex}</div>}
          {picked === "no" && <div style={{ marginTop: 8 }}>
            <div style={{ background: "#B3402F14", border: "1.5px solid #B3402F33", borderRadius: 12, padding: "11px 13px", fontSize: 13.5, lineHeight: 1.9 }}>
              <b style={{ color: "#B3402F" }}>لا بأس — هذا سر الدرس:</b> {drill.ex}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn ghost" style={{ flex: 1, padding: 11, fontSize: 13 }} onClick={() => { play("click"); setTeach(true); }}>🧑‍🏫 لم أفهم</button>
              <button className="btn" style={{ flex: 2, padding: 11 }} onClick={nextAfterWrong}>فهمت — سؤال آخر ←</button>
            </div>
          </div>}
        </div>
      </>}
      {teach && drill && <Teacher g={g} theme={theme} q={{ ...drill, topic: unit.id.startsWith("f6") || unit.id.startsWith("f7") || unit.id === "s5" || unit.id === "s6" || unit.id === "f8" ? "sentence" : "arithmetic", ...drill }} picked={null} fallbackCard={unit.cards[0]} onClose={() => setTeach(false)} />}
    </div>
  );
}

/* ---------- 🎭 المحاكاة والتقرير التحليلي ---------- */
function SimFlow({ g, theme, unit, onDone, onBack }) {
  const [phase, setPhase] = useState("rules");   // rules | run | report
  const [qs] = useState(() => bankPick({ topics: Object.keys(TOPIC_META), n: unit.sim.n, diffs: unit.sim.hard ? [2, 3] : [1, 2, 3] }).filter(x => x.type === 'mcq').map(x => ({ ...x, sec: x.topic })));
  const [i, setI] = useState(0);
  const [log, setLog] = useState([]);
  const [flash, setFlash] = useState(null);
  const [timeLeft, setTimeLeft] = useState(unit.sim.time);
  const q = qs[i];

  useEffect(() => { if (phase === "run") setTimeLeft(unit.sim.time); }, [i, phase]);
  useEffect(() => {
    if (phase !== "run" || flash) return;
    const t = setInterval(() => setTimeLeft(x => x - 1), 1000);
    return () => clearInterval(t);
  }, [phase, i, flash]);
  useEffect(() => { if (phase === "run" && timeLeft <= 0 && !flash) submit(-1); }, [timeLeft]);

  const submit = (idx) => {
    const ok = idx === q.a;
    play(ok ? "correct" : "wrong");
    setFlash(ok ? "ok" : "no");
    const nl = [...log, { sec: q.sec, ok, t: unit.sim.time - Math.max(timeLeft, 0) }];
    setLog(nl);
    setTimeout(() => {
      setFlash(null);
      if (i + 1 >= qs.length) { setPhase("report"); play("win"); }
      else setI(i + 1);
    }, 550);
  };

  if (phase === "rules") return (
    <div style={{ animation: "drop .3s ease" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: theme.text, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: 8, opacity: .8 }}>→ رجوع</button>
      <div className="card" style={{ background: "#17251F", color: "#fff", border: "none", textAlign: "center", padding: 22 }}>
        <div style={{ fontSize: 48 }}>{unit.icon}</div>
        <div style={{ fontWeight: 900, fontSize: 17, margin: "6px 0" }}>{unit.name}</div>
        <div style={{ fontSize: 13.5, opacity: .9, lineHeight: 1.9 }}>{unit.cards[0].t}</div>
      </div>
      <button className="btn" style={{ width: "100%", padding: 14, fontSize: 16, background: "#B3402F" }} onClick={() => { play("boss"); setPhase("run"); }}>🎬 ابدأ — القاعة صامتة</button>
    </div>
  );

  if (phase === "report") {
    const correct = log.filter(x => x.ok).length;
    const acc = correct / log.length;
    const score = Math.min(100, Math.round(55 + acc * 45));
    const bySec = {};
    log.forEach(({ sec, ok }) => { bySec[sec] ||= { a: 0, c: 0 }; bySec[sec].a++; if (ok) bySec[sec].c++; });
    const rows = Object.entries(bySec).sort((a, b) => (a[1].c / a[1].a) - (b[1].c / b[1].a));
    const weak = rows.filter(([, v]) => v.c / v.a < 0.7).slice(0, 2);
    return (
      <div style={{ animation: "pop .4s ease" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: theme.sub }}>📋 تقرير المحاكاة</div>
          <div style={{ fontSize: 42, fontWeight: 900, color: score >= 90 ? "#C89235" : "#0F5147", margin: "4px 0" }}>{score}</div>
          <div style={{ fontSize: 13, color: theme.sub }}>درجة تقديرية • {correct}/{log.length} صحيحة {unit.sim.hard && "• 🏅 وضع الصفوة"}</div>
        </div>
        <div className="card">
          <div style={{ fontWeight: 900, fontSize: 13.5, marginBottom: 8 }}>أداؤك حسب القسم في هذه الجلسة:</div>
          {rows.map(([sec, v]) => {
            const p = Math.round((v.c / v.a) * 100);
            return (
              <div key={sec} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 12, fontWeight: 800, minWidth: 96 }}>{SEC_AR[sec] || sec}</span>
                <div style={{ flex: 1, background: theme.line, borderRadius: 99, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${p}%`, height: "100%", borderRadius: 99, background: p >= 80 ? "#1F7A5C" : p >= 60 ? "#C89235" : "#B3402F" }} />
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 900, minWidth: 34, textAlign: "left" }}>{p}%</span>
              </div>
            );
          })}
        </div>
        {weak.length > 0 && <div className="card" style={{ background: "#B3402F0d", borderColor: "#B3402F33" }}>
          <div style={{ fontWeight: 900, fontSize: 13.5, marginBottom: 6 }}>🦉 وصفة المدرب بعد هذه الجلسة:</div>
          {weak.map(([sec]) => <div key={sec} style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 6 }}><b>{SEC_AR[sec]}:</b> {TIP_FIX[sec]}</div>)}
        </div>}
        <button className="btn gold" style={{ width: "100%", padding: 13 }} onClick={() => onDone({ score, acc, log })}>اعتمد النتيجة ←</button>
      </div>
    );
  }

  return (
    <div style={{ animation: "drop .25s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
        <span style={{ fontSize: 12.5, fontWeight: 900, color: theme.sub }}>🎭 محاكاة • {i + 1}/{qs.length}</span>
        <span className={timeLeft <= 5 ? "tpulse" : ""} style={{ fontWeight: 900, fontSize: 14, color: timeLeft <= 8 ? "#B3402F" : theme.text, direction: "ltr" }}>⏱ {Math.max(timeLeft, 0)}s</span>
      </div>
      <div style={{ background: theme.line, borderRadius: 99, height: 6, marginBottom: 10, overflow: "hidden" }}>
        <div style={{ width: `${(i / qs.length) * 100}%`, height: "100%", background: "#B3402F", borderRadius: 99, transition: "width .4s" }} />
      </div>
      <div className="card" style={{ animation: flash === "no" ? "shake .35s ease" : "none" }}>
        <div dir="ltr" style={{ textAlign: "left", fontSize: 15.5, fontWeight: 600, lineHeight: 1.75, marginBottom: 12, whiteSpace: "pre-line" }}>{q.q}</div>
        {q.options.map((o, idx) => (
          <button key={idx} className="opt" disabled={!!flash}
            style={flash && idx === q.a ? { borderColor: "#1F7A5C", background: "#1F7A5C22" } : {}}
            onClick={() => !flash && submit(idx)}>{String.fromCharCode(65 + idx)}. {o}</button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════ 🎯 محاكاة اختبار كاملة بأقسام مؤقتة ═══════════════ */
const MOCK_SECS = [
  { key: "verbal", name: "القسم اللفظي", icon: "📖", topics: ["analogy", "sentence", "reading", "vocab"], n: 10, time: 480 },
  { key: "quant", name: "القسم الكمي", icon: "🔢", topics: ["arithmetic", "algebra", "geometry", "comparison", "data"], n: 10, time: 540 },
];
const fmtClock = (s) => { s = Math.max(0, s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function MockExam({ g, theme, close, onDone }) {
  const [phase, setPhase] = useState("intro");   // intro | run | brk | report
  const [secIdx, setSecIdx] = useState(0);
  const [qs, setQs] = useState([]);
  const [qi, setQi] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MOCK_SECS[0].time);
  const [logs, setLogs] = useState([]);
  const sec = MOCK_SECS[secIdx];

  const loadSection = (idx) => {
    const s = MOCK_SECS[idx];
    const picked = bankPick({ topics: s.topics, n: s.n, diffs: [1, 2, 3] }).filter(x => x.type === "mcq").map(x => ({ ...x, sec: x.topic }));
    setQs(picked); setQi(0); setTimeLeft(s.time);
  };
  const startSection = (idx) => { loadSection(idx); setSecIdx(idx); setPhase("run"); play("boss"); };

  const goNext = () => { if (secIdx + 1 < MOCK_SECS.length) setPhase("brk"); else { setPhase("report"); play("win"); } };

  useEffect(() => {
    if (phase !== "run") return;
    const t = setInterval(() => setTimeLeft(x => x - 1), 1000);
    return () => clearInterval(t);
  }, [phase, secIdx]);
  useEffect(() => {
    if (phase === "run" && timeLeft <= 0) {
      setLogs(prev => [...prev, ...qs.slice(qi).map(q => ({ sec: q.sec, section: sec.key, ok: false, wrong: mistakeRec(q, -1, "mcq") }))]);
      goNext();
    }
  }, [timeLeft]);

  const answer = (idx) => {
    const q = qs[qi];
    const ok = idx === q.a;
    play("click");
    const entry = { sec: q.sec, section: sec.key, ok, ...(ok ? {} : { wrong: mistakeRec(q, idx, "mcq") }) };
    setLogs(prev => [...prev, entry]);
    if (qi + 1 >= qs.length) goNext(); else setQi(qi + 1);
  };

  if (phase === "intro") return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: theme.bg, color: theme.text, width: "min(100%,560px)", borderRadius: 18, padding: 20, animation: "pop .3s ease" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>🎯</div>
          <div style={{ fontWeight: 900, fontSize: 18, margin: "4px 0" }}>محاكاة اختبار كاملة</div>
          <div style={{ fontSize: 13, color: theme.sub, lineHeight: 1.9, margin: "6px 0 12px" }}>
            قسمان كما في القدرات الحقيقي: <b>لفظي</b> ثم <b>كمي</b>. لكل قسم <b>مؤقّت واحد للقسم كامله</b> — وزّع وقتك بنفسك. لن تظهر الإجابات إلا في التقرير النهائي، والأسئلة التي تخطئها تُحفظ في 📕 دفتر أخطائك.
          </div>
          {MOCK_SECS.map(s => (
            <div key={s.key} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0", padding: "9px 12px" }}>
              <span style={{ fontWeight: 800, fontSize: 13.5 }}>{s.icon} {s.name}</span>
              <span style={{ fontSize: 12.5, color: theme.sub }}>{s.n} سؤال • ⏱ {fmtClock(s.time)}</span>
            </div>
          ))}
          <button className="btn" style={{ width: "100%", padding: 14, fontSize: 16, marginTop: 8, background: "#B3402F" }} onClick={() => startSection(0)}>🎬 ابدأ المحاكاة</button>
          <button className="btn ghost" style={{ width: "100%", padding: 10, marginTop: 8 }} onClick={close}>إغلاق</button>
        </div>
      </div>
    </div>
  );

  if (phase === "brk") return (
    <div style={{ position: "fixed", inset: 0, background: "#0F5147", color: "#fff", zIndex: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", animation: "pop .3s ease" }}>
      <div style={{ fontSize: 44 }}>✅</div>
      <div style={{ fontWeight: 900, fontSize: 18, margin: "8px 0" }}>انتهى {MOCK_SECS[secIdx].name}</div>
      <div style={{ fontSize: 14, opacity: .85, marginBottom: 20, lineHeight: 1.9 }}>خذ نفسًا… القسم التالي: <b>{MOCK_SECS[secIdx + 1].name}</b><br />{MOCK_SECS[secIdx + 1].n} سؤال • ⏱ {fmtClock(MOCK_SECS[secIdx + 1].time)}</div>
      <button className="btn" style={{ padding: "13px 30px", fontSize: 16, background: "#fff", color: "#0F5147" }} onClick={() => startSection(secIdx + 1)}>ابدأ {MOCK_SECS[secIdx + 1].name} ←</button>
    </div>
  );

  if (phase === "report") {
    const correct = logs.filter(x => x.ok).length;
    const acc = logs.length ? correct / logs.length : 0;
    const score = Math.min(100, Math.round(55 + acc * 45));
    const secScore = (key) => { const L = logs.filter(x => x.section === key); const c = L.filter(x => x.ok).length; return L.length ? Math.round((c / L.length) * 100) : 0; };
    const bySec = {};
    logs.forEach(({ sec, ok }) => { bySec[sec] ||= { a: 0, c: 0 }; bySec[sec].a++; if (ok) bySec[sec].c++; });
    const rows = Object.entries(bySec).sort((a, b) => (a[1].c / a[1].a) - (b[1].c / b[1].a));
    const weak = rows.filter(([, v]) => v.c / v.a < 0.7).slice(0, 2);
    return (
      <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ background: theme.bg, color: theme.text, width: "min(100%,620px)", maxHeight: "88vh", overflowY: "auto", borderRadius: "22px 22px 0 0", padding: "18px 16px 30px", animation: "drop .3s ease" }}>
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: theme.sub }}>📋 تقرير المحاكاة الكاملة</div>
            <div style={{ fontSize: 46, fontWeight: 900, color: score >= 90 ? "#C89235" : "#0F5147", margin: "2px 0" }}>{score}</div>
            <div style={{ fontSize: 13, color: theme.sub }}>درجة تقديرية • {correct}/{logs.length} صحيحة</div>
            {g.mockBest && <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 3 }}>أفضل نتيجة سابقة: {g.mockBest.score}</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {MOCK_SECS.map(s => (
              <div key={s.key} className="card" style={{ flex: 1, textAlign: "center", margin: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: theme.sub }}>{s.icon} {s.name}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: secScore(s.key) >= 70 ? "#1F7A5C" : "#B3402F" }}>{secScore(s.key)}%</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 13.5, marginBottom: 8 }}>أداؤك حسب القسم:</div>
            {rows.map(([s, v]) => {
              const p = Math.round((v.c / v.a) * 100);
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, minWidth: 96 }}>{SEC_AR[s] || s}</span>
                  <div style={{ flex: 1, background: theme.line, borderRadius: 99, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${p}%`, height: "100%", borderRadius: 99, background: p >= 80 ? "#1F7A5C" : p >= 60 ? "#C89235" : "#B3402F" }} />
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 900, minWidth: 34, textAlign: "left" }}>{p}%</span>
                </div>
              );
            })}
          </div>
          {weak.length > 0 && <div className="card" style={{ background: "#B3402F0d", borderColor: "#B3402F33" }}>
            <div style={{ fontWeight: 900, fontSize: 13.5, marginBottom: 6 }}>🦉 ركّز على:</div>
            {weak.map(([s]) => <div key={s} style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 6 }}><b>{SEC_AR[s]}:</b> {TIP_FIX[s]}</div>)}
          </div>}
          <div style={{ fontSize: 12, color: theme.sub, textAlign: "center", margin: "4px 0 10px" }}>📕 أسئلتك الخاطئة حُفظت في دفتر الأخطاء للمراجعة</div>
          <button className="btn gold" style={{ width: "100%", padding: 13 }} onClick={() => { onDone({ score, verbal: secScore("verbal"), quant: secScore("quant"), acc, log: logs }); close(); }}>اعتمد النتيجة وأغلق ←</button>
        </div>
      </div>
    );
  }

  // phase === "run"
  const q = qs[qi];
  if (!q) return null;
  const low = timeLeft <= 30;
  return (
    <div style={{ position: "fixed", inset: 0, background: theme.bg, color: theme.text, zIndex: 60, overflowY: "auto", padding: "16px 16px 30px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 900 }}>{sec.icon} {sec.name}</span>
          <span className={low ? "tpulse" : ""} style={{ fontWeight: 900, fontSize: 16, color: low ? "#B3402F" : theme.text, direction: "ltr" }}>⏱ {fmtClock(timeLeft)}</span>
        </div>
        <div style={{ background: theme.line, borderRadius: 99, height: 6, marginBottom: 4, overflow: "hidden" }}>
          <div style={{ width: `${(timeLeft / sec.time) * 100}%`, height: "100%", background: low ? "#B3402F" : "#C89235", borderRadius: 99, transition: "width 1s linear" }} />
        </div>
        <div style={{ fontSize: 12, color: theme.sub, marginBottom: 10, fontWeight: 800 }}>سؤال {qi + 1} من {qs.length} • القسم {secIdx + 1}/{MOCK_SECS.length}</div>
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 900, color: "#C89235", marginBottom: 8 }}>{SEC_AR[q.sec] || q.sec}</div>
          <div dir="auto" style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.8, marginBottom: 12, whiteSpace: "pre-line" }}>{q.q}</div>
          {q.options.map((o, idx) => (
            <button key={idx} className="opt" style={{ textAlign: "start" }} onClick={() => answer(idx)}>{String.fromCharCode(65 + idx)}. {o}</button>
          ))}
        </div>
        <button className="btn ghost" style={{ width: "100%", padding: 10, marginTop: 4 }} onClick={() => answer(-1)}>تخطّي هذا السؤال ←</button>
      </div>
    </div>
  );
}

function applyMockDone(n, res, fx = FX_NULL) {
  if (!n.mockBest || res.score > n.mockBest.score) n.mockBest = { score: res.score, verbal: res.verbal, quant: res.quant };
  res.log.forEach(({ sec, ok, wrong }) => {
    n.stats.answered++; if (ok) n.stats.correct++;
    n.stats.bySec[sec] ||= { a: 0, c: 0, t: 0, to: 0 };
    const v = n.stats.bySec[sec]; v.a++; if (ok) v.c++;
    if (wrong) addMistake(n, wrong, n.day);
  });
  fx.toast(`🎯 محاكاة كاملة: ${res.score}`);
}



/* ═══════════════════════════════════════════════════════════
   🧑‍🏫 المعلم — شرح ذكي متدرج + معلم AI يناسب مستواك
   ═══════════════════════════════════════════════════════════ */
/* ---------- 🏔️ شعار Arise ---------- */
function AriseLogo({ size = 90, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill={color} aria-label="Arise">
      <path d="M12 86 L44 16 L64 54 L55 54 L44 33 L27 86 Z" />
      <path d="M58 86 L70 86 L89 42 L79 40 Z" />
      <path d="M18 80 L70 32 L76 39 L25 86 Z" />
      <path d="M66 14 L93 21 L83 45 Z" />
    </svg>
  );
}

/* ---------- 🎨 نظام الأيقونات الأصلية ---------- */
const IC_PATHS = {
  coin: <><circle cx="12" cy="12" r="9" fill="#F0C560" stroke="#B8860B" strokeWidth="1.6"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#B8860B" strokeWidth="1.3"/><path d="M12 8.8v6.4M9.6 10.4h4.8" stroke="#8A6508" strokeWidth="1.5" strokeLinecap="round"/></>,
  heart: <path d="M12 20.5S4.5 15.8 2.6 12C.9 8.6 3 5.2 6.2 5.2c2 0 3.6 1.1 5.8 3.3 2.2-2.2 3.8-3.3 5.8-3.3 3.2 0 5.3 3.4 3.6 6.8-1.9 3.8-9.4 8.5-9.4 8.5z"/>,
  bolt2: <path d="M13 2 4.5 13.5h5.6L9 22l8.7-11.6h-5.6z" fill="#F0C560" stroke="#B8860B" strokeWidth="1"/>,
  battery: <><rect x="2.5" y="8" width="16" height="9" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.8"/><rect x="19.5" y="10.5" width="2.5" height="4" rx="1" fill="currentColor"/></>,
  skull: <><path d="M12 3c-4.6 0-7.6 3-7.6 7.2 0 2.5 1.2 4.2 2.6 5.2V19a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3.6c1.4-1 2.6-2.7 2.6-5.2C19.6 6 16.6 3 12 3z" fill="#E8E6E0"/><circle cx="9" cy="11" r="1.9" fill="#17251F"/><circle cx="15" cy="11" r="1.9" fill="#17251F"/><path d="M10.5 17h3M12 14.3l-1 1.6h2z" stroke="#17251F" strokeWidth="1.2" fill="#17251F"/></>,
  brain: <path d="M9 3.5C6.8 3.5 5.4 5 5.3 6.8 3.8 7.3 3 8.6 3 10.1c0 1 .4 1.9 1.1 2.5-.4.6-.6 1.3-.6 2 0 2 1.6 3.5 3.6 3.6.4 1.6 1.8 2.6 3.4 2.6h1V3.5H9zM15 3.5c2.2 0 3.6 1.5 3.7 3.3 1.5.5 2.3 1.8 2.3 3.3 0 1-.4 1.9-1.1 2.5.4.6.6 1.3.6 2 0 2-1.6 3.5-3.6 3.6-.4 1.6-1.8 2.6-3.4 2.6h-1V3.5H15z" fill="#9B7EC8" stroke="#7B5EA7" strokeWidth="1"/>,
};
function Ico({ n, s = 16, c = "currentColor", style = {} }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={c} style={{ verticalAlign: "-2px", ...style }}>{IC_PATHS[n]}</svg>;
}

function TeacherFace({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <circle cx="24" cy="26" r="15" fill="#F1D3B0" />
      <path d="M9 24c0-10 6-16 15-16s15 6 15 16l-2 1c0-4-2-6-4-6H15c-2 0-4 2-4 6z" fill="#FDFDFB" stroke="#DDD6C8" strokeWidth="1"/>
      <path d="M7 23h34l-2 4H9z" fill="#C0392B"/>
      <circle cx="18" cy="27" r="4.4" fill="none" stroke="#17251F" strokeWidth="1.8"/>
      <circle cx="30" cy="27" r="4.4" fill="none" stroke="#17251F" strokeWidth="1.8"/>
      <path d="M22.4 27h3.2" stroke="#17251F" strokeWidth="1.8"/>
      <circle cx="18" cy="27" r="1.5" fill="#17251F"/><circle cx="30" cy="27" r="1.5" fill="#17251F"/>
      <path d="M19 35c2 2.2 8 2.2 10 0" stroke="#8A5A3B" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      <path d="M14 20c3-2 17-2 20 0" stroke="#D9C9B0" strokeWidth="1.4" fill="none"/>
    </svg>
  );
}

function Teacher({ g, theme, q, picked, fallbackCard, onClose, onBonus }) {
  const [tab, setTab] = useState("main");   // main | similar
  const [hintN, setHintN] = useState(0);
  const [sq] = useState(() => bankSimilar(q));
  const [sPicked, setSPicked] = useState(null);
  const wrongOpt = picked != null && q.options ? q.options[picked] : null;
  const trap = picked != null && q.traps ? q.traps[picked] : null;
  const level = masteryOf(g, q.topic || q.sec).label;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 195, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: theme.bg, color: theme.text, width: "min(100%,620px)", maxHeight: "88vh", overflowY: "auto", borderRadius: "22px 22px 0 0", padding: "14px 16px 28px", animation: "drop .3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <TeacherFace size={40} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 15 }}>المعلم</div>
            <div style={{ fontSize: 11, color: theme.sub }}>ما ننتقل حتى تفهم — هذا شغلي</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: theme.text }}>✕</button>
        </div>

        {tab === "main" && <>
          {wrongOpt != null && (
            <div className="card" style={{ borderColor: "#B3402F44", background: "#B3402F0a" }}>
              <div style={{ fontWeight: 900, fontSize: 13, color: "#B3402F", marginBottom: 4 }}>🔍 ليش أخطأت بالضبط:</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>{trap || `اخترت «${wrongOpt}» — والصحيح «${q.options[q.a]}». ${q.ex || ""}`}</div>
            </div>
          )}
          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 13, color: "#0F5147", marginBottom: 8 }}>🪜 الحل خطوة بخطوة:</div>
            {(q.steps || [q.ex || (fallbackCard ? fallbackCard.t : "")]).map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                <span style={{ minWidth: 22, height: 22, borderRadius: "50%", background: "#0F5147", color: "#fff", fontSize: 11.5, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.8 }}>{s}</span>
              </div>
            ))}
            {q.alt && <div style={{ marginTop: 8, background: "#7B5EA714", border: "1.5px solid #7B5EA733", borderRadius: 10, padding: "9px 12px", fontSize: 13, lineHeight: 1.8 }}><b style={{ color: "#7B5EA7" }}>🔀 {q.alt}</b></div>}
          </div>
          {q.hints && hintN < q.hints.length && (
            <button className="btn ghost" style={{ width: "100%", padding: 10, marginBottom: 8, fontSize: 13.5 }} onClick={() => { play("click"); setHintN(hintN + 1); }}>💡 أعطني تلميحًا فقط ({hintN}/{q.hints.length})</button>
          )}
          {q.hints && q.hints.slice(0, hintN).map((h, i) => (
            <div key={i} className="card" style={{ padding: "9px 13px", fontSize: 13, borderColor: "#C8923544" }}>💡 {i + 1}: {h}</div>
          ))}
          {sq && <button className="btn" style={{ width: "100%", padding: 12, fontSize: 13.5 }} onClick={() => { play("click"); setTab("similar"); }}>🧪 جرّبني بسؤال مشابه</button>}
        </>}

        {tab === "similar" && sq && (
          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 12.5, color: "#0F5147", marginBottom: 8 }}>🧪 نفس المهارة ({sq.skill}) — لو حليته، الفكرة رسخت:</div>
            <div dir="ltr" style={{ textAlign: "left", fontWeight: 700, fontSize: 15, marginBottom: 10, lineHeight: 1.7, whiteSpace: "pre-line" }}>{sq.q}</div>
            {sq.options.map((o, i) => {
              let st = {};
              if (sPicked !== null) { if (i === sq.a) st = { borderColor: "#1F7A5C", background: "#1F7A5C22" }; else if (i === sPicked) st = { borderColor: "#B3402F", background: "#B3402F22" }; }
              return <button key={i} className="opt" style={st} onClick={() => {
                if (sPicked !== null) return;
                setSPicked(i); play(i === sq.a ? "correct" : "wrong");
                if (i === sq.a && onBonus) onBonus(8);
              }}>{String.fromCharCode(65 + i)}. {o}</button>;
            })}
            {sPicked !== null && (
              <div style={{ fontSize: 13, lineHeight: 1.8, background: sPicked === sq.a ? "#1F7A5C14" : "#B3402F10", borderRadius: 10, padding: "9px 12px" }}>
                <b style={{ color: sPicked === sq.a ? "#1F7A5C" : "#B3402F" }}>{sPicked === sq.a ? "✓ رسخت! خذ مكافأتك" : "شوف الخطوات:"}</b> {sPicked === sq.a ? sq.ex : (sq.steps || [sq.ex]).join(" ← ")}
              </div>
            )}
            <button className="btn ghost" style={{ width: "100%", marginTop: 10, padding: 10, fontSize: 13 }} onClick={() => setTab("main")}>→ رجوع للشرح</button>
          </div>
        )}

      </div>
    </div>
  );
}


/* ---------- 💬 غرفة المعلم: تدريب موجَّه بالشرح المحلي ---------- */
function AskTeacher({ g, theme, onBack, onBonus }) {
  const SKILLS_LIST = (() => {
    const seen = {};
    GENS.filter(x => (x.type || "mcq") === "mcq").forEach(x => { if (!seen[x.skill]) seen[x.skill] = { skill: x.skill, topic: x.topic, diff: x.diff }; });
    return Object.values(seen);
  })();
  const weakTopic = weakestOf(g, Object.keys(TOPIC_META));
  const [q, setQ] = useState(null);
  const [picked, setPicked] = useState(null);
  const [teach, setTeach] = useState(false);
  const start = (skill) => {
    const cands = GENS.filter(x => (x.type || "mcq") === "mcq" && (!skill || x.skill === skill));
    const made = makeGen(GR.pick(cands), g);
    if (made) { play("click"); setPicked(null); setQ(made); }
  };
  return (
    <div style={{ animation: "drop .3s ease" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: theme.text, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: 8, opacity: .8 }}>→ رجوع للأكاديمية</button>
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <TeacherFace size={46} />
        <div style={{ fontSize: 13.5, lineHeight: 1.8 }}><b>اختر مهارة أدرّبك عليها.</b> أعطيك سؤالًا، وإن أخطأت أشرح لك سبب الخطأ خطوة بخطوة — وأكرر بأسئلة جديدة حتى تتقنها.</div>
      </div>

      {!q && <>
        <div className="card" style={{ borderColor: "#C8923544", background: "#C8923510" }}>
          <div style={{ fontSize: 12.5, fontWeight: 900, color: "#C89235", marginBottom: 6 }}>🎯 اقتراح المعلم — أضعف مواضيعك الآن</div>
          <div style={{ fontSize: 13.5, marginBottom: 8 }}>{SEC_AR[weakTopic] || weakTopic}</div>
          <button className="btn gold" style={{ width: "100%", padding: 11, fontSize: 13.5 }} onClick={() => {
            const cands = GENS.filter(x => (x.type || "mcq") === "mcq" && x.topic === weakTopic);
            const made = cands.length ? makeGen(GR.pick(cands), g) : null;
            if (made) { play("click"); setPicked(null); setQ(made); } else start(null);
          }}>درّبني على الأضعف ←</button>
        </div>
        <div className="card">
          <div style={{ fontSize: 12.5, fontWeight: 900, color: theme.sub, marginBottom: 8 }}>أو اختر مهارة بعينها ({SKILLS_LIST.length}):</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SKILLS_LIST.map(s => (
              <button key={s.skill} onClick={() => start(s.skill)} style={{ border: `1.5px solid ${theme.line}`, background: "transparent", color: theme.text, borderRadius: 10, padding: "7px 11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {s.skill}
              </button>
            ))}
          </div>
        </div>
      </>}

      {q && <div className="card">
        <div style={{ fontSize: 11.5, fontWeight: 900, color: "#0F5147", marginBottom: 8 }}>🧑‍🏫 تدريب • {q.skill}</div>
        <div dir="ltr" style={{ textAlign: "left", fontWeight: 700, fontSize: 15, marginBottom: 10, lineHeight: 1.75, whiteSpace: "pre-line" }}>{q.q}</div>
        {q.options.map((o, i) => {
          let st = {};
          if (picked !== null) { if (i === q.a) st = { borderColor: "#1F7A5C", background: "#1F7A5C22" }; else if (i === picked) st = { borderColor: "#B3402F", background: "#B3402F22" }; }
          return <button key={i} className="opt" style={st} onClick={() => {
            if (picked !== null) return;
            setPicked(i); play(i === q.a ? "correct" : "wrong");
            if (i === q.a && onBonus) onBonus(8);
          }}>{String.fromCharCode(65 + i)}. {o}</button>;
        })}
        {picked !== null && (
          <div style={{ fontSize: 13, lineHeight: 1.85, background: picked === q.a ? "#1F7A5C14" : "#B3402F10", borderRadius: 10, padding: "9px 12px" }}>
            <b style={{ color: picked === q.a ? "#1F7A5C" : "#B3402F" }}>{picked === q.a ? "✓ أحسنت" : "الصحيح: " + q.options[q.a]}</b>
            {" "}{picked === q.a ? q.ex : ((q.traps || {})[picked] || q.ex)}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {picked !== null && picked !== q.a && <button className="btn ghost" style={{ flex: 1, padding: 11, fontSize: 13 }} onClick={() => { play("click"); setTeach(true); }}>🧑‍🏫 لم أفهم</button>}
          <button className="btn" style={{ flex: 2, padding: 11, fontSize: 13.5 }} onClick={() => start(q.skill)}>سؤال آخر بنفس المهارة ←</button>
        </div>
        <button className="btn ghost" style={{ width: "100%", marginTop: 8, padding: 10, fontSize: 12.5 }} onClick={() => { play("click"); setQ(null); setPicked(null); }}>↺ اختر مهارة أخرى</button>
      </div>}

      {teach && q && <Teacher g={g} theme={theme} q={q} picked={picked} onClose={() => setTeach(false)} onBonus={onBonus} />}
    </div>
  );
}

/* ---------- 🔁 جلسة المراجعة اليومية (تكرار متباعد) ---------- */
function ReviewSession({ g, theme, onFinish, onExit }) {
  const [items] = useState(() => dueList(g).sort(() => Math.random() - 0.5));
  const [i, setI] = useState(0);
  const [stage, setStage] = useState("q");        // q | reteach | q2 | done
  const [picked, setPicked] = useState(null);
  const [numVal, setNumVal] = useState("");
  const [results, setResults] = useState([]);
  // 🎲 لكل وحدة مستحقة: سؤالان مختلفان (تشخيص ثم تثبيت) يتجددان كل مراجعة
  const [pool] = useState(() => items.map(it => {
    const gen = unitGenQs(it.u.id, 2, g);
    if (gen.length >= 2) return gen;
    const auth = it.u.awl ? awlDrills(it.u.awl) : (it.u.drills || []);
    if (!auth.length) return [];
    const b = Math.floor(Math.random() * auth.length);
    return [auth[b], auth[(b + 1) % auth.length]];
  }));
  const it = items[i];
  if (!it && stage !== "done") return <div className="card" style={{ textAlign: "center" }}>لا مراجعات اليوم — ذاكرتك مثبتة ✓<button className="btn" style={{ marginTop: 10 }} onClick={onExit}>رجوع</button></div>;
  const drill = it ? ((pool[i] || [])[stage === "q2" ? 1 : 0] || (pool[i] || [])[0] || it.u.drills[0]) : null;

  const record = (ok) => {
    if (stage === "q" && !ok) { play("wrong"); setPicked(null); setNumVal(""); setStage("reteach"); return; }
    play(ok ? "correct" : "wrong");
    const nr = [...results, { id: it.u.id, ok: stage === "q" }];
    setTimeout(() => {
      setResults(nr); setPicked(null); setNumVal("");
      if (i + 1 >= items.length) { setStage("done"); play("win"); onFinish(nr); }
      else { setI(i + 1); setStage("q"); }
    }, 750);
    setPicked(ok ? "ok" : "no");
  };

  if (stage === "done") {
    const kept = results.filter(r => r.ok).length;
    return (
      <div className="card" style={{ textAlign: "center", padding: 26, animation: "pop .4s ease" }}>
        <div style={{ fontSize: 50 }}>🧠</div>
        <div style={{ fontWeight: 900, fontSize: 18, margin: "8px 0" }}>مراجعة اليوم اكتملت</div>
        <div style={{ fontSize: 14, lineHeight: 2 }}>ثابت في ذاكرتك: <b style={{ color: "#1F7A5C" }}>{kept}</b> • رجع لخطة الغد: <b style={{ color: "#E58E26" }}>{results.length - kept}</b></div>
        <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 6 }}>كل إجابة صحيحة تُبعد موعد المراجعة القادمة — هكذا تبقى المعلومة ليوم الاختبار.</div>
        <button className="btn gold" style={{ width: "100%", marginTop: 14, padding: 12 }} onClick={onExit}>ممتاز ←</button>
      </div>
    );
  }

  if (stage === "reteach") return (
    <div style={{ animation: "drop .3s ease" }}>
      <div className="card" style={{ border: "1.5px solid #E58E2666" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#E58E26", marginBottom: 8 }}>🔄 تنشيط سريع — {it.u.icon} {it.u.name}</div>
        <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 6 }}>{it.u.cards[0].h}</div>
        <div style={{ fontSize: 14, lineHeight: 2 }}>{it.u.cards[0].t}</div>
        {it.u.cards[0].ex && <div dir="ltr" style={{ textAlign: "left", background: "#1F7A5C18", borderRadius: 10, padding: "8px 12px", marginTop: 8, fontSize: 13.5, fontWeight: 800, fontFamily: "Menlo, monospace" }}>{it.u.cards[0].ex}</div>}
      </div>
      <button className="btn" style={{ width: "100%", padding: 12 }} onClick={() => { play("click"); setStage("q2"); }}>تذكرت — جرّبني بسؤال تطبيقي ←</button>
    </div>
  );

  return (
    <div style={{ animation: "drop .25s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900, color: "#7B5EA7" }}>🔁 مراجعة {i + 1}/{items.length} — {it.u.icon} {it.u.name}</span>
        <button onClick={onExit} style={{ background: "none", border: "none", color: theme.sub, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>إيقاف مؤقت</button>
      </div>
      <div className="card">
        {stage === "q2" && <div style={{ fontSize: 11.5, fontWeight: 900, color: "#E58E26", marginBottom: 8 }}>سؤال التثبيت بعد التنشيط:</div>}
        <div dir="ltr" style={{ textAlign: "left", fontSize: 16, fontWeight: 700, marginBottom: 12, lineHeight: 1.7 }}>{drill.q}</div>
        {drill.kind === "num" ? <>
          <div dir="ltr" style={{ textAlign: "center", fontSize: 24, fontWeight: 900, letterSpacing: 3, background: theme.line + "55", borderRadius: 12, padding: "9px 0", marginBottom: 10, minHeight: 48, color: picked === "ok" ? "#1F7A5C" : picked === "no" ? "#B3402F" : theme.text }}>{numVal || "؟"}</div>
          {picked === null && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>
            {[1,2,3,4,5,6,7,8,9,"⌫",0,"✓"].map(k => (
              <button key={k} className="opt" style={{ textAlign: "center", fontSize: 17, fontWeight: 900, padding: "12px 0", margin: 0, background: k === "✓" ? "#0F5147" : undefined, color: k === "✓" ? "#fff" : undefined, opacity: k === "✓" && !numVal ? .45 : 1 }}
                onClick={() => { play("click"); if (k === "⌫") setNumVal(v => v.slice(0, -1)); else if (k === "✓") { if (numVal) record(parseInt(numVal, 10) === drill.a); } else if (numVal.length < 6) setNumVal(v => v + k); }}>{k}</button>
            ))}
          </div>}
        </> : drill.options.map((o, idx) => {
          let st = {};
          if (picked !== null) { if (idx === drill.a) st = { borderColor: "#1F7A5C", background: "#1F7A5C22" }; else st = { opacity: .5 }; }
          return <button key={idx} className="opt" style={st} onClick={() => picked === null && record(idx === drill.a)}>{String.fromCharCode(65 + idx)}. {o}</button>;
        })}
        {picked === "ok" && <div style={{ marginTop: 8, background: "#1F7A5C1d", borderRadius: 12, padding: "9px 12px", fontSize: 13, fontWeight: 800, color: "#1F7A5C" }}>✓ ثابتة! {drill.ex}</div>}
        {picked === "no" && <div style={{ marginTop: 8, background: "#B3402F14", borderRadius: 12, padding: "9px 12px", fontSize: 13, lineHeight: 1.8 }}><b style={{ color: "#B3402F" }}>القاعدة:</b> {drill.ex} — رجعت لخطة الغد.</div>}
      </div>
    </div>
  );
}

/* ---------- 🗺️ خريطة المعرفة ---------- */
function KnowledgeMap({ g, theme, onPick, close }) {
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: theme.bg, color: theme.text, width: "min(100%,620px)", maxHeight: "86vh", overflowY: "auto", borderRadius: "22px 22px 0 0", padding: "16px 16px 30px", animation: "drop .3s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 17 }}>🗺️ خريطة المعرفة</div>
          <button onClick={close} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: theme.text }}>✕</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, fontSize: 10.5, fontWeight: 800 }}>
          {[["⚪", "لم يبدأ"], ["🔵", "يتعلمه"], ["🟢", "فهمه"], ["🟠", "يحتاج مراجعة"], ["🥇", "أتقنه"]].map(([e, l]) => (
            <span key={l} style={{ background: theme.line + "66", borderRadius: 8, padding: "3px 8px" }}>{e} {l}</span>
          ))}
        </div>
        {KNOW_TRACKS.map(tr => (
          <div key={tr.name} className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>{tr.name}</div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
              {tr.ids.map((uid, i) => {
                const found = unitById(uid);
                const phIdx = ACADEMY.findIndex(p => p.id === found.ph.id);
                const st = nodeState(g, uid, phIdx);
                return (
                  <span key={uid + i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {i > 0 && <span style={{ color: theme.sub, fontWeight: 900 }}>←</span>}
                    <button onClick={() => onPick(found)} style={{ border: `1.5px solid ${st.c}`, background: st.c + "18", color: theme.text, borderRadius: 10, padding: "6px 9px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                      {st.e} {found.u.name.split(" ").slice(0, 2).join(" ")}
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: theme.sub, textAlign: "center", lineHeight: 1.8 }}>القاعدة: لا مفهوم يُفتح قبل متطلباته — إلا باجتياز اختبار الإتقان الصارم 🔓</div>
      </div>
    </div>
  );
}

/* ---------- 🦉 المدرب الذكي ---------- */
function Coach({ tip, close }) {
  useEffect(() => { play("coin"); }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 190, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={close}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(96%,560px)", margin: "0 8px 14px", background: "#17251F", color: "#fff", borderRadius: 20, padding: "16px 16px 14px", animation: "drop .35s ease", border: "1.5px solid #C8923555", boxShadow: "0 -8px 40px rgba(0,0,0,.4)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ animation: "pulse 2.5s infinite" }}><TeacherFace size={46} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, fontWeight: 900, color: "#C89235", letterSpacing: .5 }}>المعلم • تحليل مبني على أدائك أنت</div>
            <div style={{ fontWeight: 900, fontSize: 15, margin: "4px 0 6px" }}>{tip.e} {tip.h}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.9, opacity: .92 }}>{tip.d}</div>
          </div>
        </div>
        <button className="btn gold" style={{ width: "100%", marginTop: 12, padding: 11 }} onClick={close}>فهمت — كمّل ⚔️</button>
      </div>
    </div>
  );
}


/* ---------- ⚔️ استعداد ما قبل الزعيم ---------- */
function BossPrep({ g, theme, q, onBegin, onBack }) {
  const maxH = (g.skills.includes("heart4") ? 4 : 3) - (g.energy < 30 ? 1 : 0);
  return (
    <div style={{ animation: "pop .4s ease" }}>
      <div className="card" style={{ background: "#17251F", color: "#fff", border: "none", textAlign: "center", padding: 22 }}>
        <div style={{ fontSize: 12, color: "#F0C560", fontWeight: 900, letterSpacing: 2 }}>— معركة زعيم —</div>
        <div style={{ fontSize: 56, margin: "6px 0", animation: "pulse 2s infinite" }}>{q.icon}</div>
        <div style={{ fontWeight: 900, fontSize: 18 }}>{q.name}</div>
        <div style={{ fontSize: 13, opacity: .85, marginTop: 6, lineHeight: 1.8 }}>{q.desc}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 12, fontSize: 12.5, fontWeight: 800 }}>
          <span>💀 HP {q.enemy.hp}</span><span>⏱ {q.enemy.time}ث/سؤال</span><span>⭐ {q.enemy.xp} XP</span>
        </div>
      </div>
      <div className="card">
        <div style={{ fontWeight: 900, fontSize: 13.5, marginBottom: 8 }}>عدّتك للمعركة:</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800, flexWrap: "wrap", gap: 6 }}>
          <span>{"❤️".repeat(Math.max(2, maxH))}{g.energy < 30 ? " (مرهق −1)" : ""}</span>
          <span>💡×{g.items.hint} 🧊×{g.items.freeze} 🧪×{g.items.potion}</span>
          <span>🔋 {g.energy}%</span>
        </div>
        {g.mode === "calm" && <div style={{ fontSize: 12, color: theme.sub, fontWeight: 800, marginTop: 8 }}>⏱ تنبيه: معارك الزعماء بمؤقت دائمًا — حتى في الوضع الهادئ. هذي هيبتهم.</div>}
        {g.energy < 30 && <div style={{ fontSize: 12, color: "#B3402F", fontWeight: 800, marginTop: 8 }}>⚠️ طاقتك منخفضة — الأفضل ترتاح أو تنام قبل الزعيم.</div>}
      </div>
      <button className="btn" style={{ width: "100%", padding: 14, fontSize: 16, background: "#B3402F" }} onClick={onBegin}>⚔️ ادخل المعركة</button>
      <button className="btn ghost" style={{ width: "100%", padding: 11, marginTop: 8 }} onClick={onBack}>لست جاهزًا بعد — رجوع</button>
    </div>
  );
}

/* ---------- 🎯 الهدف التالي + مركز المهمات ---------- */
const LOC_HINT = {
  1: { q1: "🏠 البيت", q2: "🏫 المدرسة", q3: "🏫 المدرسة", boss: "🏫 المدرسة" },
  2: { q1: "🏛️ مركز قياس", boss: "🏛️ مركز قياس" },
  3: { choice: "🏠 البيت (منصة القبول)", q1: "🏠 البيت", boss: "🏠 البيت" },
  4: { q1: "🛫 المطار", q2: "🛏️ السكن", boss: "🎓 الجامعة" },
  5: { q1: "🎓 الجامعة", q2: "🎓 الجامعة", q3: "🎓 الجامعة", boss: "🎓 الجامعة" },
  6: { q1: "🎓 الجامعة", boss: "🎓 الجامعة" },
  7: { q1: "🛢️ برج أرامكو", boss: "🛢️ برج أرامكو" },
};
function nextGoal(g) {
  const acadCount = Object.keys(g.acad?.units || {}).length;
  if (g.chapter === 1 && g.stats.battles === 0 && acadCount === 0)
    return { t: "🎓 ابدأ رحلة التعلم من الأكاديمية", sub: "حدد مستواك أو ابدأ من الصفر • 📍 📚 الأكاديمية", pct: 5, gold: true };
  const d = g.daily;
  if (d) for (const id of d.ids) {
    const def = DAILY_POOL.find(p => p.id === id);
    if (def && !d.claimed[id] && (d.prog[id] || 0) >= def.goal) return { t: "🎁 مكافأة جاهزة للاستلام!", sub: def.t + " — افتح 📋 المهمات", pct: 100, gold: true };
  }
  const ch = CH.find(c => c.id === g.chapter);
  const mains = ch.quests.filter(q => !q.side);
  const doneCount = mains.filter(q => g.done[`${ch.id}:${q.id}`]).length;
  const total = mains.length + 1;
  const nq = mains.find(q => !g.done[`${ch.id}:${q.id}`]);
  const hint = (qid) => LOC_HINT[ch.id]?.[qid] ? ` • 📍 ${LOC_HINT[ch.id][qid]}` : "";
  if (nq) return { t: `🎯 ${nq.type === "choice" ? "اختر جامعتك" : nq.name}`, sub: ch.title + hint(nq.id), pct: Math.round((doneCount / total) * 100) };
  if (!g.done[`${ch.id}:boss`]) return { t: `⚔️ الزعيم بانتظارك: ${ch.boss.name}`, sub: ch.title + hint("boss"), pct: Math.round((doneCount / total) * 100), boss: true };
  return { t: "🏆 الفصل مكتمل — واصل رحلتك", sub: ch.title, pct: 100 };
}

function TaskRow({ def, prog, claimed, onClaim, theme, weekly }) {
  const p = Math.min(def.goal, prog || 0);
  const done = p >= def.goal;
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, flex: 1 }}>{def.t}</div>
        {claimed ? <span style={{ fontSize: 11.5, color: "#1F7A5C", fontWeight: 900 }}>✓ مُستلمة</span> :
          done ? <button className="btn gold" style={{ padding: "5px 12px", fontSize: 12 }} onClick={onClaim}>استلم 🎁</button> :
            <span style={{ fontSize: 11.5, fontWeight: 900, color: theme.sub }}>{p}/{def.goal}</span>}
      </div>
      <div style={{ background: theme.line, borderRadius: 99, height: 6, overflow: "hidden", marginTop: 4 }}>
        <div style={{ width: `${(p / def.goal) * 100}%`, height: "100%", borderRadius: 99, background: claimed ? "#1F7A5C" : weekly ? "#7B5EA7" : "#C89235", transition: "width .4s" }} />
      </div>
    </div>
  );
}

function GoalTasks({ g, theme, claimTask, claimSeason, onReview }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("d");
  const goal = nextGoal(g);
  const d = g.daily, w = g.weekly, s = g.season;
  const readyCount = (d ? d.ids.filter(id => { const def = DAILY_POOL.find(p => p.id === id); return def && !d.claimed[id] && (d.prog[id] || 0) >= def.goal; }).length : 0)
    + (w ? w.ids.filter(id => { const def = WEEKLY_POOL.find(p => p.id === id); return def && !w.claimed[id] && (w.prog[id] || 0) >= def.goal; }).length : 0)
    + (s ? SEASON.tiers.filter((t, i) => s.pts >= t.p && !s.claimed.includes(i)).length : 0);
  return (
    <div className="card" style={{ padding: 12, border: goal.gold ? "2px solid #C89235" : `1px solid ${theme.line}` }}>
      {/* الهدف التالي */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 13.5, color: goal.boss ? "#B3402F" : theme.text }}>{goal.t}</div>
          <div style={{ fontSize: 11, color: theme.sub, marginTop: 2 }}>{goal.sub} • {goal.pct}%</div>
        </div>
        <button onClick={() => { play("click"); setOpen(!open); }} style={{ border: "none", background: "#C8923522", color: "#C89235", borderRadius: 10, padding: "7px 11px", fontWeight: 900, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", position: "relative" }}>
          📋 المهمات{readyCount > 0 && <span style={{ position: "absolute", top: -6, left: -6, background: "#B3402F", color: "#fff", borderRadius: 99, fontSize: 10, padding: "1px 6px", fontWeight: 900 }}>{readyCount}</span>}
        </button>
      </div>
      <div style={{ background: theme.line, borderRadius: 99, height: 7, overflow: "hidden", marginTop: 8 }}>
        <div style={{ width: `${goal.pct}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#F0C560,#C89235)", transition: "width .5s" }} />
      </div>
      {dueList(g).length > 0 && (
        <button onClick={onReview} style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, marginTop: 9, border: "1.5px solid #7B5EA755", background: "#7B5EA714", borderRadius: 11, padding: "8px 11px", cursor: "pointer", fontFamily: "inherit", color: theme.text }}>
          <Ico n="brain" s={19} />
          <span style={{ flex: 1, textAlign: "right", fontWeight: 800, fontSize: 12.5 }}>مراجعة اليوم: {dueList(g).length} — قبل ما تتبخر من الذاكرة</span>
          <span style={{ fontWeight: 900, fontSize: 12, color: "#7B5EA7" }}>3 دقائق ←</span>
        </button>
      )}

      {open && <div style={{ marginTop: 12, borderTop: `1px solid ${theme.line}`, paddingTop: 10 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {[["d", "☀️ اليوم"], ["w", "📅 الأسبوع"], ["s", "🏆 الموسم"]].map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, border: "none", borderRadius: 10, padding: "7px 0", fontWeight: 900, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", background: tab === id ? "#0F5147" : theme.line + "66", color: tab === id ? "#fff" : theme.text }}>{l}</button>
          ))}
        </div>
        {tab === "d" && d && d.ids.map(id => { const def = DAILY_POOL.find(p => p.id === id); return def && <TaskRow key={id} def={def} prog={d.prog[id]} claimed={d.claimed[id]} onClaim={() => claimTask("d", id)} theme={theme} />; })}
        {tab === "d" && <div style={{ fontSize: 11, color: theme.sub, textAlign: "center" }}>تتجدد تلقائيًا كل يوم • كل مهمة = +15 نقطة موسم</div>}
        {tab === "w" && w && w.ids.map(id => { const def = WEEKLY_POOL.find(p => p.id === id); return def && <TaskRow key={id} def={def} prog={w.prog[id]} claimed={w.claimed[id]} onClaim={() => claimTask("w", id)} theme={theme} weekly />; })}
        {tab === "w" && <div style={{ fontSize: 11, color: theme.sub, textAlign: "center" }}>تتجدد كل أسبوع • كل مهمة = +40 نقطة موسم</div>}
        {tab === "s" && s && <>
          <div style={{ fontWeight: 900, fontSize: 12.5, marginBottom: 6 }}>{SEASON.name} — <span style={{ color: "#C89235" }}>{s.pts} نقطة</span></div>
          {SEASON.tiers.map((t, i) => {
            const reached = s.pts >= t.p, claimed = s.claimed.includes(i);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 20, filter: reached ? "none" : "grayscale(1)", opacity: reached ? 1 : .5 }}>{t.e}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{t.t} <span style={{ color: theme.sub }}>({t.p} نقطة)</span></div>
                  <div style={{ background: theme.line, borderRadius: 99, height: 5, overflow: "hidden", marginTop: 3 }}>
                    <div style={{ width: `${Math.min(100, (s.pts / t.p) * 100)}%`, height: "100%", background: "#7B5EA7", borderRadius: 99 }} />
                  </div>
                </div>
                {claimed ? <span style={{ fontSize: 11, color: "#1F7A5C", fontWeight: 900 }}>✓</span> :
                  reached ? <button className="btn gold" style={{ padding: "5px 11px", fontSize: 11.5 }} onClick={() => claimSeason(i)}>استلم</button> :
                    <span style={{ fontSize: 11, color: theme.sub, fontWeight: 800 }}>🔒</span>}
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: theme.sub, textAlign: "center" }}>النقاط من: المعارك (+10) • الزعماء (+25) • المهام اليومية (+15) والأسبوعية (+40)</div>
        </>}
      </div>}
    </div>
  );
}


/* ---------- 🏢 Road to Aramco ---------- */
function roadMilestones(g) {
  const p = (id) => phaseProg(g, ACADEMY.find(x => x.id === id));
  const M = [
    { icon: "🧱", name: "Foundation", desc: "أساسيات الرياضيات والإنجليزية", pct: Math.round((p("F") + p("S")) / 2), done: phaseDone(g, "F") && phaseDone(g, "S"), go: "acad" },
    { icon: "🎓", name: "Academic English (AWL)", desc: `${Object.values(AWL_WORDS).reduce((a,w)=>a+w.length,0)} كلمة أكاديمية — معنى ونطق واستخدام`, pct: p("A"), done: phaseDone(g, "A"), go: "acad" },
    { icon: "🧭", name: "GAT English", desc: "استراتيجيات + محاكاة + دخول اختبار القدرات", pct: Math.round((p("Q") + p("P") + (g.gatScore ? 100 : 0)) / 3), done: phaseDone(g, "Q") && phaseDone(g, "P") && !!g.gatScore, go: "acad" },
    { icon: "🏭", name: "CPC Preparation", desc: "سرعة ذهنية، منطق، وقراءة بنمط أرامكو", pct: p("C"), done: phaseDone(g, "C"), go: "acad" },
    { icon: "🏯", name: "Aramco Assessment", desc: "اختبار القبول — المعركة الأخيرة في القصة", pct: g.done["7:boss"] ? 100 : Math.round((g.chapter / 7) * 100), done: !!g.done["7:boss"], go: "world" },
    { icon: "🪪", name: "Job Offer", desc: "عرض العمل — النهاية الأسطورية", pct: g.ending === "legend" ? 100 : g.ending ? 50 : 0, done: g.ending === "legend", go: "world" },
  ];
  let unlocked = 0;
  M.forEach((m, i) => { m.locked = i > 0 && !M[i - 1].done; if (!m.locked) unlocked = i; });
  return { M, current: M.findIndex(m => !m.done && !m.locked) };
}
function RoadPanel({ g, theme, close, goAcad }) {
  const { M, current } = roadMilestones(g);
  const total = Math.round(M.reduce((a, m) => a + m.pct, 0) / 6);
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 55, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: theme.bg, color: theme.text, width: "min(100%,620px)", maxHeight: "86vh", overflowY: "auto", borderRadius: "22px 22px 0 0", padding: "16px 16px 30px", animation: "drop .3s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontWeight: 900, fontSize: 17 }}>🏢 Road to Aramco</div>
          <button onClick={close} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: theme.text }}>✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: theme.sub, marginBottom: 10 }}>كل لعبة تلعبها = خطوة حقيقية نحو القبول • إجمالي الرحلة: <b style={{ color: "#C89235" }}>{total}%</b></div>
        {M.map((m, i) => (
          <div key={m.name} style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 36 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900,
                background: m.done ? "#1F7A5C" : i === current ? "#C89235" : theme.card, color: m.done || i === current ? "#fff" : theme.sub,
                border: `2px solid ${m.done ? "#1F7A5C" : i === current ? "#C89235" : theme.line}`, animation: i === current ? "pulse 2s infinite" : "none" }}>
                {m.done ? "✓" : m.locked ? "🔒" : m.icon}
              </div>
              {i < M.length - 1 && <div style={{ width: 3, flex: 1, minHeight: 22, background: m.done ? "#1F7A5C" : theme.line, borderRadius: 2 }} />}
            </div>
            <div className="card" style={{ flex: 1, opacity: m.locked ? .5 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 14 }} dir="ltr">{m.icon} {m.name}</div>
                  <div style={{ fontSize: 12, color: theme.sub, marginTop: 2 }}>{m.locked ? "أتقن المرحلة السابقة لفتحها" : m.desc}</div>
                </div>
                {!m.locked && !m.done && i === current && <button className="btn gold" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => { close(); if (m.go === "acad") goAcad(); }}>{m.go === "acad" ? "الأكاديمية ←" : "العالم ←"}</button>}
              </div>
              <div style={{ background: theme.line, borderRadius: 99, height: 7, overflow: "hidden", marginTop: 8 }}>
                <div style={{ width: `${m.pct}%`, height: "100%", borderRadius: 99, background: m.done ? "#1F7A5C" : "linear-gradient(90deg,#F0C560,#C89235)", transition: "width .5s" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 📔 سجل الرحلة ---------- */
function MistakesTab({ g, theme, clearMistake }) {
  const mistakes = g.mistakes || [];
  const [mode, setMode] = useState("list");   // list | test | done
  const [queue, setQueue] = useState([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState(null);
  const [cleared, setCleared] = useState(0);

  if (mistakes.length === 0 && mode === "list") {
    return (
      <div className="card" style={{ textAlign: "center", color: theme.sub, fontSize: 13, lineHeight: 2 }}>
        📕 دفتر أخطائك فاضٍ.<br />كل سؤال تخطئ فيه بالمعارك يُحفظ هنا تلقائيًا — راجعه، أعِد اختبار نفسك فيه، وأتقنه.
      </div>
    );
  }

  const startTest = () => { setQueue([...mistakes]); setQi(0); setPicked(null); setCleared(0); setMode("test"); play("click"); };
  const grade = (m, correct) => { if (correct) { clearMistake(m.id); setCleared(c => c + 1); play("correct"); } else play("wrong"); };

  if (mode === "done") {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>🎯</div>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>خلّصت مراجعة أخطائك</div>
        <div style={{ fontSize: 13, color: theme.sub, marginBottom: 14 }}>أتقنت {cleared} من {queue.length} — بقي {mistakes.length} في الدفتر</div>
        <button className="btn" style={{ width: "100%", padding: 11 }} onClick={() => { setMode("list"); play("click"); }}>رجوع للدفتر</button>
      </div>
    );
  }

  if (mode === "test") {
    const m = queue[qi];
    const isLast = qi >= queue.length - 1;
    const advance = () => { if (isLast) setMode("done"); else { setQi(qi + 1); setPicked(null); } };
    const showNext = picked !== null && picked !== "rev";
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: theme.sub, marginBottom: 8, fontWeight: 800 }}>
          <span>سؤال {qi + 1}/{queue.length}</span><span>{SEC_AR[m.sec] || m.sec}</span>
        </div>
        <div dir="auto" className="card" style={{ fontWeight: 800, fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{m.q}</div>
        {m.kind === "mcq" ? (
          <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
            {m.options.map((opt, idx) => {
              let bg; if (picked !== null) { if (idx === m.a) bg = "#1F7A5C"; else if (idx === picked) bg = "#B3402F"; }
              return (
                <button key={idx} className="opt" disabled={picked !== null}
                  style={{ background: bg, color: bg ? "#fff" : undefined, textAlign: "start" }}
                  onClick={() => { if (picked !== null) return; setPicked(idx); grade(m, idx === m.a); }}>{opt}</button>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {picked === null ? (
              <button className="btn ghost" style={{ width: "100%", padding: 11 }} onClick={() => setPicked("rev")}>أظهر الإجابة</button>
            ) : (
              <>
                <div className="card" style={{ textAlign: "center", fontWeight: 900 }}>الإجابة الصحيحة: <span style={{ color: "#1F7A5C" }}>{m.a}</span></div>
                {picked === "rev" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className="btn" style={{ flex: 1, padding: 10 }} onClick={() => { grade(m, true); setPicked("marked"); }}>✓ عرفتها</button>
                    <button className="btn ghost" style={{ flex: 1, padding: 10 }} onClick={() => { grade(m, false); setPicked("marked"); }}>✗ راجعها</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {showNext && (
          <>
            {m.ex && <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 8, lineHeight: 1.8 }}>💡 {m.ex}</div>}
            <button className="btn" style={{ width: "100%", padding: 11, marginTop: 10 }} onClick={advance}>{isLast ? "إنهاء ✓" : "التالي ←"}</button>
          </>
        )}
      </div>
    );
  }

  // mode === "list"
  return (
    <>
      <button className="btn" style={{ width: "100%", padding: 12, marginBottom: 10 }} onClick={startTest}>🎯 اختبرني في أخطائي ({mistakes.length})</button>
      {mistakes.map((m, i) => (
        <div key={m.id + "_" + i} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 900, background: theme.line + "88", borderRadius: 6, padding: "2px 8px" }}>{SEC_AR[m.sec] || m.sec}</span>
            <span style={{ fontSize: 10.5, color: theme.sub }}>📅 يوم {m.ts}</span>
          </div>
          <div dir="auto" style={{ fontWeight: 800, fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{m.q}</div>
          <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.9 }}>
            <span style={{ color: "#B3402F" }}>إجابتك: {m.picked === -1 ? "انتهى الوقت ⏰" : m.kind === "mcq" ? m.options[m.picked] : m.picked} ❌</span><br />
            <span style={{ color: "#1F7A5C" }}>الصحيحة: {m.kind === "mcq" ? m.options[m.a] : m.a} ✓</span>
          </div>
          {m.ex && <div style={{ fontSize: 12, color: theme.sub, marginTop: 5, lineHeight: 1.8 }}>💡 {m.ex}</div>}
        </div>
      ))}
    </>
  );
}

function Journal({ g, theme, close, clearMistake }) {
  const [tab, setTab] = useState("tl");
  const col = COLLECT.map(c => ({ ...c, got: c.cond(g) }));
  const gotN = col.filter(c => c.got).length;
  const tline = [...(g.timeline || [])].sort((a, b) => a.day - b.day);
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: theme.bg, color: theme.text, width: "min(100%,620px)", maxHeight: "84vh", overflowY: "auto", borderRadius: "22px 22px 0 0", padding: "16px 16px 30px", animation: "drop .3s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 17 }}>📔 رحلة {g.name}</div>
          <button onClick={close} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: theme.text }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["tl", "📖 يومياتي"], ["col", `🎒 المقتنيات ${gotN}/${col.length}`], ["mis", `📕 أخطائي ${(g.mistakes || []).length}`]].map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, border: "none", borderRadius: 10, padding: "8px 0", fontWeight: 900, fontSize: 13, cursor: "pointer", fontFamily: "inherit", background: tab === id ? "#0F5147" : theme.line + "66", color: tab === id ? "#fff" : theme.text }}>{l}</button>
          ))}
        </div>

        {tab === "tl" && <>
          <div className="card" style={{ textAlign: "center", fontSize: 12.5, fontWeight: 800, color: theme.sub }}>
            من طالب ثانوي 🎒 إلى {g.ending === "legend" ? "مهندس أرامكو 👑" : titleOf(g.xp).name + " " + titleOf(g.xp).icon} — اليوم {g.day} من الرحلة
          </div>
          {tline.length === 0 && <div className="card" style={{ textAlign: "center", color: theme.sub, fontSize: 13 }}>هنا يُكتب دفتر يومياتك… كل لحظة كبيرة تعيشها تتحول لسطر يُروى.</div>}
          {tline.map((x, i) => (
            <div key={x.k} style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 30 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#0F5147", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{x.e}</div>
                {i < tline.length - 1 && <div style={{ width: 3, flex: 1, minHeight: 18, background: theme.line, borderRadius: 2 }} />}
              </div>
              <div className="card" style={{ flex: 1, padding: "10px 13px" }}>
                <div style={{ fontWeight: 900, fontSize: 13.5 }}>{x.t}</div>
                {x.b && <div style={{ fontSize: 12, color: theme.sub, marginTop: 4, lineHeight: 1.8, fontStyle: "italic" }}>"{x.b}"</div>}
                <div style={{ fontSize: 11, color: theme.sub, marginTop: 3 }}>📅 اليوم {x.day}</div>
              </div>
            </div>
          ))}
          {/* محطات قادمة */}
          {CH.filter(c => c.id > g.chapter || (c.id === g.chapter && !g.done[`${c.id}:boss`])).slice(0, 2).map(c => (
            <div key={c.id} style={{ display: "flex", gap: 12, opacity: .45 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 30 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: theme.line, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🔮</div>
              </div>
              <div className="card" style={{ flex: 1, padding: "10px 13px" }}>
                <div style={{ fontWeight: 900, fontSize: 13.5 }}>؟؟؟ — {c.title}</div>
                <div style={{ fontSize: 11, color: theme.sub, marginTop: 2 }}>بانتظارك…</div>
              </div>
            </div>
          ))}
        </>}

        {tab === "mis" && <MistakesTab g={g} theme={theme} clearMistake={clearMistake} />}

        {tab === "col" && <>
          <div style={{ background: theme.line, borderRadius: 99, height: 8, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ width: `${(gotN / col.length) * 100}%`, height: "100%", background: "linear-gradient(90deg,#F0C560,#C89235)", borderRadius: 99 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {col.map(c => (
              <div key={c.id} className="card" style={{ textAlign: "center", margin: 0, padding: "12px 6px", opacity: c.got ? 1 : .45, border: c.got ? "1.5px solid #C89235" : `1px solid ${theme.line}` }}>
                <div style={{ fontSize: 28, filter: c.got ? "none" : "grayscale(1) blur(1px)" }}>{c.e}</div>
                <div style={{ fontWeight: 900, fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>{c.got ? c.n : "؟؟؟"}</div>
                <div style={{ fontSize: 9.5, color: theme.sub, marginTop: 2, lineHeight: 1.5 }}>{c.got ? "✓ في حوزتك" : c.h}</div>
              </div>
            ))}
          </div>
        </>}
      </div>
    </div>
  );
}

/* ═══════════════ 🎮 GAME APP v2 — عالم حي بنظام يوم ═══════════════ */

const SAVE_VER = 1;
const newSave = () => ({
  v: SAVE_VER,
  started: false, name: "ضاوي", avatar: "a1", owned: ["a1"], mode: "calm",
  chapter: 1, done: {}, seen: {},
  day: 1, slot: 0, energy: 100, dayFlags: {}, lastBattle: null,
  xp: 0, coins: 60, skills: [], items: { hint: 1, freeze: 0, potion: 0 },
  streak: 0, lastDay: "", dailyDate: "",
  ach: [], gatScore: null, uni: null, finalAcc: null, ending: null,
  stats: { answered: 0, correct: 0, bySec: {}, battles: 0, bestCombo: 0 },
  daily: null, weekly: null, season: null, history: [], timeline: [], coachN: 0,
  acad: { units: {}, placed: null, simBest: null, opened: {} },
  srs: {},
  mistakes: [],
  mockBest: null,
  examDate: null,
  mem: { study: 0, work: 0, rest: 0, perfects: 0, lost: {}, comeback: {}, gatFirst: null, gatImproved: null, lastComeback: null },
});

/* 📕 دفتر الأخطاء: يلتقط السؤال الذي أخطأ فيه اللاعب كاملًا ليعيد مراجعته لاحقًا */
function mistakeRec(q, picked, kind) {
  return {
    id: sigOf(q.q), sec: q.sec, kind,
    q: q.q, options: q.options || null, a: q.a, picked,
    ex: q.ex || "", steps: q.steps || null,
  };
}
function addMistake(n, rec, day) {
  n.mistakes = (n.mistakes || []).filter(m => m.id !== rec.id);
  n.mistakes.unshift({ ...rec, ts: day });
  if (n.mistakes.length > 60) n.mistakes.length = 60;
}



class Guard extends (typeof React !== "undefined" ? React.Component : Object) {
  constructor(p) { super(p); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  render() {
    if (this.state.err) return (
      <div dir="rtl" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Tahoma", background: "#F4F6F3", padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 54 }}>🛠️</div>
        <div style={{ fontWeight: 900, fontSize: 18, margin: "10px 0" }}>صار خلل غير متوقع</div>
        <div style={{ fontSize: 14, color: "#5A6A62", lineHeight: 1.9 }}>حفظ Arise بأمان تام. اضغط الزر وترجع لرحلتك من نفس النقطة.</div>
        <button onClick={() => this.setState({ err: false })} style={{ marginTop: 16, border: "none", background: "#0F5147", color: "#fff", padding: "12px 26px", borderRadius: 12, fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>↩️ ارجع للعبة</button>
      </div>
    );
    return this.props.children;
  }
}
import React from "react";


/* ═══ 🧪 PURE PROGRESSION CORE — قابل للاختبار الآلي الكامل ═══ */
const FX_NULL = { toast: () => {}, play: () => {}, later: (f) => f && f() };
function grantP(n, achId, fx) {
    if (achId && !n.ach.includes(achId)) {
      n.ach.push(achId);
      const a = ACHV.find(x => x.id === achId);
      fx.toast(`🏅 إنجاز: ${a.name}`); fx.play("coin");
    }
}

function addRewardsP(n, xp, coins, fx) {
    const beforeLvl = lvlOf(n.xp);
    if (n.dayFlags?.x2) xp *= 2;
    if (n.energy >= 80) xp = Math.round(xp * 1.1);
    n.xp += xp;
    n.coins += Math.round(coins * (n.skills.includes("gold") ? 1.5 : 1));
    if (n.coins >= 500) grantP(n, "rich", fx);
    const afterLvl = lvlOf(n.xp);
    if (afterLvl > beforeLvl) {
      let bonus = 0, chest = false;
      for (let L = beforeLvl + 1; L <= afterLvl; L++) {
        bonus += 20 * L;
        if (L === 2) tl(n, "lv2", "⬆️", "أول ترقية مستوى", "أول مرة تشوف الشريط الذهبي يكتمل. من هنا بدأ الإدمان الجميل.");
        if (L % 5 === 0) { chest = true; n.items.hint++; n.items.freeze++; n.items.potion++; tl(n, "lv" + L, "🏵️", `وصلت المستوى ${L} — صندوق كبير`); }
      }
      n.coins += bonus;
      fx.toast(`⬆️ مستوى ${afterLvl}! +${bonus}🪙 +نقطة مهارة`);
      if (chest) fx.later(() => fx.toast("🎁 صندوق المستوى الكبير: +💡+🧊+🧪"), 600);
      fx.play("levelup");
    }
    const today = new Date().toDateString();
    if (n.lastDay !== today) {
      const diff = n.lastDay ? (new Date(today) - new Date(n.lastDay)) / 864e5 : 99;
      n.streak = diff === 1 ? n.streak + 1 : 1;
      n.lastDay = today;
      if (n.streak >= 3) grantP(n, "streak3", fx);
    }
}


function applyClaimTask(n, scope, id, fx = FX_NULL) {
    ensurePeriods(n);
    const pool = scope === "d" ? DAILY_POOL : WEEKLY_POOL;
    const st = scope === "d" ? n.daily : n.weekly;
    const d = pool.find(p => p.id === id);
    if (!d || st.claimed[id] || (st.prog[id] || 0) < d.goal) return;
    st.claimed[id] = true;
    addRewardsP(n,  d.r.xp || 0, d.r.coins || 0, fx);
    if (d.r.item) n.items[d.r.item]++;
    n.season.pts += scope === "d" ? 15 : 40;
    fx.toast(`✅ مهمة مكتملة: +${d.r.coins || 0}🪙${d.r.xp ? ` +${d.r.xp}XP` : ""}${d.r.item ? " +" + SHOP_ITEMS.find(s => s.id === d.r.item).icon : ""} • +${scope === "d" ? 15 : 40} نقطة موسم`);
    fx.play("coin");
  }

function applyClaimSeason(n, idx, fx = FX_NULL) {
    ensurePeriods(n);
    const t = SEASON.tiers[idx];
    if (!t || n.season.claimed.includes(idx) || n.season.pts < t.p) return;
    n.season.claimed.push(idx);
    if (t.r.coins) n.coins += t.r.coins;
    if (t.r.items) Object.entries(t.r.items).forEach(([k, v]) => { n.items[k] += v; });
    fx.toast(`🏆 مكافأة الموسم: ${t.e} ${t.t}`);
    fx.play("win");
  }

function applyDailyChest(n, fx = FX_NULL) {
  const today = new Date().toDateString();
  if (n.dailyDate === today) { fx.toast("⏳ الصندوق يتجدد بكرة"); return false; }
  const item = ["hint", "freeze", "potion"][Math.floor(Math.random() * 3)];
  n.dailyDate = today; n.coins += 40; n.items[item]++;
  addRewardsP(n, 10, 0, fx);
  const it = SHOP_ITEMS.find(s => s.id === item);
  fx.play("coin"); fx.toast(`🎁 +40 🪙 + ${it.icon} ${it.name}`);
  return true;
}

function applyReview(n, records, fx = FX_NULL) {
            n.srs ||= {};
            let kept = 0;
            records.forEach(({ id, ok }) => {
              const s = n.srs[id] || { lvl: 0, due: n.day };
              if (ok) { kept++; s.lvl = Math.min(SRS_INT.length - 1, s.lvl + 1); s.due = n.day + SRS_INT[s.lvl]; if (AWL_WORDS[id]) questEv(n, "awlword", 1); }
              else { s.lvl = Math.max(0, s.lvl - 2); s.due = n.day + 1; }
              n.srs[id] = s;
            });
            addRewardsP(n,  kept * 8, kept * 3, fx);
            questEv(n, "correct", kept);
            tl(n, "firstrev", "🧠", "أول جلسة مراجعة متباعدة", "المعلومة اللي تراجعها بموعدها… تسكن الذاكرة الطويلة وتنتظرك يوم الاختبار.");
            fx.toast(`🧠 ثبّت ${kept} • أعاد للغد ${records.length - kept}`);
          }

function applyFinishUnit(n, u, ph, opts = {}, fx = FX_NULL) {
            if (opts.bonusOnly) { addRewardsP(n,  opts.bonusOnly, 0, fx); return; }
            const review = !!n.acad.units[u.id];
            n.acad.units[u.id] = true;
            if (u.awl) questEv(n, "awlword", u.need || 5);
            n.srs ||= {};
            if (!n.srs[u.id] && u.drills) n.srs[u.id] = opts.tested ? { lvl: 2, due: n.day + SRS_INT[2] } : { lvl: 0, due: n.day + SRS_INT[0] };
            if (!review) {
              if (opts.tested) tl(n, "testout", "🔓", "تجاوزت مفهومًا باختبار الإتقان", "3/3 بلا خطأ — أثبتّ أن الأساس عندك، والخريطة فتحت الطريق.");
              const R = opts.tested ? [30, 15] : { F: [45, 20], S: [55, 25], Q: [70, 35] }[ph.id] || [50, 25];
              n.mem ||= {}; n.mem.study = (n.mem.study || 0) + 1;
              addRewardsP(n,  R[0], R[1], fx);
              questEv(n, "correct", 3);
              tl(n, "firstlesson", "📖", "أول درس في الأكاديمية", "جلست، تعلمت مفهومًا، وطبقته بيدك. هكذا تُبنى العقول — درسًا فوق درس.");
              fx.toast(`🎓 أتقنت: ${u.name} (+${R[0]} XP +${R[1]}🪙)`);
              if (phaseDone(n, ph.id)) { tl(n, "dip" + ph.id, ph.icon, `شهادة: ${ph.name.split(":")[1]}`, "مرحلة كاملة خلف ظهرك. المقتنيات 🎒 استقبلت شهادتك."); fx.play("win"); setTimeout(() => fx.toast(`${ph.icon} أكملت ${ph.name}!`), 700); }
            }
          }

function applySimDone(n, u, ph, res, fx = FX_NULL) {
            n.acad.units[u.id] = true;
            if (!n.acad.simBest || res.score > n.acad.simBest.score) n.acad.simBest = { score: res.score };
            res.log.forEach(({ sec, ok, t }) => {
              n.stats.answered++; if (ok) n.stats.correct++;
              n.stats.bySec[sec] ||= { a: 0, c: 0, t: 0, to: 0 };
              const v = n.stats.bySec[sec]; v.a++; if (ok) v.c++; v.t += t || 0;
            });
            addRewardsP(n,  60 + res.score, 45, fx);
            tl(n, "firstsim", "🎭", `أول محاكاة كاملة — درجة تقديرية ${res.score}`, "قاعة صامتة ومؤقت لا يرحم… وطلعت منها برقم وخريطة ضعف واضحة. هذا هو التدريب الحقيقي.");
            if (u.sim.hard && res.score >= 90) tl(n, "elite", "🏅", "قهرت تحدي الصفوة بدرجة 90+", "22 ثانية للسؤال ولم ترمش. قياس بعدها بتحسها بطيئة.");
            if (phaseDone(n, ph.id)) { tl(n, "dipP", ph.icon, `ختم الاحتراف`, "أنهيت آخر قاعة في الأكاديمية. من هنا وطالع… أنت المعلم."); fx.play("win"); }
            fx.toast(`🎭 درجتك التقديرية: ${res.score}`);
          }

function applyPickUni(n, u, fx = FX_NULL) { n.uni = u.name; n.done["3:choice"] = true; addRewardsP(n,  30, 20, fx); tl(n, "uni", "✉️", `القبول: ${u.name}`, "قرأت خطاب القبول ثلاث مرات عشان تتأكد إنه اسمك فعلًا."); }

function applySleep(n, ev) {
      ensurePeriods(n);
      n.history.push({ day: n.day, q: accOf(n, Q_SECS), v: accOf(n, V_SECS) });
      if (n.history.length > 40) n.history.shift();
      n.day += 1; n.slot = 0; n.energy = 100; n.dayFlags = {};
      ensurePeriods(n);
      if (ev) { ev.fx(n); n.dayFlags.morningEvent = ev.id; }
    }

function applySpendSlot(n, energyCost) {
  n.slot = Math.min(3, n.slot + 1);
  n.energy = Math.min(100, Math.max(0, n.energy - energyCost));
}

function applyBattleOutcome(n, res, fx = FX_NULL) {
  let tip = null;

      res.answered.forEach(({ sec, ok, t, to, wrong }) => {
        n.stats.answered++; if (ok) n.stats.correct++;
        n.stats.bySec[sec] ||= { a: 0, c: 0, t: 0, to: 0 };
        const v = n.stats.bySec[sec];
        v.a++; if (ok) v.c++; v.t = (v.t || 0) + (t || 0); if (to) v.to = (v.to || 0) + 1;
        if (wrong) addMistake(n, wrong, n.day);   // 📕 احفظ السؤال في دفتر الأخطاء
      });
      n.stats.bestCombo = Math.max(n.stats.bestCombo, res.bestCombo);
      n.lastBattle = { won: res.won, boss: res.isBoss };
      /* 🪞 ذاكرة السلوك */
      n.mem ||= { study: 0, work: 0, rest: 0, perfects: 0, lost: {}, comeback: {}, gatFirst: null, gatImproved: null, lastComeback: null };
      const bkey = `${res.chId}:${res.questId}`;
      const bname = res.isBoss ? CH.find(c => c.id === res.chId).boss.name : (CH.find(c => c.id === res.chId).quests.find(q => q.id === res.questId)?.name || "المعركة");
      if (String(res.questId).startsWith("side")) n.mem.work++; else n.mem.study++;
      if (!res.won) n.mem.lost[bkey] = (n.mem.lost[bkey] || 0) + 1;
      if (res.won && (n.mem.lost[bkey] || 0) > 0 && !n.mem.comeback[bkey]) {
        n.mem.comeback[bkey] = true; n.mem.lastComeback = bname;
        tl(n, "cb" + bkey, "🔁", `العودة الكبرى: هزمت "${bname}"`, `طرحك ${n.mem.lost[bkey]} ${n.mem.lost[bkey] === 1 ? "مرة" : "مرات"}… ثم رجعت وأنهيت القصة. الناس بدأت تلاحظ أنك لا تستسلم.`);
        fx.toast(`🔁 عودة الأبطال! الجميع سيتذكر هذا`);
      }
      if (res.won && res.acc === 1 && res.answered.length >= 3) {
        n.mem.perfects++;
        if (n.mem.perfects === 1) tl(n, "perf1", "💎", "أول معركة مثالية", "صفر أخطاء. حتى أنت ما صدقت الشاشة أول ثانية.");
      }
      n.coachN = (n.coachN || 0) + 1;
      const ins = coachInsight(n);
      if (ins && (ins.p >= 60 || n.coachN >= 3)) { tip = ins; n.coachN = 0; }
      ensurePeriods(n);
      questEv(n, "correct", res.answered.filter(x => x.ok).length);
      if (res.won) {
        questEv(n, "win");
        if (res.isBoss) questEv(n, "bosswin");
        if (String(res.questId).startsWith("side")) questEv(n, "work");
        if (res.acc === 1 && res.answered.length >= 3) questEv(n, "perfect");
        if (res.bestCombo >= 3) questEv(n, "combo3");
        n.season.pts += res.isBoss ? 25 : 10;
      }
      addRewardsP(n,  res.xpGained + (res.won ? res.xp : 0), res.won ? res.coins : 0, fx);
      if (res.won) {
        n.stats.battles++;
        grantP(n, "first", fx);
        if (res.bestCombo >= 5) grantP(n, "combo5", fx);
        n.done[`${res.chId}:${res.questId}`] = true;
        if (res.isGat) {
          const score = Math.min(100, Math.round(55 + res.acc * 45));
          if (n.mem.gatFirst === null) { n.mem.gatFirst = score; tl(n, "gat", "🎫", `ظهرت نتيجة القدرات: ${score}`, "أسبوعان من الانتظار… ثم رسالة قياس. يدك ارتجفت وأنت تفتحها."); }
          else if (score > (n.gatScore || 0) && !n.mem.gatImproved) { n.mem.gatImproved = { from: n.gatScore, to: score }; tl(n, "gatup", "📈", `أعدت القدرات: من ${n.gatScore} إلى ${score}`, "كان ممكن تكتفي… لكنك رجعت للقاعة نفسها وطلعت برقم أعلى."); }
          n.gatScore = Math.max(n.gatScore || 0, score);
          if (n.gatScore >= 90) grantP(n, "gat90", fx);
          fx.toast(`📜 درجة القدرات: ${n.gatScore}`);
        }
        if (res.chId === 5 && res.questId === "q2") tl(n, "proj", "🧪", "أول مشروع جامعي ينجح", "فريقك تأخر والتسليم كان غدًا… وأنت اللي أنقذ الموقف بالأرقام.");
        if (res.isBoss) {
          fx.play("door");
          if (!Object.keys(n.done).some(k => k.endsWith(":boss") && k !== `${res.chId}:boss`)) tl(n, "firstboss", "⚔️", `أول زعيم يسقط: ${bname}`, "أول مرة تشوف شريط صحة زعيم يوصل صفر بيدك. ما ينتسى هذا الشعور.");
          tl(n, "boss" + res.chId, CH.find(c => c.id === res.chId).emoji, `أنهيت ${CH.find(c => c.id === res.chId).title}`);
          if (res.chId === 1) grantP(n, "ch1", fx);
          if (res.chId >= n.chapter && res.chId < 7) {
            n.chapter = res.chId + 1;
            if (n.chapter === 4) { grantP(n, "usa", fx); tl(n, "usa1", "🗽", "أول يوم في أمريكا", "برد ما تعرفه، لغة حولك من كل جهة، وسرير غريب… وحماس يمنعك من النوم."); }
          }
          if (res.chId === 6) grantP(n, "grad", fx);
          if (res.isFinal) {
            n.finalAcc = Math.round(res.acc * 100);
            const gs = n.gatScore || 0;
            n.ending = gs >= 90 && n.finalAcc >= 70 ? "legend" : (gs >= 80 || n.finalAcc >= 60) ? "good" : "open";
            if (n.ending === "legend") grantP(n, "aramco", fx);
            tl(n, "ending", n.ending === "legend" ? "👑" : "🌅", n.ending === "legend" ? "يوم التوظيف: مهندس في أرامكو" : "أنهيت الرحلة الأولى", n.ending === "legend" ? `اتصال من الظهران: "مبروك يا مهندس ${n.name}". أول شخص اتصلت عليه؟ أبوك. ${n.mem.work >= 4 ? "ومن ورديات الكشك إلى برج أرامكو… يا لها من قصة." : ""}` : "الرحلة ما انتهت… هذي استراحة محارب قبل الجولة الأخيرة.");
          }
        }
      }
    
  return tip;
}

export default function AppRoot() { return <Guard><App /></Guard>; }

function App() {
  const [g, setG] = useState(newSave());
  const [view, setView] = useState({ s: "title" });
  const [panel, setPanel] = useState(null);
  const [trans, setTrans] = useState(null);       // بطاقة سينمائية
  const [coach, setCoach] = useState(null);       // 🦉 المدرب الذكي
  const [toasts, setToasts] = useState([]);
  const [musicMode, setMusicMode] = useState("off");
  const [sound, setSound] = useState(true);
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        let r = await store.get(SAVE_KEY);
        if (!r?.value) r = await store.get("qq-save");   // ترحيل حفظات ما قبل Arise
        if (r?.value) setG({ ...newSave(), ...JSON.parse(r.value) });
      } catch (e) {}
      setG(prev => { const n = JSON.parse(JSON.stringify(prev)); ensurePeriods(n); return n; });
      loaded.current = true;
    })();
    return () => stopMusic();
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    (async () => { try { await store.set(SAVE_KEY, JSON.stringify(g)); } catch (e) {} })();
  }, [g]);
  useEffect(() => { soundOn = sound; }, [sound]);
  useEffect(() => { if (musicMode !== "off") startMusic(musicMode); else stopMusic(); }, [musicMode]);

  const toast = (msg) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800);
  };
  const mut = (fn) => setG(prev => { const n = JSON.parse(JSON.stringify(prev)); fn(n); return n; });

  /* 💾 نسخة احتياطية: تصدير/استيراد كل التقدّم (التخزين محلي فقط) */
  const doExport = () => {
    try {
      const data = JSON.stringify(g);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `arise-backup-${(g.name || "لاعب")}-يوم${g.day}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (navigator.clipboard) navigator.clipboard.writeText(data).catch(() => {});
      toast("💾 تم حفظ نسختك — احتفظ بالملف في مكان آمن");
    } catch (e) { toast("تعذّر التصدير"); }
  };
  const doImport = (text) => {
    try {
      const obj = JSON.parse(text);
      if (!obj || typeof obj !== "object" || obj.v == null || !obj.stats) { toast("⚠️ الرمز غير صالح"); return false; }
      setG({ ...newSave(), ...obj });
      setPanel(null);
      toast("✅ تم استعادة تقدّمك بنجاح");
      return true;
    } catch (e) { toast("⚠️ تعذّرت الاستعادة — تأكد من الرمز/الملف"); return false; }
  };

  const FX = { toast, play, later: (f) => setTimeout(f, 600) };
  const grant = (n, id) => grantP(n, id, FX);
  const addRewards = (n, xp, coins) => addRewardsP(n, xp, coins, FX);

  const spSpent = g.skills.reduce((a, id) => a + (SKILLS.find(s => s.id === id)?.cost || 0), 0);
  const spFree = Math.max(0, lvlOf(g.xp) - 1 - spSpent);
  const night = g.slot >= 3;

  /* ---- الوقت والطاقة ---- */
  const spendSlot = (energyCost) => mut(n => applySpendSlot(n, energyCost));

  const doSleep = () => {
    play("door");
    const ev = Math.random() < 0.75 ? EVENTS[Math.floor(Math.random() * EVENTS.length)] : null;
    setTrans({ e: "🌙", t: `نهاية اليوم ${g.day}`, sub: "…تغفو والأحلام مليانة معادلات وكلمات إنجليزية…", bg: "#0B1020", ms: 2000 });
    mut(n => applySleep(n, ev));
    setTimeout(() => {
      if (ev) setTrans({ e: ev.e, t: ev.t, sub: `${ev.d}  (${ev.tag})`, bg: "#14263B", ms: 2600 });
    }, 2050);
    setTimeout(() => {
      setG(cur => { const dn = dueList(cur).length; if (dn > 0) toast(`🧠 خطة اليوم: ${dn} ${dn === 1 ? "مراجعة" : "مراجعات"} بانتظارك بالأكاديمية`); return cur; });
    }, ev ? 4800 : 2200);
  };

  /* ---- نهاية معركة (نفس منطق v1 كاملًا) ---- */
  const onBattleEnd = (res) => {
    const n = JSON.parse(JSON.stringify(g));
    const tip = applyBattleOutcome(n, res, FX);
    setG(n);
    if (tip) setTimeout(() => setCoach(tip), 900);
    if (res.won && res.isFinal) { setView({ s: "ending" }); return; }
    // زعيم مهزوم → مشهد ختام الفصل + بطاقة الفصل الجديد
    const ch = CH.find(c => c.id === res.chId);
    if (res.won && res.isBoss && !g.seen[`out${res.chId}`] && ch.outro.length) {
      mut(n => { n.seen[`out${res.chId}`] = true; });
      setView({ s: "dialog", lines: ch.outro, after: { s: "chapterCard", id: res.chId + 1 } });
    } else if (res.won && res.isBoss && res.chId < 7) {
      setView({ s: "chapterCard", id: res.chId + 1 });
    } else setView({ s: "world" });
  };

  useEffect(() => {
    if (view.s === "world" && g.started && !g.seen.hello) {
      mut(n => { n.seen.hello = true; });
      const nm = g.name;
      setTimeout(() => setCoach({ e: "🧭", h: `أهلًا ${nm}! هذي بوصلتك`, d: "قبل أي معركة: 📚 الأكاديمية تعلّمك كل شي من الصفر — حتى جدول الضرب — على أربع مراحل حتى الاحتراف. الشريط الذهبي فوق يوجهك دائمًا 📍، والمعارك تطبيقك العملي. تعبت؟ نم، وكل صباح يجيب جديدًا." }), 1100);
    }
    if (view.s === "chapterCard") {
      const ch = CH.find(c => c.id === view.id);
      if (ch) setTrans({ e: ch.emoji, t: ch.title, sub: `📍 ${ch.place}`, bg: ch.usa ? "#101B30" : "#0E2B25", ms: 2300 });
      const t = setTimeout(() => {
        if (ch && !g.seen[`in${ch.id}`]) {
          mut(n => { n.seen[`in${ch.id}`] = true; });
          setView({ s: "dialog", lines: ch.intro, after: { s: "world" } });
        } else setView({ s: "world" });
      }, 2350);
      return () => clearTimeout(t);
    }
  }, [view.s]);

  const startBattle = (q) => {
    if (q.isBoss) { play("boss"); setView({ s: "prep", q }); return; }
    launchBattle(q);
  };
  const launchBattle = (q) => {
    play("click");
    spendSlot(q.side ? 20 : 15);
    const count = q.enemy.hp + 4;
    setView({
      s: "battle", chId: q.chId, questId: q.qid, isBoss: !!q.isBoss,
      usa: eraOf(g.chapter) === "us",
      enemy: { ...q.enemy, name: q.name, icon: q.icon },
      qs: buildChallenges(q.enemy.secs, count, g, !!q.isBoss),
      key: Date.now(),
    });
  };

  const doAct = (act, loc) => {
    if (act === "sleep") { doSleep(); setView({ s: "world" }); return; }
    if (act === "rest") { mut(n => { n.mem ||= {}; n.mem.rest = (n.mem.rest || 0) + 1; }); spendSlot(-40); play("coin"); toast("🛋️ ارتحت… +40 طاقة"); return; }
    if (act === "call") { mut(n => { n.dayFlags.called = true; n.energy = Math.min(100, n.energy + 15); }); play("coin"); toast("📞 «الله يوفقك يا وليدي» — +15 طاقة"); return; }
    if (act === "daily") { mut(n => applyDailyChest(n, FX)); return; }
    if (act === "academy") { play("door"); setView({ s: "acad" }); return; }
    if (act === "choice") { setView({ s: "choice" }); return; }
    if (act === "retake") {
      const b = CH.find(c => c.id === 2).boss;
      startBattle({ chId: 2, qid: "boss", isBoss: false, name: b.name, icon: b.icon, enemy: { hp: b.hp, secs: b.secs, time: b.time, xp: b.xp, coins: b.coins, isGat: true } });
    }
  };

  const claimTask = (scope, id) => mut(n => applyClaimTask(n, scope, id, FX));
  const claimSeason = (idx) => mut(n => applyClaimSeason(n, idx, FX));

  const usaNow = eraOf(g.chapter) === "us" && view.s !== "title";
  const theme = usaNow ? { bg: "#0B1626", head: "#122B4A", card: "#16233A", text: "#EAF0F8", sub: "#9FB2CC", line: "#24354F" }
                       : { bg: "#F4F6F3", head: "#0F5147", card: "#FFFFFF", text: "#17251F", sub: "#5A6A62", line: "#E2E8E1" };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: "'Segoe UI', Tahoma, system-ui, sans-serif", transition: "background .6s ease" }}>
      <style>{`
        *{box-sizing:border-box;margin:0}
        html,body{background:${theme.bg};overscroll-behavior-y:contain}
        .card{box-shadow:0 1px 2px rgba(15,30,25,.05),0 5px 16px rgba(15,30,25,.06);background:${theme.card};border:1px solid ${theme.line};border-radius:16px;padding:14px;margin-bottom:10px;transition:background .5s ease}
        .btn{border:none;box-shadow:0 3px 10px rgba(15,81,71,.28);background:linear-gradient(180deg,#146455,#0F5147);color:#fff;padding:12px 20px;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit}
        .btn.gold{background:linear-gradient(180deg,#D9A344,#C08A2C);box-shadow:0 3px 10px rgba(200,146,53,.3)}.btn.dark{background:#17251F}.btn.ghost{background:transparent;color:${theme.text};border:1.5px solid ${theme.line}}
        .opt{display:block;width:100%;text-align:left;direction:ltr;border:1.5px solid ${theme.line};background:${usaNow ? "#1B2B45" : "#FAFBFA"};color:${theme.text};border-radius:12px;padding:12px 14px;margin-bottom:8px;font-size:15px;cursor:pointer;font-family:inherit}
        .opt:disabled{opacity:.35}
        .hudbtn{border:none;background:rgba(255,255,255,.15);color:#fff;border-radius:12px;padding:8px 10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
        @keyframes pop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(4px)}}
        @keyframes floatUp{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-52px)}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        @keyframes drop{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}
        @keyframes fadein{from{opacity:0}to{opacity:1}}
        @keyframes walkbob{from{transform:translateY(0)}to{transform:translateY(-4px)}}
        .toast{background:#17251F;color:#F0C560;padding:11px 18px;border-radius:13px;font-weight:800;font-size:14px;animation:pop .3s ease;box-shadow:0 6px 22px rgba(0,0,0,.3);margin-bottom:8px}
        button:focus-visible{outline:3px solid #C89235;outline-offset:2px}
        button:active{transform:scale(.98)}
        .tpulse{animation:pulse .5s infinite;display:inline-block}
        @keyframes confetti{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(-90px) rotate(260deg);opacity:0}}
        @keyframes sheen{0%{background-position:-80px 0}100%{background-position:160px 0}}
        .goldbar{background-image:linear-gradient(90deg,#F0C560,#C89235),linear-gradient(100deg,transparent 30%,rgba(255,255,255,.55) 50%,transparent 70%)!important;background-size:100% 100%,60px 100%;background-repeat:no-repeat,no-repeat;animation:sheen 2.6s ease-in-out infinite}
      `}</style>

      <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 210, width: "min(92vw,420px)" }}>
        {toasts.map(t => <div className="toast" key={t.id}>{t.msg}</div>)}
      </div>

      {trans && <Transition card={trans} onDone={() => setTrans(null)} />}
      {coach && <Coach tip={coach} close={() => setCoach(null)} />}

      {view.s !== "title" && <HUD g={g} spFree={spFree} setPanel={setPanel} sound={sound} setSound={setSound}
        musicMode={musicMode} setMusicMode={setMusicMode}
        mode={g.mode} setMode={(m) => { mut(n => { n.mode = m; }); toast(m === "calm" ? "🧘 وضع هادئ: بدون مؤقت (إلا الزعماء)" : "⚡ وضع التحدي: مؤقت + بونص سرعة"); }} />}

      <div style={{ padding: "10px 14px 40px", maxWidth: 620, margin: "0 auto" }}>
        {view.s === "title" && <Title g={g} setG={setG} onStart={(name) => {
          mut(n => { n.started = true; n.name = name || n.name; ensurePeriods(n); tl(n, "start", "🎒", "بدأت الرحلة — سنة التخرج"); });
          play("win");
          setView({ s: "chapterCard", id: 1 });
        }} onContinue={() => { play("click"); setView({ s: "world" }); }} />}

        {view.s === "world" && <World g={g} theme={theme} night={night} startBattle={startBattle} doAct={doAct}
          onTalkEv={() => mut(n => questEv(n, "talk"))}
          onReview={() => { play("click"); setView({ s: "acad", review: true }); }}
          claimTask={claimTask} claimSeason={claimSeason} toast={toast} />}

        {view.s === "chapterCard" && <div style={{ minHeight: 200 }} />}

        {view.s === "prep" && <BossPrep g={g} theme={theme} q={view.q} onBegin={() => launchBattle(view.q)} onBack={() => { play("click"); setView({ s: "world" }); }} />}

        {view.s === "dialog" && <Dialog lines={view.lines} theme={theme} onDone={() => setView(view.after)} />}

        {view.s === "acad" && <Academy g={g} theme={theme} startReview={view.review}
          onOpenUnit={(u) => mut(n => { n.acad.opened ||= {}; n.acad.opened[u.id] = true; })}
          onReview={(records) => mut(n => applyReview(n, records, FX))}
          onExit={() => { play("click"); setView({ s: "world" }); }}
          onPlace={(rec) => mut(n => { n.acad.placed = rec; tl(n, "acadstart", "📚", "التحقت بالأكاديمية", rec === 0 ? "قررت تبني نفسك من الطابوقة الأولى. القرارات الكبيرة تبدأ هكذا." : `التشخيص وضعك في ${ACADEMY[rec].name.split(":")[1]} — أساسك موجود، نبني فوقه.`); })}
          onFinishUnit={(u, ph, opts = {}) => mut(n => applyFinishUnit(n, u, ph, opts, FX))}
          onSimDone={(u, ph, res) => mut(n => applySimDone(n, u, ph, res, FX))} />}

        {view.s === "choice" && <UniChoice g={g} theme={theme} onPick={(u) => {
          mut(n => applyPickUni(n, u, FX));
          play("win"); toast(`🎓 انقبلت في ${u.name}`);
          setView({ s: "world" });
        }} onRetake={() => doAct("retake")} back={() => setView({ s: "world" })} />}

        {view.s === "battle" && <Battle key={view.key} view={view} g={g} theme={theme} spendItem={(id) => mut(n => { n.items[id]--; })} onEnd={onBattleEnd} />}

        {view.s === "ending" && <Ending g={g} theme={theme} onReplay={() => {
          mut(n => { n.done["7:boss"] = false; n.ending = null; });
          setView({ s: "world" });
        }} onFree={() => setView({ s: "world" })} />}
      </div>

      {panel === "road" && <RoadPanel g={g} theme={theme} close={() => setPanel(null)} goAcad={() => setView({ s: "acad" })} />}
      {panel === "journal" && <Journal g={g} theme={theme} close={() => setPanel(null)}
        clearMistake={(id) => mut(n => { n.mistakes = (n.mistakes || []).filter(m => m.id !== id); })} />}
      {panel === "mock" && <MockExam g={g} theme={theme} close={() => setPanel(null)}
        onDone={(res) => mut(n => applyMockDone(n, res, FX))} />}
      {panel && panel !== "journal" && panel !== "mock" && <Panel g={g} theme={theme} panel={panel} spFree={spFree} close={() => setPanel(null)}
        buySkill={(sk) => mut(n => { n.skills.push(sk.id); if (n.skills.length >= 3) grant(n, "skills3"); })}
        buyItem={(it) => mut(n => { n.coins -= (n.dayFlags?.sale ? Math.ceil(it.price / 2) : it.price); n.items[it.id]++; })}
        buyAvatar={(av) => mut(n => { n.coins -= av.price; n.owned.push(av.id); n.avatar = av.id; })}
        wearAvatar={(av) => mut(n => { n.avatar = av.id; })} toast={toast}
        onExport={doExport} onImport={doImport} onOpenMock={() => setPanel("mock")}
        onSetDate={(v) => mut(n => { n.examDate = v || null; })} />}
    </div>
  );
}

/* ---------- العالم: شارع + داخل مبنى ---------- */
function World({ g, theme, night, startBattle, doAct, onTalkEv, claimTask, claimSeason, onReview, toast }) {
  const [inside, setInside] = useState(null);
  const [pos, setPos] = useState(0);
  const [talk, setTalk] = useState(null);
  const canAct = !night;
  const era = eraOf(g.chapter);
  useEffect(() => { setInside(null); setPos(0); setTalk(null); }, [g.chapter]);
  if (talk) return <Dialog lines={talk} theme={theme} onDone={() => setTalk(null)} />;
  return (
    <div>
      {!inside && <GoalTasks g={g} theme={theme} claimTask={claimTask} claimSeason={claimSeason} onReview={onReview} />}
      {!inside && <Street g={g} theme={theme} night={night} pos={pos} setPos={setPos} onEnter={(loc) => setInside(loc)} />}
      {!inside && night && (
        <div className="card" style={{ textAlign: "center", fontWeight: 800, fontSize: 13.5 }}>
          🌙 استهلكت يومك كله. ادخل {era === "us" ? "السكن" : "البيت"} ونَم لتبدأ اليوم {g.day + 1}.
        </div>
      )}
      {inside && <Interior g={g} theme={theme} loc={inside} night={night} canAct={canAct}
        onQuest={(q) => { if (!canAct) { toast("🌙 الوقت متأخر — نم أولًا"); return; } startBattle(q); }}
        onAct={(a) => doAct(a, inside)} onTalk={(lines) => { onTalkEv(); setTalk(lines); }} close={() => { play("click"); setInside(null); }} />}
    </div>
  );
}

/* ---------- HUD v2: لاعب + يوم + طاقة ---------- */
function HUD({ g, spFree, setPanel, sound, setSound, musicMode, setMusicMode, mode, setMode }) {
  const lvl = lvlOf(g.xp);
  const cur = g.xp - xpForLvl(lvl), need = xpForLvl(lvl + 1) - xpForLvl(lvl);
  const t = titleOf(g.xp);
  const av = AVATARS.find(a => a.id === g.avatar);
  const usa = eraOf(g.chapter) === "us";
  const head = usa ? "#122B4A" : "#0F5147";
  return (
    <div style={{ background: head, color: "#fff", padding: "calc(env(safe-area-inset-top, 0px) + 12px) 14px 10px", borderRadius: "0 0 20px 20px", transition: "background .6s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 32 }}>{av.e}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 14.5 }}>{g.name} <span style={{ fontSize: 11.5, opacity: .85 }}>• {t.icon} {t.name} • Lv.{lvl}</span></div>
          <div style={{ background: "rgba(255,255,255,.18)", borderRadius: 99, height: 7, overflow: "hidden", marginTop: 4 }}>
            <div className="goldbar" style={{ width: `${Math.min(100, (cur / need) * 100)}%`, height: "100%", transition: "width .5s" }} />
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: "#F0C560" }}><Ico n="coin" s={15} /> {g.coins}</div>
          {g.streak > 0 && <div style={{ fontSize: 11, fontWeight: 800 }}><Ico n="bolt2" s={12} /> {g.streak}ي</div>}
        </div>
      </div>
      {/* شريط اليوم والطاقة */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, fontWeight: 800 }}>
        <span style={{ background: "rgba(255,255,255,.15)", borderRadius: 8, padding: "2px 8px" }}>📅 اليوم {g.day}</span>
        <span style={{ background: "rgba(255,255,255,.15)", borderRadius: 8, padding: "2px 8px" }}>{g.slot >= 3 ? "🌙 ليل" : SLOTS[g.slot]}</span>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5 }}>
          <Ico n="battery" s={16} c="#fff" />
          <div style={{ flex: 1, background: "rgba(255,255,255,.18)", borderRadius: 99, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${g.energy}%`, height: "100%", background: g.energy < 30 ? "#E85D4A" : g.energy < 60 ? "#F0C560" : "#7FD8A4", transition: "width .5s", borderRadius: 99 }} />
          </div>
          <span style={{ minWidth: 30 }}>{g.energy}%</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 9, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <button className="hudbtn" style={{ position: "relative" }} onClick={() => setPanel("skills")}>🌳{spFree > 0 && <span style={{ position: "absolute", top: -4, left: -4, background: "#B3402F", borderRadius: 99, fontSize: 10, padding: "1px 6px", fontWeight: 900 }}>{spFree}</span>}</button>
        <button className="hudbtn" onClick={() => setPanel("shop")}>🛒</button>
        <button className="hudbtn" style={{ fontWeight: 900 }} onClick={() => setPanel("road")}>🏢</button>
        <button className="hudbtn" onClick={() => setPanel("journal")}>📔</button>
        <button className="hudbtn" onClick={() => setPanel("ach")}>🏅</button>
        <button className="hudbtn" onClick={() => setPanel("stats")}>📊</button>
        <button className="hudbtn" onClick={() => setMode(mode === "calm" ? "hard" : "calm")}>{mode === "calm" ? "🧘" : "⚡"}</button>
        <button className="hudbtn" onClick={() => setSound(!sound)}>{sound ? "🔊" : "🔇"}</button>
        <button className="hudbtn" onClick={() => setMusicMode(musicMode === "off" ? "dream" : musicMode === "dream" ? "glow" : "off")}>{musicMode === "off" ? "🎶✖️" : musicMode === "dream" ? "🌙" : "🌈"}</button>
      </div>
    </div>
  );
}

function Title({ g, setG, onStart, onContinue }) {
  const [name, setName] = useState(g.name || "ضاوي");
  const [confirmNew, setConfirmNew] = useState(false);
  return (
    <div style={{ textAlign: "center", paddingTop: 40, animation: "pop .5s ease" }}>
      <div style={{ color: "#0F5147" }}><AriseLogo size={96} /></div>
      <h1 dir="ltr" style={{ fontSize: 34, fontWeight: 900, color: "#17251F", margin: "4px 0 2px", letterSpacing: 6 }}>ARISE</h1>
      <div style={{ fontSize: 15.5, color: "#5A6A62", fontWeight: 700 }}>من الصفر… إلى أرامكو 🛢️</div>
      <div style={{ fontSize: 13, color: "#8A968E", margin: "10px 0 26px", lineHeight: 1.8 }}>عالم حر • أيام تعيشها • شخصيات تتذكرك — وسلاحك عقلك</div>
      {g.started && !confirmNew && (
        <button className="btn gold" style={{ width: "80%", padding: 15, fontSize: 17, marginBottom: 12 }} onClick={onContinue}>▶️ متابعة — اليوم {g.day}</button>
      )}
      {!confirmNew ? (
        <button className={g.started ? "btn ghost" : "btn"} style={{ width: "80%", padding: g.started ? 12 : 15, fontSize: g.started ? 14 : 17 }}
          onClick={() => (g.started ? setConfirmNew(true) : onStart(name))}>🆕 قصة جديدة</button>
      ) : (
        <div className="card" style={{ width: "88%", margin: "0 auto" }}>
          <div style={{ fontSize: 14, marginBottom: 10, fontWeight: 700 }}>بداية جديدة تمسح تقدمك الحالي كاملًا. متأكد؟</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="btn dark" onClick={() => { setG({ ...newSave(), started: false }); setConfirmNew(false); }}>نعم، امسح</button>
            <button className="btn ghost" onClick={() => setConfirmNew(false)}>تراجع</button>
          </div>
        </div>
      )}
      {!g.started && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#5A6A62", marginBottom: 6 }}>اسم البطل:</div>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={14}
            style={{ padding: "10px 14px", borderRadius: 12, border: "1.5px solid #D6DED6", fontSize: 15, fontFamily: "inherit", textAlign: "center", width: 200 }} />
        </div>
      )}
    </div>
  );
}
function Dialog({ lines, theme, onDone }) {
  const [li, setLi] = useState(0);
  const [chars, setChars] = useState(0);
  const line = lines[li];
  const full = line.t;
  useEffect(() => {
    setChars(0);
    const t = setInterval(() => setChars(c => {
      if (c >= full.length) { clearInterval(t); return c; }
      return c + 1;
    }), 17);
    return () => clearInterval(t);
  }, [li]);
  const tap = () => {
    play("click");
    if (chars < full.length) setChars(full.length);
    else if (li + 1 < lines.length) setLi(li + 1);
    else onDone();
  };
  return (
    <div onClick={tap} style={{ cursor: "pointer", paddingTop: 30, animation: "drop .3s ease" }}>
      <div style={{ textAlign: "center", fontSize: 76, marginBottom: 14, animation: "pulse 3s infinite" }}>{line.e}</div>
      <div className="card" style={{ padding: 18, minHeight: 130 }}>
        <div style={{ fontWeight: 900, fontSize: 14, color: "#C89235", marginBottom: 8 }}>{line.who}</div>
        <div style={{ fontSize: 16, lineHeight: 2 }}>{full.slice(0, chars)}<span style={{ opacity: .5 }}>▌</span></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, padding: "0 4px" }}>
        <span style={{ fontSize: 12.5, color: theme.sub }}>اضغط للمتابعة • {li + 1}/{lines.length} {chars >= full.length && <span className="tpulse">▼</span>}</span>
        <button onClick={(e) => { e.stopPropagation(); play("click"); onDone(); }} style={{ background: "none", border: "none", color: theme.sub, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>تخطي ⏭</button>
      </div>
    </div>
  );
}

function UniChoice({ g, theme, onPick, onRetake, back }) {
  const score = g.gatScore || 0;
  return (
    <div style={{ animation: "drop .35s ease" }}>
      <button onClick={back} style={{ background: "none", border: "none", color: theme.text, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: 8, opacity: .8 }}>→ رجوع</button>
      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 34 }}>🗝️</div>
        <div style={{ fontWeight: 900, fontSize: 16, margin: "4px 0" }}>درجتك: <span style={{ color: "#C89235" }}>{score}</span></div>
        <div style={{ fontSize: 13, color: theme.sub }}>كل باب له مفتاح. الأبواب المقفلة تحتاج درجة أعلى.</div>
      </div>
      {UNIS.map(u => {
        const open = score >= u.need;
        return (
          <button key={u.name} className="card" disabled={!open} onClick={() => open && onPick(u)}
            style={{ width: "100%", textAlign: "right", fontFamily: "inherit", cursor: open ? "pointer" : "not-allowed", opacity: open ? 1 : .5, display: "flex", gap: 12, alignItems: "center", color: theme.text, border: open ? "1.5px solid #1F7A5C55" : `1px solid ${theme.line}` }}>
            <div style={{ fontSize: 28 }}>{open ? u.e : "🔒"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 14.5 }}>{u.name}</div>
              <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>{u.need > 0 ? `يتطلب ${u.need}+` : "قبول مفتوح"}</div>
            </div>
            {open && <div style={{ fontWeight: 900, color: "#1F7A5C", fontSize: 13 }}>ادخل ←</div>}
          </button>
        );
      })}
      {score < 90 && (
        <button className="btn dark" style={{ width: "100%", padding: 13, marginTop: 4 }} onClick={onRetake}>🔁 أعد اختبار القدرات وارفع درجتك</button>
      )}
    </div>
  );
}

/* ═══════════════ ⚔️ BATTLE ENGINE — أربعة أنماط لعب ═══════════════ */

const QUANT_SECS = ["arithmetic", "algebra", "geometry", "comparison", "data"];

function Battle({ view, g, theme, spendItem, onEnd }) {
  const { enemy, qs, chId, questId, isBoss } = view;
  const calm = g.mode === "calm" && !isBoss;      // 🧘 بدون مؤقت خارج الزعماء
  const maxHearts = g.skills.includes("heart4") ? 4 : 3;
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState(null);      // mcq: index | -1 مهلة | "done"
  const [numVal, setNumVal] = useState("");
  const [matchSel, setMatchSel] = useState(null);  // كلمة إنجليزية مختارة
  const [matchDone, setMatchDone] = useState([]);  // أزواج مكتملة
  const [matchWrong, setMatchWrong] = useState(0);
  const [matchShuf] = useState(() => qs.map(c => c.kind === "match" ? [...c.pairs.map(p => p[1])].sort(() => Math.random() - 0.5) : null));
  const [orderProg, setOrderProg] = useState([]);
  const [orderFails, setOrderFails] = useState(0);
  const [orderShuf] = useState(() => qs.map(c => c.kind === "order" ? [...c.steps].sort(() => Math.random() - 0.5) : null));
  const [removed, setRemoved] = useState([]);
  const [frozen, setFrozen] = useState(false);
  const [freeHint, setFreeHint] = useState(g.skills.includes("vhint"));
  const [enemyHp, setEnemyHp] = useState(enemy.hp);
  const tired = (g.energy ?? 100) < 30;
  const [hearts, setHearts] = useState(Math.max(2, maxHearts - (tired ? 1 : 0)));
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xpGained, setXpGained] = useState(0);
  const [log, setLog] = useState([]);
  const [over, setOver] = useState(null);
  const [fx, setFx] = useState({});
  const q = qs[qi % qs.length];
  const isQuant = QUANT_SECS.includes(q.sec);
  const baseTime = q.kind === "match" || q.kind === "order" ? 60 : enemy.time;
  const TIME = baseTime + (isQuant && g.skills.includes("qtime") ? 8 : 0) + (!isQuant && g.skills.includes("vtime") ? 8 : 0);
  const [timeLeft, setTimeLeft] = useState(TIME);
  const [teach, setTeach] = useState(false);
  const qStart = useRef(Date.now());
  const took = () => Math.min(90, Math.max(1, Math.round((Date.now() - qStart.current) / 1000)));

  useEffect(() => { setTimeLeft(TIME); qStart.current = Date.now(); }, [qi]);

  useEffect(() => {
    if (calm || picked !== null || over || frozen) return;
    const t = setInterval(() => setTimeLeft(x => x - 1), 1000);
    return () => clearInterval(t);
  }, [picked, over, qi, frozen, calm]);

  useEffect(() => {
    if (!calm && timeLeft <= 0 && picked === null && !over && !frozen) miss(-1);
  }, [timeLeft]);

  const critAt = isQuant && g.skills.includes("qcrit") ? 2 : 3;

  const endBattle = (won, finalLog, finalXp, finalBest) => {
    const correct = finalLog.filter(x => x.ok).length;
    const acc = finalLog.length ? correct / finalLog.length : 0;
    setOver(won ? "win" : "lose");
    play(won ? "win" : "wrong");
    setFx(f => ({ ...f, result: { won, chId, questId, isBoss, isGat: !!enemy.isGat, isFinal: !!enemy.isFinal, acc, xpGained: finalXp, coins: enemy.coins, xp: enemy.xp, bestCombo: finalBest, answered: finalLog } }));
  };

  const dealDamage = (dmg, gain, crit, newLog, newCombo) => {
    const newXp = xpGained + gain;
    const newBest = Math.max(bestCombo, newCombo);
    setBestCombo(newBest); setXpGained(newXp);
    play(crit ? "crit" : "correct");
    setFx({ hitEnemy: true, dmgText: crit ? `💥 −${dmg} حاسمة!` : `−${dmg}`, xpText: `+${gain}` });
    setTimeout(() => setFx(f => ({ ...f, hitEnemy: false })), 450);
    const newHp = Math.max(0, enemyHp - dmg);
    setEnemyHp(newHp);
    if (newHp <= 0) { setTimeout(() => endBattle(true, newLog, newXp, newBest), 900); return true; }
    return false;
  };

  const takeHit = (newLog) => {
    setCombo(0);
    play("heart");
    setFx({ hitMe: true });
    setTimeout(() => setFx(f => ({ ...f, hitMe: false })), 450);
    const h = hearts - 1;
    setHearts(h);
    if (h <= 0) setTimeout(() => endBattle(false, newLog, xpGained, bestCombo), 1100);
    return h;
  };

  /* --- MCQ --- */
  const hit = (idx) => {
    if (picked !== null || over) return;
    setPicked(idx);
    const ok = idx === q.a;
    const newLog = [...log, { sec: q.sec, ok, t: took(), ...(ok ? {} : { wrong: mistakeRec(q, idx, "mcq") }) }];
    setLog(newLog);
    if (ok) {
      const newCombo = combo + 1;
      setCombo(newCombo);
      const crit = newCombo >= critAt;
      const fast = !calm && timeLeft > TIME * 0.6;
      dealDamage(crit ? 2 : 1, 10 * Math.min(newCombo, 4) + (fast ? 5 : 0) + (crit ? 5 : 0), crit, newLog, newCombo);
    } else takeHit(newLog);
  };

  const miss = (idx) => {
    setPicked(-1);
    const newLog = [...log, { sec: q.sec, ok: false, t: TIME, to: true, ...((q.kind === "mcq" || q.kind === "num") ? { wrong: mistakeRec(q, -1, q.kind) } : {}) }];
    setLog(newLog);
    takeHit(newLog);
  };

  /* --- NUM (لوحة أرقام) --- */
  const numSubmit = () => {
    if (picked !== null || numVal === "") return;
    const ok = parseInt(numVal, 10) === q.a;
    setPicked(ok ? "done" : "wrongnum");
    const newLog = [...log, { sec: q.sec, ok, t: took(), ...(ok ? {} : { wrong: mistakeRec(q, numVal, "num") }) }];
    setLog(newLog);
    if (ok) {
      const newCombo = combo + 1;
      setCombo(newCombo);
      const crit = newCombo >= critAt;
      dealDamage(crit ? 2 : 1, 12 * Math.min(newCombo, 4) + (crit ? 5 : 0), crit, newLog, newCombo);
    } else takeHit(newLog);
  };

  /* --- MATCH (توصيل كلمات) --- */
  const tapEn = (w) => { if (!matchDone.some(d => d[0] === w)) { setMatchSel(w); play("click"); } };
  const tapAr = (m) => {
    if (!matchSel || matchDone.some(d => d[1] === m)) return;
    const pair = q.pairs.find(p => p[0] === matchSel);
    const newLog = [...log, { sec: "vocab", ok: pair[1] === m, t: took() }];
    setLog(newLog);
    if (pair[1] === m) {
      const nd = [...matchDone, [matchSel, m]];
      setMatchDone(nd); setMatchSel(null);
      const newCombo = combo + 1; setCombo(newCombo);
      const dead = dealDamage(1, 8, false, newLog, newCombo);
      if (!dead && nd.length === q.pairs.length) setPicked("done");
    } else {
      setMatchSel(null);
      const mw = matchWrong + 1; setMatchWrong(mw);
      setFx({ hitMe: true }); play("wrong"); setCombo(0);
      setTimeout(() => setFx(f => ({ ...f, hitMe: false })), 400);
      if (mw >= 3) { setMatchWrong(0); takeHit(newLog); }
    }
  };

  /* --- ORDER (رتّب الحل) --- */
  const tapStep = (s) => {
    if (picked !== null || orderProg.includes(s)) return;
    if (q.steps[orderProg.length] === s) {
      const np = [...orderProg, s];
      setOrderProg(np); play("click");
      if (np.length === q.steps.length) {
        setPicked("done");
        const newLog = [...log, { sec: q.sec, ok: true, t: took() }];
        setLog(newLog);
        const newCombo = combo + 1; setCombo(newCombo);
        dealDamage(2, 25, true, newLog, newCombo);
      }
    } else {
      setOrderProg([]); setCombo(0);
      setFx({ hitMe: true }); play("wrong");
      setTimeout(() => setFx(f => ({ ...f, hitMe: false })), 400);
      const of = orderFails + 1; setOrderFails(of);
      if (of >= 2) {
        setOrderFails(0);
        const newLog = [...log, { sec: q.sec, ok: false, t: took() }];
        setLog(newLog);
        takeHit(newLog);
        setPicked("failorder");   // اكشف الحل الصحيح بدل تعليق اللاعب
      }
    }
  };

  const next = () => {
    play("click");
    setQi(qi + 1); setPicked(null); setRemoved([]); setFrozen(false);
    setNumVal(""); setMatchSel(null); setMatchDone([]); setMatchWrong(0);
    setOrderProg([]); setOrderFails(0);
  };

  const useHint = () => {
    if (q.kind !== "mcq" || picked !== null || removed.length) return;
    if (freeHint) setFreeHint(false);
    else if (g.items.hint > 0) spendItem("hint");
    else return;
    setRemoved([0, 1, 2, 3].filter(i => i !== q.a).sort(() => Math.random() - 0.5).slice(0, 2));
    play("coin");
  };
  const useFreeze = () => {
    if (calm || picked !== null || frozen || g.items.freeze <= 0) return;
    spendItem("freeze"); setFrozen(true); play("coin");
  };
  const usePotion = () => {
    if (hearts >= maxHearts || g.items.potion <= 0 || over) return;
    spendItem("potion"); setHearts(hearts + 1); play("coin");
  };

  /* --- نتيجة المعركة --- */
  if (over && fx.result) {
    const r = fx.result;
    const acc = Math.round(r.acc * 100);
    return (
      <div className="card" style={{ textAlign: "center", padding: 26, animation: "pop .45s ease", position: "relative", overflow: "hidden" }}>
        {r.won && ["🎉", "✨", "⭐", "🎊", "✨", "🌟", "🎉", "⭐"].map((c, i) => (
          <span key={i} style={{ position: "absolute", bottom: 10, left: `${8 + i * 12}%`, fontSize: 18, animation: `confetti ${0.9 + (i % 3) * 0.3}s ease ${i * 0.08}s forwards` }}>{c}</span>
        ))}
        <div style={{ fontSize: 58 }}>{r.won ? (isBoss ? "🏆" : "⚔️") : "💔"}</div>
        <div style={{ fontSize: 21, fontWeight: 900, margin: "8px 0 6px", color: r.won ? "#1F7A5C" : "#B3402F" }}>
          {r.won ? `هزمت ${enemy.name}!` : "سقطت في المعركة"}
        </div>
        {r.won && r.isGat && <div style={{ fontSize: 15, fontWeight: 900, background: "#C8923522", color: "#C89235", borderRadius: 12, padding: "8px 12px", margin: "6px 0" }}>📜 درجتك في القدرات: {Math.min(100, Math.round(55 + r.acc * 45))}</div>}
        <div style={{ fontSize: 14.5, lineHeight: 2.1 }}>
          الدقة: <b>{acc}%</b> • أفضل كومبو: <b>🔥×{r.bestCombo}</b><br />
          <span style={{ color: "#C89235", fontWeight: 900, fontSize: 17 }}>+{r.xpGained + (r.won ? r.xp : 0)} XP</span>
          {r.won && <span style={{ fontWeight: 900 }}> • 🪙 +{r.coins}{g.skills.includes("gold") ? " (×1.5)" : ""}</span>}
        </div>
        {!r.won && <div style={{ fontSize: 13, color: theme.sub, marginTop: 8, lineHeight: 1.8 }}>احتفظت بالـXP اللي جمعته. جهّز أدواتك أو افتح مهارة وارجع.</div>}
        <button className="btn gold" style={{ marginTop: 14, width: "100%", padding: 13 }} onClick={() => onEnd(r)}>
          {r.won ? "استلم الغنائم ←" : "انسحاب تكتيكي ←"}
        </button>
      </div>
    );
  }

  const kindChip = { mcq: "🎯 اختر الضربة", num: "🔢 اكتب الجواب واضرب", match: "🔗 وصّل الأزواج — كل وصلة ضربة", order: "🧩 رتّب خطوات الحل — ترتيب كامل = ضربة حاسمة" }[q.kind];

  return (
    <div style={{ animation: "drop .3s ease" }}>
      {/* العدو */}
      <div className="card" style={{ textAlign: "center", background: "#17251F", color: "#fff", border: "none", position: "relative", animation: fx.hitEnemy ? "shake .4s ease" : "none" }}>
        {fx.dmgText && fx.hitEnemy && <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", color: "#F0C560", fontWeight: 900, fontSize: 20, animation: "floatUp .8s ease forwards" }}>{fx.dmgText}</div>}
        <div style={{ fontSize: 54, filter: fx.hitEnemy ? "brightness(2)" : "none", animation: "pulse 2.5s infinite" }}>{enemy.icon}</div>
        <div style={{ fontWeight: 900, fontSize: 15, margin: "4px 0 8px" }}>{enemy.name}</div>
        <div style={{ background: "rgba(255,255,255,.15)", borderRadius: 99, height: 12, overflow: "hidden", maxWidth: 260, margin: "0 auto" }}>
          <div style={{ width: `${(enemyHp / enemy.hp) * 100}%`, height: "100%", background: "linear-gradient(90deg,#E85D4A,#B3402F)", transition: "width .5s ease", borderRadius: 99 }} />
        </div>
        <div style={{ fontSize: 12, marginTop: 4, opacity: .9, fontWeight: 800 }}><Ico n="skull" s={14} /> {enemyHp}/{enemy.hp}</div>
      </div>

      {/* اللاعب */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px", marginBottom: 8, animation: fx.hitMe ? "shake .4s ease" : "none" }}>
        <div style={{ display: "flex", gap: 3 }}>{Array.from({ length: maxHearts }).map((_, i) => <Ico key={i} n="heart" s={19} c={i < hearts ? "#E0453A" : theme.line} style={{ filter: i < hearts ? "drop-shadow(0 1px 1px rgba(0,0,0,.25))" : "none", transition: "fill .3s" }} />)}</div>
        <div style={{ fontWeight: 900, fontSize: 13, color: combo >= 2 ? "#C89235" : theme.sub }}>{combo >= 2 ? `🔥 كومبو ×${Math.min(combo, 4)}` : tired ? "🥱 مرهق: −1 قلب" : calm ? "🧘 خذ راحتك" : `جولة ${qi + 1}`}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="hudbtn" onClick={useHint} disabled={q.kind !== "mcq" || picked !== null || removed.length > 0 || (!freeHint && g.items.hint <= 0)}
            style={{ opacity: q.kind === "mcq" && (freeHint || g.items.hint > 0) && !removed.length ? 1 : .35 }}>💡{freeHint ? "★" : g.items.hint}</button>
          <button className="hudbtn" onClick={useFreeze} disabled={calm || frozen || g.items.freeze <= 0} style={{ opacity: !calm && g.items.freeze > 0 && !frozen ? 1 : .35 }}>🧊{g.items.freeze}</button>
          <button className="hudbtn" onClick={usePotion} disabled={hearts >= maxHearts || g.items.potion <= 0} style={{ opacity: g.items.potion > 0 && hearts < maxHearts ? 1 : .35 }}>🧪{g.items.potion}</button>
        </div>
      </div>

      <div className="card" style={{ position: "relative" }}>
        {fx.xpText && fx.hitEnemy && <div style={{ position: "absolute", top: 8, left: 14, color: "#C89235", fontWeight: 900, fontSize: 15, animation: "floatUp .9s ease forwards", direction: "ltr" }}>{fx.xpText} XP</div>}
        <div style={{ fontSize: 12, fontWeight: 900, color: "#C89235", marginBottom: 8 }}>{kindChip}</div>

        {/* المؤقت — يختفي كليًا في الوضع الهادئ */}
        {!calm && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span className={!frozen && timeLeft <= 5 ? "tpulse" : ""} style={{ fontWeight: 900, fontSize: 13, color: frozen ? "#3B82C4" : timeLeft <= 8 ? "#B3402F" : theme.text, minWidth: 44, direction: "ltr", textAlign: "left" }}>{frozen ? "🧊 ∞" : `⏱ ${Math.max(timeLeft, 0)}s`}</span>
            <div style={{ flex: 1, background: theme.line, height: 6, borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: frozen ? "100%" : `${(Math.max(timeLeft, 0) / TIME) * 100}%`, height: "100%", background: frozen ? "#3B82C4" : timeLeft <= 8 ? "#B3402F" : "#C89235", transition: "width 1s linear", borderRadius: 99 }} />
            </div>
          </div>
        )}

        {/* ---------- MCQ ---------- */}
        {q.kind === "mcq" && <>
          <div dir="ltr" style={{ textAlign: "left", fontSize: 15.5, lineHeight: 1.75, marginBottom: 13, whiteSpace: "pre-line", fontWeight: 600 }}>{q.q}</div>
          {q.options.map((o, idx) => {
            const gone = removed.includes(idx);
            let style = {};
            if (picked !== null) {
              if (idx === q.a) style = { borderColor: "#1F7A5C", background: "#1F7A5C22", fontWeight: 700 };
              else if (idx === picked) style = { borderColor: "#B3402F", background: "#B3402F22" };
            }
            return <button key={idx} className="opt" style={style} disabled={gone} onClick={() => hit(idx)}>{String.fromCharCode(65 + idx)}. {gone ? "—" : o}</button>;
          })}
        </>}

        {/* ---------- NUM: لوحة أرقام ---------- */}
        {q.kind === "num" && <>
          <div dir="ltr" style={{ textAlign: "left", fontSize: 17, fontWeight: 700, marginBottom: 10 }}>{q.q}</div>
          <div dir="ltr" style={{ textAlign: "center", fontSize: 26, fontWeight: 900, letterSpacing: 3, background: theme.line + "55", borderRadius: 12, padding: "10px 0", marginBottom: 10, minHeight: 52, color: picked === "done" ? "#1F7A5C" : picked === "wrongnum" ? "#B3402F" : theme.text }}>
            {numVal || "؟"}
          </div>
          {picked === null && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, "⌫", 0, "⚔️"].map(k => (
              <button key={k} className="opt" style={{ textAlign: "center", fontSize: 18, fontWeight: 900, padding: "13px 0", margin: 0, background: k === "⚔️" ? "#0F5147" : undefined, color: k === "⚔️" ? "#fff" : undefined, opacity: k === "⚔️" && !numVal ? .45 : 1 }}
                onClick={() => {
                  play("click");
                  if (k === "⌫") setNumVal(v => v.slice(0, -1));
                  else if (k === "⚔️") numSubmit();
                  else if (numVal.length < 6) setNumVal(v => v + k);
                }}>{k}</button>
            ))}
          </div>}
        </>}

        {/* ---------- MATCH: توصيل ---------- */}
        {q.kind === "match" && <>
          <div style={{ fontSize: 13.5, marginBottom: 10, lineHeight: 1.7 }}>وصّل كل كلمة بمعناها. كل وصلة صحيحة = ضربة للعدو. (3 أخطاء = العدو يضربك)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              {q.pairs.map(([w]) => {
                const done = matchDone.some(d => d[0] === w);
                return <button key={w} className="opt" disabled={done} onClick={() => tapEn(w)}
                  style={{ textAlign: "center", fontWeight: 800, margin: "0 0 8px", opacity: done ? .35 : 1, borderColor: matchSel === w ? "#C89235" : undefined, background: matchSel === w ? "#C8923522" : done ? "#1F7A5C22" : undefined }}>{done ? "✓ " : ""}{w}</button>;
              })}
            </div>
            <div>
              {matchShuf[qi % qs.length].map((m) => {
                const done = matchDone.some(d => d[1] === m);
                return <button key={m} className="opt" dir="rtl" disabled={done} onClick={() => tapAr(m)}
                  style={{ textAlign: "center", fontWeight: 800, margin: "0 0 8px", opacity: done ? .35 : 1, background: done ? "#1F7A5C22" : undefined }}>{done ? "✓ " : ""}{m}</button>;
              })}
            </div>
          </div>
          {matchWrong > 0 && picked === null && <div style={{ fontSize: 12.5, color: "#B3402F", fontWeight: 800, marginTop: 4 }}>محاولات خاطئة: {matchWrong}/3</div>}
        </>}

        {/* ---------- ORDER: رتّب الحل ---------- */}
        {q.kind === "order" && <>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 10, lineHeight: 1.7 }}>{q.title}</div>
          <div style={{ minHeight: 34, background: theme.line + "44", borderRadius: 10, padding: "8px 10px", marginBottom: 10, fontSize: 13, lineHeight: 1.9 }}>
            {orderProg.length === 0 ? <span style={{ color: theme.sub }}>اضغط الخطوات بالترتيب الصحيح ↓</span> :
              orderProg.map((s, i) => <div key={i} style={{ color: "#1F7A5C", fontWeight: 700 }}>{i + 1}. {s}</div>)}
          </div>
          {picked === null && [...q.steps].filter(s => !orderProg.includes(s)).length > 0 &&
            (orderShuf[qi % qs.length] || q.steps).map((s) => !orderProg.includes(s) && (
              <button key={s} className="opt" dir="rtl" style={{ textAlign: "right" }} onClick={() => tapStep(s)}>{s}</button>
            ))}
          {orderFails > 0 && picked === null && <div style={{ fontSize: 12.5, color: "#B3402F", fontWeight: 800 }}>ترتيب خاطئ — انعاد من البداية ({orderFails}/2)</div>}
        </>}

        {/* شريط ما بعد الجولة */}
        {picked !== null && hearts > 0 && enemyHp > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ background: (picked === "done" || picked === q.a) ? "#1F7A5C1d" : "#B3402F1d", borderRadius: 12, padding: "11px 13px", fontSize: 13.5, lineHeight: 1.8 }}>
              <b style={{ color: (picked === "done" || picked === q.a) ? "#1F7A5C" : "#B3402F" }}>
                {picked === "done" || picked === q.a ? "⚔️ ضربة ناجحة" : picked === -1 ? "⏰ انتهى الوقت — العدو ضربك" : picked === "failorder" ? "🧩 العدو ضربك — هذا الترتيب الصحيح:" : "🩸 العدو ضربك"}
              </b>{picked === "failorder" ? ` ${q.steps.join(" ← ")}` : q.ex ? ` — ${q.ex}` : q.kind === "num" && picked === "wrongnum" ? ` — الجواب الصحيح: ${q.a}. ${q.ex || ""}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {picked !== q.a && picked !== "done" && q.kind !== "match" && q.kind !== "order" && (
                <button className="btn ghost" style={{ flex: 1, padding: 11, fontSize: 13.5 }} onClick={() => { play("click"); setTeach(true); }}>🧑‍🏫 لم أفهم</button>
              )}
              <button className="btn" style={{ flex: 2, padding: 11 }} onClick={next}>استمر بالقتال ←</button>
            </div>
          </div>
        )}
      </div>
      {teach && <Teacher g={g} theme={theme} q={q} picked={typeof picked === "number" && picked >= 0 ? picked : null}
        onBonus={(b) => { setXpGained(x => x + b); setFx(f => ({ ...f, hitEnemy: false })); }}
        onClose={() => setTeach(false)} />}
    </div>
  );
}

/* ═══════════════ 🏁 ENDINGS ═══════════════ */

function Ending({ g, theme, onReplay, onFree }) {
  const E = {
    legend: { e: "👑🛢️", t: "النهاية الأسطورية", d: `"${g.name}... مبروك. أهلًا بك مهندسًا في أرامكو السعودية." — البداية كانت ليلة مذاكرة وكسل يجلس على كتفك. والنهاية: مكتبك يطل على أبراج الظهران. الرحلة اللي بدأت بسؤال حساب... انتهت بحلم كامل.`, c: "#C89235" },
    good: { e: "💼✨", t: "نهاية مشرّفة", d: `حصلت على وظيفة قوية في شركة كبرى. أرامكو ردّت: "ملفك واعد — نرحب بإعادة التقديم بعد سنة خبرة." الحلم مو بعيد... يحتاج جولة أخيرة أقوى.`, c: "#1F7A5C" },
    open: { e: "🌅", t: "الرحلة مستمرة", d: `ما عبرت اختبار أرامكو هالمرة، لكن اللي بنيته ما ينهدم: شهادة، لغة، وعقل أقوى بكثير من طالب الثانوية اللي بدأ الرحلة. ارفع درجاتك وارجع للمعركة الأخيرة.`, c: "#3B82C4" },
  }[g.ending || "open"];
  const acc = g.stats.answered ? Math.round((g.stats.correct / g.stats.answered) * 100) : 0;
  return (
    <div style={{ textAlign: "center", paddingTop: 24, animation: "pop .5s ease" }}>
      <div style={{ fontSize: 74 }}>{E.e}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: E.c, margin: "8px 0" }}>{E.t}</div>
      <div className="card" style={{ textAlign: "right", fontSize: 15, lineHeight: 2.1, padding: 18 }}>{E.d}</div>
      <div className="card" style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>📜 سجل الرحلة</div>
        <div style={{ fontSize: 13.5, lineHeight: 2.2 }}>
          درجة القدرات: <b style={{ color: "#C89235" }}>{g.gatScore ?? "—"}</b> • الجامعة: <b>{g.uni ?? "—"}</b><br />
          دقة الإجابات الكلية: <b>{acc}%</b> • معارك محسومة: <b>{g.stats.battles}</b> • أفضل كومبو: <b>🔥×{g.stats.bestCombo}</b><br />
          الإنجازات: <b>{g.ach.length}/{ACHV.length}</b> • اللقب: <b>{titleOf(g.xp).icon} {titleOf(g.xp).name}</b>
        </div>
      </div>
      {g.ending !== "legend" && <button className="btn gold" style={{ width: "100%", padding: 14, marginBottom: 8 }} onClick={onReplay}>⚔️ أعد المعركة الأخيرة</button>}
      <button className="btn ghost" style={{ width: "100%", padding: 12 }} onClick={onFree}>🗺️ ارجع للعالم (لعب حر ورفع الدرجات)</button>
      <div style={{ fontSize: 12, color: theme.sub, marginTop: 16 }}>Qudrat Quest • صُنعت لرحلة {g.name} الحقيقية 🤍</div>
    </div>
  );
}

/* ═══════════════ 🗂 PANELS ═══════════════ */

function StudyPlanCard({ g, theme, onSetDate }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exam = g.examDate ? new Date(g.examDate + "T00:00:00") : null;
  const daysLeft = exam ? Math.max(0, Math.round((exam - today) / 86400000)) : null;
  const secs = ALL_SECS.filter(s => secStat(g, s).a > 0);
  const weak = [...secs].sort((a, b) => weightOf(g, b) - weightOf(g, a)).slice(0, 2);
  const due = (dueList(g) || []).length;
  return (
    <div className="card" style={{ background: "#0F51470d", borderColor: "#0F514733" }}>
      <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 6 }}>📅 خطة المذاكرة والعدّاد</div>
      {!g.examDate ? (
        <>
          <div style={{ fontSize: 12.5, color: theme.sub, lineHeight: 1.9, marginBottom: 10 }}>حدّد تاريخ اختبارك، وسيبني لك التطبيق خطة يومية تركّز على أقسامك الأضعف مع عدّاد تنازلي محفّز.</div>
          <input type="date" onChange={e => e.target.value && onSetDate(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: 11, borderRadius: 10, border: `1px solid ${theme.line}`, background: theme.bg, color: theme.text, fontSize: 14, fontFamily: "inherit" }} />
        </>
      ) : (
        <>
          <div style={{ textAlign: "center", margin: "2px 0 10px" }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: daysLeft <= 7 ? "#B3402F" : "#0F5147", lineHeight: 1.1 }}>{daysLeft}</div>
            <div style={{ fontSize: 12.5, color: theme.sub }}>{daysLeft === 0 ? "اليوم اختبارك — بالتوفيق! 🍀" : daysLeft === 1 ? "باقٍ يوم واحد على اختبارك" : `باقٍ ${daysLeft} يوم على اختبارك`}</div>
          </div>
          <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 5 }}>🎯 خطة اليوم:</div>
          <ul style={{ margin: 0, paddingInlineStart: 20, fontSize: 12.5, lineHeight: 2 }}>
            {weak.length ? weak.map(s => <li key={s}>ركّز على <b>{SEC_AR[s]}</b> — 10 أسئلة (من أضعف أقسامك)</li>)
              : <li>خُض 3 معارك لنكتشف أقسامك الأضعف ونبني خطتك</li>}
            {due > 0 && <li>أنجز <b>{due}</b> {due === 1 ? "مراجعة مستحقّة" : "مراجعات مستحقّة"} في الأكاديمية</li>}
            <li>{daysLeft <= 14 ? "محاكاة كاملة كل يومين لضبط الإيقاع" : "محاكاة كاملة مرة كل أسبوع"}</li>
            {(g.mistakes || []).length > 0 && <li>راجع <b>{g.mistakes.length}</b> من دفتر أخطائك 📕</li>}
          </ul>
          <button className="btn ghost" style={{ width: "100%", padding: 9, marginTop: 10, fontSize: 12.5 }} onClick={() => onSetDate("")}>تغيير/إزالة التاريخ</button>
        </>
      )}
    </div>
  );
}

function BackupBox({ theme, onExport, onImport }) {
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const fileRef = useRef(null);
  const readFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => onImport(String(r.result || ""));
    r.readAsText(f);
  };
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 4 }}>💾 نسخة احتياطية ونقل التقدّم</div>
      <div style={{ fontSize: 12, color: theme.sub, lineHeight: 1.8, marginBottom: 10 }}>
        صدّر تقدّمك واحتفظ فيه، أو استعِده على جهاز ثاني. تقدّمك محفوظ على هذا المتصفح فقط — خذ نسخة بين فترة وأخرى حتى لا تفقده.
      </div>
      <button className="btn" style={{ width: "100%", padding: 11, marginBottom: 8 }} onClick={onExport}>⬇️ تصدير نسخة احتياطية</button>
      {!open ? (
        <button className="btn ghost" style={{ width: "100%", padding: 11 }} onClick={() => setOpen(true)}>⬆️ استعادة نسخة</button>
      ) : (
        <>
          <textarea value={code} onChange={e => setCode(e.target.value)} dir="ltr" placeholder="الصق رمز النسخة الاحتياطية هنا…"
            style={{ width: "100%", boxSizing: "border-box", minHeight: 70, borderRadius: 10, border: `1px solid ${theme.line}`, padding: 10, fontSize: 12, fontFamily: "monospace", background: theme.bg, color: theme.text, marginBottom: 8, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" style={{ flex: 1, padding: 10, opacity: code.trim() ? 1 : .45 }} disabled={!code.trim()} onClick={() => onImport(code.trim())}>استعد من الرمز</button>
            <button className="btn ghost" style={{ flex: 1, padding: 10 }} onClick={() => fileRef.current && fileRef.current.click()}>📁 من ملف</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json,.txt" style={{ display: "none" }} onChange={readFile} />
          <div style={{ fontSize: 11, color: "#B3402F", marginTop: 8, textAlign: "center" }}>⚠️ الاستعادة تستبدل تقدّمك الحالي بالكامل</div>
        </>
      )}
    </div>
  );
}

function Panel({ g, theme, panel, spFree, close, buySkill, buyItem, buyAvatar, wearAvatar, toast, onExport, onImport, onOpenMock, onSetDate }) {
  const priceOf = (p) => (g.dayFlags?.sale ? Math.ceil(p / 2) : p);
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: theme.bg, color: theme.text, width: "min(100%,620px)", maxHeight: "82vh", overflowY: "auto", borderRadius: "22px 22px 0 0", padding: "16px 16px 30px", animation: "drop .3s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 17 }}>
            {panel === "skills" && `🌳 شجرة المهارات (نقاطك: ${spFree})`}
            {panel === "shop" && `🛒 المتجر (🪙 ${g.coins})`}
            {panel === "ach" && `🏅 الإنجازات ${g.ach.length}/${ACHV.length} — ${Math.round((g.ach.length / ACHV.length) * 100)}%`}
            {panel === "stats" && "📊 إحصائياتك"}
          </div>
          <button onClick={close} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: theme.text }}>✕</button>
        </div>

        {panel === "skills" && SKILLS.map(sk => {
          const owned = g.skills.includes(sk.id);
          const can = !owned && spFree >= sk.cost;
          return (
            <div className="card" key={sk.id} style={{ display: "flex", gap: 12, alignItems: "center", border: owned ? "1.5px solid #1F7A5C" : `1px solid ${theme.line}` }}>
              <div style={{ fontSize: 28 }}>{sk.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 14 }}>{sk.name} <span style={{ fontSize: 11, color: theme.sub }}>({sk.branch})</span></div>
                <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>{sk.desc}</div>
              </div>
              {owned ? <span style={{ color: "#1F7A5C", fontWeight: 900, fontSize: 13 }}>✓ مفتوحة</span> :
                <button className="btn" style={{ padding: "8px 14px", fontSize: 13, opacity: can ? 1 : .45 }} disabled={!can}
                  onClick={() => { buySkill(sk); play("levelup"); }}>{sk.cost} ⭐</button>}
            </div>
          );
        })}
        {panel === "skills" && <div style={{ fontSize: 12.5, color: theme.sub, textAlign: "center" }}>تكسب نقطة مهارة ⭐ مع كل مستوى جديد</div>}

        {panel === "shop" && <>
          <div style={{ fontWeight: 900, fontSize: 13.5, color: "#C89235", margin: "4px 4px 8px" }}>أدوات المعركة{g.dayFlags?.sale ? " — 🏷️ تخفيضات اليوم −50%!" : ""}</div>
          {SHOP_ITEMS.map(it => (
            <div className="card" key={it.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 26 }}>{it.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 14 }}>{it.name} <span style={{ fontSize: 12, color: theme.sub }}>(معك: {g.items[it.id]})</span></div>
                <div style={{ fontSize: 12.5, color: theme.sub }}>{it.desc}</div>
              </div>
              <button className="btn gold" style={{ padding: "8px 14px", fontSize: 13, opacity: g.coins >= priceOf(it.price) ? 1 : .45 }} disabled={g.coins < priceOf(it.price)}
                onClick={() => { buyItem(it); play("coin"); }}>🪙 {priceOf(it.price)}{g.dayFlags?.sale ? " 🏷️" : ""}</button>
            </div>
          ))}
          <div style={{ fontWeight: 900, fontSize: 13.5, color: "#C89235", margin: "10px 4px 8px" }}>شخصيات</div>
          {AVATARS.map(av => {
            const owned = g.owned.includes(av.id);
            const wearing = g.avatar === av.id;
            return (
              <div className="card" key={av.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 28 }}>{av.e}</div>
                <div style={{ flex: 1, fontWeight: 900, fontSize: 14 }}>{av.name}</div>
                {wearing ? <span style={{ color: "#1F7A5C", fontWeight: 900, fontSize: 13 }}>✓ مُرتدى</span> :
                  owned ? <button className="btn" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => { wearAvatar(av); play("click"); }}>ارتدِ</button> :
                    <button className="btn gold" style={{ padding: "8px 14px", fontSize: 13, opacity: g.coins >= av.price ? 1 : .45 }} disabled={g.coins < av.price}
                      onClick={() => { buyAvatar(av); play("coin"); toast(`${av.e} فتحت: ${av.name}`); }}>🪙 {av.price}</button>}
              </div>
            );
          })}
        </>}

        {panel === "ach" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {ACHV.map(a => {
            const got = g.ach.includes(a.id);
            return (
              <div key={a.id} className="card" style={{ textAlign: "center", opacity: got ? 1 : .45, margin: 0, border: got ? "1.5px solid #C89235" : `1px solid ${theme.line}` }}>
                <div style={{ fontSize: 26, filter: got ? "none" : "grayscale(1)" }}>{a.icon}</div>
                <div style={{ fontWeight: 900, fontSize: 12.5, marginTop: 3 }}>{a.name}</div>
                <div style={{ fontSize: 11, color: theme.sub, marginTop: 2, lineHeight: 1.5 }}>{a.desc}</div>
              </div>
            );
          })}
        </div>}

        {panel === "stats" && <StatsPanel g={g} theme={theme} />}
        {panel === "stats" && <StudyPlanCard g={g} theme={theme} onSetDate={onSetDate} />}
        {panel === "stats" && (
          <div className="card" style={{ textAlign: "center", background: "#B3402F0d", borderColor: "#B3402F33" }}>
            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 3 }}>🎯 محاكاة اختبار كاملة</div>
            <div style={{ fontSize: 12, color: theme.sub, lineHeight: 1.8, marginBottom: 10 }}>قسمان مؤقّتان (لفظي + كمي) كما في القدرات الحقيقي، مع تقرير مفصّل.{g.mockBest ? ` أفضل نتيجة: ${g.mockBest.score}` : ""}</div>
            <button className="btn" style={{ width: "100%", padding: 12, background: "#B3402F" }} onClick={() => { play("click"); onOpenMock(); }}>ابدأ المحاكاة الكاملة</button>
          </div>
        )}
        {panel === "stats" && <BackupBox theme={theme} onExport={onExport} onImport={onImport} />}
      </div>
    </div>
  );
}

function ProgressChart({ g, theme }) {
  const h = (g.history || []).filter(x => x.q !== null || x.v !== null);
  if (h.length < 2) return (
    <div className="card" style={{ textAlign: "center", fontSize: 12.5, color: theme.sub }}>
      📈 نم ليلتين على الأقل داخل اللعبة وسيظهر هنا منحنى تطورك في الكمي واللفظي يومًا بيوم
    </div>
  );
  const W = 300, H = 110, pad = 8;
  const pts = (key, color) => {
    const vals = h.map(x => x[key]);
    const path = h.map((x, i) => {
      const px = pad + (i / (h.length - 1)) * (W - 2 * pad);
      const py = H - pad - ((x[key] ?? 0) / 100) * (H - 2 * pad);
      return `${px},${py}`;
    }).join(" ");
    return { path, color, last: vals[vals.length - 1] };
  };
  const q = pts("q", "#C89235"), v = pts("v", "#7B5EA7");
  return (
    <div className="card">
      <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 8 }}>📈 تطورك عبر الأيام</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        {[25, 50, 75].map(y => <line key={y} x1={pad} x2={W - pad} y1={H - pad - (y / 100) * (H - 2 * pad)} y2={H - pad - (y / 100) * (H - 2 * pad)} stroke={theme.line} strokeDasharray="3 4" />)}
        <polyline points={q.path} fill="none" stroke={q.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={v.path} fill="none" stroke={v.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 12, fontWeight: 800, marginTop: 4 }}>
        <span style={{ color: "#C89235" }}>● الكمي {q.last ?? "—"}%</span>
        <span style={{ color: "#7B5EA7" }}>● اللفظي {v.last ?? "—"}%</span>
      </div>
    </div>
  );
}


function StatsPanel({ g, theme }) {
  const acc = g.stats.answered ? Math.round((g.stats.correct / g.stats.answered) * 100) : 0;
  const secs = Object.entries(g.stats.bySec);
  return (
    <div>
      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 34, fontWeight: 900, color: acc >= 90 ? "#C89235" : "#0F5147" }}>{acc}%</div>
        <div style={{ fontSize: 13, color: theme.sub }}>الدقة الكلية • {g.stats.correct}/{g.stats.answered} إجابة صحيحة</div>
        <div style={{ fontSize: 13, marginTop: 6, fontWeight: 800 }}>⚔️ {g.stats.battles} معركة محسومة • 🔥 أفضل كومبو ×{g.stats.bestCombo} • ⚡ سلسلة {g.streak} يوم</div>
      </div>
      <ProgressChart g={g} theme={theme} />
      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 14 }}>الدقة حسب القسم — هذي بوصلتك: العب في الأقسام الحمراء</div>
        {secs.length === 0 && <div style={{ fontSize: 13, color: theme.sub }}>خض معاركك الأولى وستظهر بياناتك هنا</div>}
        {secs.length >= 2 && (
          <div style={{ fontSize: 12, fontWeight: 800, background: "#C8923518", color: "#C89235", borderRadius: 10, padding: "7px 10px", marginBottom: 10, lineHeight: 1.7 }}>
            🧠 اللعبة تركز حاليًا على: {[...secs].sort((x, y) => weightOf(g, y[0]) - weightOf(g, x[0])).slice(0, 2).map(([s]) => SEC_AR[s] || s).join(" و ")} — لأنها أضعف أقسامك الآن
          </div>
        )}
        {secs.map(([sec, v]) => {
          const p = Math.round((v.c / v.a) * 100);
          const m = masteryOf(g, sec);
          const avg = v.a ? Math.round((v.t || 0) / v.a) : 0;
          return (
            <div key={sec} style={{ marginBottom: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, fontWeight: 800, marginBottom: 3, gap: 6 }}>
                <span>{SEC_AR[sec] || sec} <span style={{ fontSize: 10.5, background: theme.line + "88", borderRadius: 6, padding: "1px 6px" }}>{m.e} {m.label}</span></span>
                <span style={{ color: p >= 80 ? "#1F7A5C" : p >= 60 ? "#C89235" : "#B3402F", whiteSpace: "nowrap" }}>{p}% ({v.c}/{v.a}){avg ? ` • ⏱${avg}ث` : ""}{v.to ? ` • ⏰${v.to}` : ""}</span>
              </div>
              <div style={{ background: theme.line, borderRadius: 99, height: 8, overflow: "hidden" }}>
                <div style={{ width: `${p}%`, height: "100%", borderRadius: 99, background: p >= 80 ? "#1F7A5C" : p >= 60 ? "#C89235" : "#B3402F", transition: "width .5s" }} />
              </div>
            </div>
          );
        })}
      </div>
      {g.gatScore && <div className="card" style={{ textAlign: "center", fontWeight: 900 }}>📜 درجة القدرات داخل اللعبة: <span style={{ color: "#C89235", fontSize: 18 }}>{g.gatScore}</span></div>}
    </div>
  );
}
