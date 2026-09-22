import * as React from "react";
import type { ChartSpec } from "../shared/chartSpec";
import { ChartCard } from "./chart";
import {
  AUTO_OPEN_INITIAL,
  autoOpenReducer,
  chartAddress,
  extractChartSpec,
  findChartSpec,
  maxTurnOf,
  partialTurnOf,
  turnClosed,
  turnFromAddress,
  type UseChatLike,
} from "./turn";

/**
 * 所需客户端服务：槽位注册表、侧栏 tab 类型注册表、侧栏导航控制器。
 * 后两者由 @deepseek-ai/dsh-client-ui-sidebar-right 提供（dsh-web-app 内置）。
 */
export const inject = ["slots", "sidebarRightTabs", "sidebarRight"];

/** 侧栏资源类型的 kind/类型段（同时也是自动打开认领的地址前缀段）。 */
const TAB_KIND = "trading-chart";
/** 类型的实现身份；正文与标题槽的分派 key，必须一致。 */
const TAB_ID = "dsh-trading-agent";
/** 没有 chartSpec 时 tab chip 的兜底文字。 */
const TAB_TITLE = "行情图";
/** turnTail 里「重新打开」入口的注册 id。 */
const LINK_ID = "dsh-trading-agent";
/** 自动打开观察者的注册 id。 */
const AUTO_OPEN_ID = "dsh-trading-agent";

interface SlotDeclaration {
  name: string;
  id?: string;
  key?: string;
  order?: number;
  priority?: number;
  inject?: (sessionId: string, actions?: unknown) => unknown;
}

interface SlotsService {
  inject(name: string, callback: () => unknown): unknown;
  register(declaration: SlotDeclaration, component: unknown): unknown;
}

interface SidebarRightTabsService {
  register(definition: {
    id: string;
    kind: string;
    patterns?: readonly string[];
    priority?: string;
    title: (address: string) => string;
  }): unknown;
}

interface SidebarRightService {
  /** 在指定会话里打开（或聚焦已打开的）一个资源 tab。 */
  openResourceIn(sessionId: string, address: string, options?: { params?: unknown }): void;
}

interface ClientContext {
  slots: SlotsService;
  sidebarRightTabs: SidebarRightTabsService;
  sidebarRight: SidebarRightService;
  effect(callback: () => unknown, label?: string): unknown;
}

// ── 侧栏正文 / 标题：从 tab 的地址与 params 里取 chartSpec ─────────────────

interface TabInfoLike {
  tab: {
    contentId?: string;
    navigation: { address?: string; params?: unknown };
  };
}

interface ChartTabProps {
  /** 由 sidebar.right.pane.tab(.title) 槽注入的框架 hook。 */
  useTabInfo?: () => TabInfoLike;
  /** 会话槽共同提供的聊天快照 hook。 */
  useChat?: UseChatLike;
}

/**
 * 取 tab 的 chartSpec：优先用导航参数；参数不持久化，刷新后布局会把 tab 还原成
 * 空壳，此时按地址里的回合号从对话快照里把图找回来。
 */
function chartSpecOfTab(props: ChartTabProps): ChartSpec | undefined {
  const info = props.useTabInfo?.();
  const address = info?.tab.navigation.address ?? info?.tab.contentId;
  const turn = turnFromAddress(address);
  const recovered = props.useChat?.((snapshot) => (turn === undefined ? undefined : findChartSpec(snapshot, turn)));
  return extractChartSpec(info?.tab.navigation.params) ?? recovered;
}

/** 侧栏正文：没有合法 chartSpec 时不渲染。 */
function ChartTab(props: ChartTabProps): React.ReactElement | null {
  const spec = chartSpecOfTab(props);
  if (spec === undefined) return null;
  return React.createElement(ChartCard, { spec });
}

/** tab chip 文字：显示到具体交易对与周期，便于多个图表 tab 之间区分。 */
function ChartTabTitle(props: ChartTabProps): React.ReactElement {
  const spec = chartSpecOfTab(props);
  const label = spec === undefined ? TAB_TITLE : `${spec.symbol} ${spec.interval}`;
  return React.createElement("span", null, label);
}

// ── turnTail：每个出图的回合底部留一个「重新打开」入口 ─────────────────────

const LINK_STYLE: React.CSSProperties = {
  marginBottom: "6px",
  padding: "2px 8px",
  borderRadius: "4px",
  border: "1px solid rgba(128, 128, 128, 0.35)",
  background: "transparent",
  color: "inherit",
  font: "11px/1.6 ui-sans-serif, system-ui, sans-serif",
  cursor: "pointer",
  opacity: 0.85,
};

interface ChartLinkProps {
  turn?: { turn?: number } | number;
  useChat?: UseChatLike;
  /** 由 apply 注入：按会话打开/聚焦这张图。 */
  openChart?: (turn: number, spec: ChartSpec) => void;
}

/**
 * 回合末尾的图表入口：本回合有 trading_chart 结果时渲染一个链接。
 * 它不负责自动打开——自动打开只发生在「看着回合完成」时；这里的入口用于
 * 手动关闭 tab 之后把它找回来。
 */
function ChartLink(props: ChartLinkProps): React.ReactElement | null {
  const turn = typeof props.turn === "number" ? props.turn : props.turn?.turn;
  const spec = props.useChat?.((snapshot) => findChartSpec(snapshot, turn));
  if (turn === undefined || spec === undefined) return null;
  const open = props.openChart;
  return React.createElement(
    "button",
    {
      type: "button",
      "data-trading-open": "1",
      style: LINK_STYLE,
      onClick: () => open?.(turn, spec),
    },
    "在右侧栏查看行情图",
  );
}

// ── 自动打开：只在「看着一个回合跑完」时打开，刷新/切会话不打开 ────────────

interface ChartAutoOpenerProps {
  useSession?: <T>(selector: (session: { running?: boolean }) => T) => T;
  useChat?: UseChatLike;
  /** 由 apply 注入：按会话打开这张图。 */
  openChart?: (turn: number, spec: ChartSpec) => void;
}

/**
 * 会话级观察者（不渲染任何内容）。
 *
 * 刷新页面或切换会话时，会话的 running 一直是 false，观察不到 true→false 的
 * 跳变，所以不会自动打开；只有真实经历「运行中 → 结束」才把最新的图表打开到侧栏。
 */
function ChartAutoOpener(props: ChartAutoOpenerProps): null {
  const running = props.useSession?.((session) => session.running === true) === true;
  const maxTurn = props.useChat?.((snapshot) => maxTurnOf(snapshot));
  const partialTurn = props.useChat?.((snapshot) => partialTurnOf(snapshot));
  const [state, dispatch] = React.useReducer(autoOpenReducer, AUTO_OPEN_INITIAL);

  React.useEffect(() => {
    dispatch({ type: "observe", running, partialTurn, maxTurn });
  }, [running, partialTurn, maxTurn]);

  const target = state.targetTurn;
  const spec = props.useChat?.((snapshot) => (target === null ? undefined : findChartSpec(snapshot, target)));
  const closed = props.useChat?.((snapshot) => (target === null ? undefined : turnClosed(snapshot, target)));
  const openChart = props.openChart;

  React.useEffect(() => {
    if (target === null || closed !== true) return;
    if (spec !== undefined) openChart?.(target, spec);
    dispatch({ type: "settled" });
  }, [target, closed, spec, openChart]);

  return null;
}

// ── 注册 ───────────────────────────────────────────────────────────────────

/**
 * 注册右侧栏原生行情图 tab 与它的打开路径。
 *
 * 图表以**资源 tab**（`dsh-resource://trading-chart/<会话>/<回合>`）呈现：侧栏按
 * (kind, contentId) 去重，所以重复打开只会聚焦同一张图，关闭后再点链接也能找回；
 * 每个回合一个稳定地址，旧图因此各自留在 tab 条上。
 */
export function apply(ctx: ClientContext): void {
  const openChart = (sessionId: string, turn: number, spec: ChartSpec): void => {
    ctx.sidebarRight.openResourceIn(sessionId, chartAddress(sessionId, turn), { params: { spec } });
  };

  ctx.effect(
    () => ctx.sidebarRightTabs.register({
      id: TAB_ID,
      kind: TAB_KIND,
      patterns: ["dsh-resource://trading-chart/**"],
      title: () => TAB_TITLE,
    }),
    "trading-agent: 侧栏行情图类型",
  );

  ctx.effect(
    () => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register(
      { name: "sidebar.right.pane.tab", key: TAB_ID },
      ChartTab,
    )),
    "trading-agent: 侧栏行情图正文",
  );

  ctx.effect(
    () => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register(
      { name: "sidebar.right.pane.tab.title", key: TAB_ID },
      ChartTabTitle,
    )),
    "trading-agent: 侧栏行情图标题",
  );

  ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register(
    {
      name: "conversation.chat.turnTail",
      id: LINK_ID,
      inject: (sessionId: string) => ({
        openChart: (turn: number, spec: ChartSpec): void => openChart(sessionId, turn, spec),
      }),
    },
    ChartLink,
  ));

  ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register(
    {
      name: "conversation.session.header.utilities",
      id: AUTO_OPEN_ID,
      inject: (sessionId: string) => ({
        openChart: (turn: number, spec: ChartSpec): void => openChart(sessionId, turn, spec),
      }),
    },
    ChartAutoOpener,
  ));
}
