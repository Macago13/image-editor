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

// Natívne formáty + HEIC (ten konvertujeme cez heic2any).
// Prípony .heic/.heif sú v zozname aj samostatne — Windows im často nedáva MIME typ.
const PODPOROVANE_FORMATY =
	'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/heic,image/heif,.heic,.heif';

const jeHeic = (subor: File) =>
	subor.type === 'image/heic' ||
	subor.type === 'image/heif' ||
	/\.hei[cf]$/i.test(subor.name);

export default function Editor() {
	const obalRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<Konva.Stage>(null);
	const suborInputRef = useRef<HTMLInputElement>(null);
	const [rozmer, setRozmer] = useState({ width: 0, height: 0 });
	const [obrazok, setObrazok] = useState<HTMLImageElement | null>(null);
	const [konvertujem, setKonvertujem] = useState(false);

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
	const vycentruj = (img: HTMLImageElement) => {
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

	const otvorSubor = async (e: ChangeEvent<HTMLInputElement>) => {
		const subor = e.target.files?.[0];
		// Vynulovanie umožní vybrať ten istý súbor znova.
		e.target.value = '';
		if (!subor) return;

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

		// Objekt-URL: obrázok sa číta priamo z pamäte prehliadača, nič nejde na sieť.
		const url = URL.createObjectURL(zdroj);
		const img = new window.Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			setObrazok(img);
			vycentruj(img);
		};
		img.src = url;
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
			</header>

			<main ref={obalRef} className="flex-1 overflow-hidden" style={sachovnica}>
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
			</main>
		</div>
	);
}
