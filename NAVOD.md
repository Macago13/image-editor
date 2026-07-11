# Návod na používanie — Editor obrázkov

Jednoduchý editor obrázkov, ktorý beží celý v prehliadači. Tvoje obrázky
**nikdy neopúšťajú tvoj počítač** — nič sa nikam nenahráva.

> Návod dopĺňame priebežne — popisuje len to, čo už je hotové.

## Otvorenie obrázka

Klikni hore na zelené tlačidlo **Otvoriť obrázok** a vyber súbor zo svojho
počítača. Podporované formáty: **PNG, JPG, WebP, GIF, BMP** a aj **HEIC**
(fotky z iPhonu) — tie sa najprv automaticky skonvertujú, chvíľku to potrvá
a na tlačidle svieti „Konvertujem…".

Obrázok sa zobrazí v strede plátna, prispôsobený veľkosti okna. Nič sa
nikam nenahráva — súbor zostáva len v tvojom prehliadači.

### Vloženie SVG (logá)

Otvoriť môžeš aj **SVG**. Keďže SVG nemá pevnú veľkosť v pixeloch, appka sa
ťa najprv opýta, **v akej šírke** ho má vykresliť (výšku dopočíta sama).
Predvyplní rozumný návrh — pre logá pokojne zvoľ viac, zmenšiť sa dá vždy,
ale zväčšovanie už kvalite nepomôže.

## Nástroje

V hlavičke je prepínač nástrojov. Aktívny nástroj svieti nazeleno.

### ✋ Posun

Základný režim — ťahaním myši posúvaš plátno (viď „Plátno" nižšie).

### 💧 Kvapkadlo

Vyberie farbu priamo z obrázka. Zapni kvapkadlo, klikni na miesto
v obrázku — a farba toho pixelu sa objaví vo štvorčeku v hlavičke aj
s presným kódom (napr. `#34d399`). Túto farbu neskôr použijú ďalšie
nástroje (ceruzka, odstránenie podľa farby).

Tip: keď potrebuješ trafiť presný pixel, najprv si miesto priblíž
kolieskom myši.

### 🧽 Guma

Vymaže časť obrázka do priehľadna — kade potiahneš, tam zostane
šachovnica (= nič). Veľkosť gumy nastavíš posuvníkom v hlavičke;
krúžok pri kurzore presne ukazuje, čo guma zasiahne.

Každý ťah gumou je jeden krok histórie — **Ctrl + Z** ho vráti celý
naraz.

Tip: na jemné dočisťovanie okrajov si obrázok najprv priblíž a nastav
malú gumu.

**Režim „Len podobná farba"** — zaškrtni políčko v hlavičke a guma
začne mazať len farbu, na ktorej si **začal ťah** (napr. biele pozadie),
ostatné farby nechá tak. Môžeš tak smelo prejsť gumou aj cez okraj loga.
Posuvník **Tolerancia** určuje, aké odtiene sa ešte počítajú ako „tá istá
farba": 0 = len úplne presná farba, väčšie číslo = aj podobné odtiene.
Začni okolo 30 a dolaď podľa výsledku (Ctrl + Z je kamarát).

### 🎨 Výber farby

Štvorček s farbou v hlavičke sa dá **rozkliknúť**. V paneli nájdeš:

- **paletu** základných farieb — stačí kliknúť,
- **Hex kód** — napíš presný kód farby (napr. `#ff6600` alebo len
  `ff6600`) a stlač Enter; hodí sa, keď máš presné firemné farby,
- **Iná farba** — otvorí dúhový výber, kde farbu namiešaš myšou.

Panel zavrieš kliknutím kamkoľvek mimo neho. A samozrejme stále platí,
že farbu vieš nasať aj kvapkadlom priamo z obrázka.

### ✏️ Ceruzka

Dokreslí, čo chýba — kreslí **aktuálnou farbou** (tá vo štvorčeku
v hlavičke). Veľkosť stopy má vlastný posuvník, nezávislý od gumy.

Typický postup: kvapkadlom klikni na farbu v obrázku, ktorú chceš
doplniť, prepni na ceruzku a dokresli. Krúžok pri kurzore ukazuje
stopu aj farbu, ktorou budeš kresliť.

## ✨ Odstránenie pozadia

Otvor obrázok a klikni na fialové tlačidlo **Odstrániť pozadie**. AI nájde
hlavný objekt (osobu, produkt, zviera…) a pozadie spraví priehľadným —
uvidíš cez neho šachovnicu.

Dobré vedieť:

- **Pri úplne prvom použití** sa sťahuje AI model (niekoľko desiatok MB) —
  panel ukazuje priebeh. Ďalšie použitia sú už rýchle, model zostáva
  uložený v prehliadači.
- Samotná fotka **nikam neodchádza** — celý výpočet beží v tvojom
  prehliadači, do internetu sa sťahuje len model.
- Výsledok je bežný krok histórie: **Ctrl + Z** ho vráti, **👁 Pred/Po**
  ho porovná s originálom.
- Okraje potom doladíš gumou (na zvyšky pozadia) alebo ceruzkou
  (na omylom zmazané časti).

## Porovnanie pred/po

Chceš skontrolovať, čo všetko si zmenil? **Podrž** tlačidlo **👁 Pred/Po**
vpravo hore (alebo klávesu **P**) — plátno ukáže pôvodný obrázok tak, ako
si ho otvoril, a hore svieti štítok „Pôvodný obrázok". Pusti — a si späť
v upravenej verzii. Nič sa tým nemení, je to len rýchly pohľad.

## Krok späť a znova

Pomýlil/a si sa? Vpravo hore sú tlačidlá **↶ Späť** a **↷ Znova**, alebo
použi klávesy:

- **Ctrl + Z** — krok späť,
- **Ctrl + Y** (alebo Ctrl + Shift + Z) — krok znova dopredu.

Appka si pamätá posledných 30 krokov.

## Plátno

Po otvorení appky vidíš plátno so **sivo-bielou šachovnicou**. Šachovnica
znamená „tu nič nie je" — keď na nej neskôr bude obrázok s priehľadným
pozadím, cez priehľadné miesta bude šachovnicu vidno.

### Posúvanie (pan)

Chyť plátno myšou (stlač ľavé tlačidlo a ťahaj) — celé sa posúva.

### Priblíženie (zoom)

Toč kolieskom myši:

- **od seba** = priblíženie,
- **k sebe** = oddialenie.

Zoom mieri tam, kam ukazuje kurzor — keď chceš zväčšiť konkrétny detail,
namier naň myšou a zatoč kolieskom.

---

*Ďalšie funkcie (nahratie obrázka, guma, odstránenie pozadia, export…)
pribudnú v ďalších verziách a návod sa doplní.*
