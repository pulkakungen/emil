# Tvättis 🦝

Liten app till Emil: fem uppgifter om dagen och kärleks- och peppnotiser
som slumpas ut över dygnet.

Själva appen ligger här i roten. Push-servern (Cloudflare worker) delas med
Sassibrass och ligger kvar i repot `pulkakungen/Sassibrass`, i mappen
`cloudflare-worker`. Allt som rör tvättbjörnen ligger där under `/rc/`.

## Så funkar det

* **Uppgifter** (i `app.js`, listan `TASKS`):
  * Gör något tråkigt som du inte vill göra (varje dag)
  * Unna dig något gott (varje dag)
  * Skicka ett gulligt meddelande till din fru (varje dag)
  * Tänk på din fru! (varje dag)
  * Spring en runda (rullande var tredje dag, räknas från senaste avbockning)
* **Notiser**: 5 slumpade tider per dygn, alltid mellan **06.15 och 23.45**.
  Tyst mellan 23.45 och 06.15.
* Notiserna är mest ren kärlek och pepp, men blir ibland en knuff om en
  uppgift fortfarande är ogjord (appen synkar status till servern).
* Klapp på tvättbjörnen ger en slumpad kärlekshälsning i pratbubblan.
* Streak räknas upp varje dag där allt på listan blev avbockat.

## Byta ut tvättbjörnen

Lägg din egen SVG som `raccoon.svg` (samma filnamn) så byts
bilden automatiskt. Ikonerna i `icons/` är enkla platshållare
och kan bytas mot riktiga PNG:er på 192x192 och 512x512.

## Ändra meddelanden

Alla notistexter ligger i `cloudflare-worker/src/raccoon-messages.js` (i Sassibrass-repot),
uppdelade i kärlek, pepp, bus, fånigt och knuffar per uppgift. Ändra fritt
och deploya sedan om workern:

```bash
cd cloudflare-worker
npm install
npm run deploy
```

Antal notiser per dygn ändras med `PUSHES_PER_DAY` i
`cloudflare-worker/src/raccoon.js`. Tysta perioden styrs av
`WINDOW_START_MIN` och `WINDOW_END_MIN` i samma fil.

## Adresser i workern

Samma worker som Sassibrass, allt för tvättbjörnen ligger under `/rc/`:

| Adress | Vad den gör |
| --- | --- |
| `/rc/admin/status` | Visar om notiser är påslagna och dagens lottade tider |
| `/rc/admin/send-test` | Skickar en testnotis direkt |
| `/rc/admin/send?text=Hej` | Skickar ett eget meddelande på direkten |
| `/rc/admin/reroll` | Lottar om dagens tider |

## Installera på hans telefon

1. Öppna appens adress i webbläsaren.
2. **iPhone**: dela-knappen, "Lägg till på hemskärmen". Notiser fungerar
   bara när appen startas från hemskärmen.
   **Android**: menyn, "Installera app".
3. Tryck på 🔔 i appen och godkänn notiser.
