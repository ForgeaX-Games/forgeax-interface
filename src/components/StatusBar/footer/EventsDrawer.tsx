import { useGatewayRuns } from "../../../lib/editor-facts-bus";
import "./footer.css";

/** epoch ms → "HH:MM:SS"; empty ts renders as a dash. */
function fmtTime(ms: number): string {
	if (!ms) return "—";
	const d = new Date(ms);
	return d.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

export function EventsDrawer() {
	const runs = useGatewayRuns();

	if (runs.length === 0) {
		return (
			<div className="fx-drawer-content">
				<div className="fx-empty">暂无事件 · 引擎未运行或无 gateway 调用</div>
			</div>
		);
	}

	return (
		<div className="fx-drawer-content">
			{runs.map((r) => (
				<div key={r.runId} className="fx-ev">
					<span className="t">{fmtTime(r.ts)}</span>
					<span className="ev">{r.operationId}</span>
					<span className="msg">
						{r.error ? `${r.status} · ${r.error}` : r.status}
					</span>
				</div>
			))}
		</div>
	);
}
