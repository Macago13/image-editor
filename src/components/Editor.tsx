import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import {
	Stage,
	Layer,
	Image as KonvaImage,
	Text,
	Circle,
	Rect,
	Transformer,
} from 'react-konva';
import type Konva from 'konva';

// Šachovnica cez CSS gradient — signalizuje priehľadné časti plátna.
const sachovnica: CSSProperties = {
	backgroundImage: 'repeating-conic-gradient(#cbd5e1 0% 25%, #f1f5f9 0% 50%)',
	backgroundSize: '20px 20px',
};

const ZOOM_KROK = 1.1;

// Obrázok na plátne môže byť aj canvas (výsledok rasterizácie SVG).
type Vykreslitelne = HTMLImageElement | HTMLCanvasElement;

// Natívne formáty + HEIC (konvertujeme cez heic2any) + SVG (rasterizujeme).
// Prípony sú v zozname aj samostatne — Windows im často nedáva MIME typ.
const PODPOROVANE_FORMATY =
	'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,.svg,image/heic,image/heif,.heic,.heif';

const jeHeic = (subor: File) =>
	subor.type === 'image/heic' ||
	subor.type === 'image/heif' ||
	/\.hei[cf]$/i.test(subor.name);

const jeSvg = (subor: File) =>
	subor.type === 'image/svg+xml' || /\.svg$/i.test(subor.name);

// Prečíta zo SVG jeho prirodzenú šírku a pomer strán (šírka / výška).
// Skúša atribúty width/height, potom viewBox; keď nič, predpokladá štvorec.
function rozmerySvg(text: string): { sirka: number; pomer: number } {
	const svg = new DOMParser()
		.parseFromString(text, 'image/svg+xml')
		.querySelector('svg');
	const w = parseFloat(svg?.getAttribute('width') ?? '');
	const h = parseFloat(svg?.getAttribute('height') ?? '');
	if (w > 0 && h > 0) return { sirka: Math.round(w), pomer: w / h };

	const viewBox = svg?.getAttribute('viewBox')?.trim().split(/[\s,]+/);
	if (viewBox?.length === 4) {
		const vw = parseFloat(viewBox[2]);
		const vh = parseFloat(viewBox[3]);
		if (vw > 0 && vh > 0) return { sirka: Math.round(vw), pomer: vw / vh };
	}
	return { sirka: 1024, pomer: 1 };
}

// SVG čakajúce v dialógu na výber rozlíšenia.
type CakajuceSvg = { subor: File; pomer: number };

const MIN_SIRKA = 8;
const MAX_SIRKA = 8192; // bezpečný limit veľkosti canvasu v prehliadačoch

// Koľko krokov späť si pamätáme — každý stav drží celý obrázok v pamäti.
const MAX_HISTORIA = 30;

type Nastroj = 'posun' | 'kvapkadlo' | 'guma' | 'ceruzka' | 'orez';

type Bod = { x: number; y: number };
type Ram = { x: number; y: number; width: number; height: number };

// Predvolené pomery strán orezu; null = voľný.
const POMERY = [
	['volny', 'Voľný'],
	['1:1', '1:1'],
	['4:3', '4:3'],
	['16:9', '16:9'],
	['9:16', '9:16'],
	['vlastny', 'Vlastný'],
] as const;
type PomerVolba = (typeof POMERY)[number][0];

const doHex = (n: number) => n.toString(16).padStart(2, '0');

const hexNaRgb = (hex: string): [number, number, number] => [
	parseInt(hex.slice(1, 3), 16),
	parseInt(hex.slice(3, 5), 16),
	parseInt(hex.slice(5, 7), 16),
];

// Základná paleta — rýchly výber bežných farieb.
const PALETA = [
	'#000000', '#475569', '#94a3b8', '#ffffff',
	'#ef4444', '#f97316', '#facc15', '#22c55e',
	'#10b981', '#06b6d4', '#3b82f6', '#8b5cf6',
	'#ec4899', '#92400e', '#f8fafc', '#0f172a',
];

export default function Editor() {
	const obalRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<Konva.Stage>(null);
	const suborInputRef = useRef<HTMLInputElement>(null);
	const [rozmer, setRozmer] = useState({ width: 0, height: 0 });
	// História stavov plátna: historia[krok] je to, čo práve vidíš.
	const [historia, setHistoria] = useState<Vykreslitelne[]>([]);
	const [krok, setKrok] = useState(-1);
	const obrazok = krok >= 0 ? historia[krok] : null;
	const [konvertujem, setKonvertujem] = useState(false);
	const [cakajuceSvg, setCakajuceSvg] = useState<CakajuceSvg | null>(null);
	const [svgSirka, setSvgSirka] = useState(1024);
	const [nastroj, setNastroj] = useState<Nastroj>('posun');
	const [farba, setFarba] = useState('#000000');
	const [paletaOtvorena, setPaletaOtvorena] = useState(false);
	// Text v hex políčku — do „farba" sa prepíše až po potvrdení platnej hodnoty.
	const [hexVstup, setHexVstup] = useState('#000000');

	// Keď sa farba zmení inde (kvapkadlo, paleta, picker), hex políčko sa zladí.
	useEffect(() => setHexVstup(farba), [farba]);

	// Prijme „#ff6600", „ff6600" aj skrátené „f60"; neplatný vstup vráti späť.
	const potvrdHex = () => {
		let v = hexVstup.trim().replace(/^#/, '');
		if (/^[0-9a-f]{3}$/i.test(v)) v = [...v].map((z) => z + z).join('');
		if (/^[0-9a-f]{6}$/i.test(v)) setFarba(`#${v.toLowerCase()}`);
		else setHexVstup(farba);
	};
	const [gumaVelkost, setGumaVelkost] = useState(40);
	const [ceruzkaVelkost, setCeruzkaVelkost] = useState(12);
	// Tolerančný režim gumy: maže len farbu podobnú tej, na ktorej sa ťah začal.
	const [tolerancna, setTolerancna] = useState(false);
	const [tolerancia, setTolerancia] = useState(30);
	// Počas tolerančného ťahu: pixely pracovnej kópie + vzorová farba zo štartu ťahu.
	const tolerDataRef = useRef<{
		data: ImageData;
		vzor: [number, number, number];
	} | null>(null);
	// Pracovná kópia obrázka počas ťahu gumou; do histórie ide až po pustení myši.
	const [pracovny, setPracovny] = useState<HTMLCanvasElement | null>(null);
	const kreslimRef = useRef(false);
	const poslednyBodRef = useRef<Bod | null>(null);
	// Pozícia kurzora v súradniciach obrázka — na krúžok ukazujúci veľkosť gumy.
	const [kurzor, setKurzor] = useState<Bod | null>(null);
	// Originál na porovnanie pred/po — obrázok tak, ako bol otvorený.
	const [original, setOriginal] = useState<Vykreslitelne | null>(null);
	// Priebeh AI odstraňovania pozadia; null = nebeží.
	const [odstranovanie, setOdstranovanie] = useState<{
		faza: string;
		percenta: number | null;
	} | null>(null);
	// Panel „Odstrániť farbu" (color-to-alpha) a jeho tolerancia.
	const [ctaOtvorene, setCtaOtvorene] = useState(false);
	const [ctaTolerancia, setCtaTolerancia] = useState(30);
	// Exportný dialóg: formát, cieľový rozmer (zviazaný s pomerom strán) a kvalita.
	const [exportOtvoreny, setExportOtvoreny] = useState(false);
	const [expFormat, setExpFormat] = useState<
		'image/png' | 'image/jpeg' | 'image/webp'
	>('image/png');
	const [expRozmer, setExpRozmer] = useState({ w: 0, h: 0 });
	const [expKvalita, setExpKvalita] = useState(90);
	const [exportujem, setExportujem] = useState(false);
	// Orezový rám (v súradniciach obrázka) a zvolený pomer strán.
	const [orez, setOrez] = useState<Ram | null>(null);
	const [pomerVolba, setPomerVolba] = useState<PomerVolba>('volny');
	const [vlastnyPomer, setVlastnyPomer] = useState({ w: 1, h: 1 });
	const orezRectRef = useRef<Konva.Rect>(null);
	const transformerRef = useRef<Konva.Transformer>(null);

	// Číselná hodnota pomeru (šírka / výška); null = voľný.
	const pomer =
		pomerVolba === 'volny'
			? null
			: pomerVolba === 'vlastny'
				? vlastnyPomer.w > 0 && vlastnyPomer.h > 0
					? vlastnyPomer.w / vlastnyPomer.h
					: null
				: (() => {
						const [w, h] = pomerVolba.split(':').map(Number);
						return w / h;
					})();
	const [ukazujemPovodny, setUkazujemPovodny] = useState(false);

	// Na plátne sa zobrazuje: originál (kým držíš Pred/Po), inak pracovná
	// kópia (počas ťahu), inak aktuálny krok histórie.
	const zobrazeny =
		ukazujemPovodny && original ? original : (pracovny ?? obrazok);

	// Guma a ceruzka majú každá svoju veľkosť stopy.
	const kresliaci = nastroj === 'guma' || nastroj === 'ceruzka';
	const velkostStopy = nastroj === 'ceruzka' ? ceruzkaVelkost : gumaVelkost;

	// Neviditeľný canvas s pixelmi aktuálneho obrázka — z neho číta kvapkadlo.
	// Vyrába sa nanovo len pri zmene obrázka, nie pri každom kliku.
	const pixelCtx = useMemo(() => {
		if (!obrazok) return null;
		const c = document.createElement('canvas');
		c.width = obrazok.width;
		c.height = obrazok.height;
		const ctx = c.getContext('2d', { willReadFrequently: true });
		ctx?.drawImage(obrazok, 0, 0);
		return ctx;
	}, [obrazok]);

	// Plátno musí presne vyplniť svoj obal — sledujeme jeho veľkosť
	// aj pri zmene veľkosti okna.
	useEffect(() => {
		const obal = obalRef.current;
		if (!obal) return;
		const prepocitaj = () =>
			setRozmer({ width: obal.clientWidth, height: obal.clientHeight });
		prepocitaj();
		const pozorovatel = new ResizeObserver(prepocitaj);
		pozorovatel.observe(obal);
		return () => pozorovatel.disconnect();
	}, []);

	// Nastaví zoom a pozíciu tak, aby bol celý obrázok v strede plátna
	// s malým okrajom.
	const vycentruj = (img: Vykreslitelne) => {
		const stage = stageRef.current;
		if (!stage) return;
		const mierka = Math.min(
			1,
			(stage.width() * 0.9) / img.width,
			(stage.height() * 0.9) / img.height,
		);
		stage.scale({ x: mierka, y: mierka });
		stage.position({
			x: (stage.width() - img.width * mierka) / 2,
			y: (stage.height() - img.height * mierka) / 2,
		});
	};

	// Pridá nový stav na koniec histórie. Ak sme boli o pár krokov späť,
	// „budúcnosť" za aktuálnym krokom sa zahodí (ako vo Worde).
	const pridajDoHistorie = (novy: Vykreslitelne) => {
		setHistoria((stara) => {
			const orezana = stara.slice(0, krok + 1);
			orezana.push(novy);
			// Pri prekročení limitu zabudneme najstarší stav.
			const nadLimit = orezana.length - MAX_HISTORIA;
			return nadLimit > 0 ? orezana.slice(nadLimit) : orezana;
		});
		setKrok((k) => Math.min(k + 1, MAX_HISTORIA - 1));
	};

	const mozeSpat = krok > 0;
	const mozeZnova = krok < historia.length - 1;
	const spat = () => {
		if (mozeSpat) setKrok(krok - 1);
	};
	const znova = () => {
		if (mozeZnova) setKrok(krok + 1);
	};

	// Klávesové skratky: Ctrl+Z (späť), Ctrl+Y alebo Ctrl+Shift+Z (znova).
	useEffect(() => {
		const naKlavesu = (e: KeyboardEvent) => {
			if (!e.ctrlKey && !e.metaKey) return;
			const k = e.key.toLowerCase();
			if (k === 'z' && e.shiftKey) {
				e.preventDefault();
				znova();
			} else if (k === 'z') {
				e.preventDefault();
				spat();
			} else if (k === 'y') {
				e.preventDefault();
				znova();
			}
		};
		window.addEventListener('keydown', naKlavesu);
		return () => window.removeEventListener('keydown', naKlavesu);
	});

	// Podržanie klávesy P ukazuje pôvodný obrázok (pred/po).
	useEffect(() => {
		const stlacene = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() !== 'p' || e.ctrlKey || e.metaKey || e.altKey) return;
			// Pri písaní do políčka (napr. hex kód) klávesa P nič neprepína.
			if ((e.target as HTMLElement).tagName === 'INPUT') return;
			setUkazujemPovodny(true);
		};
		const pustene = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() === 'p') setUkazujemPovodny(false);
		};
		window.addEventListener('keydown', stlacene);
		window.addEventListener('keyup', pustene);
		return () => {
			window.removeEventListener('keydown', stlacene);
			window.removeEventListener('keyup', pustene);
		};
	}, []);

	// Načíta blob ako <img> element a položí ho na plátno.
	const polozNaPlatno = (zdroj: Blob) => {
		const url = URL.createObjectURL(zdroj);
		const img = new window.Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			pridajDoHistorie(img);
			setOriginal(img);
			vycentruj(img);
		};
		img.src = url;
	};

	const otvorSubor = async (e: ChangeEvent<HTMLInputElement>) => {
		const subor = e.target.files?.[0];
		// Vynulovanie umožní vybrať ten istý súbor znova.
		e.target.value = '';
		if (!subor) return;

		// SVG nejde rovno na plátno — najprv sa v dialógu vyberie rozlíšenie.
		if (jeSvg(subor)) {
			const { sirka, pomer } = rozmerySvg(await subor.text());
			setSvgSirka(Math.min(MAX_SIRKA, Math.max(MIN_SIRKA, sirka)));
			setCakajuceSvg({ subor, pomer });
			return;
		}

		let zdroj: Blob = subor;
		if (jeHeic(subor)) {
			setKonvertujem(true);
			try {
				// Knižnica sa sťahuje až pri prvom HEIC súbore, nie pri štarte appky.
				const heic2any = (await import('heic2any')).default;
				const vysledok = await heic2any({ blob: subor, toType: 'image/png' });
				zdroj = Array.isArray(vysledok) ? vysledok[0] : vysledok;
			} catch (chyba) {
				console.error('HEIC konverzia zlyhala:', chyba);
				alert('Tento HEIC súbor sa nepodarilo skonvertovať.');
				return;
			} finally {
				setKonvertujem(false);
			}
		}

		polozNaPlatno(zdroj);
	};

	// Vykreslí čakajúce SVG do canvasu vo zvolenom rozlíšení (rasterizácia).
	const vlozSvg = () => {
		if (!cakajuceSvg) return;
		const sirka = Math.min(MAX_SIRKA, Math.max(MIN_SIRKA, Math.round(svgSirka)));
		const vyska = Math.max(1, Math.round(sirka / cakajuceSvg.pomer));

		const blob = new Blob([cakajuceSvg.subor], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const img = new window.Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			const canvas = document.createElement('canvas');
			canvas.width = sirka;
			canvas.height = vyska;
			canvas.getContext('2d')?.drawImage(img, 0, 0, sirka, vyska);
			pridajDoHistorie(canvas);
			setOriginal(canvas);
			vycentruj(canvas);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			alert('Toto SVG sa nepodarilo vykresliť.');
		};
		img.src = url;
		setCakajuceSvg(null);
	};

	// Pozícia kurzora prepočítaná do súradníc obrázka
	// (odčíta posun plátna, vydelí zoomom).
	const bodNaObrazku = (): Bod | null => {
		const stage = stageRef.current;
		const poloha = stage?.getPointerPosition();
		if (!stage || !poloha) return null;
		return {
			x: (poloha.x - stage.x()) / stage.scaleX(),
			y: (poloha.y - stage.y()) / stage.scaleY(),
		};
	};

	// Klik kvapkadlom: prečíta farbu pixelu pod kurzorom.
	const priKliknuti = () => {
		if (nastroj !== 'kvapkadlo' || !obrazok || !pixelCtx) return;
		const bod = bodNaObrazku();
		if (!bod) return;
		const x = Math.floor(bod.x);
		const y = Math.floor(bod.y);
		if (x < 0 || y < 0 || x >= obrazok.width || y >= obrazok.height) return;

		const [r, g, b, alfa] = pixelCtx.getImageData(x, y, 1, 1).data;
		if (alfa === 0) return; // priehľadné miesto — nie je z čoho brať farbu
		setFarba(`#${doHex(r)}${doHex(g)}${doHex(b)}`);
	};

	// Nakreslí čiaru z bodu do bodu. Guma „vyrezáva" do priehľadna
	// (destination-out), ceruzka kreslí aktuálnou farbou. Rovnaký bod
	// dvakrát = bodka.
	const kresliSegment = (platno: HTMLCanvasElement, od: Bod, kam: Bod) => {
		const ctx = platno.getContext('2d');
		if (!ctx) return;
		ctx.save();
		if (nastroj === 'guma') {
			ctx.globalCompositeOperation = 'destination-out';
		} else {
			ctx.fillStyle = farba;
			ctx.strokeStyle = farba;
		}
		if (od.x === kam.x && od.y === kam.y) {
			ctx.beginPath();
			ctx.arc(od.x, od.y, velkostStopy / 2, 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.lineWidth = velkostStopy;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.beginPath();
			ctx.moveTo(od.x, od.y);
			ctx.lineTo(kam.x, kam.y);
			ctx.stroke();
		}
		ctx.restore();
	};

	// Tolerančná pečiatka: v kruhu gumy spriehľadní len pixely, ktorých farba
	// je blízko vzoru. Nad prahom tolerancie je ešte pásmo plynulého prechodu,
	// aby na hranách nezostávali tvrdé zúbky.
	const stampTolerancne = (platno: HTMLCanvasElement, stred: Bod) => {
		const info = tolerDataRef.current;
		const ctx = platno.getContext('2d');
		if (!info || !ctx) return;
		const { data } = info;
		const [vr, vg, vb] = info.vzor;
		const polomer = gumaVelkost / 2;
		// Tolerancia 0–100 → vzdialenosť farieb 0–441 (maximum v RGB kocke).
		const prah = (tolerancia / 100) * 441.7;
		const prechod = Math.max(prah * 0.5, 1);

		const x0 = Math.max(0, Math.floor(stred.x - polomer));
		const y0 = Math.max(0, Math.floor(stred.y - polomer));
		const x1 = Math.min(platno.width - 1, Math.ceil(stred.x + polomer));
		const y1 = Math.min(platno.height - 1, Math.ceil(stred.y + polomer));
		if (x1 < x0 || y1 < y0) return;

		for (let y = y0; y <= y1; y++) {
			for (let x = x0; x <= x1; x++) {
				const dx = x + 0.5 - stred.x;
				const dy = y + 0.5 - stred.y;
				if (dx * dx + dy * dy > polomer * polomer) continue;

				const i = (y * platno.width + x) * 4;
				const alfa = data.data[i + 3];
				if (alfa === 0) continue;

				const dr = data.data[i] - vr;
				const dg = data.data[i + 1] - vg;
				const db = data.data[i + 2] - vb;
				const vzdialenost = Math.sqrt(dr * dr + dg * dg + db * db);

				if (vzdialenost <= prah) {
					data.data[i + 3] = 0;
				} else if (vzdialenost <= prah + prechod) {
					// Plynulý prechod: čím bližšie k prahu, tým priehľadnejšie.
					const podiel = (vzdialenost - prah) / prechod;
					data.data[i + 3] = Math.min(alfa, Math.round(alfa * podiel));
				}
			}
		}
		ctx.putImageData(data, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
	};

	// Tolerančný ťah medzi dvoma bodmi = pečiatky husto za sebou.
	const tolerancnySegment = (platno: HTMLCanvasElement, od: Bod, kam: Bod) => {
		const dlzka = Math.hypot(kam.x - od.x, kam.y - od.y);
		const pocet = Math.max(1, Math.ceil(dlzka / Math.max(1, gumaVelkost / 4)));
		for (let k = 1; k <= pocet; k++) {
			const t = k / pocet;
			stampTolerancne(platno, {
				x: od.x + (kam.x - od.x) * t,
				y: od.y + (kam.y - od.y) * t,
			});
		}
	};

	// Stlačenie myši s gumou/ceruzkou: vyrobí pracovnú kópiu a spraví prvú bodku.
	const zacniTah = () => {
		// Počas náhľadu pred/po sa nekreslí — videl by si originál, ale
		// menil upravenú verziu.
		if (!kresliaci || !obrazok || ukazujemPovodny) return;
		const kopia = document.createElement('canvas');
		kopia.width = obrazok.width;
		kopia.height = obrazok.height;
		const ctx = kopia.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;
		ctx.drawImage(obrazok, 0, 0);

		const bod = bodNaObrazku();
		if (nastroj === 'guma' && tolerancna) {
			// Vzorová farba = pixel, na ktorom sa ťah začal. Mimo obrázka
			// alebo na priehľadnom mieste tolerančný ťah nezačne.
			if (!bod) return;
			const x = Math.floor(bod.x);
			const y = Math.floor(bod.y);
			if (x < 0 || y < 0 || x >= kopia.width || y >= kopia.height) return;
			const data = ctx.getImageData(0, 0, kopia.width, kopia.height);
			const i = (y * kopia.width + x) * 4;
			if (data.data[i + 3] === 0) return;
			tolerDataRef.current = {
				data,
				vzor: [data.data[i], data.data[i + 1], data.data[i + 2]],
			};
			stampTolerancne(kopia, bod);
		} else if (bod) {
			kresliSegment(kopia, bod, bod);
		}
		poslednyBodRef.current = bod;
		kreslimRef.current = true;
		setPracovny(kopia);
	};

	// Pohyb myši: posúva krúžok gumy a počas ťahu maže po čiare.
	const priPohybe = () => {
		const bod = bodNaObrazku();
		setKurzor(bod);
		if (!kreslimRef.current || !pracovny || !bod) return;
		if (tolerancna && tolerDataRef.current) {
			tolerancnySegment(pracovny, poslednyBodRef.current ?? bod, bod);
		} else {
			kresliSegment(pracovny, poslednyBodRef.current ?? bod, bod);
		}
		poslednyBodRef.current = bod;
		stageRef.current?.batchDraw();
	};

	// Pustenie myši: hotový ťah sa uloží ako jeden krok histórie.
	const ukonciTah = () => {
		if (!kreslimRef.current) return;
		kreslimRef.current = false;
		poslednyBodRef.current = null;
		tolerDataRef.current = null;
		if (pracovny) {
			pridajDoHistorie(pracovny);
			setPracovny(null);
		}
	};

	// AI odstránenie pozadia. Celé beží v prehliadači: knižnica si pri prvom
	// použití stiahne model (desiatky MB) a výpočet beží vo Web Workeri
	// (proxyToWorker), takže UI nezamrzne. Fotka nikam neodchádza.
	const odstranPozadie = async () => {
		if (!obrazok || odstranovanie) return;
		setOdstranovanie({ faza: 'Pripravujem…', percenta: null });
		try {
			const { removeBackground } = await import('@imgly/background-removal');

			// Aktuálny stav plátna → PNG blob, ktorý knižnica zje.
			const c = document.createElement('canvas');
			c.width = obrazok.width;
			c.height = obrazok.height;
			c.getContext('2d')?.drawImage(obrazok, 0, 0);
			const vstup: Blob = await new Promise((ok, zle) =>
				c.toBlob((b) => (b ? ok(b) : zle(new Error('toBlob zlyhal'))), 'image/png'),
			);

			const vysledok = await removeBackground(vstup, {
				proxyToWorker: true,
				output: { format: 'image/png' },
				progress: (kluc, hotovo, celkom) => {
					const faza = kluc.startsWith('fetch')
						? 'Sťahujem AI model (len prvýkrát)…'
						: 'Odstraňujem pozadie…';
					setOdstranovanie({
						faza,
						percenta: celkom > 0 ? Math.round((hotovo / celkom) * 100) : null,
					});
				},
			});

			// Výsledok do histórie — pohľad nemeníme, rozmer je rovnaký.
			const url = URL.createObjectURL(vysledok);
			const img = new window.Image();
			img.onload = () => {
				URL.revokeObjectURL(url);
				pridajDoHistorie(img);
			};
			img.src = url;
		} catch (chyba) {
			console.error('Odstránenie pozadia zlyhalo:', chyba);
			alert(
				'Odstránenie pozadia zlyhalo. Skús to znova — ak sa to opakuje, over pripojenie na internet (prvé použitie sťahuje AI model).',
			);
		} finally {
			setOdstranovanie(null);
		}
	};

	// Pri zapnutí orezu (alebo zmene obrázka počas neho) sa rám nastaví
	// na 80 % obrázka, v strede, prispôsobený zvolenému pomeru.
	useEffect(() => {
		if (nastroj !== 'orez' || !obrazok) {
			setOrez(null);
			return;
		}
		let w = obrazok.width * 0.8;
		let h = pomer ? w / pomer : obrazok.height * 0.8;
		if (h > obrazok.height * 0.95) {
			h = obrazok.height * 0.8;
			w = pomer ? h * pomer : w;
		}
		setOrez({
			x: (obrazok.width - w) / 2,
			y: (obrazok.height - h) / 2,
			width: w,
			height: h,
		});
	}, [nastroj, obrazok, pomer]);

	// Transformer (úchytky) sa musí ručne pripnúť na orezový rám.
	useEffect(() => {
		const tr = transformerRef.current;
		const rect = orezRectRef.current;
		if (nastroj === 'orez' && orez && tr && rect) {
			tr.nodes([rect]);
			tr.getLayer()?.batchDraw();
		}
	}, [nastroj, orez !== null]);

	// Po potiahnutí/zmene veľkosti rámu prepíše nové hodnoty do stavu.
	// Konva mení scale, nie width/height — tu to znormalizujeme späť.
	const prevezmiRam = () => {
		const rect = orezRectRef.current;
		if (!rect) return;
		const novy: Ram = {
			x: rect.x(),
			y: rect.y(),
			width: Math.max(1, rect.width() * rect.scaleX()),
			height: Math.max(1, rect.height() * rect.scaleY()),
		};
		rect.scale({ x: 1, y: 1 });
		setOrez(novy);
	};

	// Vyreže prienik rámu s obrázkom ako nový krok histórie.
	const aplikujOrez = () => {
		if (!obrazok || !orez) return;
		const x0 = Math.max(0, Math.round(orez.x));
		const y0 = Math.max(0, Math.round(orez.y));
		const x1 = Math.min(obrazok.width, Math.round(orez.x + orez.width));
		const y1 = Math.min(obrazok.height, Math.round(orez.y + orez.height));
		const w = x1 - x0;
		const h = y1 - y0;
		if (w < 1 || h < 1) {
			alert('Orezový rám je celý mimo obrázka.');
			return;
		}
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		c.getContext('2d')?.drawImage(obrazok, x0, y0, w, h, 0, 0, w, h);
		pridajDoHistorie(c);
		setNastroj('posun');
		vycentruj(c);
	};

	// Zmena šírky/výšky v exporte — druhý rozmer sa dopočíta podľa
	// pomeru strán obrázka, aby sa export nezdeformoval.
	const nastavExpSirku = (w: number) => {
		if (!obrazok) return;
		setExpRozmer({ w, h: Math.max(1, Math.round(w * (obrazok.height / obrazok.width))) });
	};
	const nastavExpVysku = (h: number) => {
		if (!obrazok) return;
		setExpRozmer({ w: Math.max(1, Math.round(h * (obrazok.width / obrazok.height))), h });
	};

	const otvorExport = () => {
		if (!obrazok) return;
		setExpRozmer({ w: obrazok.width, h: obrazok.height });
		setExportOtvoreny(true);
	};

	// Export: zmenší/zväčší cez pica (kvalitný filter, nie rozpixelované
	// natívne škálovanie), pri JPG podloží bielou (JPG nemá priehľadnosť)
	// a stiahne súbor. Všetko lokálne.
	const exportuj = async () => {
		if (!obrazok || exportujem) return;
		const w = Math.min(MAX_SIRKA, Math.max(1, Math.round(expRozmer.w)));
		const h = Math.min(MAX_SIRKA, Math.max(1, Math.round(expRozmer.h)));
		setExportujem(true);
		try {
			const zdroj = document.createElement('canvas');
			zdroj.width = obrazok.width;
			zdroj.height = obrazok.height;
			zdroj.getContext('2d')?.drawImage(obrazok, 0, 0);

			let vystup = zdroj;
			if (w !== obrazok.width || h !== obrazok.height) {
				const ciel = document.createElement('canvas');
				ciel.width = w;
				ciel.height = h;
				const Pica = (await import('pica')).default;
				await new Pica().resize(zdroj, ciel);
				vystup = ciel;
			}

			if (expFormat === 'image/jpeg') {
				const podlozeny = document.createElement('canvas');
				podlozeny.width = vystup.width;
				podlozeny.height = vystup.height;
				const ctx = podlozeny.getContext('2d');
				if (ctx) {
					ctx.fillStyle = '#ffffff';
					ctx.fillRect(0, 0, podlozeny.width, podlozeny.height);
					ctx.drawImage(vystup, 0, 0);
				}
				vystup = podlozeny;
			}

			const blob: Blob = await new Promise((ok, zle) =>
				vystup.toBlob(
					(b) => (b ? ok(b) : zle(new Error('toBlob zlyhal'))),
					expFormat,
					expKvalita / 100,
				),
			);
			const pripona = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[
				expFormat
			];
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `obrazok-${w}x${h}.${pripona}`;
			a.click();
			URL.revokeObjectURL(a.href);
			setExportOtvoreny(false);
		} catch (chyba) {
			console.error('Export zlyhal:', chyba);
			alert('Export zlyhal, skús to prosím znova.');
		} finally {
			setExportujem(false);
		}
	};

	// Color-to-alpha: prejde celý obrázok a spriehľadní každý pixel
	// s farbou blízkou aktuálnej farbe. Rovnaká matematika ako tolerančná
	// guma (prah + plynulý prechod), len globálne.
	const odstranFarbu = () => {
		if (!obrazok) return;
		const c = document.createElement('canvas');
		c.width = obrazok.width;
		c.height = obrazok.height;
		const ctx = c.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;
		ctx.drawImage(obrazok, 0, 0);

		const data = ctx.getImageData(0, 0, c.width, c.height);
		const [vr, vg, vb] = hexNaRgb(farba);
		const prah = (ctaTolerancia / 100) * 441.7;
		const prechod = Math.max(prah * 0.5, 1);

		for (let i = 0; i < data.data.length; i += 4) {
			const alfa = data.data[i + 3];
			if (alfa === 0) continue;
			const dr = data.data[i] - vr;
			const dg = data.data[i + 1] - vg;
			const db = data.data[i + 2] - vb;
			const vzdialenost = Math.sqrt(dr * dr + dg * dg + db * db);
			if (vzdialenost <= prah) {
				data.data[i + 3] = 0;
			} else if (vzdialenost <= prah + prechod) {
				const podiel = (vzdialenost - prah) / prechod;
				data.data[i + 3] = Math.min(alfa, Math.round(alfa * podiel));
			}
		}
		ctx.putImageData(data, 0, 0);
		pridajDoHistorie(c);
		setCtaOtvorene(false);
	};

	// Zoom kolieskom myši — približuje smerom ku kurzoru, nie k stredu.
	const priZoome = (e: Konva.KonvaEventObject<WheelEvent>) => {
		e.evt.preventDefault();
		const stage = e.target.getStage();
		if (!stage) return;
		const staraSkala = stage.scaleX();
		const kurzor = stage.getPointerPosition();
		if (!kurzor) return;

		// Bod na plátne, na ktorý kurzor ukazuje — po zoome musí zostať pod kurzorom.
		const bodPodKurzorom = {
			x: (kurzor.x - stage.x()) / staraSkala,
			y: (kurzor.y - stage.y()) / staraSkala,
		};
		const novaSkala =
			e.evt.deltaY < 0 ? staraSkala * ZOOM_KROK : staraSkala / ZOOM_KROK;

		stage.scale({ x: novaSkala, y: novaSkala });
		stage.position({
			x: kurzor.x - bodPodKurzorom.x * novaSkala,
			y: kurzor.y - bodPodKurzorom.y * novaSkala,
		});
	};

	const svgVyska = cakajuceSvg
		? Math.max(1, Math.round(svgSirka / cakajuceSvg.pomer))
		: 0;

	return (
		<div className="flex h-screen flex-col">
			<header className="flex items-center gap-4 border-b border-slate-700 bg-slate-800 px-4 py-3">
				<h1 className="text-lg font-semibold text-emerald-400">Editor obrázkov</h1>
				<button
					type="button"
					onClick={() => suborInputRef.current?.click()}
					disabled={konvertujem}
					className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
				>
					{konvertujem ? 'Konvertujem…' : 'Otvoriť obrázok'}
				</button>
				<input
					ref={suborInputRef}
					type="file"
					accept={PODPOROVANE_FORMATY}
					onChange={otvorSubor}
					className="hidden"
				/>
				<div className="flex gap-1 rounded-md bg-slate-900 p-1">
					{(
						[
							['posun', '✋ Posun'],
							['kvapkadlo', '💧 Kvapkadlo'],
							['guma', '🧽 Guma'],
							['ceruzka', '✏️ Ceruzka'],
							['orez', '✂️ Orez'],
						] as const
					).map(([id, popis]) => (
						<button
							key={id}
							type="button"
							onClick={() => setNastroj(id)}
							className={`rounded px-3 py-1 text-sm ${
								nastroj === id
									? 'bg-emerald-600 text-white'
									: 'text-slate-300 hover:bg-slate-700'
							}`}
						>
							{popis}
						</button>
					))}
				</div>

				{nastroj === 'guma' && (
					<>
						<label className="flex items-center gap-2 text-sm text-slate-300">
							Veľkosť
							<input
								type="range"
								min={4}
								max={300}
								value={gumaVelkost}
								onChange={(e) => setGumaVelkost(Number(e.target.value))}
								className="w-32 accent-emerald-500"
							/>
							<span className="w-12 tabular-nums">{gumaVelkost}px</span>
						</label>
						<label
							className="flex items-center gap-1.5 text-sm text-slate-300"
							title="Guma maže len farbu, na ktorej si začal ťah"
						>
							<input
								type="checkbox"
								checked={tolerancna}
								onChange={(e) => setTolerancna(e.target.checked)}
								className="accent-emerald-500"
							/>
							Len podobná farba
						</label>
						{tolerancna && (
							<label className="flex items-center gap-2 text-sm text-slate-300">
								Tolerancia
								<input
									type="range"
									min={0}
									max={100}
									value={tolerancia}
									onChange={(e) => setTolerancia(Number(e.target.value))}
									className="w-24 accent-emerald-500"
								/>
								<span className="w-8 tabular-nums">{tolerancia}</span>
							</label>
						)}
					</>
				)}
				{nastroj === 'ceruzka' && (
					<label className="flex items-center gap-2 text-sm text-slate-300">
						Veľkosť
						<input
							type="range"
							min={1}
							max={100}
							value={ceruzkaVelkost}
							onChange={(e) => setCeruzkaVelkost(Number(e.target.value))}
							className="w-32 accent-emerald-500"
						/>
						<span className="w-12 tabular-nums">{ceruzkaVelkost}px</span>
					</label>
				)}
				{nastroj === 'orez' && (
					<div className="flex items-center gap-2 text-sm text-slate-300">
						Pomer
						<select
							value={pomerVolba}
							onChange={(e) => setPomerVolba(e.target.value as PomerVolba)}
							className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
						>
							{POMERY.map(([id, popis]) => (
								<option key={id} value={id}>
									{popis}
								</option>
							))}
						</select>
						{pomerVolba === 'vlastny' && (
							<span className="flex items-center gap-1">
								<input
									type="number"
									min={1}
									value={vlastnyPomer.w}
									onChange={(e) =>
										setVlastnyPomer((p) => ({ ...p, w: Number(e.target.value) }))
									}
									className="w-14 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
								/>
								:
								<input
									type="number"
									min={1}
									value={vlastnyPomer.h}
									onChange={(e) =>
										setVlastnyPomer((p) => ({ ...p, h: Number(e.target.value) }))
									}
									className="w-14 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
								/>
							</span>
						)}
						{orez && (
							<span className="text-xs text-slate-400">
								{Math.round(orez.width)} × {Math.round(orez.height)}px
							</span>
						)}
						<button
							type="button"
							onClick={aplikujOrez}
							className="rounded-md bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-500"
						>
							Orezať
						</button>
						<button
							type="button"
							onClick={() => setNastroj('posun')}
							className="rounded-md px-2 py-1 text-slate-300 hover:bg-slate-700"
						>
							Zrušiť
						</button>
					</div>
				)}

				<button
					type="button"
					onClick={odstranPozadie}
					disabled={!obrazok || !!odstranovanie}
					title="AI odstráni pozadie — všetko prebehne v tvojom prehliadači"
					className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:cursor-wait disabled:opacity-50"
				>
					{odstranovanie ? 'Pracujem…' : '✨ Odstrániť pozadie'}
				</button>

				<div className="relative">
					<button
						type="button"
						onClick={() => setCtaOtvorene((o) => !o)}
						disabled={!obrazok}
						title="Spriehľadní zvolenú farbu v celom obrázku"
						className="rounded-md bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50"
					>
						🎯 Odstrániť farbu
					</button>

					{ctaOtvorene && (
						<>
							<div
								className="fixed inset-0 z-10"
								onClick={() => setCtaOtvorene(false)}
							/>
							<div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-lg border border-slate-700 bg-slate-800 p-3 shadow-xl">
								<p className="text-sm text-slate-300">
									Z celého obrázka zmizne táto farba:
								</p>
								<div className="mt-2 flex items-center gap-2 text-sm text-slate-300">
									<span
										className="h-6 w-6 rounded border border-slate-500"
										style={{ backgroundColor: farba }}
									/>
									<code>{farba}</code>
									<span className="text-xs text-slate-500">
										(zmeň kvapkadlom / paletou)
									</span>
								</div>
								<label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
									Tolerancia
									<input
										type="range"
										min={0}
										max={100}
										value={ctaTolerancia}
										onChange={(e) => setCtaTolerancia(Number(e.target.value))}
										className="flex-1 accent-emerald-500"
									/>
									<span className="w-8 tabular-nums">{ctaTolerancia}</span>
								</label>
								<button
									type="button"
									onClick={odstranFarbu}
									className="mt-3 w-full rounded-md bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600"
								>
									Odstrániť z celého obrázka
								</button>
							</div>
						</>
					)}
				</div>

				<div className="relative">
					<button
						type="button"
						onClick={() => setPaletaOtvorena((o) => !o)}
						title="Aktuálna farba — klikni a vyber inú"
						className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-300 hover:bg-slate-700"
					>
						<span
							className="h-6 w-6 rounded border border-slate-500"
							style={{ backgroundColor: farba }}
						/>
						<code>{farba}</code>
					</button>

					{paletaOtvorena && (
						<>
							{/* Neviditeľná vrstva — klik mimo panela ho zavrie. */}
							<div
								className="fixed inset-0 z-10"
								onClick={() => setPaletaOtvorena(false)}
							/>
							<div className="absolute left-0 top-full z-20 mt-2 w-60 rounded-lg border border-slate-700 bg-slate-800 p-3 shadow-xl">
								<div className="grid grid-cols-8 gap-1.5">
									{PALETA.map((f) => (
										<button
											key={f}
											type="button"
											onClick={() => setFarba(f)}
											title={f}
											className={`h-6 w-6 rounded border-2 ${
												farba === f ? 'border-emerald-400' : 'border-slate-600'
											}`}
											style={{ backgroundColor: f }}
										/>
									))}
								</div>
								<label className="mt-3 flex items-center justify-between gap-2 text-sm text-slate-300">
									Hex kód
									<input
										value={hexVstup}
										onChange={(e) => setHexVstup(e.target.value)}
										onBlur={potvrdHex}
										onKeyDown={(e) => e.key === 'Enter' && potvrdHex()}
										spellCheck={false}
										className="w-28 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 font-mono text-sm text-slate-100"
									/>
								</label>
								<label className="mt-2 flex items-center justify-between gap-2 text-sm text-slate-300">
									Iná farba
									<input
										type="color"
										value={farba}
										onChange={(e) => setFarba(e.target.value)}
										className="h-8 w-28 cursor-pointer rounded bg-transparent"
									/>
								</label>
							</div>
						</>
					)}
				</div>

				<div className="ml-auto flex items-center gap-1">
					<button
						type="button"
						onClick={otvorExport}
						disabled={!obrazok}
						title="Stiahni výsledok ako PNG, JPG alebo WebP"
						className="mr-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
					>
						⬇️ Export
					</button>
					<button
						type="button"
						onMouseDown={() => setUkazujemPovodny(true)}
						onMouseUp={() => setUkazujemPovodny(false)}
						onMouseLeave={() => setUkazujemPovodny(false)}
						disabled={!original}
						title="Podrž — ukáže pôvodný obrázok (alebo drž klávesu P)"
						className={`rounded-md px-3 py-1.5 text-sm disabled:opacity-40 ${
							ukazujemPovodny
								? 'bg-amber-500 text-slate-900'
								: 'text-slate-200 hover:bg-slate-700'
						}`}
					>
						👁 Pred/Po
					</button>
					<button
						type="button"
						onClick={spat}
						disabled={!mozeSpat}
						title="Späť (Ctrl+Z)"
						className="rounded-md px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-40"
					>
						↶ Späť
					</button>
					<button
						type="button"
						onClick={znova}
						disabled={!mozeZnova}
						title="Znova (Ctrl+Y)"
						className="rounded-md px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-40"
					>
						↷ Znova
					</button>
				</div>
			</header>

			<main
				ref={obalRef}
				className={`relative flex-1 overflow-hidden ${
					nastroj === 'kvapkadlo'
						? 'cursor-crosshair'
						: kresliaci
							? 'cursor-none'
							: nastroj === 'orez'
								? 'cursor-default'
								: 'cursor-grab'
				}`}
				style={sachovnica}
			>
				<Stage
					ref={stageRef}
					width={rozmer.width}
					height={rozmer.height}
					draggable={nastroj === 'posun'}
					onWheel={priZoome}
					onClick={priKliknuti}
					onTap={priKliknuti}
					onMouseDown={zacniTah}
					onTouchStart={zacniTah}
					onMouseMove={priPohybe}
					onTouchMove={priPohybe}
					onMouseUp={ukonciTah}
					onTouchEnd={ukonciTah}
					onMouseLeave={() => {
						setKurzor(null);
						ukonciTah();
					}}
				>
					<Layer>
						{zobrazeny ? (
							<KonvaImage image={zobrazeny} />
						) : (
							<Text
								x={rozmer.width / 2 - 220}
								y={rozmer.height / 2}
								width={440}
								align="center"
								text="Zatiaľ je plátno prázdne — klikni hore na „Otvoriť obrázok“"
								fontSize={16}
								fill="#475569"
							/>
						)}
						{nastroj === 'orez' && orez && obrazok && (
							<>
								{/* Stmavenie okolia rámu — 4 obdĺžniky okolo výrezu. */}
								{(
									[
										[0, 0, obrazok.width, orez.y],
										[0, orez.y + orez.height, obrazok.width, obrazok.height - orez.y - orez.height],
										[0, orez.y, orez.x, orez.height],
										[orez.x + orez.width, orez.y, obrazok.width - orez.x - orez.width, orez.height],
									] as const
								).map(([rx, ry, rw, rh], i) =>
									rw > 0 && rh > 0 ? (
										<Rect
											key={i}
											x={rx}
											y={ry}
											width={rw}
											height={rh}
											fill="black"
											opacity={0.45}
											listening={false}
										/>
									) : null,
								)}
								<Rect
									ref={orezRectRef}
									x={orez.x}
									y={orez.y}
									width={orez.width}
									height={orez.height}
									stroke="#34d399"
									strokeWidth={1.5}
									strokeScaleEnabled={false}
									draggable
									onDragEnd={prevezmiRam}
									onTransformEnd={prevezmiRam}
								/>
								<Transformer
									ref={transformerRef}
									rotateEnabled={false}
									flipEnabled={false}
									keepRatio={pomer !== null}
									enabledAnchors={
										pomer !== null
											? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
											: undefined
									}
									anchorStroke="#34d399"
									anchorFill="#0f172a"
									borderEnabled={false}
									boundBoxFunc={(stary, novy) =>
										novy.width < 10 || novy.height < 10 ? stary : novy
									}
								/>
							</>
						)}
						{kresliaci && kurzor && (
							// Krúžok ukazuje presný záber gumy/ceruzky; hrúbka čiary
							// sa nezväčšuje so zoomom (strokeScaleEnabled). Pri ceruzke
							// je vyplnený aktuálnou farbou.
							<Circle
								x={kurzor.x}
								y={kurzor.y}
								radius={velkostStopy / 2}
								stroke="#0f172a"
								strokeWidth={1.5}
								strokeScaleEnabled={false}
								fill={nastroj === 'ceruzka' ? farba : undefined}
								opacity={nastroj === 'ceruzka' ? 0.6 : 1}
								listening={false}
							/>
						)}
					</Layer>
				</Stage>

				{odstranovanie && (
					<div className="absolute inset-x-0 top-0 z-10 flex justify-center p-3">
						<div className="w-80 rounded-lg border border-slate-700 bg-slate-800/95 p-4 shadow-xl">
							<p className="text-sm text-slate-200">{odstranovanie.faza}</p>
							<div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
								<div
									className={`h-full rounded-full bg-violet-500 transition-all ${
										odstranovanie.percenta === null ? 'w-full animate-pulse' : ''
									}`}
									style={
										odstranovanie.percenta !== null
											? { width: `${odstranovanie.percenta}%` }
											: undefined
									}
								/>
							</div>
							{odstranovanie.percenta !== null && (
								<p className="mt-1 text-right text-xs text-slate-400">
									{odstranovanie.percenta}%
								</p>
							)}
						</div>
					</div>
				)}

				{ukazujemPovodny && (
					<div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1 text-sm font-medium text-slate-900 shadow">
						Pôvodný obrázok
					</div>
				)}

				{exportOtvoreny && obrazok && (
					<div className="absolute inset-0 flex items-center justify-center bg-black/50">
						<div className="w-96 rounded-lg bg-slate-800 p-5 shadow-xl">
							<h2 className="font-semibold text-slate-100">Export obrázka</h2>

							<div className="mt-4 flex gap-2">
								{(
									[
										['image/png', 'PNG', 'priehľadnosť'],
										['image/jpeg', 'JPG', 'fotky'],
										['image/webp', 'WebP', 'malé súbory'],
									] as const
								).map(([mime, popis, hint]) => (
									<button
										key={mime}
										type="button"
										onClick={() => setExpFormat(mime)}
										className={`flex-1 rounded-md px-2 py-2 text-sm ${
											expFormat === mime
												? 'bg-emerald-600 text-white'
												: 'bg-slate-900 text-slate-300 hover:bg-slate-700'
										}`}
									>
										{popis}
										<span className="block text-xs opacity-70">{hint}</span>
									</button>
								))}
							</div>

							<div className="mt-4 flex items-center gap-2 text-sm text-slate-300">
								<label className="flex-1">
									Šírka
									<input
										type="number"
										min={1}
										max={MAX_SIRKA}
										value={expRozmer.w}
										onChange={(e) => nastavExpSirku(Number(e.target.value))}
										className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-slate-100"
									/>
								</label>
								<span className="mt-5">×</span>
								<label className="flex-1">
									Výška
									<input
										type="number"
										min={1}
										max={MAX_SIRKA}
										value={expRozmer.h}
										onChange={(e) => nastavExpVysku(Number(e.target.value))}
										className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-slate-100"
									/>
								</label>
							</div>
							<p className="mt-1 text-xs text-slate-500">
								Rozmery sú zviazané pomerom strán. Pôvodný rozmer:{' '}
								{obrazok.width} × {obrazok.height}px — iný tvar dosiahneš
								nástrojom ✂️ Orez.
							</p>

							{expFormat !== 'image/png' && (
								<label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
									Kvalita
									<input
										type="range"
										min={50}
										max={100}
										value={expKvalita}
										onChange={(e) => setExpKvalita(Number(e.target.value))}
										className="flex-1 accent-emerald-500"
									/>
									<span className="w-8 tabular-nums">{expKvalita}</span>
								</label>
							)}

							<div className="mt-5 flex justify-end gap-2">
								<button
									type="button"
									onClick={() => setExportOtvoreny(false)}
									className="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
								>
									Zrušiť
								</button>
								<button
									type="button"
									onClick={exportuj}
									disabled={exportujem}
									className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
								>
									{exportujem ? 'Pripravujem…' : 'Stiahnuť'}
								</button>
							</div>
						</div>
					</div>
				)}

				{cakajuceSvg && (
					<div className="absolute inset-0 flex items-center justify-center bg-black/50">
						<div className="w-80 rounded-lg bg-slate-800 p-5 shadow-xl">
							<h2 className="font-semibold text-slate-100">Vloženie SVG</h2>
							<p className="mt-2 text-sm text-slate-400">
								SVG nemá pevné pixely — vyber, v akom rozlíšení sa má vykresliť.
								Pre logá voľ radšej viac, zmenšiť sa dá vždy.
							</p>
							<label className="mt-4 block text-sm text-slate-300">
								Šírka v pixeloch
								<input
									type="number"
									min={MIN_SIRKA}
									max={MAX_SIRKA}
									value={svgSirka}
									onChange={(e) => setSvgSirka(Number(e.target.value))}
									className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-slate-100"
								/>
							</label>
							<p className="mt-2 text-sm text-slate-400">
								Výška sa dopočíta: <strong>{svgVyska}px</strong>
							</p>
							<div className="mt-5 flex justify-end gap-2">
								<button
									type="button"
									onClick={() => setCakajuceSvg(null)}
									className="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
								>
									Zrušiť
								</button>
								<button
									type="button"
									onClick={vlozSvg}
									className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
								>
									Vložiť
								</button>
							</div>
						</div>
					</div>
				)}
			</main>
		</div>
	);
}
