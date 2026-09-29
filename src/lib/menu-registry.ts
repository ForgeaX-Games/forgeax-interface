// Interface-owned built-in menu descriptors and native wire types.
// Runtime registration, ordering, subscriptions and disposal belong to host.menus.

export type MenuId =
	| "brand"
	| "file"
	| "edit"
	| "window"
	| "build"
	| "select"
	| "help"
	| "publish";

export interface MenuItemDef {
	/** 稳定唯一 id,例:'file.save' / 'window.toggle_chat'。重复注册会抛错。 */
	id: string;
	/** 归属菜单顶层大类。 */
	menu: MenuId;
	/** 分组键 —— 菜单内的段落分组;渲染器/原生桥根据相邻项的 group 差异插入分隔符。 */
	group: string;
	/** 段内排序 (升序)。同 order 用插入顺序破平局 (稳定排序)。 */
	order: number;
	/** i18n key —— 渲染时经 `t(labelKey)` 翻译;`serializeMenusForNative` 由调用方
	 *  传入的 `translate` fn 完成翻译,进而不把函数塞进原生契约。 */
	labelKey: string;
	/** lucide 图标名 (仅 Web 端渲染;原生菜单不带 icon)。 */
	icon?: string;
	/** 要执行的 command bus id;省略 = 该项为**纯文本禁用项** (占位/说明/未来功能)。 */
	commandId?: string;
	/** 派发命令时透传给 `commands.execute(commandId, args)` 的参数。 */
	args?: unknown;
	/** 键位组合 (canonical),例:'Ctrl+S'。Web 用 prettyCombo 显示,原生转为 accelerator。 */
	keybinding?: string;
	/** 动态子菜单的**事实**(供投影/门对账消费,不是行为指南):
	 *  所有动态子项共用的 commandId(如「打开最近」的每一行都是 game.pick)。 */
	dynamicChildCommandId?: string;
	/** 动态子项 id 的构成事实:`\${本项id}.\${args[该键]}`(如 file.openRecent.<slug>)。
	 *  有了它,外部调用方无需展开动态列表就能按参数定位到具体子项。 */
	dynamicChildIdFromArg?: string;
	/** 可见性谓词 —— 返回 false 时该项从菜单中**隐藏** (原生序列化时直接 drop)。 */
	when?: () => boolean;
	/** 显式启用谓词 —— 缺省时默认为 `!!commandId` (无命令则不可点)。 */
	enabled?: () => boolean;
	/** 复选态谓词 (Window 面板 toggle 类)。 */
	checked?: () => boolean;
	/** 危险/破坏性样式标记 (仅 Web 视觉;原生透传但由平台决定是否使用)。 */
	danger?: boolean;
	/** 子菜单 (例:File → Open Recent → ...;Select → By Type → ...)。 */
	children?: MenuItemDef[];
	/** 动态子菜单派生器 —— 渲染器在 submenu 展开时同步求值,返回运行时派生的子项
	 *  (例:File → 打开最近 → 按 mtime 排序的最近游戏列表)。与静态 `children`
	 *  互斥优先:声明了本项即视为可展开的 submenu,展开时才求值 (SSOT 仍是注册表,
	 *  子项是纯 derive)。求值必须同步 (数据源需在展开前预取/缓存);仅 Web 端消费,
	 *  原生序列化不含动态子项 (native 菜单结构在 build 时固化)。 */
	dynamicChildren?: () => MenuItemDef[];
}

export interface NativeMenuItem {
	/** 对应 MenuItemDef.id。 */
	id: string;
	/** **已翻译**的显示文本 (调用方传入的 `translate` fn 完成)。 */
	label: string;
	/** 原生 accelerator 字符串,例:'CmdOrCtrl+S' / 'CmdOrCtrl+Shift+Z'。无键位则省略。 */
	accelerator?: string;
	/** 已解析的启用态 (when 已 drop 掉隐藏项;enabled 默认 = !!commandId)。 */
	enabled: boolean;
	/** 破坏性样式提示 (原样透传,由平台决定是否使用)。 */
	danger?: boolean;
	/** 当前项是**新段的第一项**时为 true (菜单内首项除外),原生桥据此插分隔符。 */
	separatorBefore?: boolean;
	/** 子菜单 (递归应用同样的翻译/序列化规则)。 */
	children?: NativeMenuItem[];
}

export interface NativeMenu {
	menu: MenuId;
	items: NativeMenuItem[];
}
