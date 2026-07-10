export default function Editor() {
	return (
		<div className="flex min-h-screen flex-col">
			<header className="border-b border-slate-700 bg-slate-800 px-4 py-3">
				<h1 className="text-lg font-semibold text-emerald-400">Editor obrázkov</h1>
			</header>

			<main className="flex flex-1 items-center justify-center">
				<p className="text-slate-400">
					Tu bude plátno — zatiaľ prázdny React komponent.
				</p>
			</main>
		</div>
	);
}
