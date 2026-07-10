# Projekt: Webový editor obrázkov (V1)

> Tento súbor si Claude Code prečíta pri každom spustení. Sú tu pravidlá projektu,
> aby si nezabudol kontext a nerobil rozhodnutia, ktoré nechceme.

## Čo staviame

Jednoduchý **webový editor obrázkov**, ktorý beží celý v prehliadači.
Tok práce: nahraj obrázok → odstráň/vyčisti pozadie → doretušuj → orež na presný
rozmer → exportuj (a pri logách voliteľne vektorizuj do SVG).

Toto je **V1 — zámerne jednoduchá prvá verzia.** Organizácia knižníc referencií
a generovanie cez API sú mimo rozsah, neriešime ich teraz.

Kompletný plán je v súbore `plan_image_editor_v1.md` — ber ho ako zdroj pravdy.

## Tech stack

- **Astro** (najnovšia verzia) ako škrupina appky
- **React** ako „ostrov" (island) — celý editor je jeden React komponent s `client:only`
- **Tailwind v4** na štýlovanie — cez `@tailwindcss/vite` plugin
  (NIE cez starý `@astrojs/tailwind`, ten je zastaraný)
- **Konva** (`konva` + `react-konva`) na plátno: zoom, posun, orezový rám, vrstvy
- Pixelové operácie (guma, color-to-alpha, kvapkadlo) sa robia na surovom
  canvas cez `ImageData`, nie cez Konva objekty

## Tvrdé pravidlá (neporušovať)

- **Všetko client-side.** Žiadny server, žiadna databáza, žiadne účty vo V1.
- **Súbory nikdy neopúšťajú prehliadač.** Žiadne posielanie obrázkov na cudzie
  servery. Súkromie je funkcia, nie detail.
- Appka sa nasadzuje na **Vercel** ako statické súbory. Tam treba nastaviť
  COOP/COEP hlavičky cez `vercel.json` (viď Známe pasce). **GitHub Pages
  nepoužívať** — nevie nastaviť tie hlavičky, odstránenie pozadia by tam
  nefungovalo. (Kód zostáva na GitHube, Vercel sa naň len napojí.)
- Ťažké operácie (odstránenie pozadia, vektorizácia) bežia vo **Web Workeri**,
  aby nezamrzlo UI.

## Známe pasce (skontroluj, kým sa v nich nezasekneme)

- **Odstránenie pozadia (`@imgly/background-removal`):**
  - Potrebuje peer-dependency `onnxruntime-web`.
  - Vyžaduje `SharedArrayBuffer` → treba nastaviť dve HTTP hlavičky:
    `Cross-Origin-Opener-Policy: same-origin` a
    `Cross-Origin-Embedder-Policy: require-corp` — v dev serveri (astro.config)
    aj pri nasadení (na Vercel cez `vercel.json`). Bez nich to je pomalé
    alebo nefunguje.
  - Model (desiatky MB) sa sťahuje pri prvom použití → treba progress indikátor.
  - Licencia je **AGPL.** Pre osobné/interné použitie OK. Kým to zostáva
    open-source, netrápi nás. Ak by sme chceli uzavretý komerčný produkt,
    UPOZORNI ma vopred — AGPL by nútila zverejniť zdrojový kód.
- **Vektorizácia:** plain `potrace` vie len čiernobielo (1-bit). Pre farebné
  logá s presnou paletou použi `imagetracerjs` (čistý JS, vie viacfarebnú
  vektorizáciu + posterizáciu) alebo `wasm-vtracer`. Sedí to na požiadavku
  „zamknutej brand palety".
- **HEIC z iPhonu:** konvertuj cez `heic2any` PRED nahodením na plátno a
  rešpektuj EXIF orientáciu (inak sa obrázok otočí nabok).
- **Kvalitný resize pri exporte:** použi `pica`, nie len natiahnutie canvasu
  (inak sú zmenšené obrázky rozpixelované).

## Ako so mnou pracovať (dôležité — som začiatočníčka)

- **Vždy vysvetľuj po slovensky** jednoduchými slovami, čo ideš spraviť a prečo.
- **Nič neinštaluj bez toho, aby si mi najprv povedal, čo to je a načo to treba.**
- Rob **malé kroky.** Radšej jeden malý funkčný kúsok, ktorý si overíme, než veľká
  zmena naraz. Kroky sú rozpísané v `TODO.md`.
- Po dokončení kroku mi **povedz, ako si výsledok overím** v prehliadači.
- Keď sa treba rozhodnúť medzi možnosťami, **spýtaj sa ma** a ponúkni odporúčanie
  s krátkym dôvodom — nerozhoduj potichu za mňa.
- Keď narazíš na niečo z „Známych pascí" vyššie, spomeň to skôr, než to spôsobí
  problém.
