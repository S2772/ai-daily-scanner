import React from 'react';
import { AlertTriangle, Clock, Info } from 'lucide-react';
import { DataStatusHint } from '../dataStatus';

function formatTime(value?: string): string {
  if (!value) return '-';
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('zh-CN', { hour12: false });
}

export function DataStatusPanel({ status }: { status: DataStatusHint }) {
  const isError = status.kind === 'collected_with_errors' || status.kind === 'request_error';

  return (
    <div className={`rounded-lg border p-4 text-xs ${isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
      <div className="flex items-start gap-2">
        {isError ? <AlertTriangle className="w-4 h-4 mt-0.5" /> : <Info className="w-4 h-4 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm mb-1">{status.title}</div>
          <div className="leading-relaxed">{status.description}</div>

          <div className="mt-3 space-y-1 text-[11px]">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              检查时间: {formatTime(status.checkedAt)}
            </div>
            {status.errorAt && <div>错误时间: {formatTime(status.errorAt)}</div>}
          </div>

          {status.logs.length > 0 && (
            <div className="mt-3 rounded border border-current/20 bg-white/60 p-2">
              <div className="font-medium mb-1">错误日志 / 运行日志</div>
              <div className="space-y-1 max-h-36 overflow-y-auto break-words">
                {status.logs.map((log, index) => (
                  <div key={`${index}-${log}`}>{log}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
