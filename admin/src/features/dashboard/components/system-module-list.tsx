import { Tag } from 'antd';
import { List, type RowComponentProps } from 'react-window';
import type { SystemModuleDto } from '@/generated/api/models/systemModuleDto';

type ModuleRowProps = { items: SystemModuleDto[] };

function ModuleRow({ index, style, ariaAttributes, items }: RowComponentProps<ModuleRowProps>) {
  const item = items[index];
  return (
    <div
      {...ariaAttributes}
      style={style}
      className="grid grid-cols-[minmax(150px,1fr)_130px_60px_60px] items-center gap-3 border-b border-slate-100 px-3"
    >
      <div className="min-w-0">
        <strong>{item.name}</strong>
        <div className="truncate text-xs text-gray-500">{item.key}</div>
      </div>
      <Tag className="w-fit" color={item.status === 'ACTIVE' ? 'green' : 'default'}>
        {item.status === 'ACTIVE' ? 'Đã có API' : 'Đã scaffold'}
      </Tag>
      <span className="text-center font-semibold">{item.p0Count}</span>
      <span className="text-center font-semibold">{item.p1Count}</span>
    </div>
  );
}

function moduleRowKey(index: number, data: ModuleRowProps) {
  return data.items[index].key;
}

export function SystemModuleList({ items }: { items: SystemModuleDto[] }) {
  if (!items.length) return <div className="py-10 text-center text-gray-500">Chưa có module.</div>;
  const height = Math.min(items.length * 72, 432);
  return (
    <div className="min-w-[520px]">
      <div className="grid h-10 grid-cols-[minmax(150px,1fr)_130px_60px_60px] items-center gap-3 bg-slate-50 px-3 text-xs font-bold uppercase text-gray-500">
        <span>Module</span>
        <span>Trạng thái</span>
        <span className="text-center">P0</span>
        <span className="text-center">P1</span>
      </div>
      <List
        rowComponent={ModuleRow}
        rowCount={items.length}
        rowHeight={72}
        rowKey={moduleRowKey}
        rowProps={{ items }}
        style={{ height }}
      />
    </div>
  );
}
