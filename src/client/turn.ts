import { TOOL_NAME } from "../shared/tool";
import type { ChartSpec } from "../shared/chartSpec";

/** 工具结果块的最小形状（presentationMeta 挂在 root.meta 上）。 */
export interface ToolBlockLike {
  name?: string;
  call?: { name?: string } | null;
  meta?: unknown;
}

/** 聊天节点里我们关心的那一层。 */
export interface ChatNodeLike {
  kind?: string;
  data?: { root?: ToolBlockLike };
}

/** 会话时间线里我们关心的一面：已加载回合的顺序与每个回合的开关状态。 */
export interface ChatTimelineLike {
  readonly turnOrder: readonly number[];
  readonly turns: ReadonlyMap<number, { readonly status?: string }>;
}

/**
 * 聊天快照的最小面。
 *
 * locations/nodes 用于按回合找 chartSpec；timeline/legacy 只在自动打开与恢复时需要，
 * 因此声明为可选，便于测试构造最小快照。
 */
export interface ChatSnapshotLike {
  locations: { getTurn(turn: number): readonly string[] };
  nodes: { get(key: string): ChatNodeLike | undefined };
  /** 已加载回合的时间线（最大回合号、回合是否 closed）。 */
  timeline?: ChatTimelineLike;
  /** 兼容投影里的流式状态（partial 为进行中的助手输出）。 */
  legacy?: { readonly partial?: { readonly turn: number } | null };
}

/** turnTail 槽与所有会话槽共同提供的 useChat：用一个 selector 订阅聊天快照。 */
export type UseChatLike = <T>(selector: (snapshot: ChatSnapshotLike) => T) => T;

/** chartSpec 的结构判别：客户端只信任形状合法的 presentationMeta。 */
export function isChartSpec(value: unknown): value is ChartSpec {
  return (
    typeof value === "object"
    && value !== null
    && Array.isArray((value as ChartSpec).series)
    && typeof (value as ChartSpec).symbol === "string"
  );
}

/**
 * 在指定回合里从后往前找 trading_chart 的 tool-result，取它的 presentationMeta。
 * 找不到（或没有回合号）时返回 undefined。
 */
export function findChartSpec(snapshot: ChatSnapshotLike, turn: number | undefined): ChartSpec | undefined {
  if (turn === undefined) return undefined;
  const keys = snapshot.locations.getTurn(turn);
  for (let i = keys.length - 1; i >= 0; i -= 1) {
    const node = snapshot.nodes.get(keys[i]!);
    if (node?.kind !== "tool-call") continue;
    const root = node.data?.root;
    const name = root?.call?.name ?? root?.name;
    if (name === TOOL_NAME && isChartSpec(root?.meta)) return root.meta;
  }
  return undefined;
}

/**
 * 从侧栏 tab 的 navigation.params 里取 chartSpec。
 * params 由本插件自己写入（{ spec }），但恢复自持久化布局的数据不可全信，仍做形状校验。
 */
export function extractChartSpec(params: unknown): ChartSpec | undefined {
  if (typeof params !== "object" || params === null) return undefined;
  const spec = (params as { spec?: unknown }).spec;
  return isChartSpec(spec) ? spec : undefined;
}

/** 侧栏 tab 的 navigation.params 形状（本插件约定）。 */
export interface ChartTabParams {
  spec: ChartSpec;
}

/** 已加载回合里最大的回合号（最新的一个已加载回合）。 */
export function maxTurnOf(snapshot: ChatSnapshotLike): number | undefined {
  const order = snapshot.timeline?.turnOrder;
  if (order === undefined || order.length === 0) return undefined;
  return order[order.length - 1];
}

/** 进行中的助手输出属于哪个回合；没有流式输出时为 undefined。 */
export function partialTurnOf(snapshot: ChatSnapshotLike): number | undefined {
  return snapshot.legacy?.partial?.turn;
}

/** 某个回合是否已经 closed（turn/end 已到）。 */
export function turnClosed(snapshot: ChatSnapshotLike, turn: number): boolean {
  return snapshot.timeline?.turns.get(turn)?.status === "closed";
}

// ── 图表在侧栏里的地址（资源 tab 的身份）────────────────────────────────────

/** 本插件认领的资源地址前缀：类型段即 sidebarRightTabs 的 kind。 */
export const CHART_ADDRESS_PREFIX = "dsh-resource://trading-chart/";

/**
 * 每张图一个稳定地址：会话 + 回合。
 *
 * 用资源地址而不是页 kind 作为 tab 身份，是为了让侧栏自己按 (kind, contentId)
 * 去重——同一张图重复打开只会聚焦已有 tab，而不是再开一个；关闭后再打开也能找回。
 */
export function chartAddress(sessionId: string, turn: number): string {
  return `${CHART_ADDRESS_PREFIX}${encodeURIComponent(sessionId)}/${turn}`;
}

/** 从资源地址里取回合号；不是本插件的地址时返回 undefined。 */
export function turnFromAddress(address: string | undefined): number | undefined {
  if (address === undefined || !address.startsWith(CHART_ADDRESS_PREFIX)) return undefined;
  const rest = address.slice(CHART_ADDRESS_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash === -1) return undefined;
  const parsed = Number(rest.slice(slash + 1));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

// ── 自动打开的状态机：只在回合「刚刚完成」时打开 ───────────────────────────

/** 自动打开的状态：会话是否在跑、正在跑的回合、以及待打开的目标回合。 */
export interface AutoOpenState {
  readonly running: boolean;
  readonly activeTurn: number | undefined;
  readonly targetTurn: number | null;
}

/** 尚未观察到任何回合时的初值。 */
export const AUTO_OPEN_INITIAL: AutoOpenState = { running: false, activeTurn: undefined, targetTurn: null };

export type AutoOpenAction =
  | {
    readonly type: "observe";
    readonly running: boolean;
    readonly partialTurn: number | undefined;
    readonly maxTurn: number | undefined;
  }
  | { readonly type: "settled" };

/**
 * 观察会话运行状态，推导出「回合刚刚完成」的目标。
 *
 * 关键取舍：刷新页面或切换会话时 running 一直是 false，观察不到 true→false 的
 * 跳变，因此不会自动打开；只有真正看着一个回合从跑到停，才产生 targetTurn。
 */
export function autoOpenReducer(state: AutoOpenState, action: AutoOpenAction): AutoOpenState {
  if (action.type === "settled") {
    return state.targetTurn === null ? state : { ...state, targetTurn: null };
  }
  if (action.running) {
    const activeTurn = action.partialTurn ?? action.maxTurn ?? state.activeTurn;
    if (state.running && activeTurn === state.activeTurn) return state;
    return { running: true, activeTurn, targetTurn: state.targetTurn };
  }
  if (!state.running) return state;
  return { running: false, activeTurn: state.activeTurn, targetTurn: state.activeTurn ?? null };
}
