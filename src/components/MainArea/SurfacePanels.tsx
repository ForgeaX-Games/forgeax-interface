import { SurfaceRegion } from "@forgeax/app-shell/react";
import { useEffect, useRef } from "react";
import { type SurfaceKind, setAnchor } from "../../lib/surfaceAnchors";

// SurfaceAnchor — empty flex-fill placeholder that registers its element with the
// anchor registry on mount and clears it on unmount. The keep-alive layer reads
// this element's bounding rect to position the live (kept-alive) surface over it.
function SurfaceAnchor({ kind }: { kind: SurfaceKind }) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		setAnchor(kind, ref.current);
		return () => setAnchor(kind, null);
	}, [kind]);
	return (
		<div ref={ref} className="surface-anchor" data-surface-anchor={kind} />
	);
}

// ViewportPanel — combined edit+preview surface, renders the editor viewport anchor.
// The keep-alive layer manages the actual surface rendering.
export function ViewportPanel() {
	return (
		<SurfaceRegion>
			<SurfaceAnchor kind="edit" />
		</SurfaceRegion>
	);
}
