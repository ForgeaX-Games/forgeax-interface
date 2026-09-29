import { publishTopic as publish } from "@forgeax/app-shell/application";

/** 已登记的跨-surface 深链 topic。payload 见下方 map。 */
export type DeepLinkTopic =
	| "bus:expand-plugin" // string   —— BusAdminPanel 展开某 plugin 行并滚动到
	| "bus:filter-kind" // string   —— BusAdminPanel solo 某 kind 过滤
	| "sidebar:focus-plugin" // string   —— Sidebar/AgentsPanel 滚动高亮某 agent（R4 消费者待补回）
	| "sidebar:flash-kind" // string   —— Sidebar BUS KINDS chip 闪烁（R4 消费者待补回）
	| "chat:flash-bus-chip"; // string   —— ChatPanel TabStrip bus-chip 闪烁（R4 消费者待补回）

/** producer：发一条深链意图（retain 一次，晚挂载的消费者会补到）。 */
export function emitDeepLink(topic: DeepLinkTopic, payload: string): void {
	publish(topic, payload, { retain: true });
}
