// Typy pre imagetracerjs — knižnica ich nedodáva, deklarujeme si ich sami.
declare module 'imagetracerjs' {
	/** Farba palety v RGBA (0–255). */
	export type PaletaFarba = { r: number; g: number; b: number; a: number };

	export interface MoznostiTrace {
		/** Počet farieb pri kvantizácii (posterizácii). */
		numberofcolors?: number;
		/** Vlastná paleta — použije sa namiesto automatickej. */
		pal?: PaletaFarba[];
		/** 0 = paleta sa nevzorkuje z obrázka (nutné pri vlastnej palete). */
		colorsampling?: number;
		/** Počet kôl kvantizácie. */
		colorquantcycles?: number;
		/** Presnosť kriviek (nižšie = vernejšie, viac bodov). */
		ltres?: number;
		qtres?: number;
		/** Ignorovať plôšky menšie než tento počet pixelov (šum). */
		pathomit?: number;
		/** Zaobliť rohy ciest. */
		roundcoords?: number;
		/** Pridať viewBox do SVG. */
		viewbox?: boolean;
		strokewidth?: number;
		blurradius?: number;
	}

	const ImageTracer: {
		imagedataToSVG(imgd: ImageData, options?: MoznostiTrace | string): string;
	};
	export default ImageTracer;
}
