// Compatibility adapter while Interface consumers migrate to
// @forgeax/app-shell/application. The provider delegates to App Shell so every
// product shares one React context identity; the local hooks retain Interface's
// narrower host type until its remaining product shell is retired.

import {
	type AppHost as ApplicationHost,
	HostProvider as ApplicationHostProvider,
	useHost as useApplicationHost,
} from "@forgeax/app-shell/application";
import React, { useCallback, useEffect, useState } from "react";
import type { AppHost } from "../types";

export const HostProvider: React.FC<{
	value: AppHost;
	children: React.ReactNode;
}> = ({ value, children }) => (
	<ApplicationHostProvider value={value as unknown as ApplicationHost}>
		{children}
	</ApplicationHostProvider>
);

export function useHost(): AppHost {
	return useApplicationHost() as unknown as AppHost;
}

export function useCommand<Args = unknown, Result = unknown>(
	id: string,
): (args?: Args) => Promise<Result> {
	const host = useHost();
	return useCallback(
		(args?: Args) => host.commands.execute<Result>(id, args as unknown),
		[host, id],
	);
}

export function useContextKey<Value>(key: string): Value | undefined {
	const host = useHost();
	const [value, setValue] = useState<Value | undefined>(() =>
		host.contextKeys.get<Value>(key),
	);
	useEffect(() => {
		setValue(host.contextKeys.get<Value>(key));
		const dispose = host.contextKeys.onChange(key, (next) =>
			setValue(next as Value),
		);
		return () => {
			void dispose();
		};
	}, [host, key]);
	return value;
}

export function useKeybindingScope(
	ref: React.RefObject<Element | null>,
	scopeId: string,
): void {
	const host = useHost();
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const dispose = host.keybindings.registerScope(element, scopeId);
		return () => {
			void dispose();
		};
	}, [host, ref, scopeId]);
}
