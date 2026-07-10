import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Stage, Layer, Image as KonvaImage, Text } from 'react-konva';
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

			<main ref={obalRef} className="relative flex-1 overflow-hidden" style={sachovnica}>
				<Stage
					ref={stageRef}
					width={rozmer.width}
					height={rozmer.height}
					draggable
					onWheel={priZoome}
				>
					<Layer>
						{obrazok ? (
							<KonvaImage image={obrazok} />
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
