# TODO — Editor obrázkov

Kroky idú v logickom poradí. **Každá odškrtnutá skupina = jeden commit na Git.**
Nerob viac naraz — sprav skupinu, over v prehliadači, commitni, pokračuj.

Ako commitovať je popísané dole v sekcii **„Git — ťahák pre začiatočníkov"**.

---

## Fáza 0 — Príprava projektu

- [x] Založiť Astro projekt s Reactom a Tailwindom, rozbehnúť prázdnu stránku
- [x] Vytvoriť prázdny React komponent `Editor` (`client:only`) na hlavnej stránke
- [x] Nastaviť Git a spraviť prvý push na GitHub *(nižšie je návod)*
- [x] Skopírovať `CLAUDE.md` a `plan_image_editor_v1.md` do priečinka projektu

➡️ **Commit:** `init: prázdny Astro projekt s Reactom a Tailwindom`

## Fáza 1 — Plátno + import

- [x] Plátno cez Konva so zoomom a posunom (pan)
- [x] Priehľadnostná šachovnica na pozadí (aby bolo vidno priehľadné časti)
- [x] Nahratie obrázka na plátno (PNG, JPG, WebP, GIF, BMP)
- [x] Import HEIC z iPhonu (cez `heic2any`, so správnou orientáciou)
- [x] Import SVG (rasterizácia — appka sa opýta na veľkosť)
- [x] Undo / redo história

➡️ **Commit:** `fáza 1: plátno, import obrázkov, undo/redo`

## Fáza 2 — Retušovacie nástroje

- [x] Kvapkadlo (výber farby priamo z obrázka)
- [x] Guma s nastaviteľnou veľkosťou
- [x] Tolerančný režim gumy (maže len farbu, na ktorú klikneš, nezasahuje okolie)
- [x] Ceruzka na dokreslenie (výber farby a veľkosti)
- [x] Farebná paleta + presné zadanie hex kódu
- [x] Náhľad pred/po (rýchle prepnutie originál ↔ upravené)

➡️ **Commit:** `fáza 2: guma, ceruzka, kvapkadlo, paleta, náhľad pred/po`

## Fáza 3 — Odstránenie pozadia

- [x] AI odstránenie pozadia (`@imgly/background-removal`) + progress indikátor
- [x] Nastaviť COOP/COEP hlavičky (nutné pre AI krok — viď CLAUDE.md)
- [x] Presunúť AI operáciu do Web Workera (nech nezamrzne UI — cez `proxyToWorker`)
- [ ] Odstránenie podľa farby (color-to-alpha): kvapkadlo + tolerančný slider,
      plynulý prechod alfa na hranách

➡️ **Commit:** `fáza 3: automatické aj farebné odstránenie pozadia`

## Fáza 4 — Orezanie + export

- [ ] Orezanie: voľné aj s uzamknutým pomerom (1:1, 16:9, vlastný)
- [ ] Presné zadanie výstupnej veľkosti v pixeloch
- [ ] Export do PNG (s priehľadnosťou), JPG, WebP
- [ ] Kvalitný resize pri exporte (cez `pica`)
- [ ] Dávkový export — jeden obrázok vo viacerých veľkostiach naraz

➡️ **Commit:** `fáza 4: orezanie a export s presným rozmerom`

## Fáza 5 — Vektorizácia (najkomplexnejšia, na koniec)

- [ ] Posterizácia — slider na počet farieb
- [ ] Vlastná/zamknutá paleta — priradenie každej plochy k najbližšiemu hex kódu
      zo zadaného zoznamu
- [ ] Vektorizácia → export SVG (cez `imagetracerjs`)
- [ ] Porovnať kvalitu výsledku oproti Photopea → Image → Vectorize Bitmap

➡️ **Commit:** `fáza 5: vektorizácia, posterizácia, vlastná paleta`

---

## Git — ťahák pre začiatočníkov

Git = história tvojho projektu. Každý commit je „uložená pozícia", ku ktorej sa
vieš vrátiť. GitHub = kópia tej histórie na internete (záloha + zdieľanie).

**Než začneš (jednorazovo):**
1. Nainštaluj Git z `git-scm.com` (Windows: preklikaj inštaláciu).
2. Založ si účet na `github.com`.
3. Vytvor na GitHube nový **prázdny** repozitár (bez README).

**Najjednoduchší spôsob — nechaj to na Claude Code.** Keď dokončíš skupinu, napíš:

> *„Commitni tento krok s vhodnou správou a pushni na GitHub."*

Claude Code to spraví za teba. Toto je úplne v poriadku, kým sa učíš.

**Ak sa to chceš naučiť ručne** (v termináli VS Code, `Ctrl+ö` alebo `Ctrl+~`):
```bash
git add .                          # priprav všetky zmeny
git commit -m "sem správa commitu" # ulož pozíciu
git push                           # pošli na GitHub
```

**Alebo klikaním** — vo VS Code je vľavo ikona **Source Control** (vetvička).
Tam napíšeš správu, klikneš ✓ Commit a potom „Sync/Push". Žiadne príkazy.

> Tip: prvé prepojenie projektu s GitHubom je jediný trošku otravný krok. Keď sa
> k nemu dostaneš (Fáza 0), skopíruj mi sem, čo ti Claude Code alebo GitHub píše,
> a prevediem ťa tým.
