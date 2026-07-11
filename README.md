# Editor obrázkov

Jednoduchý webový editor obrázkov, ktorý beží **celý v prehliadači** —
súbory nikdy neopúšťajú tvoj počítač.

**▶ Vyskúšaj naživo: https://image-editor-tau-one.vercel.app/**

## Čo vie

- **Import:** PNG, JPG, WebP, GIF, BMP, HEIC (fotky z iPhonu) aj SVG
- **Odstránenie pozadia:** AI (lokálne v prehliadači) alebo podľa farby
  (color-to-alpha s toleranciou)
- **Retuš:** guma (aj tolerančná — maže len zvolenú farbu), ceruzka,
  kvapkadlo, paleta s presným hex vstupom
- **Orez** s voľným aj zamknutým pomerom strán
- **Export:** PNG / JPG / WebP, presný rozmer v pixeloch, kvalitný resize,
  dávkový export viacerých veľkostí naraz
- **Vektorizácia** do SVG s posterizáciou a zamknutou brand paletou
- Undo/redo, náhľad pred/po, zoom a posun plátna

Návod na používanie: [NAVOD.md](NAVOD.md)

## Tech stack

Astro + React (jeden ostrov) + Tailwind v4 + Konva. Pixelové operácie cez
`ImageData`. AI odstránenie pozadia: `@imgly/background-removal` (AGPL)
vo Web Workeri — vyžaduje COOP/COEP hlavičky (`vercel.json`,
`astro.config.mjs`). HEIC: `heic2any` · resize: `pica` ·
vektorizácia: `imagetracerjs`.

## Vývoj

```sh
npm install       # závislosti
npm run dev       # dev server na localhost:4321
npm run build     # produkčný build do ./dist/
```

Nasadzuje sa automaticky na Vercel pri každom pushi na `main`.
