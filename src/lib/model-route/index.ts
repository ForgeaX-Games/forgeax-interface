import { useShellStore } from "../../store";
import {
	getAgentModel,
	listModels,
	type ModelCatalogEntry,
	setAgentModels,
} from "../model-config";
import { getLastModel } from "../model-prefs";
// ActiveModelRoute — the single source of truth for "which model source is the
// chat actually using right now", and the one place that mutation flows through.
//
// Design §12 (adopted revisions) calls for a closed-union ActiveModelRoute from
// which `providerOverride` is DERIVED rather than a second hand-maintained
// field. In this codebase the runtime routing is already decided by two pieces
// of existing state — we do NOT add a third:
//
//   1. store.providerOverride (per-session): null → native forgeax path
//      (POST /api/sessions/:sid/messages); non-null → a CLI driver via
//      /api/cli/chat (claude-code / codex / cursor-agent / codebuddy).
//   2. .env FORGEAX_MODEL: which model the native path resolves (auto-resolver
//      routes by id prefix — claude-* → Anthropic, gpt-* → OpenAI, …).
//
// So the "active source" the Providers panel + onboarding show is a pure
// DERIVATION over (providerOverride, FORGEAX_MODEL), and switching source is a
// single `applyModelRoute` that writes both consistently. No ghost field.

/** Closed union of model sources the UI can present + switch between. */
export type ModelSource =
	/** BYO OpenAI-compatible key — native path, FORGEAX_MODEL=<vendor id>. */
	| { kind: "api-key"; model: string }
	/** Local CLI driver — providerOverride=<id>. */
	| { kind: "cli"; providerId: string };

/**
 * The UI-facing "active source" identifier: 'api-key' | <cli-id> | null
 * (nothing set).
 */
export type ActiveSourceId = "api-key" | string | null;

const RE_OPENAI = /^(gpt-|o[1-9]|codex-)/i;

/**
 * Derive the active source id purely from the two runtime inputs. Kept a pure
 * function so it can be unit-tested and reused by both the Providers panel and
 * the onboarding readiness gate.
 */
export function deriveActiveSource(
	providerOverride: string | null,
	forgeaxModel: string | null,
): ActiveSourceId {
	// A CLI override always wins — the chat is routed through /api/cli/chat.
	if (providerOverride && providerOverride !== "forgeax") {
		return providerOverride;
	}
	// Native path: the model id tells us the source.
	const m = (forgeaxModel ?? "").trim();
	if (m && RE_OPENAI.test(m)) return "api-key";
	// Any native model (claude-*/gemini-*/proxy) — still the "api-key" bucket from
	// the Providers UI's perspective (BYO credential).
	if (m) return "api-key";
	return null;
}

async function patchEnv(patch: Record<string, string>): Promise<void> {
	const r = await fetch("/api/settings/env", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(patch),
	});
	const j = (await r.json().catch(() => null)) as {
		ok?: boolean;
		error?: string;
	} | null;
	if (!r.ok || !j?.ok) {
		throw new Error(j?.error ?? `HTTP ${r.status}`);
	}
}

/**
 * Switch the active model source. Writes the two underlying pieces of state
 * atomically-enough (env then override) so the derived active source lands on
 * the requested value. Returns once persisted.
 *
 *  - api-key → providerOverride=null + FORGEAX_MODEL=<vendor id> (env keys are
 *              saved separately via the Providers EnvFields)
 *  - cli     → providerOverride=<id> (FORGEAX_MODEL untouched — the driver owns
 *              its own model selection)
 */
export async function applyModelRoute(source: ModelSource): Promise<void> {
	const setProviderOverride = useShellStore.getState().setProviderOverride;
	switch (source.kind) {
		case "api-key":
			await patchEnv({ FORGEAX_MODEL: source.model });
			setProviderOverride(null);
			return;
		case "cli":
			setProviderOverride(source.providerId);
			return;
	}
}

/** The catalog provider id currently in effect, derived from providerOverride. */
export function currentCatalogProvider(
	providerOverride: string | null,
): string | null {
	return providerOverride && providerOverride !== "forgeax"
		? providerOverride
		: null;
}

/** Preserve the last explicit user pick when it still belongs to this catalog;
 * otherwise use the provider's first visible/default entry. */
export function preferredCatalogModel(
	catalog: readonly ModelCatalogEntry[],
	remembered: string | null,
): string | undefined {
	if (
		remembered &&
		catalog.some((model) => model.id === remembered && !model.hidden)
	) {
		return remembered;
	}
	return catalog.find((model) => !model.hidden)?.id ?? catalog[0]?.id;
}

/** Reconcile against the active provider catalog. Preserve valid selections
 * (including hidden entries), but a nonempty foreign-provider default is not
 * a usable selection. Callers must discard stale session/provider responses. */
export function passiveSessionCatalogModel(
	catalog: readonly ModelCatalogEntry[],
	current: string | null | undefined,
	remembered: string | null,
): string | undefined {
	if (
		catalog.length === 0 ||
		(current && catalog.some((entry) => entry.id === current))
	)
		return undefined;
	return preferredCatalogModel(catalog, remembered);
}

/** Model seeding policy for a newly scaffolded session. Native sessions only
 * override their scaffold default when the user has an applicable remembered
 * pick; CLI sessions must always land on a model from that driver's catalog. */
export function initialSessionCatalogModel(
	catalog: readonly ModelCatalogEntry[],
	catalogProviderId: string | null,
	remembered: string | null,
): string | undefined {
	const rememberedEntry = remembered
		? catalog.find((model) => model.id === remembered && !model.hidden)
		: undefined;
	if (rememberedEntry) return rememberedEntry.id;
	return catalogProviderId ? preferredCatalogModel(catalog, null) : undefined;
}

/**
 * Restore EVERY open session model from the destination provider preference.
 *
 * `providerOverride` is GLOBAL (one value for the whole app), so switching it
 * re-routes ALL sessions through the new provider — but each session's
 * agent.json still pins the OLD provider's model id, which may not exist in the
 * new provider's catalog. The product requirement is therefore: switching the
 * provider in Settings resets the current model of ALL active sessions to the
 * new provider's remembered model or default (not just the focused one). We resolve it
 * once (provider-scoped) and write it into each open tab's agent.json. Returns
 * the model set + how many sessions were updated, or null when nothing to do.
 */
export async function resetOpenSessionsModelToProviderDefault(
	catalogProviderId: string | null,
): Promise<{ selected: string; count: number } | null> {
	const st = useShellStore.getState();
	const targets = st.tabs
		.map((t) => ({ sid: t.sid, agentPath: t.agentId }))
		.filter(
			(x): x is { sid: string; agentPath: string } => !!x.sid && !!x.agentPath,
		);
	if (targets.length === 0) return null;
	const catalog = await listModels(catalogProviderId);
	const nextModel = preferredCatalogModel(
		catalog,
		getLastModel(catalogProviderId),
	);
	if (!nextModel) return null;
	let count = 0;
	for (const { sid, agentPath } of targets) {
		if (useShellStore.getState().providerOverride !== st.providerOverride)
			break;
		try {
			await setAgentModels(sid, agentPath, [nextModel]);
			count++;
		} catch (e) {
			// Best-effort per session — one bad agent.json must not abort the rest.
			console.warn("[model-route] reset session model failed", {
				sid,
				agentPath,
				err: e,
			});
		}
	}
	return count > 0 ? { selected: nextModel, count } : null;
}

/** Reconcile session configuration against its active provider catalog. */
export async function reconcileSessionModelToActiveProvider(
	sid: string,
	agentPath: string,
): Promise<{ selected: string } | null> {
	const initial = useShellStore.getState();
	const catalogProviderId = currentCatalogProvider(initial.providerOverride);
	const catalog = await listModels(catalogProviderId).catch(() => null);
	if (!catalog || catalog.length === 0) return null;

	const cur = await getAgentModel(sid, agentPath).catch(() => null);
	const currentId = cur?.selected ?? null;
	const next = passiveSessionCatalogModel(
		catalog,
		currentId,
		getLastModel(catalogProviderId),
	);
	if (!next) return null;
	const current = useShellStore.getState();
	if (
		current.activeSid !== initial.activeSid ||
		!current.tabs.some((tab) => tab.sid === sid) ||
		currentCatalogProvider(current.providerOverride) !== catalogProviderId
	)
		return null;
	try {
		await setAgentModels(sid, agentPath, [next]);
		return { selected: next };
	} catch (e) {
		console.warn("[model-route] reconcile session model failed", {
			sid,
			agentPath,
			err: e,
		});
		return null;
	}
}
