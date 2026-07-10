# Vlastný image editor – plán V1

Cieľ: jeden nástroj namiesto prepínania medzi viacerými webmi. Toto je zámerne **jednoduchšia, prvá verzia** – organizácia knižníc referencií a API integrácie na generovanie (pôvodný širší nápad) nechávame na neskôr.

## 1. Rozsah V1

Appka rieši: nahraj obrázok → odstráň/vyčisti pozadie → doretušuj → orež na presný rozmer → exportuj (prípadne vektorizuj, ak ide o logo).

## 2. Funkcie

### Import
- Upload PNG/JPG/WebP/GIF/BMP – natívne
- **HEIC (z iPhonu)** – konverzia cez WASM knižnicu (napr. heic2any) pred nahodením na plátno, s rešpektovaním EXIF orientácie
- **SVG na vstupe** – rasterizácia na plátno pri zvolenom rozlíšení (keďže SVG nemá pevné pixely, appka sa pri vstupe opýta/navrhne veľkosť)

### Plátno
- Zoom, posun (pan), priehľadnostná šachovnica na zobrazenie transparentných častí appky
- Undo/redo história (kľúčové pri ručnom čistení)
- Náhľad pred/po (rýchle prepnutie medzi pôvodným a upraveným)

### Odstránenie pozadia
- **Automatické** – AI model bežiaci lokálne v prehliadači (napr. cez `@imgly/background-removal`, žiadne posielanie na server)
- **Odstránenie podľa farby (globálne, "Color to Alpha")** – tretí režim popri AI a ručnej gume. Vyberieš farbu (napr. kvapkadlom), nastavíš toleranciu sliderom (0 = len presne tá farba), a algoritmus prejde **celý obrázok** naraz – spraví priehľadným každý pixel v rámci tolerancie, bez ohľadu na to, či ide o vonkajšie pozadie alebo súvislú plochu vo vnútri objektu (napr. biela diera vo vnútri loga). Ideálne pre logá a ploché grafiky s jednoliatymi farbami – rýchlejšie než AI aj ručné čistenie. Pri nízkej tolerancii (blízko 0) na JPG alebo anti-aliasovaných hranách môžu zostať tenké svetlé obrysy – appka by mala pri hraniciach robiť plynulý prechod alfa hodnoty namiesto tvrdého rezu.
- **Ručný cleanup po AI/farebnom kroku:**
  - Guma s nastaviteľnou veľkosťou – s možnosťou farebno-tolerančného režimu (drží sa len farby, na ktorú klikneš, nezasahuje okolie – ako pri Clipping Magic)
  - Kvapkadlo (color picker) na výber farby priamo z obrázka
  - Ceruzka na dokreslenie zmiznutých častí, s výberom farby a veľkosti
  - Farebná paleta + presné zadanie hex kódu

### Orezanie / rozmer
- Voľné orezanie aj s uzamknutým pomerom strán (1:1, 16:9, vlastný pomer)
- Presné zadanie výstupnej veľkosti v pixeloch

### Export
- Formáty: PNG (s priehľadnosťou), JPG, WebP
- Presná veľkosť v pixeloch pri exporte (kvalitný resize algoritmus, nie len natiahnutie plátna)
- Dávkový export – rovnaký obrázok vo viacerých veľkostiach naraz

### Vektorizácia (pre logá)
- Krok "Zjednodušiť pred vektorizáciou" (voliteľný prepínač):
  - Slider na počet farieb (posterizácia/kvantizácia)
  - **Vlastná/zamknutá paleta** – zadáš presné brand hex kódy, algoritmus priradí každú plochu k najbližšej hodnote z tvojho zoznamu namiesto automaticky vypočítaných farieb → hex sedí presne aj po vektorizácii
- Samotná vektorizácia (potrace-based) → export SVG
- **Referenčný benchmark:** Photopea má zabudovanú funkciu Image → Vectorize Bitmap (rastr→vektor s nastaviteľným počtom farieb a redukciou šumu, export SVG/PDF). Počas vývoja vlastnej vektorizácie sa oplatí porovnávať výsledky oproti nej – je to overený, dobre fungujúci referenčný bod, na ktorý sa dá zacieliť kvalitou.

## 3. Technická architektúra

- **Platforma:** webová appka (nie desktop) – jednoduchšie nasadenie, netreba inštaláciu, funguje kdekoľvek
- **Frontend:** Astro alebo Next.js + Tailwind (stack, ktorý už poznáš) + canvas knižnica (Fabric.js alebo Konva.js) na kreslenie/gumu/ceruzku
- **Background removal:** klientská WASM knižnica – beží v prehliadači, netreba server ani API kľúče
- **HEIC konverzia:** klientská WASM knižnica (heic2any alebo podobná)
- **SVG rasterizácia:** natívne cez `Image()` + `drawImage` do canvasu
- **Resize/export kvalita:** knižnica na kvalitný downscaling (napr. pica.js), aby zmenšené obrázky neboli rozpixelované
- **Vektorizácia:** potrace (alebo JS wrapper naň) na strane klienta alebo cez malú serverless funkciu, ak by bol klientský výkon nedostatočný
- **Farebná kvantizácia s vlastnou paletou:** vlastná logika – pre každý pixel/plochu nájsť najbližšiu farbu z definovaného zoznamu hex kódov (jednoduchý „nearest color" algoritmus)
- Netreba databázu ani účty na V1 – appka môže bežať čisto client-side, žiadne ukladanie na server (súbory zostávajú len v appke, kým ich nestiahneš)

## 4. Odporúčané poradie budovania

1. Plátno + import (vrátane HEIC/SVG) + zoom/pan + undo-redo
2. Guma, ceruzka, kvapkadlo, paleta + hex vstup (retušovacie nástroje)
3. Automatické odstránenie pozadia (AI krok) + odstránenie podľa farby (globálne) napojené na plátno
4. Orezanie + export s presným rozmerom a formátmi
5. Vektorizácia + posterizácia + vlastná paleta (najkomplexnejšia časť, na koniec)

## 5. Otvorené otázky do budúcna

- Zostáva appka čisto lokálna (client-side, nič sa neukladá), alebo časom pribudne ukladanie projektov/histórie na server?
- Používaš to len ty, alebo má appka časom slúžiť aj niekomu ďalšiemu (nephew, tím)?
