import { SourceStatus } from './api';

export type DataStatusKind =
  | 'not_collected'
  | 'collected_with_errors'
  | 'collected_no_data'
  | 'request_error';

export interface DataStatusHint {
  kind: DataStatusKind;
  title: string;
  description: string;
  checkedAt: string;
  errorAt?: string;
  logs: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function stringifyError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return '未知错误';
  }
}

export function createRequestErrorHint(error: unknown, title = '数据加载失败'): DataStatusHint {
  const checkedAt = nowIso();
  const message = stringifyError(error);
  return {
    kind: 'request_error',
    title,
    description: '无法连接后端或接口请求失败，请检查服务状态后重试。',
    checkedAt,
    errorAt: checkedAt,
    logs: [message],
  };
}

export function createNoDataHint(sourceStatuses: SourceStatus[], checkedAt = nowIso()): DataStatusHint {
  if (!sourceStatuses.length) {
    return {
      kind: 'not_collected',
      title: '所选时间范围暂无抓取记录',
      description: '当前筛选时间还未执行抓取。请在 Overview 点击 Collect Now 先抓取数据。',
      checkedAt,
      logs: [],
    };
  }

  const errorRows = sourceStatuses.filter((row) => row.status === 'error');
  if (errorRows.length > 0) {
    const latestError = errorRows.reduce((latest, current) => {
      return (current.created_at || '') > (latest.created_at || '') ? current : latest;
    });

    const logs = errorRows
      .slice(0, 6)
      .map((row) => `[${row.created_at}] ${row.source}: ${row.error_message || '抓取失败'}`);

    return {
      kind: 'collected_with_errors',
      title: '抓取执行了，但出现错误',
      description: '当前日期抓取日志包含错误，请先处理错误后再次抓取。',
      checkedAt,
      errorAt: latestError.created_at,
      logs,
    };
  }

  const totalItems = sourceStatuses.reduce((sum, row) => sum + (Number(row.item_count) || 0), 0);
  if (totalItems > 0) {
    const logs = sourceStatuses
      .slice(0, 6)
      .map((row) => `[${row.created_at}] ${row.source}: status=${row.status}, items=${row.item_count}`);

    return {
      kind: 'collected_no_data',
      title: '抓取有返回，但列表为空',
      description: '检测到采集源有返回，可能是入库或筛选异常。请查看日志并检查数据库写入。',
      checkedAt,
      logs,
    };
  }

  return {
    kind: 'collected_no_data',
    title: '抓取完成，但没有采到可展示数据',
    description: '本次抓取执行成功，但各数据源返回 0 条。可稍后重试或扩展来源。',
    checkedAt,
    logs: sourceStatuses.slice(0, 6).map((row) => `[${row.created_at}] ${row.source}: status=${row.status}, items=${row.item_count}`),
  };
}
