import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Stage, Layer, Rect, Text } from 'react-konva';
import type Konva from 'konva';

// Šachovnica cez CSS gradient — signalizuje priehľadné časti plátna.
const sachovnica: CSSProperties = {
	backgroundImage: 'repeating-conic-gradient(#cbd5e1 0% 25%, #f1f5f9 0% 50%)',
	backgroundSize: '20px 20px',
};

const ZOOM_KROK = 1.1;

export default function Editor() {
	const obalRef = useRef<HTMLDivElement>(null);
	const [rozmer, setRozmer] = useState({ width: 0, height: 0 });

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
			<header className="border-b border-slate-700 bg-slate-800 px-4 py-3">
				<h1 className="text-lg font-semibold text-emerald-400">Editor obrázkov</h1>
			</header>

			<main ref={obalRef} className="flex-1 overflow-hidden" style={sachovnica}>
				<Stage
					width={rozmer.width}
					height={rozmer.height}
					draggable
					onWheel={priZoome}
				>
					<Layer>
						{/* Dočasný obsah na vyskúšanie zoomu a posunu */}
						<Rect x={100} y={100} width={200} height={200} fill="#34d399" cornerRadius={12} />
						<Text x={100} y={320} text="Skúšobný štvorec — potiahni ma alebo zoomuj kolieskom" fontSize={16} fill="#0f172a" />
					</Layer>
				</Stage>
			</main>
		</div>
	);
}
