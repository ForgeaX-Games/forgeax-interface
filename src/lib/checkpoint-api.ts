/** checkpoint-api —— checkpoint 回退点的 REST 包装(server api/sessions.ts 路由)。
 *  与 forgeax-bridge 同款风格:不持状态,调用方显式传 sid。 */

export interface CheckpointEntry {
	msgId: string;
	ts: number;
	/** false = 该消息时刻无游戏目录(纯会话),只能会话回退。 */
	hasCode: boolean;
}

export interface PendingRewindInfo {
	boundaryId: string;
	targetMsgId: string;
	mode: "both" | "conversation" | "code";
	preManifestId: string | null;
	keptDirty: string[];
	overwrite: { safetyManifestId: string; files: string[] } | null;
}

/** 单文件变更明细(server snapshot-store FileDiffStat 镜像)。 */
export interface FileDiffStat {
	path: string;
	status: "added" | "deleted" | "modified";
	insertions: number;
	deletions: number;
	binary: boolean;
}

export interface RewindPreview {
	filesChanged: string[];
	insertions: number;
	deletions: number;
	binaryOrLarge: number;
	/** 逐文件明细;旧 server 可能不返回,消费侧用 `files ?? []`。 */
	files?: FileDiffStat[];
}

export async function fetchCheckpoints(
	sid: string,
	signal?: AbortSignal,
): Promise<{
	checkpoints: CheckpointEntry[];
	pending: PendingRewindInfo | null;
}> {
	const r = await fetch(
		`/api/sessions/${encodeURIComponent(sid)}/checkpoints`,
		{ signal },
	);
	if (!r.ok) throw new Error(`GET checkpoints ${r.status}`);
	return (await r.json()) as {
		checkpoints: CheckpointEntry[];
		pending: PendingRewindInfo | null;
	};
}
