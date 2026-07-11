import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Stage, Layer, Image as KonvaImage, Text, Circle } from 'react-konva';
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

type Nastroj = 'posun' | 'kvapkadlo' | 'guma';

type Bod = { x: number; y: number };

const doHex = (n: number) => n.toString(16).padStart(2, '0');

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
	const [gumaVelkost, setGumaVelkost] = useState(40);
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

	// Na plátne sa zobrazuje pracovná kópia (počas ťahu), inak aktuálny krok histórie.
	const zobrazeny = pracovny ?? obrazok;

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

	// Načíta blob ako <img> element a položí ho na plátno.
	const polozNaPlatno = (zdroj: Blob) => {
		const url = URL.createObjectURL(zdroj);
		const img = new window.Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			pridajDoHistorie(img);
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

	// Vymaže (spriehľadní) čiaru z bodu do bodu — režim destination-out
	// z obrázka „vyrezáva". Rovnaký bod dvakrát = bodka.
	const gumujSegment = (platno: HTMLCanvasElement, od: Bod, kam: Bod) => {
		const ctx = platno.getContext('2d');
		if (!ctx) return;
		ctx.save();
		ctx.globalCompositeOperation = 'destination-out';
		if (od.x === kam.x && od.y === kam.y) {
			ctx.beginPath();
			ctx.arc(od.x, od.y, gumaVelkost / 2, 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.lineWidth = gumaVelkost;
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

	// Stlačenie myši s gumou: vyrobí pracovnú kópiu a vymaže prvú bodku.
	const zacniTah = () => {
		if (nastroj !== 'guma' || !obrazok) return;
		const kopia = document.createElement('canvas');
		kopia.width = obrazok.width;
		kopia.height = obrazok.height;
		const ctx = kopia.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;
		ctx.drawImage(obrazok, 0, 0);

		const bod = bodNaObrazku();
		if (tolerancna) {
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
			gumujSegment(kopia, bod, bod);
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
			gumujSegment(pracovny, poslednyBodRef.current ?? bod, bod);
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

				<div
					className="flex items-center gap-2 text-sm text-slate-300"
					title="Aktuálna farba (vyberá kvapkadlo)"
				>
					<span
						className="h-6 w-6 rounded border border-slate-500"
						style={{ backgroundColor: farba }}
					/>
					<code>{farba}</code>
				</div>

				<div className="ml-auto flex gap-1">
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
						: nastroj === 'guma'
							? 'cursor-none'
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
						{nastroj === 'guma' && kurzor && (
							// Krúžok ukazuje presný záber gumy; hrúbka čiary sa
							// nezväčšuje so zoomom (strokeScaleEnabled).
							<Circle
								x={kurzor.x}
								y={kurzor.y}
								radius={gumaVelkost / 2}
								stroke="#0f172a"
								strokeWidth={1.5}
								strokeScaleEnabled={false}
								listening={false}
							/>
						)}
					</Layer>
				</Stage>

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
