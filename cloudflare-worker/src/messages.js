/* =========================================================
   Meddelanden till tvättbjörnsappen (maken)

   Det här är källan till ALLA push-notiser i appen. Vill du ändra,
   lägga till eller ta bort ett meddelande gör du det här, sparar och
   kör `npm run deploy` i mappen cloudflare-worker.

   Smeknamn som används: älskling, äcklis, gullis, herr tacos, snutt.
   ========================================================= */

// Ren kärlek
export const LOVE = [
  "Bara så du vet: jag älskar dig, älskling. Hela dagen, inte bara ibland. ❤️",
  "Tänkte på dig nu. Igen. Det händer ungefär hela tiden, äcklis. 💭",
  "Du är det bästa jag har, äcklis. Punkt slut.",
  "Om jag fick välja om skulle jag välja dig igen, gullis. Varje gång. 💍",
  "Jag är så stolt över dig, herr tacos. Även när du själv inte fattar varför.",
  "Du gör mitt liv mjukare bara genom att finnas i det, älskling. 🤍",
  "Påminnelse: du är älskad precis som du är idag. Inte som du borde vara. Som du ÄR.",
  "Hemma är inte en plats, det är du, snutt. 🏠",
  "Du är min favoritmänniska, gullis. Det är inte ens nära mellan tvåan och dig.",
  "Tack för att du är du, älskling. Jag hade inte orkat med någon annan. 😌",
  "Du behöver inte prestera något för att förtjäna min kärlek. Du har den redan. 💗",
  "Jag ser allt du gör, äcklis. Även det ingen annan lägger märke till.",
  "Om du haft en tung dag: jag håller i dig ikväll. 🛋️",
  "Du är snäll, och det är den mest underskattade superkraften som finns, äcklis.",
  "Herr tacos, du luktar gott och är fin i håret. Det var allt. Slut på meddelandet.",
  "Jag är på ditt lag. Alltid. Även när du har fel. Särskilt då. 😄",
  "Du är inte för mycket och inte för lite. Du är precis lagom, älskling.",
  "Jag längtar hem till dig. 🥰"
];

// Pepp och coachning
export const PEP = [
  "Du fixar det här, älskling. Ett steg i taget. 💪",
  "Kom igen nu, snutt! En sak. Bara en. Sen är du igång.",
  "Det svåraste är att börja. Resten är bara att fortsätta, gullis.",
  "Du har klarat 100 procent av dina hittills värsta dagar. Statistiken är på din sida. 📈",
  "Halvfärdigt slår oftast ogjort, äcklis. Gör det halvdant och var stolt ändå.",
  "Andas. Axlarna ner. Du har tid. ✨",
  "Fem minuter. Sätt en timer och gör bara fem minuter, herr tacos. Sen får du sluta.",
  "Du behöver inte vara motiverad. Du behöver bara börja, så kommer motivationen springande efter. 🏃",
  "Du är starkare än det där som känns jobbigt just nu, älskling.",
  "Idag måste inte bli perfekt. Idag räcker det med att bli gjort. ✅",
  "Äcklis, du är på väg. Även när det känns som att du står still.",
  "Jag hejar på dig härifrån. Osynliga pompoms, full volym. 📣",
  "Om det känns tungt: det betyder att du lyfter något. Det är därför du blir starkare. 🏋️",
  "Du får vara trött och ändå duktig, gullis. Det går utmärkt att vara båda.",
  "Ta det som en tvättbjörn: rota igenom röran och ta det bästa du hittar. 🦝",
  "En dålig timme är inte en dålig dag, äcklis. Starta om när du vill.",
  "Du har redan gjort svårare saker än det här, herr tacos. Kom ihåg det.",
  "Klart är bättre än perfekt. Kör på, älskling! 🚀"
];

// Busigt och flörtigt
export const BUS = [
  "Snyggaste i huset är du. Och du vet om det, äcklis. 😏",
  "Tänkte på dig i duschen. Inget mer om det. 🚿",
  "Herr tacos, du är farligt bra att titta på. Bara så du vet.",
  "Om du gör klart dina grejer idag väntar något trevligt ikväll... 😌",
  "Du har ingen aning om vad du gör med mig när du kavlar upp ärmarna, älskling.",
  "Äcklis. Sluta vara så där attraktiv medan du gör helt vanliga saker. 🙃",
  "Ursäkta att jag stör, jag ville bara flörta lite. Fortsätt med ditt. 😘",
  "Gullis, ikväll är du min. Inga invändningar godtas.",
  "Du får en puss när du kommer hem. Minst en. 💋",
  "Jag skickar det här bara för att få din uppmärksamhet. Det funkade. 😈",
  "Äcklis, du är olagligt snygg när du är koncentrerad.",
  "Kom hem tidigt så ska jag vara extra snäll mot dig. 🔥"
];

// Fånigt och tvättbjörnigt
export const FANIGT = [
  "Tvättbjörnsfakta: vi tvättar maten innan vi äter. Du borde också skölja av dagen och börja om. 🦝",
  "Jag har rotat i soporna och hittat... kärlek. Till dig. Bara till dig, älskling. 🗑️❤️",
  "Jag ser ut att bära mask, men du är den som stjäl hjärtan här, snutt. 🎭",
  "Små tassar, stor kärlek. Det är hela min affärsidé. 🐾",
  "Herr tacos, visste du att en grupp tvättbjörnar kallas gäng? Vi två är ett gäng. 🦝🦝",
  "Jag skulle offra min sista sopsäck för dig, gullis.",
  "Kliar det i händerna? Det är tvättbjörnsinstinkt. Ta något gott ur skåpet. 🍪",
  "Bäst i test på att rota, näst bäst på att ge råd. Men jag försöker! 🦝",
  "Jag har tvättat mina tassar och är redo att peppa dig professionellt.",
  "Äcklis, om du var ett mellanmål hade du varit ett riktigt bra mellanmål. 🥨",
  "Jag sov hela dagen och tänkte på dig hela natten. Så funkar nattdjur. 🌙",
  "Nu blev jag rörd av mig själv. Ge dig själv en klapp på axeln från mig. 👏"
];

// Knuffar till dagens uppgifter
export const TASK_TRAKIGT = [
  "Dags för dagens tråkiga grej, älskling. Gör den ful och snabbt, så är den borta. 😤",
  "Den där saken du skjuter på? Ta den nu, snutt. Den blir inte roligare av att vänta. ⏳",
  "Tråkiga uppgiften kallar, gullis. Tio minuter, sen är du fri. 🧹",
  "Gör det tråkiga först idag, äcklis. Belöningen känns dubbelt så bra efteråt.",
  "Herr tacos, en obehaglig grej avklarad ger en dag som känns mycket lättare. Kör! 💥"
];

export const TASK_GOTT = [
  "Glöm inte unna dig något gott idag, älskling. Det är faktiskt en uppgift. 🍫",
  "Order från tvättbjörnen: gör något som känns skönt idag, äcklis. 🛁",
  "Du förtjänar något gott, gullis. Inte för att du presterat, utan för att du finns. 🍰",
  "Ta det där goda du tänkte på. Ja, just det. Gör det, äcklis. ☕",
  "Herr tacos, har du unnat dig något idag? Om inte: fixa det nu. 🌮"
];

export const TASK_FRU = [
  "Psst, älskling. Har du skickat något gulligt till din fru idag? 💌",
  "En rad till frugan, snutt. Hon blir lika glad varje gång. 🥰",
  "Gullis, skriv något fint till henne nu. Du behöver inte hitta på något smart, bara snällt. ✍️",
  "Äcklis, hon tänker på dig just nu. Passa på att skicka något tillbaka. 💕",
  "Herr tacos, ett litet meddelande hem gör hela hennes dag. Kör! 📱",
  "Dagens enklaste uppgift: säg något kärt till din fru. Du är ju bra på det. ❤️"
];

export const TASK_TANK = [
  "Tänk på din fru! 💭❤️",
  "Stanna upp tio sekunder och tänk på henne, älskling. Bara det. 💭",
  "Äcklis, minns något du gillar med din fru just nu. Ja, precis det där. 🥰",
  "Gullis, hon finns där hemma och tycker att du är bäst. Tänk på det en stund. 🏠",
  "Äcklis, blunda och tänk på er två. Sen kan du fortsätta med dagen. ✨",
  "Herr tacos, dagens finaste tanke är gratis: tänk på din fru. 💕"
];

export const TASK_SORTERA = [
  "Sortera en tvätt, älskling. Det här är min gren. 🧺",
  "Äcklis, vitt för sig och kulört för sig. Sen är du min hjälte. 🧦",
  "En tvättbjörn ber dig snällt: sortera och lägg in en tvätt. 🦝🧺",
  "Gullis, tvättkorgen tittar på dig. Gör något åt det. 👀",
  "Herr tacos, sortera högen nu så slipper du berget på söndag. ⛰️"
];

export const TASK_TVATT = [
  "Maskinen är laddad, älskling. Tryck på knappen. 🌀",
  "Kör igång en maskin, snutt. En tvätt igång är en vuxenpoäng. ✨",
  "Gullis, starta tvätten nu så är den klar innan kvällen. ⚙️",
  "Äcklis, en knapptryckning och du är dagens vuxen. 🫡",
  "Herr tacos, kör maskinen. Jag står bredvid och hejar. 🦝🌀"
];

export const TASK_DAMMSUG = [
  "Dags att dammsuga, älskling. Ett rum, sen är det gjort. 🔌",
  "Äcklis, ta det rum som stör dig mest och kör dammsugaren där. 🧹",
  "Gullis, tio minuter med dammsugaren och rummet känns nytt. ✨",
  "Snutt, dammråttorna har flyttat in igen. Visa dem vem som bor här. 🐭",
  "Herr tacos, dammsugardags. Ett rum, inte mer. 🌟"
];

export const TASK_NEDANVANING = [
  "Tio saker från nedanvåningen, älskling. Bara tio, sen är du fri. 🧹",
  "Äcklis, ta korgen och plocka tio saker en våning ner. 🧺",
  "Gullis, nedanvåningen ropar på dig. Den blir inte bättre av sig själv. 🙃",
  "Snutt, plocka undan där nere så känns hela huset lättare. ✨",
  "Herr tacos, en tvättbjörn plockar upp allt den ser. Gör som jag. 🦝"
];

export const TASK_KAFFE = [
  "Kaffestationen, älskling. Torka av och fyll på, det tar tre minuter. ☕",
  "Äcklis, sudda bort kafferingarna så blir morgonen finare imorgon. 🤎",
  "Gullis, skölj ur och fyll på vid kaffet. Ditt framtida jag tackar dig. ⏳",
  "Snutt, en ren kaffestation är halva morgonhumöret. Fixa den. ☕✨",
  "Herr tacos, kaffehörnan ropar. Du vet vad som ska göras. 🫘"
];

export const TASK_STADA = [
  "Städa nåt! Vad som helst. En yta räcker, älskling. 🧼",
  "Äcklis, välj en enda yta och gör den fin. Sen är du klar. ✨",
  "Fem minuters städning nu, gullis, och du är dagens hjälte. 🧽",
  "Snutt, ta en hylla eller ett skåp. Bara ett. Kör! 🧹",
  "Herr tacos, lite ordning gör huvudet lugnare. Städa något litet. 🌟"
];

export const TASK_TRADGARD = [
  "Ta en runda i trädgården, älskling. Bara titta, det räknas. 🌿",
  "Ut och sniffa lite luft, äcklis. Trädgården väntar. 🌤️",
  "Gullis, en sväng i trädgården gör mer för humöret än du tror. 🌳",
  "Snutt, ta en runda ute. Jag hade följt med om jag fick. 🦝🌿",
  "Herr tacos, gå ut och inspektera ditt rike. 👑🌱"
];

export const TASK_SPRING = [
  "Idag är det löpardag, älskling! Skorna på, ut och kläm en runda. 👟",
  "Springrunda idag, snutt. Du kommer aldrig ångra att du gick ut. 🏃‍♂️",
  "Dags att springa, gullis. Långsamt räknas också. Bara ut! 🌳",
  "Löpardag, äcklis! Jag håller tummarna med alla fyra tassarna. 🦝🏃",
  "Herr tacos, en runda idag så är du kung i kväll. Kör! 🏅"
];

export const TASK_KLART = [
  "Allt avklarat idag, älskling! Jag är så stolt över dig. 🎉",
  "Klart! Du är dagens tvättbjörn, äcklis. 🏆",
  "Dagens lista är tom och mitt hjärta är fullt, gullis. ❤️"
];

// Vikter styr hur ofta varje kategori dyker upp i de slumpade notiserna.
export const RANDOM_POOL = [
  { list: LOVE, weight: 4 },
  { list: PEP, weight: 3 },
  { list: BUS, weight: 2 },
  { list: FANIGT, weight: 2 }
];

/* ---------------------------------------------------------
   Märkesdagar

   dayMessages skickas på själva dagen, leadMessages i förväg.
   {när} byts ut mot "imorgon" eller "om 3 dagar". {När} ger stor bokstav.
   --------------------------------------------------------- */
export const SPECIAL_DAYS = [
  {
    id: "brollopsdag",
    month: 9,
    day: 7,
    leadDays: [7, 3, 1],
    dayMessages: [
      "Idag är det er bröllopsdag! 💍 Grattis, älskling. Tack för varje år.",
      "Bröllopsdag idag! 🥂 Du gifte dig med henne och hon skulle göra om det direkt.",
      "Grattis på bröllopsdagen, herr tacos! Idag är ni två det finaste som finns. 💕"
    ],
    leadMessages: [
      "Psst, er bröllopsdag är {när}. Du har hört det här först. 💍",
      "{När} är det bröllopsdag, älskling. Blommor finns i affären. 💐",
      "Räkna med mig: bröllopsdagen är {när}. Hinner du fixa något? 😌"
    ]
  },
  {
    id: "hjartans",
    month: 2,
    day: 14,
    leadDays: [3, 1],
    dayMessages: [
      "Alla hjärtans dag! ❤️ Din fru är kär i dig, bara så du vet.",
      "Glad alla hjärtans dag, äcklis. Krama henne extra idag. 💘",
      "Hjärtans dag idag! Säg något fint till henne, det är hela uppgiften. 💌"
    ],
    leadMessages: [
      "Alla hjärtans dag är {när}, gullis. Bara en vänlig tvättbjörn som viskar. ❤️",
      "{När} är det alla hjärtans dag. Choklad? Blommor? Du bestämmer. 🍫"
    ]
  },
  {
    id: "kanelbulle",
    month: 10,
    day: 4,
    leadDays: [1],
    dayMessages: [
      "KANELBULLENS DAG! 🥐 Det här är inte en övning, älskling. Skaffa en bulle.",
      "Idag firar vi kanelbullen. Din uppgift: ät en. Gärna två. 🥯☕",
      "Kanelbullens dag! Jag är en tvättbjörn, jag har redan ätit fyra. 🦝🥐"
    ],
    leadMessages: [
      "{När} är det kanelbullens dag. Jäs degen ikväll så är du hjälte. 🥐"
    ]
  }
];

/* ---------------------------------------------------------
   Kvällens hetare hälsning

   En per dygn, på slumpad tid sent på kvällen. Hålls antydande snarare
   än explicit, den kan landa på en låst skärm i ett rum med folk i.
   Ändra fritt, och ta bort hela listan om ni tröttnar.
   --------------------------------------------------------- */
export const SPICY = [
  "Jag tänker på dig, älskling. Och tankarna håller sig inte på mattan. 😏",
  "Kom hem. Jag har planer, och de innefattar inte tv. 🔥",
  "Äcklis. Lås dörren när du kommer upp. 🗝️",
  "Bara så du vet vad som väntar: jag har saknat dig hela dagen. Hela. 😌",
  "Gullis, jag hoppas du inte är för trött ikväll. 🙃",
  "Du har ingen aning om vad du gör med mig bara genom att finnas. 🥵",
  "Herr tacos, ikväll är du min. Inga invändningar godtas. 💋",
  "Snutt, sluta läsa det här och kom och hitta mig. 👀",
  "Jag vill ha dig närmare än vad som egentligen är praktiskt. 😈",
  "Tänkte berätta vad jag tänker på. Sen tänkte jag att jag hellre visar. 🤫",
  "Äcklis, du får en kyss när du kommer in genom dörren. Sen får vi se. 💋",
  "Jag har tänkt på dig i duschen igen. Det var allt jag tänkte säga. 🚿",
  "Gullis, jag är varm och det är inte vädrets fel. 🌡️",
  "Släck lampan lite tidigare ikväll, älskling. 🕯️",
  "Du är olagligt snygg och jag tänker göra något åt det. 🔥",
  "Herr tacos, jag har en idé. Den kräver att vi är ensamma. 😏",
  "Sista tanken innan jag somnar är alltid du. Och den är sällan oskyldig. 😇",
  "Snutt, kom hit. Jag ska viska något. 👂",
  "Jag älskar dig. Och jag vill ha dig. Båda lika mycket just nu. ❤️‍🔥",
  "Imorgon kan vänta. Ikväll finns bara vi två. 🌙"
];
