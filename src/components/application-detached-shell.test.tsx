import "../lib/telemetry-test-prelude";
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { HostProvider, useHost } from "@forgeax/app-shell/application";
import type { SurfaceDescriptor } from "@forgeax/app-shell/window";
import { cleanup, render } from "@testing-library/react";
import {
	createContext,
	Fragment,
	type ReactElement,
	type ReactNode,
	useContext,
	useEffect,
} from "react";
import { ApplicationDetachedShell } from "../ApplicationDetachedShell";
import type { InterfaceApplicationRuntime } from "../application";
import { BrandProvider, useBrandRuntime } from "../brand";
import { getBrandRuntimeSync } from "../brand/runtime";
import { createAppHost } from "../core/app-shell";
import { normalizeSourceStringDelimiters } from "../test-utils/source-text";
import { DetachedSurface } from "./DetachedSurface";
import {
	PanelRenderersProvider,
	usePanelRenderers,
} from "./DockShell/panelRenderers";

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
	cleanup();
	for (const dispose of disposers.splice(0)) await dispose();
});

function makeHost(AgentsBrowser = () => <span>surface body</span>) {
	const { host, control } = createAppHost({
		initialPanels: { editorPanelIds: [], detached: { AgentsBrowser } },
	});
	disposers.push(() => control.dispose());
	return host as InterfaceApplicationRuntime["host"];
}

describe("public detached application shell composition", () => {
	test("keeps the exact brand, host, renderer, product-provider and surface nesting", () => {
		const host = makeHost();
		const surface: SurfaceDescriptor = {
			kind: "panel",
			id: "agents",
			instance: "m145",
		};
		const ProductProvider = ({ children }: { children: ReactNode }) => (
			<>{children}</>
		);
		const tree = ApplicationDetachedShell({
			host,
			surface,
			SurfaceProvider: ProductProvider,
		});
		const child = (node: ReactElement): ReactElement =>
			(node.props as { children: ReactElement }).children;

		expect(tree.type).toBe(BrandProvider);
		const hostNode = child(tree);
		expect(hostNode.type).toBe(HostProvider);
		expect((hostNode.props as { value: unknown }).value).toBe(host);
		const rendererNode = child(hostNode);
		expect(rendererNode.type).toBe(PanelRenderersProvider);
		expect((rendererNode.props as { value: unknown }).value).toBe(host.panels);
		const productNode = child(rendererNode);
		expect(productNode.type).toBe(ProductProvider);
		const surfaceNode = child(productNode);
		expect(surfaceNode.type).toBe(DetachedSurface);
		expect((surfaceNode.props as { surface: unknown }).surface).toBe(surface);

		const defaultTree = ApplicationDetachedShell({ host, surface });
		expect(child(child(child(defaultTree))).type).toBe(Fragment);
	});

	test("makes the same contexts available to the stable product provider and detached body", () => {
		const ProductContext = createContext(false);
		const observations: unknown[][] = [];
		let mounts = 0;
		let unmounts = 0;
		function Probe() {
			observations.push([
				useHost(),
				usePanelRenderers(),
				useBrandRuntime(),
				useContext(ProductContext),
			]);
			useEffect(() => {
				mounts++;
				return () => {
					unmounts++;
				};
			}, []);
			return <span>live detached surface</span>;
		}
		function ProductProvider({ children }: { children: ReactNode }) {
			observations.push([useHost(), usePanelRenderers(), useBrandRuntime()]);
			return (
				<ProductContext.Provider value>{children}</ProductContext.Provider>
			);
		}
		const host = makeHost(Probe);
		const surface: SurfaceDescriptor = { kind: "panel", id: "agents" };
		const view = render(
			<ApplicationDetachedShell
				host={host}
				surface={surface}
				SurfaceProvider={ProductProvider}
			/>,
		);
		expect(view.getByText("live detached surface")).toBeTruthy();
		expect(
			observations.every(
				([seenHost, panels, brand]) =>
					seenHost === host &&
					panels === host.panels &&
					brand === getBrandRuntimeSync(),
			),
		).toBe(true);
		expect(observations.some((entry) => entry[3] === true)).toBe(true);
		expect(mounts).toBe(1);
		view.rerender(
			<ApplicationDetachedShell
				host={host}
				surface={surface}
				SurfaceProvider={ProductProvider}
			/>,
		);
		expect(mounts).toBe(1);
		expect(unmounts).toBe(0);
		view.unmount();
		expect(unmounts).toBe(1);
	});

	test("works without a product provider and is exposed by the existing shell entry", () => {
		const view = render(
			<ApplicationDetachedShell
				host={makeHost()}
				surface={{ kind: "panel", id: "agents" }}
			/>,
		);
		expect(view.getByText("surface body")).toBeTruthy();
		const publicEntry = normalizeSourceStringDelimiters(
			readFileSync(new URL("../ApplicationShell.tsx", import.meta.url), "utf8"),
		);
		expect(publicEntry).toContain("export { ApplicationDetachedShell }");
		expect(publicEntry).toContain("from './ApplicationDetachedShell'");
	});
});
