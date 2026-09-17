# Mrs Raccoon 🦝

Egen liten app till Emil: dagens uppgifter och kärleks- och peppnotiser
som slumpas ut över dygnet. Helt fristående, ingen koppling till någon
annan app.

* `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.json` är själva appen
* `cloudflare-worker/` är push-servern som skickar notiserna

## Uppgifterna

Ligger i listan `TASKS` högst upp i `app.js`. Lägg till, ta bort eller
skriv om fritt. Varje uppgift behöver ett unikt id, en emoji och en text.
`everyDays: 3` gör uppgiften rullande var tredje dag räknat från senaste
avbockningen.

1. Gör något tråkigt som du inte vill göra
2. Unna dig något gott
3. Skicka ett gulligt meddelande till din fru
4. Tänk på din fru!
5. Sortera och lägg in en tvätt
6. Kör en maskin tvätt
7. Dammsug ett rum
8. Plocka undan på nedanvåningen
9. Städa nåt!
10. Ta en runda i trädgården
11. Spring en runda (rullande var tredje dag)

## Notiserna

Fem slumpade tider per dygn, minst 45 minuter isär, alltid mellan
**06.15 och 23.45**. Helt tyst mellan 23.45 och 06.15. Samma meddelande
återkommer inte förrän 25 notiser senare. Om en uppgift fortfarande är
ogjord blir en notis ibland en knuff om just den i stället för ren pepp.

Texterna ligger i `cloudflare-worker/src/messages.js`, uppdelade i kärlek,
pepp, bus, fånigt och en hög per uppgift. Antal notiser per dygn ändras
med `PUSHES_PER_DAY` i `cloudflare-worker/src/worker.js`, och tysta
perioden med `WINDOW_START_MIN` och `WINDOW_END_MIN` i samma fil.

## Sätta upp push första gången

Allt görs i mappen `cloudflare-worker`:

```bash
cd cloudflare-worker
npm install

# 1. Skapa lagringen och klistra in id:t i wrangler.toml
npx wrangler kv namespace create PUSH_KV

# 2. Skapa nycklarna och lägg upp dem, allt i ett steg
npm run keys

# 3. Deploya
npm run deploy
```

Wrangler skriver ut workerns adress. Den står redan i `app.js` som
`PUSH_WORKER_URL`, byt bara om du deployar under ett annat namn. Den
publika VAPID-nyckeln behöver du inte klistra in någonstans, appen hämtar
den från workern via `/vapid`.

## Installera på telefonen

1. Öppna appens adress i webbläsaren.
2. **iPhone**: dela-knappen, "Lägg till på hemskärmen". Notiser fungerar
   bara när appen startas från hemskärmen.
   **Android**: menyn, "Installera app".
3. Tryck på 🔔 i appen och godkänn notiser.

## Tvättbjörnen

Bilderna ligger i `raccoons/` och är utklippta ur de tre arken
`tvättbjörnar 1-3.svg`. De är grupperade efter humör i listan `POSES`
högst upp i `app.js`:

| Läge | När den visas |
| --- | --- |
| `idle` | vanligt vardagsläge |
| `sleep` | efter 21 och före 07 |
| `run` | när löprundan är aktuell och inte avbockad |
| `work` | när hemmasysslor är kvar efter 17 |
| `happy` | när han klappar tvättbjörnen |
| `cheer` | när dagens lista är klar |

Vill du byta ut en pose lägger du in en ny bild i `raccoons/` och skriver
in filnamnet (utan ändelse) i rätt lista.

## Panelvyn

`/panel` visar de senaste 60 dagarna, en rad per dag och en kolumn per
uppgift. Klicka i en ruta för att rätta en bock, rättningen markeras med
en orange prick och skrivs inte över när telefonen synkar igen.

Vill du skydda sidan med en nyckel:

```bash
npx wrangler secret put PANEL_KEY
```

Sedan öppnar du `/panel?key=DIN_NYCKEL`. Utan den hemligheten är sidan
öppen för den som kan adressen.

## Adresser i workern

| Adress | Vad den gör |
| --- | --- |
| `/panel` | Panelvy: en rad per dag, klicka i en ruta för att rätta |
| `/admin/status` | Visar om notiser är påslagna och dagens lottade tider |
| `/admin/send-test` | Skickar en testnotis direkt |
| `/admin/send?text=Hej` | Skickar ett eget meddelande på direkten |
| `/admin/reroll` | Lottar om dagens tider |
